// KODESH — Post-checkout confirmation (web only).
// This is a fast-path sync so the UI updates immediately after the Stripe
// redirect — the WEBHOOK (api/webhook.js) remains the source of truth for
// plan state. This endpoint never activates Premium based on anything the
// client asserts; it always re-verifies ownership against Stripe itself.
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const sessionId = req.body && typeof req.body.sessionId === 'string' ? req.body.sessionId.trim() : null;
  if (!sessionId || !sessionId.startsWith('cs_') || sessionId.length > 200) {
    return sendError(res, 400, ERR.badRequest, null, 'confirm');
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  const sbHeaders = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };

  try {
    // Verify the checkout session with Stripe directly.
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
    );
    if (!sessionRes.ok) {
      return sendError(res, 404, 'Sesión no encontrada.', await sessionRes.text(), 'confirm');
    }
    const session = await sessionRes.json();

    // Ownership check — the session MUST have been created for this exact
    // authenticated user. client_reference_id and metadata are both set by
    // our own checkout.js from the verified JWT, so this can't be spoofed
    // by a client sending someone else's session ID.
    const sessionOwnerId = session.client_reference_id || session.metadata?.supabase_user_id || null;
    if (!sessionOwnerId || sessionOwnerId !== userId) {
      return sendError(res, 403, ERR.forbidden, `session ${sessionId} owner mismatch (session=${sessionOwnerId}, caller=${userId})`, 'confirm');
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(200).json({ success: false, plan: 'free' });
    }
    if (!session.subscription) {
      return res.status(200).json({ success: false, plan: 'free' });
    }

    // Pull the subscription itself and re-verify it belongs to this user too.
    const subRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
      { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
    );
    if (!subRes.ok) {
      return sendError(res, 502, ERR.internal, await subRes.text(), 'confirm');
    }
    const sub = await subRes.json();
    const subOwnerId = sub.metadata?.supabase_user_id || null;
    if (subOwnerId && subOwnerId !== userId) {
      return sendError(res, 403, ERR.forbidden, `subscription ${sub.id} owner mismatch`, 'confirm');
    }

    const isValid = sub.status === 'active' || sub.status === 'trialing';
    if (!isValid) {
      return res.status(200).json({ success: false, plan: 'free' });
    }

    const updateBody = {
      plan: 'premium',
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: session.customer || undefined,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    // Never write another user's row — filter is always on the authenticated userId.
    const patchRes = await fetch(
      `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`,
      { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(updateBody) }
    );

    if (patchRes.status === 204 || patchRes.ok) {
      const check = await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=user_id&limit=1`, { headers: sbHeaders });
      const rows = await check.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        await fetch(`${SB_URL}/rest/v1/user_plans`, {
          method: 'POST', headers: sbHeaders,
          body: JSON.stringify({ user_id: userId, ...updateBody }),
        });
      }
    }

    return res.status(200).json({ success: true, plan: 'premium' });

  } catch(err) {
    return sendError(res, 500, ERR.internal, err, 'confirm');
  }
}
