// KODESH — Stripe Customer Portal session (web only).
// Identity comes ONLY from the verified Supabase JWT — userId is never
// accepted from the request body, so nobody can request another user's
// billing portal.
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  try {
    const planRes = await fetch(
      `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const planData = await planRes.json();
    const customerId = planData?.[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({ error: 'no_subscription', message: 'No encontramos una suscripción asociada a esta cuenta.' });
    }

    const sessionBody = new URLSearchParams({
      customer: customerId,
      return_url: 'https://kodeshbible.com/profile.html',
    });

    const sessionRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionBody.toString(),
    });

    const session = await sessionRes.json();
    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'portal');
  }
}
