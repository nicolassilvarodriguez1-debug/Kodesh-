// KODESH — Shared test helpers: fake req/res, mock fetch router, and a
// stateful in-memory mock of the Stripe-webhook-event lifecycle RPCs (used
// to test api/webhook.js's actual HTTP-calling behavior against a fake
// Supabase, without a live Postgres connection).
//
// NOT a test file itself — not matched by the npm test script's explicit
// file list.

import { Readable } from 'node:stream';

// ── Fake req/res (Vercel-style handler signature: (req, res) => ...) ──

export function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    _headers: {},
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
  };
}

export function makeReq({ method = 'POST', headers = {}, body = null } = {}) {
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers)) normHeaders[k.toLowerCase()] = v;
  return { method, headers: normHeaders, body };
}

// api/webhook.js reads the raw body via req.on('data'/'end'/'error') —
// a real readable stream reproduces that contract exactly.
export function makeWebhookReq({ headers = {}, rawBody = '' } = {}) {
  const stream = Readable.from([Buffer.from(rawBody)]);
  stream.method = 'POST';
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers)) normHeaders[k.toLowerCase()] = v;
  stream.headers = normHeaders;
  return stream;
}

// ── Mock fetch router ──
// routes: array of { match: (url, options) => bool, handle: async (url, options) => { status, json?, text? } }
// Any call that matches no route throws — so an unexpected network call
// (e.g. a test asserting "Anthropic is never called") fails loudly instead
// of silently hitting the real internet.
export function createMockFetch(routes) {
  const calls = [];
  async function mockFetch(url, options = {}) {
    const urlStr = String(url);
    calls.push({ url: urlStr, method: options.method || 'GET', body: options.body, headers: options.headers || {} });
    for (const route of routes) {
      if (route.match(urlStr, options)) {
        const result = await route.handle(urlStr, options);
        const status = result.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => result.json,
          text: async () => (result.text !== undefined ? result.text : JSON.stringify(result.json ?? {})),
        };
      }
    }
    throw new Error(`Unmocked fetch call: ${options.method || 'GET'} ${urlStr}`);
  }
  mockFetch.calls = calls;
  mockFetch.calledWith = (substr) => calls.some(c => c.url.includes(substr));
  mockFetch.countCalledWith = (substr) => calls.filter(c => c.url.includes(substr)).length;
  return mockFetch;
}

// ── Common route builders ──

// Mocks Supabase's /auth/v1/user (used by requireUser in api/_auth.js).
export function authRoute({ validToken = 'valid-token', user = { id: 'user-123', email: 'test@example.com' } } = {}) {
  return {
    match: (url) => url.includes('/auth/v1/user'),
    handle: async (url, options) => {
      const authHeader = options.headers?.Authorization || options.headers?.authorization || '';
      const token = authHeader.replace(/^Bearer /, '');
      if (token === validToken) {
        return { status: 200, json: { id: user.id, email: user.email } };
      }
      return { status: 401, json: { error: 'invalid token' } };
    },
  };
}

// Mocks api.anthropic.com/v1/messages — tracks whether it was ever called,
// which is exactly what the "fails closed / never calls Anthropic" tests need.
export function anthropicRoute(replyText = '{}') {
  return {
    match: (url) => url.includes('api.anthropic.com'),
    handle: async () => ({ status: 200, json: { content: [{ text: replyText }] } }),
  };
}

export const FAKE_ENV = {
  SUPABASE_URL: 'https://fake.supabase.test',
  SUPABASE_SERVICE_KEY: 'fake-service-key',
  STRIPE_SECRET_KEY: 'fake-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  ANTHROPIC_API_KEY: 'fake-anthropic-key',
};

export function setFakeEnv() {
  for (const [k, v] of Object.entries(FAKE_ENV)) process.env[k] = v;
}

// ── Stripe webhook signing (mirrors what Stripe itself does) ──
export async function signWebhookBody(bodyObj, secret = FAKE_ENV.STRIPE_WEBHOOK_SECRET) {
  const rawBody = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${ts}.${rawBody}`));
  const sig = Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { rawBody, header: `t=${ts},v1=${sig}` };
}

// ── Stateful mock of stripe_webhook_events, mirroring the SQL semantics of
// claim_stripe_webhook_event / complete_stripe_webhook_event /
// fail_stripe_webhook_event (supabase/migrations/
// 20260813_webhook_lifecycle_ai_usage_repair_locks.sql). Used to exercise
// api/webhook.js's real handler across multiple deliveries of the same
// event without a live Postgres — the atomicity/row-locking guarantee of
// the REAL SQL functions is separately proven in
// supabase/tests/concurrency_repro.md (requires two live DB sessions,
// which no in-process JS mock can genuinely demonstrate).
export function createWebhookEventsStore() {
  const rows = new Map();

  function claim({ p_event_id, p_event_type, p_lease_token, p_lease_seconds }) {
    const leaseMs = (p_lease_seconds ?? 600) * 1000;
    const now = Date.now();
    let row = rows.get(p_event_id);
    if (!row) {
      row = { id: p_event_id, type: p_event_type, status: 'processing', attempts: 1, lease_token: p_lease_token, last_error: null, created_at: now, updated_at: now, completed_at: null };
      rows.set(p_event_id, row);
      return { claimed: true, status: 'processing', attempts: 1 };
    }
    if (row.status === 'completed') {
      return { claimed: false, status: 'completed', attempts: row.attempts };
    }
    if (row.status === 'processing' && (now - row.updated_at) < leaseMs) {
      return { claimed: false, status: 'processing', attempts: row.attempts };
    }
    // 'failed', or an expired 'processing' lease — reclaim.
    row.status = 'processing';
    row.attempts += 1;
    row.lease_token = p_lease_token;
    row.last_error = null;
    row.updated_at = now;
    return { claimed: true, status: 'processing', attempts: row.attempts };
  }

  function complete({ p_event_id, p_lease_token }) {
    const row = rows.get(p_event_id);
    if (!row) return false;
    if (row.status === 'processing' && row.lease_token === p_lease_token) {
      row.status = 'completed';
      row.completed_at = Date.now();
      row.updated_at = Date.now();
      return true;
    }
    return false;
  }

  function fail({ p_event_id, p_lease_token, p_error }) {
    const row = rows.get(p_event_id);
    if (!row) return false;
    if (row.status === 'processing' && row.lease_token === p_lease_token) {
      row.status = 'failed';
      row.last_error = p_error;
      row.updated_at = Date.now();
      return true;
    }
    return false;
  }

  // Test-only helper: simulate a crashed instance whose lease is now stale,
  // without needing to actually wait out the real lease window.
  function expireLease(eventId) {
    const row = rows.get(eventId);
    if (row) row.updated_at = Date.now() - 999999999;
  }

  return { rows, claim, complete, fail, expireLease };
}

export function webhookRpcRoute(store) {
  return {
    match: (url) => url.includes('/rest/v1/rpc/claim_stripe_webhook_event')
      || url.includes('/rest/v1/rpc/complete_stripe_webhook_event')
      || url.includes('/rest/v1/rpc/fail_stripe_webhook_event'),
    handle: async (url, options) => {
      const args = JSON.parse(options.body);
      if (url.includes('claim_stripe_webhook_event')) return { status: 200, json: store.claim(args) };
      if (url.includes('complete_stripe_webhook_event')) return { status: 200, json: store.complete(args) };
      if (url.includes('fail_stripe_webhook_event')) return { status: 200, json: store.fail(args) };
      throw new Error('unreachable');
    },
  };
}

// Mocks the user_plans lookups/patches that api/webhook.js's updateUserPlan
// performs. `state.customerToUser` maps stripe_customer_id -> user_id.
// `state.failLookup` / `state.failPatch` let a test flip failure modes
// between two sequential deliveries of the same event (retry scenarios).
export function userPlansRoute(state) {
  return {
    match: (url) => url.includes('/rest/v1/user_plans'),
    handle: async (url, options) => {
      if (options.method === 'PATCH') {
        if (state.failPatch) return { status: 500, json: { message: 'simulated failure' } };
        const m = url.match(/user_id=eq\.([^&]+)/);
        const userId = m ? decodeURIComponent(m[1]) : null;
        return { status: 200, json: [{ user_id: userId }] };
      }
      if (state.failLookup) return { status: 500, json: { message: 'simulated failure' } };
      const m = url.match(/stripe_customer_id=eq\.([^&]+)/);
      const custId = m ? decodeURIComponent(m[1]) : null;
      const userId = state.customerToUser?.[custId];
      return { status: 200, json: userId ? [{ user_id: userId }] : [] };
    },
  };
}

// Mocks https://api.stripe.com/v1/subscriptions/:id (used by the
// invoice.payment_succeeded handler in api/webhook.js).
export function stripeSubscriptionRoute(subsById) {
  return {
    match: (url) => url.includes('api.stripe.com/v1/subscriptions/'),
    handle: async (url) => {
      const id = url.split('/').pop();
      const sub = subsById[id];
      if (!sub) return { status: 404, json: { error: 'not found' } };
      return { status: 200, json: sub };
    },
  };
}

// Mocks https://api.stripe.com/v1/checkout/sessions/:id (used by api/confirm.js).
export function stripeCheckoutSessionRoute(sessionsById) {
  return {
    match: (url) => url.includes('api.stripe.com/v1/checkout/sessions/'),
    handle: async (url) => {
      const id = decodeURIComponent(url.split('/').pop());
      const session = sessionsById[id];
      if (!session) return { status: 404, json: { error: 'not found' } };
      return { status: 200, json: session };
    },
  };
}
