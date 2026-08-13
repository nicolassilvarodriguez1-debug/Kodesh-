// KODESH — Tests: identity always comes from the verified JWT, never from
// the request body, and cross-user access is impossible.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeReq, makeRes, createMockFetch, setFakeEnv, authRoute,
  stripeCheckoutSessionRoute,
} from './_helpers.js';

setFakeEnv();

const { default: checkoutHandler } = await import('../api/checkout.js');
const { default: portalHandler } = await import('../api/portal.js');
const { default: confirmHandler } = await import('../api/confirm.js');

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

describe('checkout.js: identity comes only from the JWT', () => {
  test('spoofed userId/userEmail in the body are ignored — Stripe customer is created for the AUTHENTICATED user', async () => {
    const mockFetch = createMockFetch([
      authRoute({ validToken: 'real-token', user: { id: 'real-user-1', email: 'real@example.com' } }),
      {
        // No existing plan/customer yet.
        match: (url) => url.includes('/rest/v1/user_plans') && !url.includes('rpc'),
        handle: async (url, options) => {
          if (options.method === 'POST') return { status: 201, json: {} }; // save customer id
          return { status: 200, json: [] }; // GET: no existing row
        },
      },
      {
        match: (url) => url.includes('api.stripe.com/v1/customers'),
        handle: async () => ({ status: 200, json: { id: 'cus_real_1' } }),
      },
      {
        match: (url) => url.includes('api.stripe.com/v1/checkout/sessions'),
        handle: async () => ({ status: 200, json: { url: 'https://checkout.stripe.com/xyz' } }),
      },
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({
      headers: { Authorization: 'Bearer real-token' },
      body: { userId: 'attacker-id', userEmail: 'attacker@evil.com', userName: 'Bob' },
    });
    const res = makeRes();
    await checkoutHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.url);

    // Nothing sent to Stripe or Supabase should ever contain the spoofed identity.
    for (const call of mockFetch.calls) {
      const bodyStr = typeof call.body === 'string' ? call.body : JSON.stringify(call.body || '');
      assert.ok(!bodyStr.includes('attacker-id'), `outgoing call to ${call.url} leaked spoofed userId`);
      assert.ok(!bodyStr.includes('attacker@evil.com'), `outgoing call to ${call.url} leaked spoofed userEmail`);
    }

    // The real authenticated identity IS what gets used.
    const customerCall = mockFetch.calls.find(c => c.url.includes('api.stripe.com/v1/customers'));
    assert.ok(customerCall.body.includes('real%40example.com') || customerCall.body.includes('real@example.com'));
    assert.ok(customerCall.body.includes('real-user-1'));

    const sessionCall = mockFetch.calls.find(c => c.url.includes('checkout/sessions'));
    assert.ok(sessionCall.body.includes('real-user-1'), 'client_reference_id/metadata should carry the real user id');
  });
});

describe('portal.js: cannot generate a session for another account\'s customer', () => {
  test('body userId is ignored — the stripe_customer_id is looked up for the AUTHENTICATED user only', async () => {
    const mockFetch = createMockFetch([
      authRoute({ validToken: 'victim-token', user: { id: 'victim-user', email: 'victim@example.com' } }),
      {
        match: (url) => url.includes('/rest/v1/user_plans'),
        handle: async (url) => {
          // Only the victim's own customer id is ever returned for this lookup.
          assert.ok(url.includes('user_id=eq.victim-user'), 'portal must filter by the authenticated user id');
          return { status: 200, json: [{ stripe_customer_id: 'cus_victim' }] };
        },
      },
      {
        match: (url) => url.includes('billing_portal/sessions'),
        handle: async (url, options) => {
          assert.ok(options.body.includes('cus_victim'));
          assert.ok(!options.body.includes('someone-elses-customer'));
          return { status: 200, json: { url: 'https://billing.stripe.com/xyz' } };
        },
      },
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({
      headers: { Authorization: 'Bearer victim-token' },
      body: { userId: 'someone-elses-id', stripe_customer_id: 'someone-elses-customer' },
    });
    const res = makeRes();
    await portalHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.url);
  });
});

describe('confirm.js: rejects sessions/subscriptions that do not belong to the caller', () => {
  test('session client_reference_id belongs to a DIFFERENT user -> 403, never patches user_plans', async () => {
    const mockFetch = createMockFetch([
      authRoute({ validToken: 'user-a-token', user: { id: 'user-A', email: 'a@example.com' } }),
      stripeCheckoutSessionRoute({
        cs_evil_session: {
          client_reference_id: 'user-B', // belongs to someone else
          metadata: { supabase_user_id: 'user-B' },
          payment_status: 'paid', status: 'complete',
          subscription: 'sub_should_never_be_fetched', customer: 'cus_B',
        },
      }),
      {
        match: (url) => url.includes('/rest/v1/user_plans'),
        handle: async () => { throw new Error('user_plans must never be touched when ownership check fails'); },
      },
      {
        match: (url) => url.includes('api.stripe.com/v1/subscriptions/'),
        handle: async () => { throw new Error('subscription should never be fetched when session ownership already failed'); },
      },
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer user-a-token' }, body: { sessionId: 'cs_evil_session' } });
    const res = makeRes();
    await confirmHandler(req, res);

    assert.equal(res.statusCode, 403);
  });

  test('session belongs to caller but the SUBSCRIPTION metadata contradicts them -> 403, never activates premium', async () => {
    const mockFetch = createMockFetch([
      authRoute({ validToken: 'user-a-token', user: { id: 'user-A', email: 'a@example.com' } }),
      stripeCheckoutSessionRoute({
        cs_mismatched_sub: {
          client_reference_id: 'user-A', // matches, passes the first check
          metadata: { supabase_user_id: 'user-A' },
          payment_status: 'paid', status: 'complete',
          subscription: 'sub_contradictory', customer: 'cus_A',
        },
      }),
      {
        match: (url) => url.includes('api.stripe.com/v1/subscriptions/sub_contradictory'),
        handle: async () => ({
          status: 200,
          json: { id: 'sub_contradictory', status: 'active', metadata: { supabase_user_id: 'user-C' } },
        }),
      },
      {
        match: (url) => url.includes('/rest/v1/user_plans'),
        handle: async () => { throw new Error('user_plans must never be patched when subscription ownership contradicts the caller'); },
      },
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer user-a-token' }, body: { sessionId: 'cs_mismatched_sub' } });
    const res = makeRes();
    await confirmHandler(req, res);

    assert.equal(res.statusCode, 403);
  });
});
