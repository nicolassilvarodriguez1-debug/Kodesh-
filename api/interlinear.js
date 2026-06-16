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

import { sbGet, getUserPlan, groupByVerse, generateChapter } from './_interlinearCore.js';
import { waitUntil } from '@vercel/functions';

const PAYWALL_MESSAGE = 'El Modo Interlineal es una función Premium. Actualiza tu plan para acceder al texto hebreo/griego original con análisis palabra por palabra.';

// Tracks chapters currently being warmed in the background, to avoid
// triggering duplicate generations if several free users hit the same
// uncached chapter in quick succession within the same server instance.
const warmingInProgress = new Set();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { book, chapter, userId } = req.body;
  if (!book || !chapter) return res.status(400).json({ error: 'book y chapter requeridos' });

  const bookU = book.toUpperCase();
  const chapterN = Number(chapter);
  const warmKey = `${bookU}:${chapterN}`;

  try {
    const plan = await getUserPlan(userId);

    // 1 — Check cache first, regardless of plan. This is cheap and lets us
    // decide whether we even need to think about generation at all.
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

    // Not cached yet. Read source words — needed either way (to generate now
    // for Premium, or to warm the cache in the background for free users).
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
      // Premium + not cached: generate synchronously and return the full result.
      const resultVerses = await generateChapter(bookU, chapterN, source, 8);
      return res.status(200).json({ book: bookU, chapter: chapterN, verses: resultVerses });
    }

    // Free user + not cached: respond with the paywall immediately, and warm
    // the cache in the background so it's ready next time (for any user).
    // waitUntil keeps the function alive long enough for generateChapter to
    // finish and save to cache, even though we've already sent the response.
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
    console.error('Interlinear error:', err);
    return res.status(500).json({ error: err.message });
  }
}
