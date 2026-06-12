// KODESH Lexicon API — AI-powered with verse-precise lookup + cache

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

// Words that have DIFFERENT meanings depending on verse context
// These should NOT be cached globally — look them up every time
const CONTEXT_SENSITIVE = new Set([
  'ama','amor','amar','amó','amaba','amamos','aman',
  'señor','dios','espíritu','palabra','fe','vida',
  'salvación','gracia','paz','gloria','santo','santa',
]);

import { PLAN_LIMITS } from './_limits.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const LEXICON_LIMITS = { free: PLAN_LIMITS.free.lexicon, premium: 999999 };

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
  // For context-sensitive words, use verse-specific cache key
  const isContextSensitive = CONTEXT_SENSITIVE.has(word.toLowerCase());
  
  try {
    let query;
    if (isContextSensitive && bookId && chapter && verse) {
      // Look for verse-specific entry first
      const verseKey = `${word.toLowerCase()}_${bookId}_${chapter}_${verse}`;
      const w = encodeURIComponent(verseKey);
      const res = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
      const data = await res.json();
      if (data?.[0]?.strongs) return data[0];
      // Fall through to general cache
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
  
  // For context-sensitive words, save with verse-specific key
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

  const { word, bookId, chapter, verse, verseContext, userId } = req.body;
  if (!word) return res.status(400).json({ error: 'word required' });

  const isNT = NT_BOOKS.has(bookId);
  const testament = isNT ? 'NT' : 'AT';
  const wordClean = word.toLowerCase().trim();
  const isContextSensitive = CONTEXT_SENSITIVE.has(wordClean);

  // 1 — Check cache (skip for context-sensitive words in NT where verse matters)
  if (!isContextSensitive) {
    const cached = await getCached(wordClean, testament, bookId, chapter, verse);
    if (cached) {
      return res.status(200).json({
        found: true,
        strongs: cached.strongs,
        lemma: cached.lemma,
        transliteration: cached.transliteration,
        pronunciation: cached.pronunciation,
        definition: cached.definition,
        language: cached.language,
        fromCache: true,
      });
    }
  } else if (bookId && chapter && verse) {
    // For context-sensitive, check verse-specific cache
    const cached = await getCached(wordClean, testament, bookId, chapter, verse);
    if (cached) {
      return res.status(200).json({
        found: true,
        strongs: cached.strongs,
        lemma: cached.lemma,
        transliteration: cached.transliteration,
        pronunciation: cached.pronunciation,
        definition: cached.definition,
        language: cached.language,
        fromCache: true,
      });
    }
  }

  // 2 — Check user limits
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

  // 3 — Call AI with verse-precise context
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
        max_tokens: 400,
        system: `Eres un experto en léxico bíblico hebreo y griego para KODESH (plataforma Hebreo-Mesiánica).

MISIÓN: Identificar la palabra EXACTA del idioma original (hebreo/griego) usada en ESE versículo específico.

REGLAS CRÍTICAS:
- AT → siempre hebreo (H####), NT → siempre griego (G####)
- Analiza el contexto del versículo para determinar la palabra EXACTA
- En Juan 21:15-17: Yeshúa usa ἀγαπάω (agapao/agape, G25) y Pedro responde con φιλέω (phileo, G5368) — son DIFERENTES
- No asumas — lee el contexto. Si Yeshúa pregunta = agape. Si Pedro responde = fileo.
- Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj

EJEMPLOS CRÍTICOS:
- "¿Me amas?" preguntado por Yeshúa en Juan 21 → ἀγαπάω G25
- "Te amo" respondido por Pedro en Juan 21 → φιλέω G5368
- "amor" en Juan 3:16 → ἀγαπάω G25
- "amor" en Juan 11:36 (llorando Jesús) → φιλέω G5368

Responde SOLO JSON:
{"found":true,"strongs":"G5368","lemma":"φιλέω","transliteration":"phileo","pronunciation":"fil-eh-o","definition":"Amar con afecto fraternal e íntimo. Amor de amistad personal. En Juan 21:15-17, Pedro usa esta palabra al responder a Yeshúa — no el agape divino incondicional sino el amor fraternal que sí puede afirmar.","language":"griego"}

Si no tiene entrada Strong's: {"found":false}`,
        messages: [{
          role: 'user',
          content: `Palabra en español: "${word}"
Libro: ${bookId} | Testamento: ${testament_label}${verseRef ? ` | Referencia exacta: ${verseRef}` : ''}
${verseContext ? `Texto del versículo: "${verseContext.slice(0, 300)}"` : ''}

Identifica la palabra ${lang} EXACTA usada en este versículo específico. Si hay múltiples palabras posibles para esta traducción en español (como agape/fileo para "amor"), determina cuál fue usada en ESTE versículo por el hablante o texto.`
        }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { found: false }; }

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
