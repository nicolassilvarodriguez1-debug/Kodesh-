// KODESH — Interlinear endpoint (premium feature)
// Returns per-word interlinear data (Hebrew/Greek + Strong's + transliteration + Spanish gloss)
// for a given book/chapter.
//
// Flow:
//   1. Check interlinear_cache for (book, chapter), regardless of plan.
//      If found -> Premium users get it immediately; free users still get the paywall message.
//   2. If NOT cached:
//      - Premium user: generate synchronously, cache it, and return the full result.
//      - Free user: respond with the paywall message immediately, but kick off
//        generation in the background ("cache warming") so the chapter is ready
//        the next time anyone (free or premium) requests it. The free user never
//        waits for this and never sees the generated content themselves.
//   3. If no source words exist for the book at all -> not_available (book not yet supported).
//
// Requires a verified Supabase session. Plan is looked up server-side from
// user_plans — never trusted from the request body.

import { randomUUID } from 'crypto';
import { sbGet, getUserPlan, groupByVerse, generateChapter } from './_interlinearCore.js';
import { waitUntil } from '@vercel/functions';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, isValidBookId, isValidChapter } from './_security.js';
import { checkRateLimit, acquireGenerationLock, releaseGenerationLock, startLockRenewal } from './_limits.js';

// Third audit pass — Objective 6: a full-chapter interlinear generation
// calls Anthropic once PER VERSE (concurrency-batched, see generateChapter
// in _interlinearCore.js). A long chapter (e.g. Psalm 119, 176 verses) at
// concurrency 8 is ~22 sequential batches — comfortably capable of taking
// longer than the old fixed 180s lease under real-world Anthropic latency.
// A generous base lease PLUS periodic renewal for as long as generation is
// still actually running (startLockRenewal) means the lock can never
// expire out from under a legitimately in-progress generation, while still
// being reclaimable promptly if the instance genuinely crashes (renewal
// simply stops).
const GENERATION_LEASE_SECONDS = 300;

const PAYWALL_MESSAGE = 'El Modo Interlineal es una función Premium. Actualiza tu plan para acceder al texto hebreo/griego original con análisis palabra por palabra.';

// Tracks chapters currently being warmed in the background, to avoid
// triggering duplicate generations if several free users hit the same
// uncached chapter in quick succession within the same server instance.
// (Best-effort only — see check_rate_limit RPC for the cross-instance guard.)
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
  if (!book || !chapter) return sendError(res, 400, ERR.badRequest, null, 'interlinear');

  const bookU = book;
  const chapterN = chapter;
  const warmKey = `${bookU}:${chapterN}`;

  let plan;
  try {
    plan = await getUserPlan(userId);
  } catch (e) {
    console.error('[Interlinear] plan lookup failed — failing closed:', e.message);
    return sendError(res, 503, ERR.unavailable, e, 'interlinear:plan-unavailable');
  }

  try {
    // 1 — Check cache first, regardless of plan.
    const cached = await sbGet(
      `interlinear_cache?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,transliteration,gloss,language&order=verse.asc,word_order.asc`
    );

    const isCached = Array.isArray(cached) && cached.length > 0;

    if (isCached) {
      if (plan !== 'premium') {
        return res.status(403).json({ error: 'premium_required', message: PAYWALL_MESSAGE });
      }
      const verses = groupByVerse(cached, [
        { in: 'original_text', out: 'text' },
        { in: 'strongs', out: 'strongs' },
        { in: 'transliteration', out: 'translit' },
        { in: 'gloss', out: 'gloss' },
        { in: 'language', out: 'language' },
      ]);
      return res.status(200).json({ book: bookU, chapter: chapterN, verses });
    }

    // Not cached yet. Rate limit generation attempts per user regardless of
    // plan — this is the expensive path (calls Anthropic per verse).
    // FAIL CLOSED: if we can't verify the limit, do not generate.
    let rl;
    try {
      rl = await checkRateLimit(userId, 'interlinear_generate', 30, 3600);
    } catch(e) {
      console.error('[Interlinear] rate limit check failed — failing closed, no Anthropic call:', e.message);
      return sendError(res, 503, ERR.unavailable, e, 'interlinear:rate-limit-unavailable');
    }
    if (!rl.allowed) return sendError(res, 429, ERR.rateLimited, null, 'interlinear:rate-limit');

    const source = await sbGet(
      `bible_source_words?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,language&order=verse.asc,word_order.asc`
    );

    if (!Array.isArray(source) || source.length === 0) {
      return res.status(404).json({
        error: 'not_available',
        message: 'El Modo Interlineal aún no está disponible para este libro.',
      });
    }

    if (plan === 'premium') {
      if (warmingInProgress.has(warmKey)) {
        return sendError(res, 409, ERR.conflict, null, 'interlinear:already-generating');
      }
      // Distributed lock (cross-instance) — the in-memory Set above only
      // protects against duplicate requests hitting the SAME warm serverless
      // instance; this is the real guard against two different instances
      // (or this endpoint racing api/interlinear-warm.js) generating the
      // same book/chapter at once. FAIL CLOSED: if we can't verify the
      // lock, don't generate.
      const leaseToken = randomUUID();
      let lock;
      try {
        lock = await acquireGenerationLock('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
      } catch(e) {
        console.error('[Interlinear] lock check failed — failing closed, no Anthropic call:', e.message);
        return sendError(res, 503, ERR.unavailable, e, 'interlinear:lock-unavailable');
      }
      if (!lock.acquired) {
        return sendError(res, 409, ERR.conflict, null, 'interlinear:already-generating');
      }
      warmingInProgress.add(warmKey);
      const stopLockRenewal = startLockRenewal('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
      try {
        const resultVerses = await generateChapter(bookU, chapterN, source, 8);
        return res.status(200).json({ book: bookU, chapter: chapterN, verses: resultVerses });
      } finally {
        warmingInProgress.delete(warmKey);
        stopLockRenewal();
        try { await releaseGenerationLock('interlinear', bookU, chapterN, leaseToken); }
        catch(e) { console.warn('[Interlinear] lock release failed:', e.message); }
      }
    }

    // Free user + not cached: respond with the paywall immediately, and warm
    // the cache in the background so it's ready next time (for any user).
    // Same distributed lock, acquired before the background task starts —
    // if we can't verify it (or it's already held), skip warming entirely
    // rather than risk a duplicate generation.
    if (!warmingInProgress.has(warmKey)) {
      warmingInProgress.add(warmKey);
      const leaseToken = randomUUID();
      waitUntil((async () => {
        try {
          const lock = await acquireGenerationLock('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
          if (!lock.acquired) return;
          const stopLockRenewal = startLockRenewal('interlinear', bookU, chapterN, leaseToken, GENERATION_LEASE_SECONDS);
          try {
            await generateChapter(bookU, chapterN, source, 8);
          } finally {
            stopLockRenewal();
            try { await releaseGenerationLock('interlinear', bookU, chapterN, leaseToken); }
            catch(e) { console.warn('[Interlinear warm-bg] lock release failed:', e.message); }
          }
        } catch(err) {
          console.error(`Background warm failed for ${warmKey}:`, err.message);
        } finally {
          warmingInProgress.delete(warmKey);
        }
      })());
    }

    return res.status(403).json({ error: 'premium_required', message: PAYWALL_MESSAGE });

  } catch(err) {
    return sendError(res, 500, ERR.internal, err, 'interlinear');
  }
}
