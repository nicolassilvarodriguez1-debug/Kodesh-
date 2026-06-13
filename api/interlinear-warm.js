// KODESH — Interlinear cache warmer (background, all users)
// Called silently (fire-and-forget) when ANY user opens a chapter.
// If the chapter isn't cached yet, generates it via Claude Haiku and saves
// to interlinear_cache — so premium users get instant results later.
//
// No plan check here: this is infrastructure work, not a user-facing feature,
// and does not count against any usage limits.

import { sbGet, groupByVerse, generateChapter } from './_interlinearCore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { book, chapter } = req.body;
  if (!book || !chapter) return res.status(400).json({ error: 'book y chapter requeridos' });

  const bookU = book.toUpperCase();
  const chapterN = Number(chapter);

  try {
    // 1 — Already cached? Nothing to do.
    const cached = await sbGet(
      `interlinear_cache?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse&limit=1`
    );
    if (Array.isArray(cached) && cached.length > 0) {
      return res.status(200).json({ status: 'already_cached' });
    }

    // 2 — Source words available for this book?
    const source = await sbGet(
      `bible_source_words?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,language&order=verse.asc,word_order.asc`
    );
    if (!Array.isArray(source) || source.length === 0) {
      return res.status(200).json({ status: 'not_available' });
    }

    // 3 — Generate and cache (lower concurrency: this runs silently for
    // free users too, so be a bit gentler on rate limits)
    await generateChapter(bookU, chapterN, source, 5);

    return res.status(200).json({ status: 'generated' });
  } catch(err) {
    console.error('Interlinear warm error:', err);
    // Always 200 — this is a background task, failures shouldn't surface to users
    return res.status(200).json({ status: 'error', error: err.message });
  }
}
