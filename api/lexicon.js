// KODESH Lexicon API — AI-powered with verse-precise lookup + cache
import { requireUser } from './_auth.js';
import { consumeUsage, releaseUsage } from './_limits.js';
import { applyCors, handleOptions, sendError, ERR, isValidBookId, isValidChapter, isValidVerse, clampString } from './_security.js';

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

// Words that have DIFFERENT meanings depending on verse context
// These should NOT be cached globally — look them up every time
const CONTEXT_SENSITIVE = new Set([
  'ama','amor','amar','amó','amaba','amamos','aman',
  'señor','dios','espíritu','palabra','fe','vida',
  'salvación','gracia','paz','gloria','santo','santa',
]);

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

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
        word: cacheWord, testament,
        strongs: entry.strongs, lemma: entry.lemma,
        transliteration: entry.transliteration, pronunciation: entry.pronunciation,
        definition: entry.definition, language: entry.language,
      })
    });
  } catch(e) {}
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const body = req.body || {};
  const strongsCode = typeof body.strongsCode === 'string' ? clampString(body.strongsCode, 20) : null;
  const word = typeof body.word === 'string' ? clampString(body.word.trim(), 100) : null;
  const bookId = isValidBookId(body.bookId) ? body.bookId.toUpperCase() : null;
  const chapter = bookId && isValidChapter(body.chapter) ? Number(body.chapter) : null;
  const verse = chapter && isValidVerse(body.verse) ? Number(body.verse) : null;
  const verseContext = typeof body.verseContext === 'string' ? clampString(body.verseContext, 500) : null;

  // Direct Strong's lookup (used by the Interlinear panel when clicking a Strong's number)
  if (strongsCode && !word) {
    if (!/^[HG]\d{1,5}$/i.test(strongsCode)) return sendError(res, 400, ERR.badRequest, null, 'lexicon');
    return handleStrongsLookup(strongsCode, userId, res);
  }

  if (!word) return sendError(res, 400, ERR.badRequest, null, 'lexicon');

  const isNT = bookId ? NT_BOOKS.has(bookId) : false;
  const testament = isNT ? 'NT' : 'AT';
  const wordClean = word.toLowerCase().trim();
  const isContextSensitive = CONTEXT_SENSITIVE.has(wordClean);

  // 1 — Check cache (free — doesn't touch quota)
  const cached = await getCached(wordClean, testament, bookId, chapter, verse);
  if (cached) {
    return res.status(200).json({
      found: true, strongs: cached.strongs, lemma: cached.lemma,
      transliteration: cached.transliteration, pronunciation: cached.pronunciation,
      definition: cached.definition, language: cached.language, fromCache: true,
    });
  }
  if (isContextSensitive && !(bookId && chapter && verse)) {
    // context-sensitive word with no verse ref — nothing more we can safely cache/serve
  }

  // 2 — Reserve quota atomically before calling Anthropic.
  let usageResult;
  try {
    usageResult = await consumeUsage(userId, 'lexicon');
  } catch(e) {
    return sendError(res, 500, ERR.internal, e, 'lexicon:consumeUsage');
  }
  if (!usageResult.allowed) {
    return res.status(429).json({
      error: 'limit_reached', plan: usageResult.plan, used: usageResult.used, limit: usageResult.limit,
      message: usageResult.plan === 'free'
        ? `Alcanzaste tu límite de ${usageResult.limit} consultas al lexicón este mes. Actualiza a Premium para continuar.`
        : `Alcanzaste tu límite de consultas este mes.`,
    });
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
Libro: ${bookId || '—'} | Testamento: ${testament_label}${verseRef ? ` | Referencia exacta: ${verseRef}` : ''}
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
      await saveCache(wordClean, testament, parsed, bookId, chapter, verse);
    } else {
      await releaseUsage(userId, 'lexicon');
    }

    return res.status(200).json(parsed);

  } catch(err) {
    await releaseUsage(userId, 'lexicon');
    return sendError(res, 500, ERR.internal, err, 'lexicon');
  }
}

// Direct Strong's code lookup — used by the Interlinear panel.
// Cached separately under word = "strongs_<code>" (e.g. "strongs_h776").
async function handleStrongsLookup(strongsCode, userId, res) {
  const isNT = strongsCode.toUpperCase().startsWith('G');
  const testament = isNT ? 'NT' : 'AT';
  const cacheKey = `strongs_${strongsCode.toLowerCase()}`;

  // 1 — Check cache (free)
  try {
    const w = encodeURIComponent(cacheKey);
    const cacheRes = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
    const cacheData = await cacheRes.json();
    if (cacheData?.[0]?.strongs) {
      return res.status(200).json({
        found: true, strongs: cacheData[0].strongs, lemma: cacheData[0].lemma,
        transliteration: cacheData[0].transliteration, pronunciation: cacheData[0].pronunciation,
        definition: cacheData[0].definition, language: cacheData[0].language, fromCache: true,
      });
    }
  } catch(e) {}

  // 2 — Reserve quota atomically (same pool as word lookups)
  let usageResult;
  try {
    usageResult = await consumeUsage(userId, 'lexicon');
  } catch(e) {
    return sendError(res, 500, ERR.internal, e, 'lexicon:consumeUsage');
  }
  if (!usageResult.allowed) {
    return res.status(429).json({
      error: 'limit_reached', plan: usageResult.plan, used: usageResult.used, limit: usageResult.limit,
      message: usageResult.plan === 'free'
        ? `Alcanzaste tu límite de ${usageResult.limit} consultas al lexicón este mes. Actualiza a Premium para continuar.`
        : `Alcanzaste tu límite de consultas este mes.`,
    });
  }

  // 3 — Generate via AI from the Strong's code alone
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
        max_tokens: 400,
        system: `Eres un experto en léxico bíblico ${lang} para KODESH (plataforma Hebreo-Mesiánica). Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj.

Responde SOLO JSON:
{"found":true,"strongs":"H776","lemma":"אֶרֶץ","transliteration":"erets","pronunciation":"eh'-rets","definition":"Tierra, suelo, país. Palabra muy frecuente que designa tanto la tierra física como una nación o territorio específico.","language":"hebreo"}

Si el código no existe: {"found":false}`,
        messages: [{
          role: 'user',
          content: `Genera la entrada léxica completa para el número Strong's ${strongsCode.toUpperCase()} (${lang} bíblico).`
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
      try {
        await sbFetch('lexicon_cache', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            word: cacheKey, testament,
            strongs: parsed.strongs, lemma: parsed.lemma,
            transliteration: parsed.transliteration, pronunciation: parsed.pronunciation,
            definition: parsed.definition, language: parsed.language,
          })
        });
      } catch(e) {}
    } else {
      await releaseUsage(userId, 'lexicon');
    }

    return res.status(200).json(parsed);

  } catch(err) {
    await releaseUsage(userId, 'lexicon');
    return sendError(res, 500, ERR.internal, err, 'lexicon:strongs');
  }
}
