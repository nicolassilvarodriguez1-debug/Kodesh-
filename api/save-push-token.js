// KODESH — Guarda (o actualiza) el token FCM de este dispositivo para el
// usuario autenticado, para poder mandarle push notifications más adelante.
// Llamado desde el cliente nativo justo después de obtener/refrescar el
// token de Firebase Messaging.
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, isNonEmptyString } from './_security.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const user = await requireUser(req, res);
  if (!user) return; // requireUser ya mandó el 401

  const { token, platform } = req.body || {};
  if (!isNonEmptyString(token, 4096)) {
    return sendError(res, 400, ERR.badRequest, null, 'save-push-token');
  }
  if (platform !== 'ios' && platform !== 'android') {
    return sendError(res, 400, ERR.badRequest, null, 'save-push-token');
  }

  try {
    // on_conflict=token: si el mismo dispositivo ya tenía un token guardado
    // (refresco de token, o un usuario distinto inició sesión en el mismo
    // dispositivo) se actualiza en vez de duplicar la fila.
    const r = await fetch(`${SB_URL}/rest/v1/user_push_tokens?on_conflict=token`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return sendError(res, 502, ERR.internal, new Error(errText), 'save-push-token:supabase');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'save-push-token');
  }
}
