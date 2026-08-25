#!/usr/bin/env node
// KODESH — Admin script: reconcile user_plans against Stripe's LIVE
// subscription state, and close out legacy webhook events.
//
// WHY THIS EXISTS (see supabase/migrations/20260814_self_sufficient_repair.sql,
// Objective 4 of the third security audit):
//
// Rows in stripe_webhook_events with status = 'legacy_unknown' were
// inserted by the OLD (pre-idempotency-redesign) webhook handler, which
// recorded an event as "seen" the instant it arrived — BEFORE doing any
// real work. A row existing there does not prove the corresponding
// user_plans update actually happened; it could just as easily represent a
// crash or a failed Supabase write that nobody ever retried.
//
// The webhook handler itself deliberately does NOT try to "fix" this by
// blindly reprocessing these old events — replaying a years-old event's
// stale payload could overwrite a user's CURRENT plan with out-of-date
// data if later events have since superseded it (a real risk: subscription
// state changes constantly — upgrades, downgrades, cancellations, renewals).
//
// This script takes the only source of truth that can never be stale:
// Stripe's LIVE subscription state, fetched fresh, right now, for every
// customer we have on file — regardless of what any historical webhook
// event said. It is intentionally NOT wired into any API endpoint (running
// it must be a deliberate, manual, admin action — see "HOW TO RUN" below).
//
// WHAT IT DOES
//   1. Reads every row in user_plans that has a stripe_customer_id.
//   2. For each, asks Stripe for that customer's current subscriptions.
//   3. Picks the most relevant one (prefers active/trialing; falls back to
//      the most recently updated of any status) and updates user_plans to
//      match it exactly — the same fields api/webhook.js's updateUserPlan()
//      writes, so the result is indistinguishable from a normal webhook-
//      driven update.
//   4. Reports every customer where the stored plan disagreed with Stripe's
//      live state (this is the number you actually care about).
//   5. Only after step 1-4 finish for EVERY customer, marks all
//      'legacy_unknown' stripe_webhook_events rows as 'reconciled' — this
//      is a blanket close-out because reconciliation here is driven by the
//      complete user_plans table, not by matching individual old events.
//
// HOW TO RUN
//   1. First check whether you even need to: run verification query (g) in
//      20260814_self_sufficient_repair.sql. If it returns 0, there is
//      nothing to reconcile and you can skip this script entirely.
//   2. Dry run first (default — makes NO writes, only prints what it
//      would change):
//        SUPABASE_URL=... SUPABASE_SERVICE_KEY=... STRIPE_SECRET_KEY=... \
//          node scripts/reconcile-stripe-subscriptions.mjs
//   3. Review the output. If it looks right, apply for real:
//        SUPABASE_URL=... SUPABASE_SERVICE_KEY=... STRIPE_SECRET_KEY=... \
//          node scripts/reconcile-stripe-subscriptions.mjs --apply
//
// Never commit real values for these env vars anywhere in this repo. Run
// this from a trusted machine/shell with the production service key
// exported only for the duration of the command.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !STRIPE_SECRET_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY');
  process.exit(1);
}

function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe GET ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Picks the subscription that best represents "the customer's current
// plan" the same way a human reading the Stripe dashboard would: prefer an
// active/trialing subscription; otherwise take whichever one was updated
// most recently (so a canceled subscription still correctly reports as
// canceled instead of silently defaulting to nothing).
function pickRelevantSubscription(subscriptions) {
  if (!subscriptions.length) return null;
  const live = subscriptions.filter(s => s.status === 'active' || s.status === 'trialing');
  if (live.length) {
    return live.sort((a, b) => b.current_period_end - a.current_period_end)[0];
  }
  return subscriptions.sort((a, b) => (b.canceled_at || b.current_period_end || 0) - (a.canceled_at || a.current_period_end || 0))[0];
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write changes)' : 'DRY RUN (no writes — pass --apply to write)'}`);

  const customers = await sbGet('user_plans?stripe_customer_id=not.is.null&select=user_id,stripe_customer_id,plan,subscription_status,current_period_end');
  console.log(`Found ${customers.length} user_plans row(s) with a stripe_customer_id.\n`);

  let mismatches = 0;
  let errors = 0;

  for (const row of customers) {
    try {
      const subs = await stripeGet(`subscriptions?customer=${encodeURIComponent(row.stripe_customer_id)}&status=all&limit=10`);
      const sub = pickRelevantSubscription(subs.data || []);

      const liveStatus = sub ? sub.status : 'canceled'; // no subscription at all == effectively canceled
      const livePlan = (liveStatus === 'active' || liveStatus === 'trialing') ? (row.plan || 'premium') : 'free';
      const livePeriodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const liveSubId = sub?.id || null;

      const disagrees = row.subscription_status !== liveStatus
        || row.plan !== livePlan
        || (row.current_period_end || null) !== livePeriodEnd;

      if (disagrees) {
        mismatches++;
        console.log(`MISMATCH user_id=${row.user_id} customer=${row.stripe_customer_id}`);
        console.log(`  stored: plan=${row.plan} status=${row.subscription_status} period_end=${row.current_period_end}`);
        console.log(`  stripe: plan=${livePlan} status=${liveStatus} period_end=${livePeriodEnd}`);

        if (APPLY) {
          await sbPatch(`user_plans?user_id=eq.${row.user_id}`, {
            plan: livePlan,
            subscription_status: liveStatus,
            stripe_subscription_id: liveSubId,
            current_period_end: livePeriodEnd,
            updated_at: new Date().toISOString(),
          });
          console.log('  -> updated.');
        }
      }
    } catch (err) {
      errors++;
      console.error(`ERROR reconciling user_id=${row.user_id} customer=${row.stripe_customer_id}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${customers.length} customer(s) checked, ${mismatches} mismatch(es)${APPLY ? ' updated' : ' found (dry run — nothing written)'}, ${errors} error(s).`);

  if (errors > 0) {
    console.error('\nRefusing to mark legacy events as reconciled — at least one customer could not be checked. Fix the errors above and re-run.');
    process.exit(1);
  }

  if (APPLY) {
    const legacyCount = await sbGet('stripe_webhook_events?status=eq.legacy_unknown&select=id');
    if (legacyCount.length > 0) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events?status=eq.legacy_unknown`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ status: 'reconciled' }),
      });
      if (!res.ok) throw new Error(`Failed to mark legacy events reconciled (${res.status}): ${(await res.text()).slice(0, 300)}`);
      console.log(`Marked ${legacyCount.length} legacy_unknown webhook event row(s) as 'reconciled'.`);
    } else {
      console.log('No legacy_unknown webhook event rows to mark.');
    }
  } else {
    console.log('\nDry run only — no writes made. Re-run with --apply to write the changes above.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
