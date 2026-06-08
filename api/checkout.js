export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, userEmail, userName } = req.body;
  if (!userId || !userEmail) return res.status(400).json({ error: 'userId y userEmail requeridos' });

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
    // Check existing plan
    const planRes = await fetch(
      `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id,plan,subscription_status&limit=1`,
      { headers: sbHeaders }
    );
    const planData = await planRes.json();
    const existingPlan = Array.isArray(planData) ? planData[0] : null;

    // Already subscribed?
    if (existingPlan?.plan === 'premium' && existingPlan?.subscription_status === 'active') {
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
        name: userName || userEmail,
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

      // Save customer ID to Supabase
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

    // Create checkout session
    const sessionBody = new URLSearchParams({
      customer: customerId,
      mode: 'subscription',
      success_url: `https://kodeshbible.com/app?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://kodeshbible.com/app?upgrade=canceled`,
      locale: 'es',
    });
    sessionBody.append('line_items[0][price]', PRICE_ID);
    sessionBody.append('line_items[0][quantity]', '1');
    sessionBody.append('subscription_data[metadata][supabase_user_id]', userId);
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
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
