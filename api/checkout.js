// KODESH — Stripe Checkout session creation (web only).
// Identity comes ONLY from the verified Supabase JWT (requireUser) — never
// from the request body. userId/userEmail in the body are ignored.
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, clampString } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return; // requireUser already sent 401

  const userId = user.id;
  const userEmail = user.email;
  if (!userEmail) return sendError(res, 400, ERR.badRequest, null, 'checkout');

  // Optional display name — sanitized, never used as an identity source.
  const userName = clampString((req.body && typeof req.body.userName === 'string') ? req.body.userName : '', 120) || userEmail;

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const PRICE_ID = 'price_1TfNp1JI47QT5dnmur1bIDnQ';

  const sbHeaders = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };

  try {
    // Check existing plan — this row is keyed by the authenticated user's ID,
    // so a caller can never read or touch another user's Stripe customer here.
    const planRes = await fetch(
      `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id,plan,subscription_status&limit=1`,
      { headers: sbHeaders }
    );
    const planData = await planRes.json();
    const existingPlan = Array.isArray(planData) ? planData[0] : null;

    // Already subscribed (active or in trial)?
    if (existingPlan?.plan === 'premium' &&
        (existingPlan?.subscription_status === 'active' || existingPlan?.subscription_status === 'trialing')) {
      return res.status(400).json({ error: 'already_subscribed', message: 'Ya tienes KODESH Premium activo.' });
    }

    let customerId = existingPlan?.stripe_customer_id || null;

    // Create Stripe customer if needed
    if (!customerId) {
      const stripeHeaders = {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      const customerBody = new URLSearchParams({
        email: userEmail,
        name: userName,
      });
      customerBody.append('metadata[supabase_user_id]', userId);

      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: stripeHeaders,
        body: customerBody.toString()
      });
      const customer = await customerRes.json();

      if (customer.error) throw new Error(`Stripe customer error: ${customer.error.message}`);
      customerId = customer.id;

      // Save customer ID to Supabase, tied to the authenticated user's row.
      await fetch(`${SB_URL}/rest/v1/user_plans`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          user_id: userId,
          stripe_customer_id: customerId,
          plan: 'free',
          subscription_status: 'inactive',
          updated_at: new Date().toISOString(),
        })
      });
    }

    // Create checkout session — client_reference_id and metadata both carry
    // the verified Supabase user ID, so confirm.js and the webhook can prove
    // this session belongs to this user without trusting anything the
    // client sends.
    const sessionBody = new URLSearchParams({
      customer: customerId,
      mode: 'subscription',
      success_url: `https://kodeshbible.com/index.html?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://kodeshbible.com/index.html?upgrade=canceled`,
      locale: 'es',
      client_reference_id: userId,
    });
    sessionBody.append('line_items[0][price]', PRICE_ID);
    sessionBody.append('line_items[0][quantity]', '1');
    sessionBody.append('subscription_data[metadata][supabase_user_id]', userId);
    sessionBody.append('subscription_data[trial_period_days]', '7');
    sessionBody.append('metadata[supabase_user_id]', userId);
    sessionBody.append('payment_method_types[0]', 'card');

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionBody.toString()
    });

    const session = await sessionRes.json();
    if (session.error) throw new Error(`Stripe session error: ${session.error.message}`);

    return res.status(200).json({ url: session.url });

  } catch(err) {
    return sendError(res, 500, ERR.internal, err, 'checkout');
  }
}
