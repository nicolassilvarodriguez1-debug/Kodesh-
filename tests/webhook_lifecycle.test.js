// KODESH — Tests for api/webhook.js's idempotency/lifecycle redesign
// (claim -> process -> complete/fail). Exercises the REAL handler() against
// a stateful in-memory mock of the claim/complete/fail RPCs and user_plans
// table — see tests/_helpers.js for the mock's design notes.
//
// Cryptographic signature verification itself (valid/tampered/rotated
// signatures, stale timestamps) is already covered by
// tests/security.test.js's "Stripe webhook: signature verification
// end-to-end" suite — not duplicated here (item 23 in the audit spec).
//
// True cross-transaction atomicity of the real Postgres RPCs is
// demonstrated separately in supabase/tests/concurrency_repro.md, which
// requires two live database sessions — something no in-process mock can
// actually prove.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWebhookReq, makeRes, createMockFetch, setFakeEnv,
  signWebhookBody, createWebhookEventsStore, webhookRpcRoute, userPlansRoute,
} from './_helpers.js';

setFakeEnv();

const { default: webhookHandler } = await import('../api/webhook.js');

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

function subEvent(id, overrides = {}) {
  return {
    id,
    type: 'customer.subscription.updated',
    data: {
      object: {
        customer: 'cus_1',
        status: 'active',
        id: 'sub_1',
        current_period_end: Math.floor(Date.now() / 1000) + 86400,
        ...overrides,
      },
    },
  };
}

async function deliver(handler, eventBody, routes) {
  const { rawBody, header } = await signWebhookBody(eventBody);
  const mockFetch = createMockFetch(routes);
  globalThis.fetch = mockFetch;
  const req = makeWebhookReq({ headers: { 'stripe-signature': header }, rawBody });
  const res = makeRes();
  await handler(req, res);
  return { res, mockFetch };
}

describe('webhook.js: completed events are never reprocessed', () => {
  test('item 16 — a duplicate delivery of a COMPLETED event is ignored with 200, updateUserPlan runs only once', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_dup_1');

    const first = await deliver(webhookHandler, event, routes);
    assert.equal(first.res.statusCode, 200);
    assert.equal(first.res.body.duplicate, undefined);
    assert.equal(store.rows.get('evt_dup_1').status, 'completed');

    const second = await deliver(webhookHandler, event, routes);
    assert.equal(second.res.statusCode, 200);
    assert.equal(second.res.body.duplicate, true);

    const patchCallsAcrossBoth = [...first.mockFetch.calls, ...second.mockFetch.calls]
      .filter(c => c.method === 'PATCH' && c.url.includes('user_plans'));
    assert.equal(patchCallsAcrossBoth.length, 1, 'updateUserPlan should have run exactly once total');
  });
});

describe('webhook.js: failed events can be reclaimed and retried', () => {
  test('item 17 & 21 — a FAILED event is reprocessed on the next delivery and succeeds', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' }, failPatch: true };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_retry_1');

    const first = await deliver(webhookHandler, event, routes);
    assert.equal(first.res.statusCode, 500);
    assert.equal(store.rows.get('evt_retry_1').status, 'failed');
    assert.ok(store.rows.get('evt_retry_1').last_error);

    // Stripe would redeliver the same event after a 500. Now the transient
    // failure is gone (as if Supabase recovered) and it should succeed.
    planState.failPatch = false;
    const second = await deliver(webhookHandler, event, routes);
    assert.equal(second.res.statusCode, 200);
    assert.equal(store.rows.get('evt_retry_1').status, 'completed');
    assert.equal(store.rows.get('evt_retry_1').attempts, 2);
  });

  test('item 20 — if updateUserPlan fails, the event is NEVER marked completed', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' }, failLookup: true };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_never_complete');

    const { res } = await deliver(webhookHandler, event, routes);
    assert.equal(res.statusCode, 500);
    assert.notEqual(store.rows.get('evt_never_complete').status, 'completed');
    assert.equal(store.rows.get('evt_never_complete').status, 'failed');
  });
});

describe('webhook.js: concurrent-delivery protection', () => {
  test('item 18 — a delivery arriving while another instance holds a fresh lease does NOT run updateUserPlan and returns a non-2xx so Stripe retries', async () => {
    const store = createWebhookEventsStore();
    // Simulate another instance already mid-flight, holding the lease.
    store.claim({ p_event_id: 'evt_inflight', p_event_type: 'customer.subscription.updated', p_lease_token: 'other-instance-lease', p_lease_seconds: 600 });

    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [
      webhookRpcRoute(store),
      {
        match: (url) => url.includes('/rest/v1/user_plans'),
        handle: async () => { throw new Error('user_plans must not be touched while another instance holds the lease'); },
      },
    ];
    const event = subEvent('evt_inflight');

    const { res } = await deliver(webhookHandler, event, routes);
    // Must NOT be 200 — a 200 here would tell Stripe "delivered, never
    // retry", and if the instance holding the lease then crashes before
    // completing/failing the event, nothing would ever reclaim it (see the
    // long comment in api/webhook.js). Any non-2xx that Stripe retries is
    // acceptable; the handler uses 409.
    assert.ok(res.statusCode < 200 || res.statusCode >= 300, `expected a non-2xx status, got ${res.statusCode}`);
    assert.equal(res.body.status, 'processing');
    assert.equal(store.rows.get('evt_inflight').lease_token, 'other-instance-lease', 'the other instance\'s lease must be untouched');
  });

  test('item 19 — an ABANDONED processing lease (expired) can be reclaimed and processed', async () => {
    const store = createWebhookEventsStore();
    store.claim({ p_event_id: 'evt_abandoned', p_event_type: 'customer.subscription.updated', p_lease_token: 'crashed-instance-lease', p_lease_seconds: 600 });
    store.expireLease('evt_abandoned');

    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_abandoned');

    const { res } = await deliver(webhookHandler, event, routes);
    assert.equal(res.statusCode, 200);
    assert.equal(store.rows.get('evt_abandoned').status, 'completed');
    assert.equal(store.rows.get('evt_abandoned').attempts, 2);
    assert.notEqual(store.rows.get('evt_abandoned').lease_token, 'crashed-instance-lease');
  });

  test('item 22 — two simultaneous deliveries of the same NEW event never both run updateUserPlan', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_concurrent');

    const [{ rawBody, header }] = await Promise.all([signWebhookBody(event)]);
    const mockFetch = createMockFetch(routes);
    globalThis.fetch = mockFetch;

    const req1 = makeWebhookReq({ headers: { 'stripe-signature': header }, rawBody });
    const res1 = makeRes();
    const req2 = makeWebhookReq({ headers: { 'stripe-signature': header }, rawBody });
    const res2 = makeRes();

    await Promise.all([webhookHandler(req1, res1), webhookHandler(req2, res2)]);

    // Exactly one delivery actually claims and processes the event (200, no
    // duplicate flag). The other delivery observes either:
    //   - the winner already fully 'completed' by the time it claims -> 200
    //     with duplicate:true, or
    //   - the winner still mid-flight with a fresh lease -> a non-2xx
    //     (409) so Stripe retries instead of silently dropping it.
    // Both are safe, non-double-processing outcomes — what must NEVER
    // happen is a bare 200 that isn't one of "genuinely completed" or
    // "already completed".
    const results = [
      { status: res1.statusCode, body: res1.body },
      { status: res2.statusCode, body: res2.body },
    ];
    const winners = results.filter(r => r.status === 200 && !r.body.duplicate);
    assert.equal(winners.length, 1, 'exactly one delivery should have won the claim and completed the event');

    const loser = results.find(r => r !== winners[0]);
    const loserIsDuplicate200 = loser.status === 200 && loser.body.duplicate === true;
    const loserIsRetryable = loser.status < 200 || loser.status >= 300;
    assert.ok(loserIsDuplicate200 || loserIsRetryable,
      `the losing delivery must be either a confirmed duplicate (200) or a non-2xx retry signal, got ${loser.status} ${JSON.stringify(loser.body)}`);

    const patchCalls = mockFetch.calls.filter(c => c.method === 'PATCH' && c.url.includes('user_plans'));
    assert.equal(patchCalls.length, 1, 'updateUserPlan must run exactly once even under concurrent delivery');
  });
});

describe('webhook.js: RPC unavailability fails safe', () => {
  test('claim RPC itself fails -> 500 so Stripe retries, no processing attempted', async () => {
    const routes = [
      { match: (url) => url.includes('/rpc/claim_stripe_webhook_event'), handle: async () => ({ status: 500, json: {} }) },
      { match: (url) => url.includes('/rest/v1/user_plans'), handle: async () => { throw new Error('must not process when claim RPC is unavailable'); } },
    ];
    const event = subEvent('evt_claim_unavailable');
    const { res } = await deliver(webhookHandler, event, routes);
    assert.equal(res.statusCode, 500);
  });

  test('completeEvent() RPC throws (non-2xx response) -> handler returns 500, event is NOT left/marked failed', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [
      {
        match: (url) => url.includes('/rpc/claim_stripe_webhook_event') || url.includes('/rpc/fail_stripe_webhook_event'),
        handle: async (url, options) => {
          const args = JSON.parse(options.body);
          if (url.includes('claim_stripe_webhook_event')) return { status: 200, json: store.claim(args) };
          return { status: 200, json: store.fail(args) };
        },
      },
      { match: (url) => url.includes('/rpc/complete_stripe_webhook_event'), handle: async () => ({ status: 500, json: { message: 'db unavailable' } }) },
      userPlansRoute(planState),
    ];
    const event = subEvent('evt_complete_rpc_down');
    const { res } = await deliver(webhookHandler, event, routes);

    assert.equal(res.statusCode, 500);
    // The Stripe state WAS applied correctly (processEvent succeeded) —
    // deliberately not marked 'failed' just because confirming completion
    // failed, per the spec: let the lease expire / a retry safely re-apply
    // the same idempotent update, rather than lying that processing failed.
    assert.equal(store.rows.get('evt_complete_rpc_down').status, 'processing');
  });

  test('completeEvent() returns false (lease already reclaimed) -> handler returns 500, never 200', async () => {
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [
      { match: (url) => url.includes('/rpc/claim_stripe_webhook_event'), handle: async () => ({ status: 200, json: { claimed: true, status: 'processing', attempts: 1 } }) },
      // Simulates the RPC's WHERE clause matching no row (lease no longer ours).
      { match: (url) => url.includes('/rpc/complete_stripe_webhook_event'), handle: async () => ({ status: 200, json: false }) },
      userPlansRoute(planState),
    ];
    const event = subEvent('evt_lease_lost');
    const { res } = await deliver(webhookHandler, event, routes);
    assert.equal(res.statusCode, 500);
  });
});

describe('webhook.js: only genuinely-safe paths ever return 200', () => {
  test('an unhandled/no-op event type is still claimed, completed, and acked 200 (not retried forever)', async () => {
    const store = createWebhookEventsStore();
    const routes = [
      webhookRpcRoute(store),
      { match: (url) => url.includes('/rest/v1/user_plans'), handle: async () => { throw new Error('a no-op event type must never touch user_plans'); } },
    ];
    // 'invoice.payment_failed' has no case in processEvent()'s switch — the
    // default branch does nothing, which is itself a legitimate "done".
    const event = { id: 'evt_noop', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } };
    const { res } = await deliver(webhookHandler, event, routes);
    assert.equal(res.statusCode, 200);
    assert.equal(store.rows.get('evt_noop').status, 'completed');
  });

  test('repeated delivery of equivalent subscription state (two different event ids) is idempotent — no error, same resulting PATCH', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];

    const eventA = subEvent('evt_idem_a');
    const eventB = subEvent('evt_idem_b'); // same customer/status/subscription — Stripe can legitimately send this twice under different event ids (e.g. created + updated)

    const first = await deliver(webhookHandler, eventA, routes);
    const second = await deliver(webhookHandler, eventB, routes);

    assert.equal(first.res.statusCode, 200);
    assert.equal(second.res.statusCode, 200);

    const patchBodies = [...first.mockFetch.calls, ...second.mockFetch.calls]
      .filter(c => c.method === 'PATCH' && c.url.includes('user_plans'))
      .map(c => JSON.parse(c.body));
    assert.equal(patchBodies.length, 2);
    assert.equal(patchBodies[0].plan, patchBodies[1].plan);
    assert.equal(patchBodies[0].subscription_status, patchBodies[1].subscription_status);
    assert.equal(patchBodies[0].stripe_subscription_id, patchBodies[1].stripe_subscription_id);
  });

  test('explicit race + crashed-instance simulation: B is told to retry while A holds the lease; after A "crashes" (lease expires unconfirmed), a later delivery safely reclaims and completes', async () => {
    const store = createWebhookEventsStore();
    const planState = { customerToUser: { cus_1: 'user-1' } };
    const routes = [webhookRpcRoute(store), userPlansRoute(planState)];
    const event = subEvent('evt_race_crash');

    // Instance A claims the event and then crashes mid-processing — it
    // never calls complete or fail. We simulate exactly this by claiming
    // directly against the store (bypassing the handler, as a crashed
    // process would never reach completeEvent()/failEvent()).
    store.claim({ p_event_id: 'evt_race_crash', p_event_type: event.type, p_lease_token: 'instance-A-lease', p_lease_seconds: 600 });

    // Instance B's delivery arrives while A's lease is still fresh.
    const bResult = await deliver(webhookHandler, event, routes);
    assert.ok(bResult.res.statusCode < 200 || bResult.res.statusCode >= 300,
      `B must be told to retry (non-2xx) while A's lease is fresh, got ${bResult.res.statusCode}`);
    assert.equal(store.rows.get('evt_race_crash').lease_token, 'instance-A-lease', 'B must not have touched A\'s lease');

    // A never returns (simulated crash). Its lease eventually expires.
    store.expireLease('evt_race_crash');

    // Stripe's retry (or B's own retry) now reclaims the abandoned event
    // and completes it successfully — proving the event was never
    // permanently stranded despite A crashing and B initially being told
    // to back off instead of double-processing.
    const cResult = await deliver(webhookHandler, event, routes);
    assert.equal(cResult.res.statusCode, 200);
    assert.equal(store.rows.get('evt_race_crash').status, 'completed');
    assert.notEqual(store.rows.get('evt_race_crash').lease_token, 'instance-A-lease');

    const patchCalls = cResult.mockFetch.calls.filter(c => c.method === 'PATCH' && c.url.includes('user_plans'));
    assert.equal(patchCalls.length, 1, 'only the reclaiming delivery should have run updateUserPlan — A never got to run it before crashing');
  });
});
