// KODESH Lexicon API — AI-powered with cache + limits

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

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

async function getCached(word, testament) {
  try {
    const w = encodeURIComponent(word.toLowerCase());
    const res = await sbFetch(`lexicon_cache?word=eq.${w}&testament=eq.${testament}&limit=1`);
    const data = await res.json();
    if (data?.[0]?.strongs) return data[0];
  } catch(e) {}
  return null;
}

async function saveCache(word, testament, entry) {
  try {
    await sbFetch('lexicon_cache', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        word: word.toLowerCase(),
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

  const { word, bookId, verseContext, userId } = req.body;
  if (!word) return res.status(400).json({ error: 'word required' });

  const isNT = NT_BOOKS.has(bookId);
  const testament = isNT ? 'NT' : 'AT';
  const lang = isNT ? 'griego' : 'hebreo';
  const wordClean = word.toLowerCase().trim();

  // 1 — Check cache first (free, no tokens)
  const cached = await getCached(wordClean, testament);
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

  // 2 — Check user limits (only for non-cached)
  if (userId) {
    const [plan, used] = await Promise.all([getUserPlan(userId), getLexiconUsage(userId)]);
    const limit = LEXICON_LIMITS[plan] || LEXICON_LIMITS.free;
    if (used >= limit) {
      return res.status(429).json({
        error: 'limit_reached',
        plan,
        used,
        limit,
        message: plan === 'free'
          ? `Alcanzaste tu límite de ${limit} consultas al lexicón este mes. Actualiza a Premium para continuar.`
          : `Alcanzaste tu límite de consultas este mes.`,
      });
    }
  }

  // 3 — Call AI
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
        max_tokens: 350,
        system: `Eres un experto en léxico bíblico hebreo y griego para KODESH (plataforma Hebreo-Mesiánica).
Reglas ESTRICTAS:
- Antiguo Testamento → SIEMPRE hebreo (Strong's H####)
- Nuevo Testamento → SIEMPRE griego (Strong's G####)
- Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj
- Responde SOLO JSON sin texto extra ni backticks

Formato:
{"found":true,"strongs":"G5495","lemma":"χείρ","transliteration":"cheir","pronunciation":"khire","definition":"mano. En el NT representa poder, acción y sanidad. Yeshúa extendió su mano para sanar (Mc 3:5).","language":"griego"}

Si la palabra no tiene entrada Strong's: {"found":false}`,
        messages: [{
          role: 'user',
          content: `Palabra: "${word}" | Libro: ${bookId} | Testamento: ${testament}${verseContext ? ` | Contexto: "${verseContext.slice(0,80)}"` : ''}`
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
      // Save to cache and increment usage in parallel
      await Promise.all([
        saveCache(wordClean, testament, parsed),
        userId ? incrementLexiconUsage(userId) : Promise.resolve(),
      ]);
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Lexicon error:', err.message);
    return res.status(500).json({ found: false, error: err.message });
  }
}
