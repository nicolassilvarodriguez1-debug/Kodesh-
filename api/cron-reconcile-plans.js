// KODESH — Reconciliación diaria de planes Premium.
//
// Por qué existe: hasta octubre 2026 NINGÚN usuario perdía el Premium al
// cancelar o dejar de pagar.
//   - Web (Stripe): el webhook estaba registrado en el dominio sin www, que
//     responde 308; Stripe no sigue redirecciones, así que ningún evento llegó
//     nunca (stripe_webhook_events estaba vacía). Y aunque llegara, guardaba
//     current_period_end = null (ver _planSync.stripePeriodEnd).
//   - iOS (RevenueCat): no hay webhook de RevenueCat. sync-premium solo corre
//     cuando el usuario compra/restaura desde el perfil, así que ni las
//     cancelaciones ni las RENOVACIONES llegaban a Supabase.
//
// Este cron no reemplaza al webhook: es la red de seguridad. Una vez al día
// pregunta a Stripe y a RevenueCat por cada usuario Premium y corrige su fila.
//
// Reglas (ver _planSync.decidePlan):
//   - Suscripción activa en Stripe o RevenueCat → premium, con su fecha real.
//   - Tuvo suscripción y ya no está activa      → free.
//   - Ni Stripe ni RevenueCat lo conocen         → Premium dado a mano desde el
//                                                  panel: NO se toca.
//   - Cualquier error consultando una fuente     → ese usuario se salta (nunca
//                                                  se quita Premium por un fallo de red).
//
// Además llena premium_periods (historial de quién tuvo Premium y cuánto
// tiempo) con todas las suscripciones que Stripe y RevenueCat conocen de cada
// usuario — por eso recorre TODAS las filas de user_plans, no solo las Premium.
//
// Disparo:
//   GET  (Vercel Cron, Authorization: Bearer CRON_SECRET)  ?dry_run=1 para simular
//   POST (admin, JWT + 2FA)  body { dryRun: true } para simular
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';
import { stripeVerdict, rcVerdict, decidePlan } from './_planSync.js';
import { periodsFromStripe, periodsFromRc, upsertPeriods, openManualPeriod, closeManualPeriods } from './_premiumHistory.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
});

function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] !== 'undefined') return req.query[name];
  try { return new URL(req.url, 'http://localhost').searchParams.get(name); } catch { return null; }
}

async function stripeGet(path) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Stripe ${path} -> ${r.status}`);
  return r.json();
}

async function getStripeSubs(row) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurada');
  const subs = [];
  if (row.stripe_subscription_id) {
    const sub = await stripeGet(`subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`);
    if (sub) subs.push(sub);
  }
  if (row.stripe_customer_id) {
    const list = await stripeGet(
      `subscriptions?customer=${encodeURIComponent(row.stripe_customer_id)}&status=all&limit=10`);
    for (const s of list?.data || []) if (!subs.some(x => x.id === s.id)) subs.push(s);
  }
  return subs;
}

async function getRcData(userId) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error('REVENUECAT_SECRET_KEY no configurada');
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`RevenueCat -> ${r.status}`);
  return r.json();
}

// Solo compara los campos que decidePlan escribe.
function differs(row, patch) {
  const t = v => (v ? new Date(v).getTime() : null);
  return row.plan !== patch.plan
    || row.subscription_status !== patch.subscription_status
    || t(row.current_period_end) !== t(patch.current_period_end);
}

export async function reconcile({ dryRun = false } = {}) {
  const res = await fetch(
    `${SB_URL}/rest/v1/user_plans?select=user_id,plan,subscription_status,current_period_end,stripe_customer_id,stripe_subscription_id,updated_at`
    + `&order=user_id&limit=5000`,
    { headers: sbHeaders() });
  if (!res.ok) throw new Error(`user_plans -> ${res.status}`);
  const rows = await res.json();

  const report = { checked: rows.length, downgraded: [], updated: [], manual: [], periods: 0, errors: [] };

  for (const row of rows) {
    try {
      const [subs, rcData] = await Promise.all([
        row.stripe_customer_id || row.stripe_subscription_id ? getStripeSubs(row) : Promise.resolve([]),
        getRcData(row.user_id),
      ]);
      const decision = decidePlan(stripeVerdict(subs), rcVerdict(rcData));
      const isPremiumNow = row.plan === 'premium'
        && (row.subscription_status === 'active' || row.subscription_status === 'trialing');

      // Historial: todas las suscripciones conocidas de este usuario.
      const periods = [...periodsFromStripe(subs, row.user_id), ...periodsFromRc(rcData, row.user_id)];
      report.periods += periods.length;
      if (!dryRun) await upsertPeriods(periods);

      if (decision.action === 'keep_manual') {
        if (isPremiumNow) report.manual.push(row.user_id);
        if (!dryRun) {
          // Regalo manual: abre período (fecha aproximada = última modificación
          // del plan si se descubre ahora) o lo cierra si ya no es Premium.
          if (isPremiumNow) await openManualPeriod(row.user_id, row.updated_at || undefined);
          else await closeManualPeriods(row.user_id);
        }
        continue;
      }
      if (!dryRun) await closeManualPeriods(row.user_id);
      if (!differs(row, decision.patch)) continue;

      const entry = { user_id: row.user_id, from: { plan: row.plan, status: row.subscription_status }, to: decision.patch };
      (decision.patch.plan === 'free' ? report.downgraded : report.updated).push(entry);

      if (!dryRun) {
        const patch = await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${row.user_id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ ...decision.patch, updated_at: new Date().toISOString() }),
        });
        if (!patch.ok) throw new Error(`PATCH user_plans -> ${patch.status}`);
      }
    } catch (err) {
      // Fail safe: si no pudimos confirmar el estado, no tocamos al usuario.
      report.errors.push({ user_id: row.user_id, error: err.message });
    }
  }
  return report;
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, POST, OPTIONS' });
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET;
    if (!secret || (req.headers['authorization'] || '') !== `Bearer ${secret}`) {
      return sendError(res, 401, ERR.unauthorized, null, 'cron-reconcile-plans');
    }
  } else if (req.method === 'POST') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  } else {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const dryRun = req.method === 'GET' ? getQueryParam(req, 'dry_run') === '1' : req.body?.dryRun === true;

  try {
    const report = await reconcile({ dryRun });
    console.log('[reconcile-plans]', JSON.stringify({ dryRun, ...report }));
    return res.status(200).json({ dryRun, ...report });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'cron-reconcile-plans');
  }
}
