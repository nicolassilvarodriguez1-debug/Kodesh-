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

import { sbGet, getUserPlan, groupByVerse, generateChapter } from './_interlinearCore.js';
import { waitUntil } from '@vercel/functions';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, isValidBookId, isValidChapter } from './_security.js';
import { checkRateLimit } from './_limits.js';

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

  try {
    const plan = await getUserPlan(userId);

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
    try {
      const rl = await checkRateLimit(userId, 'interlinear_generate', 30, 3600);
      if (!rl.allowed) return sendError(res, 429, ERR.rateLimited, null, 'interlinear:rate-limit');
    } catch(e) {
      console.warn('[Interlinear] rate limit check failed (allowing):', e.message);
    }

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
      warmingInProgress.add(warmKey);
      try {
        const resultVerses = await generateChapter(bookU, chapterN, source, 8);
        return res.status(200).json({ book: bookU, chapter: chapterN, verses: resultVerses });
      } finally {
        warmingInProgress.delete(warmKey);
      }
    }

    // Free user + not cached: respond with the paywall immediately, and warm
    // the cache in the background so it's ready next time (for any user).
    if (!warmingInProgress.has(warmKey)) {
      warmingInProgress.add(warmKey);
      waitUntil(
        generateChapter(bookU, chapterN, source, 8)
          .catch(err => console.error(`Background warm failed for ${warmKey}:`, err.message))
          .finally(() => warmingInProgress.delete(warmKey))
      );
    }

    return res.status(403).json({ error: 'premium_required', message: PAYWALL_MESSAGE });

  } catch(err) {
    return sendError(res, 500, ERR.internal, err, 'interlinear');
  }
}
