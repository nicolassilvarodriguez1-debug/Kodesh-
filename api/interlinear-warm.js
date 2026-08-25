// KODESH — Interlinear cache warmer (background, all logged-in users)
// Called silently (fire-and-forget) when a logged-in user opens a chapter.
// If the chapter isn't cached yet, generates it via Claude Haiku and saves
// to interlinear_cache — so premium users get instant results later.
//
// No plan check here: this is infrastructure work, not a user-facing feature,
// and does not count against any usage limits. It DOES require a verified
// session (previously had none at all — anyone could trigger unlimited
// generations anonymously) plus rate limiting and de-duplication to prevent
// concurrent generations of the same chapter.

import { randomUUID } from 'crypto';
import { sbGet, groupByVerse, generateChapter } from './_interlinearCore.js';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, isValidBookId, isValidChapter } from './_security.js';
import { checkRateLimit, acquireGenerationLock, releaseGenerationLock, startLockRenewal } from './_limits.js';

// See the matching constant/comment in api/interlinear.js — same reasoning:
// a full chapter generation can outlast a short fixed lease; a generous
// base lease plus periodic renewal keeps the lock alive for exactly as
// long as generation is genuinely still running.
const GENERATION_LEASE_SECONDS = 300;

// Cross-request (same server instance) de-dup guard — belt-and-suspenders
// alongside the DB-backed rate limit, which is what actually protects
// against multiple instances/cold starts.
const warmingInProgress = new Set();

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const book = isValidBookId(req.body?.book) ? req.body.book.toUpperCase() : null;
  const chapter = book && isValidChapter(req.body?.chapter) ? Number(req.body.chapter) : null;
  if (!book || !chapter) return sendError(res, 400, ERR.badRequest, null, 'interlinear-warm');

  const bookU = book;
  const chapterN = chapter;
  const warmKey = `${bookU}:${chapterN}`;

  try {
    // 1 — Already cached? Nothing to do.
    const cached = await sbGet(
      `interlinear_cache?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse&limit=1`
    );
    if (Array.isArray(cached) && cached.length > 0) {
      return res.status(200).json({ status: 'already_cached' });
    }

    // 2 — Rate limit per user, and skip if this instance is already warming
    // this exact chapter.
    if (warmingInProgress.has(warmKey)) {
      return res.status(200).json({ status: 'already_warming' });
    }
    // FAIL CLOSED: this is a background/fire-and-forget endpoint, so we
    // never surface a scary error to the client — but we must still NOT
    // generate (no Anthropic call) if we can't verify the rate limit.
    // Returning 200 with an explicit status is the "safe, non-misleading"
    // response the caller (index.html's warmInterlinearCache) already
    // treats as fire-and-forget either way.
    let rl;
    try {
      rl = await checkRateLimit(userId, 'interlinear_warm', 30, 3600);
    } catch(e) {
      console.error('[Interlinear warm] rate limit check failed — failing closed, no Anthropic call:', e.message);
      return res.status(200).json({ status: 'rate_limit_unavailable' });
    }
    if (!rl.allowed) return res.status(200).json({ status: 'rate_limited' });

    // 3 — Source words available for this book?
    const source = await sbGet(
      `bible_source_words?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,language&order=verse.asc,word_order.asc`
    );
    if (!Array.isArray(source) || source.length === 0) {
      return res.status(200).json({ status: 'not_available' });
    }

    // 3.5 — Distributed lock (cross-instance, shared with api/interlinear.js
    // under the same 'interlinear' kind so the two endpoints can never
    // generate the same chapter simultaneously either). FAIL CLOSED.
    const leaseToken = randomUUID();
    let lock;
    try {
      lock = await acquireGenerationLock('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
    } catch(e) {
      console.error('[Interlinear warm] lock check failed — failing closed, no Anthropic call:', e.message);
      return res.status(200).json({ status: 'lock_unavailable' });
    }
    if (!lock.acquired) {
      return res.status(200).json({ status: 'already_warming' });
    }

    // 4 — Generate and cache (lower concurrency: this runs silently for
    // free users too, so be a bit gentler on rate limits)
    warmingInProgress.add(warmKey);
    const stopLockRenewal = startLockRenewal('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
    try {
      await generateChapter(bookU, chapterN, source, 5);
    } finally {
      warmingInProgress.delete(warmKey);
      stopLockRenewal();
      try { await releaseGenerationLock('interlinear', bookU, chapterN, leaseToken); }
      catch(e) { console.warn('[Interlinear warm] lock release failed:', e.message); }
    }

    return res.status(200).json({ status: 'generated' });
  } catch(err) {
    console.error('Interlinear warm error:', err?.message || err);
    // Always 200 — this is a background task, failures shouldn't surface to users
    return res.status(200).json({ status: 'error' });
  }
}
