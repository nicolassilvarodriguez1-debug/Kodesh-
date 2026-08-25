// KODESH — Stripe webhook handler.
// This is the SOURCE OF TRUTH for subscription/plan state. api/confirm.js
// only does a best-effort synchronous check right after checkout — it never
// replaces this handler, and this handler never trusts anything the client
// asserts (it always re-derives state from the verified Stripe event).
//
// Security hardening in this file:
//  - Raw-body HMAC-SHA256 signature verification.
//  - Tolerates Stripe's signature-rotation window: the Stripe-Signature
//    header can contain MULTIPLE `v1=` values while a secret is being
//    rotated. We check ALL of them, not just the first found.
//  - Constant-time comparison (Node's crypto.timingSafeEqual) instead of
//    `!==`, so signature comparison can't leak timing information.
//
// Idempotency (2nd-pass redesign — see supabase/migrations/
// 20260813_webhook_lifecycle_ai_usage_repair_locks.sql):
//  Each event.id goes through claim → process → complete/fail, backed by
//  stripe_webhook_events.status ('processing'/'completed'/'failed') and a
//  random per-attempt lease_token, via three atomic RPCs:
//    - claim_stripe_webhook_event   — row-locked acquire-or-reclaim
//    - complete_stripe_webhook_event — only succeeds if we still hold the lease
//    - fail_stripe_webhook_event     — only succeeds if we still hold the lease
//  This fixes a real bug in the previous design: that version recorded
//  event.id as "done" the instant it was first seen, BEFORE processing —
//  so a crash/error partway through (e.g. the Supabase update failing)
//  would permanently mark a real event as already-handled, and Stripe's
//  retry would be silently swallowed as a "duplicate". Now:
//    - A duplicate delivery of a COMPLETED event → 200 immediately, no reprocessing.
//    - A delivery that arrives while another instance's lease on the same
//      event is still fresh → 200 without reprocessing (avoids double work).
//    - A delivery for a FAILED event, or a 'processing' event whose lease
//      expired (its instance crashed/died) → reclaimed and processed again.
//    - The event is marked 'completed' ONLY after every required operation
//      (updateUserPlan, etc.) has actually succeeded — verified against
//      real Supabase/Stripe HTTP responses, not assumed.

import nodeCrypto from 'crypto';

export const config = { api: { bodyParser: false } };

// How long a claimed-but-not-yet-completed event is considered "actively
// being processed" before another instance is allowed to reclaim it. Must
// comfortably exceed the worst-case time this handler could take (a couple
// of sequential Supabase/Stripe HTTP calls) — 10 minutes, per the requested
// 5–15 minute window.
const LEASE_SECONDS = 600;

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

async function sbRpc(fn, args) {
  const SB_URL = process.env.SUPABASE_URL;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC ${fn} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function claimEvent(eventId, eventType, leaseToken, leaseSeconds = LEASE_SECONDS) {
  return sbRpc('claim_stripe_webhook_event', {
    p_event_id: eventId, p_event_type: eventType, p_lease_token: leaseToken, p_lease_seconds: leaseSeconds,
  });
}

export async function completeEvent(eventId, leaseToken) {
  const result = await sbRpc('complete_stripe_webhook_event', { p_event_id: eventId, p_lease_token: leaseToken });
  return result === true;
}

export async function failEvent(eventId, leaseToken, errorMsg) {
  const result = await sbRpc('fail_stripe_webhook_event', {
    p_event_id: eventId, p_lease_token: leaseToken, p_error: String(errorMsg || '').slice(0, 500),
  });
  return result === true;
}

// Looks up the KODESH user for a Stripe customer, then applies the plan
// update. Throws on ANY failure — a failed HTTP response is never treated
// as success, and "the update didn't actually affect the expected user row"
// is treated as a failure too (both cases bubble up so the caller marks the
// event 'failed' and lets Stripe retry, instead of silently losing it).
async function updateUserPlan(customerId, status, subscriptionId, periodEnd) {
  const SB_URL = process.env.SUPABASE_URL;

  const lookupRes = await fetch(
    `${SB_URL}/rest/v1/user_plans?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id&limit=1`,
    { headers: sbHeaders() }
  );
  if (!lookupRes.ok) {
    throw new Error(`Supabase lookup failed (${lookupRes.status}) for customer ${customerId}`);
  }
  const data = await lookupRes.json();

  if (!data?.[0]?.user_id) {
    // No linked user for this customer yet. This can legitimately happen if
    // the webhook races ahead of checkout.js finishing its own write of
    // stripe_customer_id — throwing here (rather than silently returning)
    // means the event is marked 'failed' and Stripe retries with backoff,
    // giving that race time to resolve, instead of permanently losing the
    // plan update.
    throw new Error(`No user found for Stripe customer ${customerId}`);
  }

  const userId = data[0].user_id;

  // 'trialing' cuenta como premium — si no, los usuarios en su prueba
  // gratis de 7 días quedarían bloqueados como plan 'free'.
  const isPremiumStatus = status === 'active' || status === 'trialing';

  const patchRes = await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      plan: isPremiumStatus ? 'premium' : 'free',
      subscription_status: status,
      stripe_subscription_id: subscriptionId,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  });

  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => '');
    throw new Error(`Supabase update failed (${patchRes.status}) for user ${userId}: ${text.slice(0, 200)}`);
  }

  // Never assume a 2xx means the row was actually touched — verify the
  // response body reflects exactly the user we intended to update.
  const updated = await patchRes.json();
  if (!Array.isArray(updated) || updated.length === 0 || updated[0].user_id !== userId) {
    throw new Error(`Supabase update affected 0 rows (or the wrong row) for user ${userId}`);
  }

  console.log(`Updated user ${userId} to plan: ${isPremiumStatus ? 'premium' : 'free'} (status: ${status})`);
}

async function processEvent(event) {
  const obj = event.data.object;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await updateUserPlan(obj.customer, obj.status, obj.id, obj.current_period_end);
      break;

    case 'customer.subscription.deleted':
      await updateUserPlan(obj.customer, 'canceled', obj.id, null);
      break;

    case 'invoice.payment_succeeded':
      if (obj.subscription) {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${obj.subscription}`, {
          headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` }
        });
        if (!subRes.ok) {
          throw new Error(`Stripe subscription fetch failed (${subRes.status}) for ${obj.subscription}`);
        }
        const sub = await subRes.json();
        await updateUserPlan(obj.customer, sub.status, sub.id, sub.current_period_end);
      }
      break;

    default:
      // Unhandled event types: nothing to do, but still a successful,
      // completable outcome — otherwise Stripe would retry these forever.
      break;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'No signature' });

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = await verifyStripeSignature(rawBody.toString(), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const leaseToken = nodeCrypto.randomUUID();
  let claim;
  try {
    claim = await claimEvent(event.id, event.type, leaseToken, LEASE_SECONDS);
  } catch (err) {
    // Can't even determine idempotency state — the safest option is to let
    // Stripe retry rather than risk double-processing or silently dropping
    // the event by guessing.
    console.error('[webhook] claim RPC failed:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }

  if (!claim.claimed) {
    // Any resolved status other than 'processing' means this event is
    // already settled and must never be silently reprocessed:
    //   - 'completed'      — normal duplicate delivery of a fully-handled event.
    //   - 'legacy_unknown' — a row inserted by the OLD (pre-redesign) webhook
    //     code, which recorded an event as "done" merely because it saw the
    //     id once — that is NOT proof the plan update actually succeeded.
    //     We still must not blindly reprocess it here: replaying an old
    //     event's stale payload could overwrite a user's CURRENT plan with
    //     out-of-date data if later events have since superseded it. See
    //     scripts/reconcile-stripe-subscriptions.mjs for the safe fix —
    //     reconciling against Stripe's live subscription state, not this
    //     event's historical payload.
    //   - 'reconciled'     — a legacy row the reconciliation script has
    //     already resolved against Stripe's live state.
    if (claim.status !== 'processing') {
      console.log(`[webhook] duplicate/settled delivery of ${event.id} (${event.type}), status=${claim.status} — skipping`);
      return res.status(200).json({ received: true, duplicate: true, status: claim.status });
    }
    // status === 'processing' with a fresh lease held by ANOTHER instance.
    //
    // We must NOT ack 200 here (this was the bug in the previous design).
    // Stripe treats any 2xx as "delivered — never redeliver this event
    // again". If we respond 200 while the other instance is still
    // mid-flight, and that instance then crashes before it can call
    // completeEvent()/failEvent(), there is no longer any in-flight
    // request that will ever reclaim the event: it just sits at
    // 'processing' until the lease quietly expires, with nobody left to
    // notice. Stripe already gave up retrying because we told it "received".
    //
    // Responding with a non-2xx (409 — the event is in conflict with an
    // in-progress attempt, try again) instead makes Stripe retry with
    // backoff. By the time it does, one of two safe outcomes has happened:
    // the other instance finished (this delivery becomes an ordinary
    // duplicate-of-completed 200 above), or its lease expired (this
    // delivery reclaims and processes the event itself, per claimEvent's
    // reclaim logic). Either way the event can never be silently stranded.
    console.log(`[webhook] ${event.id} (${event.type}) already being processed by another instance — asking Stripe to retry`);
    return res.status(409).json({ received: false, status: 'processing' });
  }

  try {
    await processEvent(event);
  } catch (err) {
    console.error(`[webhook] processing failed for ${event.id} (${event.type}):`, err?.message || err);
    try {
      await failEvent(event.id, leaseToken, err?.message || 'unknown error');
    } catch (err2) {
      console.error('[webhook] failed to mark event as failed:', err2?.message || err2);
    }
    // 500 so Stripe retries — the event is now 'failed' and will be
    // reclaimed and reprocessed on the next delivery attempt.
    return res.status(500).json({ error: 'Internal error processing webhook' });
  }

  // processEvent() succeeded — the Stripe state has genuinely been applied
  // (or there was nothing to do, e.g. an unhandled event type). We still
  // must not ack 200 until we've CONFIRMED 'completed' was recorded: if we
  // crashed right here, an unconfirmed event would be stuck 'processing'
  // with no in-flight request left to reclaim it — the exact same failure
  // mode as the race above, just triggered at a different point.
  let completed;
  try {
    completed = await completeEvent(event.id, leaseToken);
  } catch (err) {
    console.error('[webhook] failed to mark event completed (RPC error):', err?.message || err);
    // Deliberately do NOT call failEvent() here: we already correctly
    // applied the real Stripe state via processEvent()/updateUserPlan(),
    // which always writes the same target fields regardless of how many
    // times it runs (idempotent). Marking this 'failed' would be a lie
    // ("processing failed") when it didn't — and it's safe to simply let a
    // retry re-run processEvent (a harmless no-op re-write) rather than
    // guess at the event's status. 500 makes Stripe retry; the event stays
    // 'processing' until either this retry succeeds in confirming
    // completion, or the lease expires and another delivery reclaims it.
    return res.status(500).json({ error: 'Internal error confirming webhook completion' });
  }

  if (!completed) {
    // completeEvent() returned false: by the time we tried to confirm
    // completion, we no longer held the lease (e.g. it expired mid-request
    // and another instance already reclaimed the event and is reprocessing
    // it). We already applied the correct Stripe state ourselves, but we
    // cannot claim OUR attempt was the one recorded as 'completed' — the
    // reclaiming instance owns that now. Do not ack 200: a 500 here lets
    // Stripe retry, which will land on either 'completed' (if the
    // reclaimer finished first) or a fresh 'processing' lease (409, retry
    // again) — never on a silently-dropped event.
    console.warn(`[webhook] lease lost for ${event.id} before completion could be recorded`);
    return res.status(500).json({ error: 'Internal error confirming webhook completion' });
  }

  return res.status(200).json({ received: true });
}
