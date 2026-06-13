// KODESH — Shared interlinear generation/cache logic
// Used by both api/interlinear.js (premium, full response) and
// api/interlinear-warm.js (background pre-generation for all users).

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return res.json();
}

export async function sbInsert(table, rows) {
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

export async function getUserPlan(userId) {
  if (!userId) return 'free';
  try {
    const data = await sbGet(`user_plans?user_id=eq.${userId}&select=plan,subscription_status&limit=1`);
    if (data?.[0]?.subscription_status === 'active') return data[0].plan || 'free';
  } catch(e) {}
  return 'free';
}

export function groupByVerse(rows, fields) {
  const verses = {};
  for (const row of rows) {
    if (!verses[row.verse]) verses[row.verse] = [];
    const entry = {};
    for (const f of fields) entry[f.out] = row[f.in];
    verses[row.verse].push(entry);
  }
  return verses;
}

// Call Claude Haiku for one verse: returns array of { gloss, translit }
export async function generateVerseData(words, language, verseRef) {
  const lang = language === 'griego' ? 'griego' : 'hebreo';
  const wordsList = words.map((w, i) => `${i + 1}. "${w.original_text}" (Strong's: ${w.strongs || '?'})`).join('\n');

  const system = `Léxico ${lang} bíblico, KODESH (Hebreo-Mesiánico). Para cada palabra da:
1. "gloss": traducción breve al español en contexto (1-4 palabras)
2. "translit": transliteración fonética latina (ej: bereshit, logos, agape)
Usa: YHWH, Yeshúa, Mashíaj.
SOLO array JSON, sin texto extra: [{"gloss":"...","translit":"..."}]
Mismo número de elementos que palabras, mismo orden.`;

  const user = `${verseRef}:
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
      max_tokens: 800,
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
    const fixed = [];
    for (let i = 0; i < words.length; i++) fixed.push(parsed[i] || { gloss: '', translit: '' });
    return fixed;
  }
  return parsed;
}

// Generate (and cache) interlinear data for a chapter that isn't cached yet.
// Returns { resultVerses } — also writes to interlinear_cache.
// concurrency controls how many verses are processed in parallel.
export async function generateChapter(bookU, chapterN, source, concurrency = 5) {
  const sourceByVerse = {};
  for (const row of source) {
    if (!sourceByVerse[row.verse]) sourceByVerse[row.verse] = [];
    sourceByVerse[row.verse].push(row);
  }

  const verseNums = Object.keys(sourceByVerse).map(Number).sort((a,b) => a-b);
  const resultVerses = {};
  const cacheRows = [];

  for (let i = 0; i < verseNums.length; i += concurrency) {
    const batch = verseNums.slice(i, i + concurrency);
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

  // Save to cache (best-effort)
  try {
    const CHUNK = 200;
    for (let i = 0; i < cacheRows.length; i += CHUNK) {
      await sbInsert('interlinear_cache', cacheRows.slice(i, i + CHUNK));
    }
  } catch(e) {
    console.error('Cache save error:', e.message);
  }

  return resultVerses;
}
