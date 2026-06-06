// Called after successful Stripe payment to confirm and activate plan
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, sessionId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

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
    let subscriptionActive = false;
    let customerId = null;
    let subscriptionId = null;
    let periodEnd = null;

    // If we have a session ID, verify it with Stripe
    if (sessionId) {
      const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=subscription`, {
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
      });
      const session = await sessionRes.json();

      if (session.payment_status === 'paid' && session.subscription) {
        subscriptionActive = true;
        customerId = session.customer;
        subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
        periodEnd = typeof session.subscription === 'object'
          ? session.subscription.current_period_end
          : null;
      }
    } else {
      // Check existing customer subscriptions
      const planRes = await fetch(
        `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id&limit=1`,
        { headers: sbHeaders }
      );
      const planData = await planRes.json();
      customerId = planData?.[0]?.stripe_customer_id;

      if (customerId) {
        const subsRes = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
          { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
        );
        const subs = await subsRes.json();
        if (subs.data?.length > 0) {
          subscriptionActive = true;
          subscriptionId = subs.data[0].id;
          periodEnd = subs.data[0].current_period_end;
        }
      }
    }

    if (subscriptionActive) {
      // Update plan to premium
      await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          plan: 'premium',
          subscription_status: 'active',
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
      });

      return res.status(200).json({ success: true, plan: 'premium' });
    }

    return res.status(200).json({ success: false, plan: 'free' });

  } catch(err) {
    console.error('Confirm error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
