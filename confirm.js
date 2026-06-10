export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
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
    let subscriptionId = null;
    let customerId = null;
    let periodEnd = null;
    let subscriptionActive = false;

    if (sessionId) {
      // Verify checkout session with Stripe
      const sessionRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
        { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
      );
      const session = await sessionRes.json();
      console.log('Session status:', session.payment_status, 'Sub:', session.subscription);

      if (session.payment_status === 'paid' && session.subscription) {
        customerId = session.customer;
        subscriptionId = session.subscription;

        // Get subscription details
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
          { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
        );
        const sub = await subRes.json();
        console.log('Sub status:', sub.status);

        if (sub.status === 'active' || sub.status === 'trialing') {
          subscriptionActive = true;
          periodEnd = sub.current_period_end;
        }
      }
    }

    if (!subscriptionActive) {
      // Fallback: check by customer ID
      const planRes = await fetch(
        `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id&limit=1`,
        { headers: sbHeaders }
      );
      const planData = await planRes.json();
      const cid = planData?.[0]?.stripe_customer_id;

      if (cid) {
        const subsRes = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${cid}&status=active&limit=1`,
          { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
        );
        const subs = await subsRes.json();
        if (subs.data?.length > 0) {
          subscriptionActive = true;
          subscriptionId = subs.data[0].id;
          customerId = cid;
          periodEnd = subs.data[0].current_period_end;
        }
      }
    }

    if (subscriptionActive) {
      const updateBody = {
        plan: 'premium',
        subscription_status: 'active',
        stripe_subscription_id: subscriptionId,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (customerId) updateBody.stripe_customer_id = customerId;

      // Try PATCH first
      const patchRes = await fetch(
        `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`,
        { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(updateBody) }
      );

      // If no rows updated, INSERT
      if (patchRes.status === 204 || patchRes.ok) {
        console.log('Plan updated to premium for user:', userId);
      } else {
        await fetch(`${SB_URL}/rest/v1/user_plans`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({ user_id: userId, ...updateBody })
        });
      }

      return res.status(200).json({ success: true, plan: 'premium' });
    }

    return res.status(200).json({ success: false, plan: 'free' });

  } catch(err) {
    console.error('Confirm error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
