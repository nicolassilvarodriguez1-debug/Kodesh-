export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function verifyStripeSignature(rawBody, signature, secret) {
  // Manual HMAC-SHA256 verification without Stripe SDK
  const encoder = new TextEncoder();
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const sig = parts.find(p => p.startsWith('v1=')).split('=')[1];

  const payload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Check timestamp is within 5 minutes
  const tolerance = 300;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
    throw new Error('Webhook timestamp too old');
  }

  if (expectedSig !== sig) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(rawBody.toString());
}

async function updateUserPlan(customerId, status, subscriptionId, periodEnd) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };

  // Find user by stripe customer ID
  const res = await fetch(`${SB_URL}/rest/v1/user_plans?stripe_customer_id=eq.${customerId}&select=user_id&limit=1`, { headers });
  const data = await res.json();

  if (!data?.[0]?.user_id) {
    console.warn('No user found for customer:', customerId);
    return;
  }

  const userId = data[0].user_id;

  await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      plan: status === 'active' ? 'premium' : 'free',
      subscription_status: status,
      stripe_subscription_id: subscriptionId,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  });

  console.log(`Updated user ${userId} to plan: ${status === 'active' ? 'premium' : 'free'}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'No signature' });

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = await verifyStripeSignature(rawBody.toString(), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const obj = event.data.object;

  try {
    switch(event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await updateUserPlan(
          obj.customer,
          obj.status,
          obj.id,
          obj.current_period_end
        );
        break;

      case 'customer.subscription.deleted':
        await updateUserPlan(obj.customer, 'canceled', obj.id, null);
        break;

      case 'invoice.payment_succeeded':
        if (obj.subscription) {
          // Refresh subscription status
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${obj.subscription}`, {
            headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` }
          });
          const sub = await subRes.json();
          await updateUserPlan(obj.customer, sub.status, sub.id, sub.current_period_end);
        }
        break;
    }
  } catch(err) {
    console.error('Webhook handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
