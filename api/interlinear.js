// KODESH — Interlinear endpoint (premium feature)
// Returns per-word interlinear data (Hebrew/Greek + Strong's + transliteration + Spanish gloss)
// for a given book/chapter.
//
// Flow:
//   1. Check interlinear_cache for (book, chapter). If found, return it.
//   2. If not found, read bible_source_words for that chapter.
//      If no source words exist either -> not_available (book not yet supported).
//   3. Generate gloss + transliteration per verse via Claude Haiku.
//   4. Save results into interlinear_cache.
//   5. Return the data.

import { sbGet, getUserPlan, groupByVerse, generateChapter } from './_interlinearCore.js';

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

  // Check premium
  const plan = await getUserPlan(userId);
  if (plan !== 'premium') {
    return res.status(403).json({
      error: 'premium_required',
      message: 'El Modo Interlineal es una función Premium. Actualiza tu plan para acceder al texto hebreo/griego original con análisis palabra por palabra.',
    });
  }

  try {
    // 1 — Check cache
    const cached = await sbGet(
      `interlinear_cache?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,transliteration,gloss,language&order=verse.asc,word_order.asc`
    );

    if (Array.isArray(cached) && cached.length > 0) {
      const verses = groupByVerse(cached, [
        { in: 'original_text', out: 'text' },
        { in: 'strongs', out: 'strongs' },
        { in: 'transliteration', out: 'translit' },
        { in: 'gloss', out: 'gloss' },
        { in: 'language', out: 'language' },
      ]);
      return res.status(200).json({ book: bookU, chapter: chapterN, verses });
    }

    // 2 — Read source words
    const source = await sbGet(
      `bible_source_words?book=eq.${bookU}&chapter=eq.${chapterN}&select=verse,word_order,original_text,strongs,language&order=verse.asc,word_order.asc`
    );

    if (!Array.isArray(source) || source.length === 0) {
      return res.status(404).json({
        error: 'not_available',
        message: 'El Modo Interlineal aún no está disponible para este libro.',
      });
    }

    // 3-5 — Generate, cache, and return
    const resultVerses = await generateChapter(bookU, chapterN, source, 8);
    return res.status(200).json({ book: bookU, chapter: chapterN, verses: resultVerses });

  } catch(err) {
    console.error('Interlinear error:', err);
    return res.status(500).json({ error: err.message });
  }
}
