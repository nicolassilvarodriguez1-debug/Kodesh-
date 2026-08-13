// KODESH — Tests: every sensitive endpoint requires a valid JWT, and NEVER
// calls Stripe or Anthropic when the caller is unauthenticated.
//
// Imports and exercises the REAL handlers from api/*.js — only `fetch` is
// mocked (and it's configured with ZERO routes here, so ANY outbound call
// — Stripe, Anthropic, or Supabase — makes the mock throw and fails the
// test loudly).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeReq, makeRes, createMockFetch, setFakeEnv } from './_helpers.js';

setFakeEnv();

const { default: checkoutHandler } = await import('../api/checkout.js');
const { default: portalHandler } = await import('../api/portal.js');
const { default: confirmHandler } = await import('../api/confirm.js');
const { default: searchHandler } = await import('../api/search.js');
const { default: assistantHandler } = await import('../api/assistant.js');
const { default: lexiconHandler } = await import('../api/lexicon.js');
const { default: textualHandler } = await import('../api/textual.js');
const { default: interlinearHandler } = await import('../api/interlinear.js');
const { default: interlinearWarmHandler } = await import('../api/interlinear-warm.js');

let originalFetch;
describe('Endpoints: 401 without JWT, zero network calls', () => {
  before(() => { originalFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = originalFetch; });

  const cases = [
    ['checkout', checkoutHandler, {}],
    ['portal', portalHandler, {}],
    ['confirm', confirmHandler, { sessionId: 'cs_test_123' }],
    ['search', searchHandler, { query: 'love' }],
    ['assistant', assistantHandler, { message: 'hola' }],
    ['lexicon', lexiconHandler, { word: 'amor' }],
    ['textual', textualHandler, { bookId: 'GEN', chapter: 1, sourceVerses: { '1': 'x' } }],
    ['interlinear', interlinearHandler, { book: 'GEN', chapter: 1 }],
    ['interlinear-warm', interlinearWarmHandler, { book: 'GEN', chapter: 1 }],
  ];

  for (const [name, handler, body] of cases) {
    test(`${name}: no Authorization header -> 401, no fetch calls at all`, async () => {
      const mockFetch = createMockFetch([]);
      globalThis.fetch = mockFetch;
      const req = makeReq({ body }); // no headers -> no Authorization
      const res = makeRes();
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(mockFetch.calls.length, 0, `${name} made an unexpected network call while unauthenticated`);
    });

    test(`${name}: invalid/expired token -> 401, never calls Stripe or Anthropic`, async () => {
      const mockFetch = createMockFetch([
        {
          match: (url) => url.includes('/auth/v1/user'),
          handle: async () => ({ status: 401, json: { error: 'invalid_token' } }),
        },
      ]);
      globalThis.fetch = mockFetch;
      const req = makeReq({ headers: { Authorization: 'Bearer garbage-token' }, body });
      const res = makeRes();
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(mockFetch.calledWith('api.anthropic.com'), false, `${name} called Anthropic despite invalid token`);
      assert.equal(mockFetch.calledWith('api.stripe.com'), false, `${name} called Stripe despite invalid token`);
    });
  }
});
