// KODESH — Tests for the distributed generation lock RPC wrappers in
// api/_limits.js (acquireGenerationLock / renewGenerationLock /
// releaseGenerationLock), against a stateful in-memory mock that mirrors
// the SQL semantics of acquire_generation_lock() / renew_generation_lock()
// / release_generation_lock() in
// supabase/migrations/20260814_self_sufficient_repair.sql.
//
// Exercises the REAL exported functions from _limits.js, not
// reimplementations — only the Postgres RPC layer underneath is mocked
// (true cross-process atomicity of the SQL functions themselves can only be
// demonstrated with a live Postgres session, same caveat as
// supabase/tests/concurrency_repro.md for the webhook lifecycle RPCs).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFetch, setFakeEnv } from './_helpers.js';

setFakeEnv();

const { acquireGenerationLock, renewGenerationLock, releaseGenerationLock } = await import('../api/_limits.js');

let originalFetch;
before(() => { originalFetch = globalThis.fetch; });
after(() => { globalThis.fetch = originalFetch; });

// Mirrors acquire_generation_lock/renew_generation_lock/release_generation_lock's
// SQL logic exactly, with an injectable clock so tests don't need real timers.
function createLockStore(initialNow = 0) {
  const rows = new Map(); // key "kind:book:chapter" -> { lease_token, expires_at }
  let now = initialNow;

  function key(kind, book, chapter) { return `${kind}:${book}:${chapter}`; }

  function acquire({ p_kind, p_book, p_chapter, p_lease_token, p_lease_seconds }) {
    const k = key(p_kind, p_book, p_chapter);
    const row = rows.get(k);
    if (!row) {
      rows.set(k, { lease_token: p_lease_token, expires_at: now + p_lease_seconds * 1000 });
      return { acquired: true };
    }
    if (row.expires_at > now) {
      return { acquired: false };
    }
    row.lease_token = p_lease_token;
    row.expires_at = now + p_lease_seconds * 1000;
    return { acquired: true };
  }

  function renew({ p_kind, p_book, p_chapter, p_lease_token, p_lease_seconds }) {
    const k = key(p_kind, p_book, p_chapter);
    const row = rows.get(k);
    if (!row || row.lease_token !== p_lease_token) return false;
    row.expires_at = now + p_lease_seconds * 1000;
    return true;
  }

  function release({ p_kind, p_book, p_chapter, p_lease_token }) {
    const k = key(p_kind, p_book, p_chapter);
    const row = rows.get(k);
    if (row && row.lease_token === p_lease_token) rows.delete(k);
  }

  return {
    rows,
    acquire, renew, release,
    advance(ms) { now += ms; },
  };
}

function lockRoute(store) {
  return {
    match: (url) => url.includes('/rpc/acquire_generation_lock') || url.includes('/rpc/renew_generation_lock') || url.includes('/rpc/release_generation_lock'),
    handle: async (url, options) => {
      const args = JSON.parse(options.body);
      if (url.includes('acquire_generation_lock')) return { status: 200, json: store.acquire(args) };
      if (url.includes('renew_generation_lock')) return { status: 200, json: store.renew(args) };
      if (url.includes('release_generation_lock')) { store.release(args); return { status: 200, json: null }; }
      throw new Error('unreachable');
    },
  };
}

describe('generation lock: acquire / expire / reclaim', () => {
  test('a fresh lock can be acquired', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);
    const result = await acquireGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    assert.equal(result.acquired, true);
  });

  test('a second instance cannot acquire while the lease is still fresh', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);
    await acquireGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    store.advance(60 * 1000); // 60s into a 120s lease — still fresh
    const result = await acquireGenerationLock('textual', 'GEN', 1, 'lease-B', 120);
    assert.equal(result.acquired, false);
  });

  test('an expired, un-renewed lock can be reclaimed by a new instance', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);
    await acquireGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    store.advance(121 * 1000); // past the 120s lease, never renewed (simulates a crash)
    const result = await acquireGenerationLock('textual', 'GEN', 1, 'lease-B', 120);
    assert.equal(result.acquired, true);
  });

  test('releaseGenerationLock only removes the lock if the lease_token still matches', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);
    await acquireGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    store.advance(121 * 1000);
    await acquireGenerationLock('textual', 'GEN', 1, 'lease-B', 120); // reclaims with a new lease

    // The original (now-stale) instance A finally wakes up and tries to
    // release what IT thinks is still its lock — must be a harmless no-op,
    // not a deletion of B's active lock.
    await releaseGenerationLock('textual', 'GEN', 1, 'lease-A');
    assert.ok(store.rows.has('textual:GEN:1'), 'B\'s lock must still exist — A must not have been able to delete it');
    assert.equal(store.rows.get('textual:GEN:1').lease_token, 'lease-B');
  });
});

describe('generation lock: renewal keeps a long-running generation\'s lock alive', () => {
  test('a lock renewed before it expires stays valid through the full expected generation duration, and a competing instance is still rejected', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);

    // Simulates api/interlinear.js generating a long chapter (e.g. Psalm
    // 119) with a 300s lease that gets renewed partway through, matching
    // startLockRenewal()'s behavior in _limits.js (renews at half the
    // lease duration).
    const leaseSeconds = 300;
    const acquireResult = await acquireGenerationLock('interlinear', 'PSA', 119, 'lease-long-gen', leaseSeconds);
    assert.equal(acquireResult.acquired, true);

    // Halfway through the lease (150s in), the renewal heartbeat fires.
    store.advance(150 * 1000);
    const renewed = await renewGenerationLock('interlinear', 'PSA', 119, 'lease-long-gen', leaseSeconds);
    assert.equal(renewed, true);

    // Now advance PAST where the ORIGINAL (un-renewed) lease would have
    // expired (150s + 160s = 310s > the original 300s lease) — a naive
    // fixed lease with no renewal would already be reclaimable here. Prove
    // it is NOT, because the renewal extended it another 300s from the
    // 150s mark (expires at 450s, not 300s).
    store.advance(160 * 1000); // now at 310s total — past the original 300s expiry
    const competingAcquire = await acquireGenerationLock('interlinear', 'PSA', 119, 'lease-competitor', leaseSeconds);
    assert.equal(competingAcquire.acquired, false, 'the lock must still be held — renewal must have extended it past the original lease window');

    // Generation genuinely finishes and releases — using the SAME lease
    // token throughout, proving renewal never changed our lease identity.
    await releaseGenerationLock('interlinear', 'PSA', 119, 'lease-long-gen');
    assert.equal(store.rows.has('interlinear:PSA:119'), false);
  });

  test('renewGenerationLock returns false (does not resurrect) once another instance has already reclaimed the lock', async () => {
    const store = createLockStore();
    globalThis.fetch = createMockFetch([lockRoute(store)]);

    await acquireGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    store.advance(121 * 1000); // A's lease expires, A never renewed in time
    await acquireGenerationLock('textual', 'GEN', 1, 'lease-B', 120); // B reclaims

    // A's renewal heartbeat (still running, unaware it was reclaimed) fires late.
    const renewResult = await renewGenerationLock('textual', 'GEN', 1, 'lease-A', 120);
    assert.equal(renewResult, false, 'A must not be able to renew a lease it no longer holds');
    assert.equal(store.rows.get('textual:GEN:1').lease_token, 'lease-B', 'B\'s lock must be untouched by A\'s stale renewal attempt');
  });
});
