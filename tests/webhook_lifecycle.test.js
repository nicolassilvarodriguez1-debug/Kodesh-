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
  test('item 18 — a delivery arriving while another instance holds a fresh lease is skipped, not reprocessed', async () => {
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
    assert.equal(res.statusCode, 200);
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

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Exactly one delivery should have actually claimed and processed (200,
    // no duplicate flag); the other should see it as already-processing or
    // already-completed depending on timing — both are safe, non-double-processing outcomes.
    assert.deepEqual(statuses, [200, 200]);

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
});
