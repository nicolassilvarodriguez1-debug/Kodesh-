// KODESH — Historial de períodos Premium (tabla premium_periods).
//
// Las funciones periodsFrom* son puras: convierten lo que devuelven Stripe y
// RevenueCat en filas de premium_periods. upsertPeriods / manual* escriben en
// Supabase. Todo es idempotente (on_conflict source,external_id), así que el
// cron diario puede reconstruir el historial completo una y otra vez.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const iso = unix => (unix ? new Date(unix * 1000).toISOString() : null);

// Suscripciones que nunca llegaron a cobrarse no cuentan como Premium.
const STRIPE_NEVER_PAID = new Set(['incomplete', 'incomplete_expired']);
const STRIPE_OPEN = new Set(['active', 'trialing', 'past_due']);

export function periodsFromStripe(subs, userId) {
  const rows = [];
  for (const sub of subs || []) {
    if (!sub?.id || STRIPE_NEVER_PAID.has(sub.status)) continue;
    const started = iso(sub.start_date || sub.created);
    if (!started) continue;
    const open = STRIPE_OPEN.has(sub.status) && !sub.ended_at;
    rows.push({
      user_id: userId,
      source: 'stripe',
      external_id: sub.id,
      product: sub.items?.data?.[0]?.price?.product || null,
      status: sub.status,
      had_trial: !!sub.trial_start,
      started_at: started,
      ended_at: open ? null : (iso(sub.ended_at) || iso(sub.canceled_at) || new Date().toISOString()),
    });
  }
  return rows;
}

const RC_STORE_SOURCE = { app_store: 'apple', mac_app_store: 'apple', play_store: 'google', promotional: 'promo' };

// RevenueCat v1 devuelve una entrada por producto con la fecha de la compra
// ORIGINAL y el vencimiento actual: si alguien canceló y volvió a suscribirse
// con el mismo producto, el hueco intermedio no se ve (Apple encadena las
// renovaciones bajo la misma transacción original).
export function periodsFromRc(rcData, userId, now = new Date()) {
  const rows = [];
  const subs = rcData?.subscriber?.subscriptions || {};
  for (const [product, s] of Object.entries(subs)) {
    if (!s || s.is_sandbox) continue;               // compras de prueba
    const source = RC_STORE_SOURCE[s.store];
    if (!source) continue;                          // 'stripe' u otras: ya vienen de Stripe
    const started = s.original_purchase_date || s.purchase_date;
    if (!started) continue;
    let status, ended = null;
    if (s.refunded_at) { status = 'refunded'; ended = s.refunded_at; }
    else if (s.expires_date && new Date(s.expires_date) <= now) { status = 'expired'; ended = s.expires_date; }
    else status = s.unsubscribe_detected_at ? 'canceled_pending' : (s.period_type === 'trial' ? 'trialing' : 'active');
    rows.push({
      user_id: userId,
      source,
      external_id: `${userId}:${product}:${started}`,
      product,
      status,
      had_trial: s.period_type === 'trial' || s.period_type === 'intro',
      started_at: started,
      ended_at: ended,
    });
  }
  return rows;
}

function sbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra };
}

export async function upsertPeriods(rows) {
  if (!rows.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/premium_periods?on_conflict=source,external_id`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(rows.map(x => ({ ...x, updated_at: new Date().toISOString() }))),
  });
  if (!r.ok) throw new Error(`upsert premium_periods -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// Premium regalado desde el panel. Si ya hay un período manual ABIERTO no se
// toca (conserva su fecha de inicio). Si el anterior está cerrado, se abre
// uno nuevo — external_id lleva la fecha para no chocar con el viejo.
export async function openManualPeriod(userId, startedAt = new Date().toISOString()) {
  const q = await fetch(
    `${SB_URL}/rest/v1/premium_periods?source=eq.manual&user_id=eq.${userId}&ended_at=is.null&select=id&limit=1`,
    { headers: sbHeaders() });
  if (!q.ok) throw new Error(`premium_periods -> ${q.status}`);
  if ((await q.json()).length) return;
  await upsertPeriods([{
    user_id: userId, source: 'manual', external_id: `${userId}:${startedAt}`,
    product: null, status: 'active', had_trial: false, started_at: startedAt, ended_at: null,
  }]);
}

export async function closeManualPeriods(userId) {
  const r = await fetch(
    `${SB_URL}/rest/v1/premium_periods?source=eq.manual&user_id=eq.${userId}&ended_at=is.null`,
    { method: 'PATCH', headers: sbHeaders(),
      body: JSON.stringify({ ended_at: new Date().toISOString(), status: 'ended', updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`close manual -> ${r.status}`);
}
