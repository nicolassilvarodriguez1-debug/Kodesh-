// KODESH — Stripe webhook handler.
// This is the SOURCE OF TRUTH for subscription/plan state. api/confirm.js
// only does a best-effort synchronous check right after checkout — it never
// replaces this handler, and this handler never trusts anything the client
// asserts (it always re-derives state from the verified Stripe event).
//
// Security hardening in this file:
//  - Raw-body HMAC-SHA256 signature verification (unchanged approach).
//  - Tolerates Stripe's signature-rotation window: the Stripe-Signature
//    header can contain MULTIPLE `v1=` values while a secret is being
//    rotated: https://stripe.com/docs/webhooks/signatures#verify-manually
//    We now check ALL of them, not just the first found.
//  - Constant-time comparison (Node's crypto.timingSafeEqual) instead of
//    `!==`, so signature comparison can't leak timing information.
//  - Idempotency: each event.id is recorded in stripe_webhook_events before
//    processing. If the same event is redelivered (Stripe retries on any
//    non-2xx, or can occasionally redeliver already-acked events), we skip
//    reprocessing and just return 200.

import nodeCrypto from 'crypto';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Constant-time hex-string comparison. Returns false (never throws) on any
// mismatch, including a length mismatch, without leaking timing info beyond
// "these are hex signatures of a known algorithm" (already public).
export function timingSafeHexEqual(a, b) {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return nodeCrypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

export async function verifyStripeSignature(rawBody, signature, secret) {
  const encoder = new TextEncoder();
  const parts = signature.split(',').map(p => p.trim());
  const timestampPart = parts.find(p => p.startsWith('t='));
  const sigParts = parts.filter(p => p.startsWith('v1='));
  if (!timestampPart || sigParts.length === 0) {
    throw new Error('Malformed Stripe-Signature header');
  }
  const timestamp = timestampPart.split('=')[1];
  const candidateSigs = sigParts.map(p => p.slice('v1='.length));

  // Check timestamp tolerance (5 minutes) before doing any crypto work.
  const tolerance = 300;
  if (!timestamp || Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > tolerance) {
    throw new Error('Webhook timestamp too old');
  }

  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Accept if ANY of the v1= candidates match — tolerates key-rotation
  // windows where Stripe sends signatures for both the old and new secret.
  const matched = candidateSigs.some(sig => timingSafeHexEqual(expectedSig, sig));
  if (!matched) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(rawBody.toString());
}

function sbHeaders() {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  return {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Idempotency guard. Tries to INSERT the event id first; a unique-violation
// (already exists) means this exact event was already processed, so the
// caller should skip reprocessing. Returns true if this is a NEW event that
// should be processed now, false if it's a duplicate delivery.
async function claimEventOnce(eventId, eventType) {
  const SB_URL = process.env.SUPABASE_URL;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/stripe_webhook_events`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id: eventId, type: eventType }),
    });
    if (res.status === 201 || res.status === 204) return true;
    if (res.status === 409) return false; // duplicate — already processed
    // Any other unexpected response: log and, to be safe, process anyway
    // rather than silently dropping a legitimate event.
    console.warn('[webhook] idempotency insert unexpected status:', res.status);
    return true;
  } catch (e) {
    console.warn('[webhook] idempotency check failed, processing anyway:', e.message);
    return true;
  }
}

async function updateUserPlan(customerId, status, subscriptionId, periodEnd) {
  const SB_URL = process.env.SUPABASE_URL;
  const headers = { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' };

  // Find user by stripe customer ID
  const res = await fetch(`${SB_URL}/rest/v1/user_plans?stripe_customer_id=eq.${customerId}&select=user_id&limit=1`, { headers });
  const data = await res.json();

  if (!data?.[0]?.user_id) {
    console.warn('No user found for customer:', customerId);
    return;
  }

  const userId = data[0].user_id;

  // 'trialing' cuenta como premium — si no, los usuarios en su prueba
  // gratis de 7 días quedarían bloqueados como plan 'free'.
  const isPremiumStatus = status === 'active' || status === 'trialing';

  await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      plan: isPremiumStatus ? 'premium' : 'free',
      subscription_status: status,
      stripe_subscription_id: subscriptionId,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  });

  console.log(`Updated user ${userId} to plan: ${isPremiumStatus ? 'premium' : 'free'} (status: ${status})`);
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
    // Signature/timestamp errors are safe to summarize generically — never
    // echo internal details, but this one specific case (webhook auth) is
    // low-risk to briefly describe since it's not user-facing.
    console.error('Webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Idempotency: skip reprocessing if we've already handled this event.id.
  const isNewEvent = await claimEventOnce(event.id, event.type);
  if (!isNewEvent) {
    console.log(`[webhook] duplicate delivery of ${event.id} (${event.type}) — skipping`);
    return res.status(200).json({ received: true, duplicate: true });
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
    console.error('Webhook handler error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error processing webhook' });
  }

  return res.status(200).json({ received: true });
}
