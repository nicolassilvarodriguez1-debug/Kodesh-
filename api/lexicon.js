// KODESH Lexicon API — Expanded with theological depth
// Returns: Strong's, lemma, transliteration, definition, theological meaning,
// word origin, did-you-know, apply-it, related words, key verses, occurrences

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

const CONTEXT_SENSITIVE = new Set([
  'ama','amor','amar','amó','amaba','amamos','aman',
  'señor','dios','espíritu','palabra','fe','vida',
  'salvación','gracia','paz','gloria','santo','santa',
]);

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const LEXICON_LIMITS = { free: 30, premium: 999999 };

async function sbFetch(path, options = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }
  });
}

async function getUserPlan(userId) {
  if (!userId) return 'free';
  try {
    const res = await sbFetch(`user_plans?user_id=eq.${userId}&select=plan,subscription_status&limit=1`);
    const data = await res.json();
    if (data?.[0]?.subscription_status === 'active') return data[0].plan || 'free';
  } catch(e) {}
  return 'free';
}

async function getLexiconUsage(userId) {
  if (!userId) return 0;
  const month = new Date().toISOString().slice(0, 7);
  try {
    const res = await sbFetch(`ai_usage?user_id=eq.${userId}&month=eq.${month}&select=lexicon_used&limit=1`);
    const data = await res.json();
    return data?.[0]?.lexicon_used || 0;
  } catch(e) { return 0; }
}

async function incrementLexiconUsage(userId) {
  if (!userId) return;
  const month = new Date().toISOString().slice(0, 7);
  try {
    const res = await sbFetch(`ai_usage?user_id=eq.${userId}&month=eq.${month}&select=lexicon_used&limit=1`);
    const data = await res.json();
    const current = data?.[0]?.lexicon_used || 0;
    if (data?.[0]) {
      await sbFetch(`ai_usage?user_id=eq.${userId}&month=eq.${month}`, {
        method: 'PATCH',
        body: JSON.stringify({ lexicon_used: current + 1 })
      });
    } else {
      await sbFetch('ai_usage', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: userId, month, lexicon_used: 1, searches_used: 0, assistant_used: 0 })
      });
    }
  } catch(e) {}
}

async function getCached(word, testament, bookId, chapter, verse) {
  const isContextSensitive = CONTEXT_SENSITIVE.has(word.toLowerCase());
  try {
    if (isContextSensitive && bookId && chapter && verse) {
      const verseKey = `${word.toLowerCase()}_${bookId}_${chapter}_${verse}`;
      const w = encodeURIComponent(verseKey);
      const res = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
      const data = await res.json();
      if (data?.[0]?.strongs) return data[0];
    }
    const w = encodeURIComponent(word.toLowerCase());
    const res = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
    const data = await res.json();
    if (data?.[0]?.strongs && !isContextSensitive) return data[0];
  } catch(e) {}
  return null;
}

async function saveCache(word, testament, entry, bookId, chapter, verse) {
  const isContextSensitive = CONTEXT_SENSITIVE.has(word.toLowerCase());
  const cacheWord = (isContextSensitive && bookId && chapter && verse)
    ? `${word.toLowerCase()}_${bookId}_${chapter}_${verse}`
    : word.toLowerCase();
  try {
    await sbFetch('lexicon_cache', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        word: cacheWord,
        testament,
        strongs: entry.strongs,
        lemma: entry.lemma,
        transliteration: entry.transliteration,
        pronunciation: entry.pronunciation,
        definition: entry.definition,
        language: entry.language,
        theological_meaning: entry.theological_meaning || null,
        word_origin: entry.word_origin || null,
        did_you_know: entry.did_you_know || null,
        apply_it: entry.apply_it || null,
        related_words: entry.related_words ? JSON.stringify(entry.related_words) : null,
        key_verses: entry.key_verses ? JSON.stringify(entry.key_verses) : null,
        occurrences: entry.occurrences || null,
      })
    });
  } catch(e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, strongsCode, bookId, chapter, verse, verseContext, userId } = req.body;

  // Handle direct Strong's lookup (from interlineal word click)
  if (strongsCode && !word) {
    return handleStrongsLookup(strongsCode, bookId, userId, res);
  }

  if (!word) return res.status(400).json({ error: 'word required' });

  const isNT = NT_BOOKS.has(bookId);
  const testament = isNT ? 'NT' : 'AT';
  const wordClean = word.toLowerCase().trim();
  const isContextSensitive = CONTEXT_SENSITIVE.has(wordClean);

  // 1 — Check cache
  if (!isContextSensitive) {
    const cached = await getCached(wordClean, testament, bookId, chapter, verse);
    if (cached) return res.status(200).json(formatCached(cached));
  } else if (bookId && chapter && verse) {
    const cached = await getCached(wordClean, testament, bookId, chapter, verse);
    if (cached) return res.status(200).json(formatCached(cached));
  }

  // 2 — Check limits
  if (userId) {
    const [plan, used] = await Promise.all([getUserPlan(userId), getLexiconUsage(userId)]);
    const limit = LEXICON_LIMITS[plan] || LEXICON_LIMITS.free;
    if (used >= limit) {
      return res.status(429).json({
        error: 'limit_reached', plan, used, limit,
        message: plan === 'free'
          ? `Alcanzaste tu límite de ${limit} consultas al lexicón este mes. Actualiza a Premium para continuar.`
          : `Alcanzaste tu límite de consultas este mes.`,
      });
    }
  }

  // 3 — Generate with AI
  const lang = isNT ? 'griego' : 'hebreo';
  const testament_label = isNT ? 'Nuevo Testamento' : 'Antiguo Testamento';
  const verseRef = (bookId && chapter && verse) ? `${bookId} ${chapter}:${verse}` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `Eres un experto en léxico bíblico ${lang} para KODESH (plataforma Hebreo-Mesiánica).

MISIÓN: Identificar y analizar en profundidad la palabra EXACTA del idioma original usada en ese versículo.

REGLAS:
- AT → hebreo (H####), NT → griego (G####)
- Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj
- En Juan 21: agapao ≠ phileo — determina cuál según el contexto exacto
- El análisis debe ser teológicamente preciso y orientado a la fe Hebreo-Mesiánica

Responde SOLO JSON válido sin markdown:
{
  "found": true,
  "strongs": "G25",
  "lemma": "ἀγαπάω",
  "transliteration": "agapao",
  "pronunciation": "ag-ap-ah-o",
  "language": "griego",
  "definition": "Definición concisa (2-3 oraciones) enfocada en el contexto de este versículo específico.",
  "theological_meaning": "Significado teológico profundo: cómo esta palabra revela el carácter de Dios o la naturaleza de la fe mesiánica (3-4 oraciones).",
  "word_origin": "Etimología: raíz, componentes, evolución del término en el mundo bíblico (2-3 oraciones).",
  "did_you_know": "Un dato fascinante y poco conocido sobre esta palabra que cambia cómo se lee el texto (2-3 oraciones).",
  "apply_it": "Aplicación práctica directa para el creyente hoy, en tono pastoral (2-3 oraciones).",
  "related_words": [
    {"word": "ἀγάπη", "strongs": "G26", "translation": "amor (sustantivo)"},
    {"word": "φιλέω", "strongs": "G5368", "translation": "amor fraternal"}
  ],
  "key_verses": [
    {"ref": "Juan 3:16", "bookId": "JHN", "chapter": 3, "verse": 16},
    {"ref": "Romanos 5:8", "bookId": "ROM", "chapter": 5, "verse": 8},
    {"ref": "1 Juan 4:8", "bookId": "1JN", "chapter": 4, "verse": 8}
  ],
  "occurrences": "Aparece 143 veces en el Nuevo Testamento"
}

Si no tiene entrada Strong's: {"found": false}`,
        messages: [{
          role: 'user',
          content: `Palabra en español: "${word}"
Libro: ${bookId} | Testamento: ${testament_label}${verseRef ? ` | Referencia: ${verseRef}` : ''}
${verseContext ? `Texto del versículo: "${verseContext.slice(0, 300)}"` : ''}

Analiza la palabra ${lang} exacta usada en este versículo y genera el análisis completo.`
        }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { found: false };
    }

    if (parsed.found) {
      await Promise.all([
        saveCache(wordClean, testament, parsed, bookId, chapter, verse),
        userId ? incrementLexiconUsage(userId) : Promise.resolve(),
      ]);
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Lexicon error:', err.message);
    return res.status(500).json({ found: false, error: err.message });
  }
}

// Format cached entry to match the full response shape
function formatCached(cached) {
  return {
    found: true,
    strongs: cached.strongs,
    lemma: cached.lemma,
    transliteration: cached.transliteration,
    pronunciation: cached.pronunciation,
    definition: cached.definition,
    language: cached.language,
    theological_meaning: cached.theological_meaning || null,
    word_origin: cached.word_origin || null,
    did_you_know: cached.did_you_know || null,
    apply_it: cached.apply_it || null,
    related_words: cached.related_words || null,
    key_verses: cached.key_verses || null,
    occurrences: cached.occurrences || null,
    fromCache: true,
  };
}

// Direct Strong's code lookup (from interlineal)
async function handleStrongsLookup(strongsCode, bookId, userId, res) {
  const isNT = strongsCode.startsWith('G');
  const testament = isNT ? 'NT' : 'AT';
  const cacheKey = `strongs_${strongsCode.toLowerCase()}`;

  try {
    const w = encodeURIComponent(cacheKey);
    const cacheRes = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
    const cacheData = await cacheRes.json();
    if (cacheData?.[0]?.strongs) return res.status(200).json(formatCached(cacheData[0]));
  } catch(e) {}

  // Generate from Strong's code
  const lang = isNT ? 'griego' : 'hebreo';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `Eres experto en léxico bíblico ${lang} para KODESH (plataforma Hebreo-Mesiánica). Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj. Responde SOLO JSON válido con el mismo schema completo que incluye: found, strongs, lemma, transliteration, pronunciation, language, definition, theological_meaning, word_origin, did_you_know, apply_it, related_words, key_verses, occurrences.`,
        messages: [{
          role: 'user',
          content: `Genera el análisis completo para la palabra bíblica con Strong's ${strongsCode} en ${lang}.`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { found: false }; }

    if (parsed.found) {
      // Cache it
      try {
        await sbFetch('lexicon_cache', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            word: cacheKey, testament,
            strongs: parsed.strongs, lemma: parsed.lemma,
            transliteration: parsed.transliteration, pronunciation: parsed.pronunciation,
            definition: parsed.definition, language: parsed.language,
            theological_meaning: parsed.theological_meaning || null,
            word_origin: parsed.word_origin || null,
            did_you_know: parsed.did_you_know || null,
            apply_it: parsed.apply_it || null,
            related_words: parsed.related_words ? JSON.stringify(parsed.related_words) : null,
            key_verses: parsed.key_verses ? JSON.stringify(parsed.key_verses) : null,
            occurrences: parsed.occurrences || null,
          })
        });
      } catch(e) {}
    }
    return res.status(200).json(parsed);
  } catch(err) {
    return res.status(500).json({ found: false, error: err.message });
  }
}
