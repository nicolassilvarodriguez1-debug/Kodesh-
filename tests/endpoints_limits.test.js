// KODESH — Tests: quota/rate-limit/lock enforcement never lets an Anthropic
// call slip through — whether the limit is legitimately reached, or the
// limiting system itself is unreachable (fail closed).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeReq, makeRes, createMockFetch, setFakeEnv, authRoute, anthropicRoute } from './_helpers.js';

setFakeEnv();

const { default: searchHandler } = await import('../api/search.js');
const { default: textualHandler } = await import('../api/textual.js');
const { default: interlinearHandler } = await import('../api/interlinear.js');
const { default: interlinearWarmHandler } = await import('../api/interlinear-warm.js');

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

const AUTH = authRoute({ validToken: 'tok', user: { id: 'user-1', email: 'u@example.com' } });

describe('search.js: allowed=false from consume_ai_usage blocks Anthropic entirely', () => {
  test('quota exhausted -> 429, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      {
        match: (url) => url.includes('/rpc/consume_ai_usage'),
        handle: async () => ({ status: 200, json: { allowed: false, used: 10, limit: 10, remaining: 0, plan: 'free', month: '2026-08' } }),
      },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { query: 'grace' } });
    const res = makeRes();
    await searchHandler(req, res);

    assert.equal(res.statusCode, 429);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });

  test('consume_ai_usage RPC itself fails -> 503 (fail closed), Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      { match: (url) => url.includes('/rpc/consume_ai_usage'), handle: async () => ({ status: 500, json: { message: 'db down' } }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { query: 'grace' } });
    const res = makeRes();
    await searchHandler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
    // Never leak the raw Supabase error text to the client.
    assert.ok(!JSON.stringify(res.body).includes('db down'));
  });
});

describe('textual.js: fails closed when checkRateLimit or the generation lock is unavailable', () => {
  const baseRoutes = () => ([
    AUTH,
    { match: (url) => url.includes('user_plans') && !url.includes('rpc'), handle: async () => ({ status: 200, json: [{ plan: 'premium', subscription_status: 'active', current_period_end: null }] }) },
    { match: (url) => url.includes('textual_cache'), handle: async () => ({ status: 200, json: [] }) },
  ]);

  test('checkRateLimit RPC fails -> 503, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      ...baseRoutes(),
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 500, json: {} }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { bookId: 'GEN', chapter: 1, sourceVerses: { '1': 'En el principio' } } });
    const res = makeRes();
    await textualHandler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });

  test('checkRateLimit allowed but generation lock already held -> 409, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      ...baseRoutes(),
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 200, json: { allowed: true, count: 1, max: 20 } }) },
      { match: (url) => url.includes('/rpc/acquire_generation_lock'), handle: async () => ({ status: 200, json: { acquired: false } }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { bookId: 'GEN', chapter: 1, sourceVerses: { '1': 'En el principio' } } });
    const res = makeRes();
    await textualHandler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });

  test('acquire_generation_lock RPC fails -> 503, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      ...baseRoutes(),
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 200, json: { allowed: true, count: 1, max: 20 } }) },
      { match: (url) => url.includes('/rpc/acquire_generation_lock'), handle: async () => ({ status: 500, json: {} }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { bookId: 'GEN', chapter: 1, sourceVerses: { '1': 'En el principio' } } });
    const res = makeRes();
    await textualHandler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });
});

describe('interlinear.js: fails closed the same way for the premium synchronous path', () => {
  test('checkRateLimit RPC fails -> 503, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      { match: (url) => url.includes('user_plans') && !url.includes('rpc'), handle: async () => ({ status: 200, json: [{ plan: 'premium', subscription_status: 'active' }] }) },
      { match: (url) => url.includes('interlinear_cache'), handle: async () => ({ status: 200, json: [] }) },
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 500, json: {} }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { book: 'GEN', chapter: 1 } });
    const res = makeRes();
    await interlinearHandler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });

  test('lock already held by another instance -> 409, Anthropic never called', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      { match: (url) => url.includes('user_plans') && !url.includes('rpc'), handle: async () => ({ status: 200, json: [{ plan: 'premium', subscription_status: 'active' }] }) },
      { match: (url) => url.includes('interlinear_cache'), handle: async () => ({ status: 200, json: [] }) },
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 200, json: { allowed: true } }) },
      { match: (url) => url.includes('bible_source_words'), handle: async () => ({ status: 200, json: [{ verse: 1, word_order: 1, original_text: 'x', strongs: 'H1', language: 'hebreo' }] }) },
      { match: (url) => url.includes('/rpc/acquire_generation_lock'), handle: async () => ({ status: 200, json: { acquired: false } }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { book: 'GEN', chapter: 1 } });
    const res = makeRes();
    await interlinearHandler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });
});

describe('interlinear-warm.js: fails closed and returns a safe, non-misleading status', () => {
  test('checkRateLimit RPC fails -> 200 with rate_limit_unavailable status, never generates', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      { match: (url) => url.includes('interlinear_cache'), handle: async () => ({ status: 200, json: [] }) },
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 500, json: {} }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { book: 'GEN', chapter: 1 } });
    const res = makeRes();
    await interlinearWarmHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'rate_limit_unavailable');
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });

  test('lock already held -> already_warming, never generates twice', async () => {
    const mockFetch = createMockFetch([
      AUTH,
      { match: (url) => url.includes('interlinear_cache'), handle: async () => ({ status: 200, json: [] }) },
      { match: (url) => url.includes('/rpc/check_rate_limit'), handle: async () => ({ status: 200, json: { allowed: true } }) },
      { match: (url) => url.includes('bible_source_words'), handle: async () => ({ status: 200, json: [{ verse: 1, word_order: 1, original_text: 'x', strongs: 'H1', language: 'hebreo' }] }) },
      { match: (url) => url.includes('/rpc/acquire_generation_lock'), handle: async () => ({ status: 200, json: { acquired: false } }) },
      anthropicRoute(),
    ]);
    globalThis.fetch = mockFetch;

    const req = makeReq({ headers: { Authorization: 'Bearer tok' }, body: { book: 'GEN', chapter: 1 } });
    const res = makeRes();
    await interlinearWarmHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'already_warming');
    assert.equal(mockFetch.calledWith('api.anthropic.com'), false);
  });
});
