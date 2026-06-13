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

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return res.json();
}

async function sbInsert(table, rows) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=book,chapter,verse,word_order`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert error ${res.status}: ${text}`);
  }
}

async function getUserPlan(userId) {
  if (!userId) return 'free';
  try {
    const data = await sbGet(`user_plans?user_id=eq.${userId}&select=plan,subscription_status&limit=1`);
    if (data?.[0]?.subscription_status === 'active') return data[0].plan || 'free';
  } catch(e) {}
  return 'free';
}

function groupByVerse(rows, fields) {
  const verses = {};
  for (const row of rows) {
    if (!verses[row.verse]) verses[row.verse] = [];
    const entry = {};
    for (const f of fields) entry[f.out] = row[f.in];
    verses[row.verse].push(entry);
  }
  return verses;
}

// Call Claude Haiku for one verse: returns array of { gloss, transliteration }
async function generateVerseData(words, language, verseRef) {
  const lang = language === 'griego' ? 'griego' : 'hebreo';
  const wordsList = words.map((w, i) => `${i + 1}. "${w.original_text}" (Strong's: ${w.strongs || '?'})`).join('\n');

  const system = `Eres un experto en ${lang} bíblico para KODESH, plataforma de estudio bíblico Hebreo-Mesiánica.

Para cada palabra del versículo, da DOS cosas:
1. "gloss": traducción breve al español de ESA palabra específica en SU contexto en este versículo (1-4 palabras, estilo interlineal)
2. "translit": transliteración fonética al español/latino estándar (sin signos diacríticos raros), ej:
   - בְּרֵאשִׁית -> "bereshit"
   - λόγος -> "logos"
   - ἀγάπη -> "agape"

Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj.

Responde SOLO con un array JSON, sin texto adicional, sin markdown:
[{"gloss":"...","translit":"..."}, ...]
El array debe tener EXACTAMENTE el mismo número de elementos que palabras recibidas, en el mismo orden.`;

  const user = `Versículo: ${verseRef}
Palabras en orden (${language === 'griego' ? 'izquierda a derecha' : 'derecha a izquierda, como aparecen en hebreo'}):
${wordsList}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  let parsed;
  try { parsed = JSON.parse(text.trim()); }
  catch(e) {
    const m = text.match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : [];
  }
  if (!Array.isArray(parsed) || parsed.length !== words.length) {
    // Pad/truncate defensively
    const fixed = [];
    for (let i = 0; i < words.length; i++) fixed.push(parsed[i] || { gloss: '', translit: '' });
    return fixed;
  }
  return parsed;
}

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

    // Group source by verse
    const sourceByVerse = {};
    for (const row of source) {
      if (!sourceByVerse[row.verse]) sourceByVerse[row.verse] = [];
      sourceByVerse[row.verse].push(row);
    }

    const verseNums = Object.keys(sourceByVerse).map(Number).sort((a,b) => a-b);
    const resultVerses = {};
    const cacheRows = [];

    // 3 — Generate gloss+translit per verse (concurrent batches to reduce latency)
    const CONCURRENCY = 5;
    for (let i = 0; i < verseNums.length; i += CONCURRENCY) {
      const batch = verseNums.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (vnum) => {
        const words = sourceByVerse[vnum];
        const language = words[0]?.language || 'hebreo';
        const verseRef = `${bookU} ${chapterN}:${vnum}`;

        let genData;
        try {
          genData = await generateVerseData(words, language, verseRef);
        } catch(e) {
          console.error(`Generate error for ${verseRef}:`, e.message);
          genData = words.map(() => ({ gloss: '', translit: '' }));
        }

        resultVerses[vnum] = words.map((w, idx) => ({
          text: w.original_text,
          strongs: w.strongs,
          translit: genData[idx]?.translit || '',
          gloss: genData[idx]?.gloss || '',
          language: w.language,
        }));

        words.forEach((w, idx) => {
          cacheRows.push({
            book: bookU,
            chapter: chapterN,
            verse: vnum,
            word_order: w.word_order,
            original_text: w.original_text,
            strongs: w.strongs,
            transliteration: genData[idx]?.translit || '',
            gloss: genData[idx]?.gloss || '',
            language: w.language,
          });
        });
      }));
    }

    // 4 — Save to cache (best-effort, don't block response on failure)
    try {
      // Insert in chunks to avoid huge payloads
      const CHUNK = 200;
      for (let i = 0; i < cacheRows.length; i += CHUNK) {
        await sbInsert('interlinear_cache', cacheRows.slice(i, i + CHUNK));
      }
    } catch(e) {
      console.error('Cache save error:', e.message);
    }

    // 5 — Return
    return res.status(200).json({ book: bookU, chapter: chapterN, verses: resultVerses });

  } catch(err) {
    console.error('Interlinear error:', err);
    return res.status(500).json({ error: err.message });
  }
}
