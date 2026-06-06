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
  const PRICE_ID = 'price_1TfMXpJEr2qnbhygbuMWM6Q4';

  try {
    // Check if user already has a Stripe customer ID
    const headers = {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    };

    const planRes = await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id,plan,subscription_status&limit=1`, { headers });
    const planData = await planRes.json();
    const existingPlan = planData?.[0];

    // If already premium and active, return error
    if (existingPlan?.plan === 'premium' && existingPlan?.subscription_status === 'active') {
      return res.status(400).json({ error: 'already_subscribed', message: 'Ya tienes KODESH Premium activo.' });
    }

    let customerId = existingPlan?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: userEmail,
          name: userName || userEmail,
          metadata: JSON.stringify({ supabase_user_id: userId }),
        }).toString()
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      // Save customer ID to Supabase
      await fetch(`${SB_URL}/rest/v1/user_plans`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: userId,
          stripe_customer_id: customerId,
          plan: 'free',
          subscription_status: 'inactive',
        })
      });
    }

    // Create checkout session
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: 'subscription',
        'line_items[0][price]': PRICE_ID,
        'line_items[0][quantity]': '1',
        success_url: `https://kodesh-sandy.vercel.app/index.html?upgrade=success`,
        cancel_url: `https://kodesh-sandy.vercel.app/index.html?upgrade=canceled`,
        'subscription_data[metadata][supabase_user_id]': userId,
        locale: 'es',
        'payment_method_types[0]': 'card',
      }).toString()
    });

    const session = await sessionRes.json();

    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });

  } catch(err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
