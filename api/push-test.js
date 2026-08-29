// KODESH — Endpoint temporal para verificar que la integración de push
// (Firebase Admin SDK -> APNs -> dispositivo) funciona de punta a punta.
// Solo admins (aal2) pueden dispararlo, y solo se manda a los tokens del
// propio admin que llama — no expone tokens de otros usuarios.
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';
import { getFcm } from './_firebase.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return; // requireAdmin ya mandó 401/403

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_push_tokens?user_id=eq.${admin.id}&select=id,token`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'no_token_registered' });
    }

    const fcm = getFcm();
    const results = await Promise.allSettled(rows.map(row =>
      fcm.send({
        token: row.token,
        notification: {
          title: 'KODESH',
          body: 'Push de prueba — si ves esto, la integración funciona ✅',
        },
      })
    ));

    let sent = 0;
    const staleIds = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        const code = result.reason?.errorInfo?.code || result.reason?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          staleIds.push(rows[i].id);
        }
        console.warn('push-test: fallo al enviar a un token:', code || result.reason?.message);
      }
    });

    // Limpieza silenciosa de tokens que Firebase ya no reconoce (app
    // desinstalada, token vencido, etc.) para no seguir intentando en vano.
    if (staleIds.length) {
      await fetch(`${SB_URL}/rest/v1/user_push_tokens?id=in.(${staleIds.join(',')})`, {
        method: 'DELETE',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      }).catch(() => {});
    }

    // Registro en el historial del panel — ver push_notification_log.
    await fetch(`${SB_URL}/rest/v1/push_notification_log`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sent_by: admin.id,
        sent_by_email: admin.email,
        kind: 'test',
        target_label: admin.email,
        title: 'KODESH',
        body: 'Push de prueba — si ves esto, la integración funciona ✅',
        sent_count: sent,
        failed_count: rows.length - sent,
        total_count: rows.length,
      }),
    }).catch(err => console.warn('push-test: fallo al guardar en el historial:', err.message));

    return res.status(200).json({ success: true, sent, total: rows.length });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'push-test');
  }
}
