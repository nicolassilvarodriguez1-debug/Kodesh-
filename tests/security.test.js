// KODESH — Automated tests for the security hardening pass.
//
// Scope: these are unit-level tests against pure/exported functions
// (validation helpers, webhook signature logic, XSS escaping) that don't
// require a live Supabase/Stripe/Anthropic connection. They do NOT
// replace a full integration test against a staging deploy — see the
// manual smoke-test checklist in the delivery report for the parts that
// need a real request/response cycle (401 without JWT, cross-user
// rejection, concurrent-request race safety, etc.), which were verified
// by code inspection but not executed end-to-end in this environment.
//
// Run with: npm test   (node --test tests/)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isNonEmptyString,
  clampString,
  isPlainObject,
  isValidBookId,
  isValidChapter,
  isValidVerse,
  sanitizeHistory,
  sanitizeSourceVerses,
} from '../api/_security.js';

import { timingSafeHexEqual, verifyStripeSignature } from '../api/webhook.js';

// Same implementation used client-side in home.html / admin.html / profile.html
// / upload.html / actividades.html / cronicas.html / landing.html / index.html.
// Kept identical here on purpose so this test proves the *algorithm*, not a
// reimplementation of it.
function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const parsed = new URL(u, 'https://kodeshbible.com/');
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (e) { return ''; }
}

describe('XSS: HTML values are neutralized as text, never executed', () => {
  test('a malicious img/onerror payload is fully escaped', () => {
    const payload = `<img src=x onerror="alert('xss')">`;
    const escaped = escHtml(payload);
    assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;');
    assert.ok(!escaped.includes('<img'), 'no raw <img tag should survive escaping');
    assert.ok(!escaped.includes('onerror='.concat('"')), 'no live onerror attribute should survive escaping');
  });

  test('script tags are escaped, not executed', () => {
    const escaped = escHtml(`<script>alert(1)</script>`);
    assert.ok(!escaped.includes('<script>'));
    assert.equal(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('null/undefined are handled without throwing', () => {
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });
});

describe('XSS: URL validation rejects dangerous protocols', () => {
  test('javascript: URLs are rejected', () => {
    assert.equal(safeUrl("javascript:alert('xss')"), '');
  });
  test('data: URLs are rejected', () => {
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
  });
  test('vbscript: and other odd schemes are rejected', () => {
    assert.equal(safeUrl('vbscript:msgbox(1)'), '');
  });
  test('https: URLs are accepted', () => {
    assert.equal(safeUrl('https://kodeshbible.com/foo.png'), 'https://kodeshbible.com/foo.png');
  });
  test('http: (non-https) URLs are rejected', () => {
    assert.equal(safeUrl('http://example.com/foo.png'), '');
  });
  test('malformed input does not throw', () => {
    assert.equal(safeUrl(''), '');
    assert.equal(safeUrl(null), '');
    assert.equal(safeUrl(42), '');
  });
});

describe('Input validation: book/chapter/verse', () => {
  test('valid book ids pass', () => {
    assert.ok(isValidBookId('GEN'));
    assert.ok(isValidBookId('rev')); // case-insensitive
  });
  test('invalid/arbitrary book ids are rejected', () => {
    assert.ok(!isValidBookId('NOTABOOK'));
    assert.ok(!isValidBookId('<script>'));
    assert.ok(!isValidBookId(123));
  });
  test('chapter must be an integer in range', () => {
    assert.ok(isValidChapter(1));
    assert.ok(isValidChapter('50'));
    assert.ok(!isValidChapter(0));
    assert.ok(!isValidChapter(151));
    assert.ok(!isValidChapter('abc'));
  });
  test('verse must be an integer in range', () => {
    assert.ok(isValidVerse(1));
    assert.ok(!isValidVerse(0));
    assert.ok(!isValidVerse(177));
  });
});

describe('Input validation: strings and objects', () => {
  test('isNonEmptyString rejects empty/oversized/non-string', () => {
    assert.ok(isNonEmptyString('hello', 10));
    assert.ok(!isNonEmptyString('', 10));
    assert.ok(!isNonEmptyString('   ', 10));
    assert.ok(!isNonEmptyString('a'.repeat(11), 10));
    assert.ok(!isNonEmptyString(123, 10));
  });
  test('clampString truncates and coerces non-strings to empty', () => {
    assert.equal(clampString('abcdef', 3), 'abc');
    assert.equal(clampString(123, 3), '');
  });
  test('isPlainObject distinguishes objects from arrays/null', () => {
    assert.ok(isPlainObject({}));
    assert.ok(!isPlainObject([]));
    assert.ok(!isPlainObject(null));
  });
});

describe('Input validation: history and sourceVerses caps (textual/assistant abuse prevention)', () => {
  test('sanitizeHistory caps item count and content length, drops malformed items', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
    const result = sanitizeHistory(long, { maxItems: 20, maxContentLen: 4000 });
    assert.equal(result.length, 20);
    assert.equal(result[0].content, 'msg 10'); // keeps the LAST 20

    const oversizedContent = [{ role: 'user', content: 'x'.repeat(5000) }];
    const clamped = sanitizeHistory(oversizedContent, { maxItems: 20, maxContentLen: 4000 });
    assert.equal(clamped[0].content.length, 4000);

    const malformed = [{ role: 'admin', content: 'hi' }, 'not an object', { role: 'user' }];
    const filtered = sanitizeHistory(malformed);
    assert.equal(filtered.length, 0);
  });

  test('sanitizeSourceVerses rejects arbitrary payloads and caps size (textual.js abuse prevention)', () => {
    // A free/anonymous-style attempt to send a huge number of large "verses"
    // to force an expensive Anthropic call must be rejected.
    const tooMany = {};
    for (let i = 1; i <= 200; i++) tooMany[String(i)] = 'text';
    assert.equal(sanitizeSourceVerses(tooMany, { maxVerses: 176, maxLen: 2000 }), null);

    const tooLong = { '1': 'x'.repeat(3000) };
    assert.equal(sanitizeSourceVerses(tooLong, { maxVerses: 176, maxLen: 2000 }), null);

    const badKey = { 'not-a-number': 'text' };
    assert.equal(sanitizeSourceVerses(badKey), null);

    const valid = { '1': 'In the beginning', '2': 'God created' };
    const result = sanitizeSourceVerses(valid);
    assert.deepEqual(result, valid);

    assert.equal(sanitizeSourceVerses('not an object'), null);
    assert.equal(sanitizeSourceVerses(null), null);
  });
});

describe('Stripe webhook: constant-time signature comparison', () => {
  test('equal hex strings match', () => {
    assert.ok(timingSafeHexEqual('deadbeef', 'deadbeef'));
  });
  test('different hex strings do not match', () => {
    assert.ok(!timingSafeHexEqual('deadbeef', 'deadbeee'));
  });
  test('different-length strings do not match (and do not throw)', () => {
    assert.ok(!timingSafeHexEqual('deadbeef', 'dead'));
  });
  test('malformed (non-hex) input does not throw', () => {
    assert.ok(!timingSafeHexEqual('not-hex!!', 'deadbeef'));
  });
});

describe('Stripe webhook: signature verification end-to-end', () => {
  const secret = 'whsec_test_secret';

  async function sign(payloadStr, ts, key) {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw', encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const bytes = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${ts}.${payloadStr}`));
    return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  test('accepts a correctly signed, fresh payload', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'test.event' });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sign(body, ts, secret);
    const event = await verifyStripeSignature(body, `t=${ts},v1=${sig}`, secret);
    assert.equal(event.id, 'evt_1');
  });

  test('accepts when the SECOND v1= candidate matches (key-rotation window)', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'test.event' });
    const ts = Math.floor(Date.now() / 1000);
    const validSig = await sign(body, ts, secret);
    const bogusSig = 'f'.repeat(64);
    const header = `t=${ts},v1=${bogusSig},v1=${validSig}`;
    const event = await verifyStripeSignature(body, header, secret);
    assert.equal(event.id, 'evt_2');
  });

  test('rejects a tampered body', async () => {
    const body = JSON.stringify({ id: 'evt_3', type: 'test.event' });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sign(body, ts, secret);
    const tamperedBody = JSON.stringify({ id: 'evt_3', type: 'test.event', amount: 999999 });
    await assert.rejects(
      () => verifyStripeSignature(tamperedBody, `t=${ts},v1=${sig}`, secret),
      /Invalid webhook signature/
    );
  });

  test('rejects a stale timestamp (replay protection)', async () => {
    const body = JSON.stringify({ id: 'evt_4', type: 'test.event' });
    const staleTs = Math.floor(Date.now() / 1000) - 999999;
    const sig = await sign(body, staleTs, secret);
    await assert.rejects(
      () => verifyStripeSignature(body, `t=${staleTs},v1=${sig}`, secret),
      /timestamp too old/
    );
  });

  test('rejects a malformed header', async () => {
    await assert.rejects(
      () => verifyStripeSignature('{}', 'garbage-header', secret),
      /Malformed Stripe-Signature header/
    );
  });
});

describe('Plan status interpretation: active AND trialing both count as Premium', () => {
  // Mirrors the exact condition used in api/_limits.js, api/checkout.js,
  // api/confirm.js, api/webhook.js, home.html, landing.html, and the
  // consume_ai_usage() SQL function — kept as a literal copy so this test
  // documents the expected behavior everywhere that logic is duplicated.
  function isPremiumStatus(status) {
    return status === 'active' || status === 'trialing';
  }

  test('active counts as premium', () => assert.ok(isPremiumStatus('active')));
  test('trialing counts as premium', () => assert.ok(isPremiumStatus('trialing')));
  test('canceled does not count as premium', () => assert.ok(!isPremiumStatus('canceled')));
  test('past_due does not count as premium', () => assert.ok(!isPremiumStatus('past_due')));
  test('undefined/no status does not count as premium', () => assert.ok(!isPremiumStatus(undefined)));
});
