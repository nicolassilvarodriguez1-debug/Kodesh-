// KODESH — Biblia Textual (IA) v2
// Genera traducción de equivalencia formal anclada al texto RVR60 + hebreo/griego original
// Formato de salida IDÉNTICO a biblia-rvr.json para compatibilidad con renderBibleText()
//
// This is a Premium-only, expensive generation endpoint (max_tokens según el
// tamaño del capítulo, ver _textualCheck.maxTokensFor).
// Previously had NO authentication at all — anyone could POST arbitrary
// sourceVerses and trigger generation. Now requires a verified Supabase
// session with an active/trialing premium plan, plus input validation and
// per-user rate limiting on cache misses (cache hits stay free/unlimited).
import { randomUUID } from 'crypto';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, isValidBookId, isValidChapter, sanitizeSourceVerses } from './_security.js';
import { checkRateLimit, acquireGenerationLock, releaseGenerationLock } from './_limits.js';
import { TEXTUAL_MODEL, buildTextualParams, parseTextualReply, sortedVerseKeys } from './_textualPrompt.js';

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

async function getPlan(userId) {
  try {
    const res = await sbFetch(`user_plans?user_id=eq.${userId}&select=plan,subscription_status,current_period_end&limit=1`);
    const data = await res.json();
    const row = data?.[0];
    if (!row) return 'free';
    const active = row.subscription_status === 'active' || row.subscription_status === 'trialing';
    const notExpired = !row.current_period_end || new Date(row.current_period_end) > new Date();
    return (active && notExpired) ? (row.plan || 'free') : 'free';
  } catch(e) { return 'free'; }
}

async function getCachedChapter(bookId, chapter) {
  try {
    const res = await sbFetch(
      `textual_cache?book_id=eq.${bookId}&chapter=eq.${chapter}&select=verses,verse_count,report_count&limit=1`
    );
    const data = await res.json();
    return data?.[0] || null;
  } catch(e) { return null; }
}

async function saveChapter(bookId, chapter, verses, verseCount) {
  try {
    await sbFetch('textual_cache?on_conflict=book_id,chapter', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        book_id: bookId,
        chapter,
        verses,
        verse_count: verseCount,
        model_version: TEXTUAL_MODEL,
        updated_at: new Date().toISOString(),
      })
    });
  } catch(e) { console.error('[Textual] Save error:', e.message); }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const bookId = isValidBookId(req.body?.bookId) ? req.body.bookId.toUpperCase() : null;
  const chapter = bookId && isValidChapter(req.body?.chapter) ? Number(req.body.chapter) : null;
  if (!bookId || !chapter) return sendError(res, 400, ERR.badRequest, null, 'textual');

  // 1 — Revisar caché (gratis, no consume ni requiere premium para servir
  // algo ya generado — pero igual exigimos sesión válida arriba).
  const cached = await getCachedChapter(bookId, chapter);
  if (cached) {
    // Aun así, esta traducción es contenido Premium — no servir el cuerpo
    // completo a cuentas free.
    const plan = await getPlan(userId);
    if (plan !== 'premium') return sendError(res, 403, ERR.forbidden, null, 'textual:not-premium');
    return res.status(200).json({
      found: true,
      verses: cached.verses,
      verseCount: cached.verse_count,
      reportCount: cached.report_count,
      fromCache: true,
    });
  }

  // 2 — Generar un capítulo nuevo requiere plan Premium (activo o en trial).
  const plan = await getPlan(userId);
  if (plan !== 'premium') return sendError(res, 403, ERR.forbidden, null, 'textual:not-premium');

  // 3 — Rate limit en generaciones nuevas (cache misses) — máx 20 capítulos
  // por hora por usuario. Los hits de caché de arriba no pasan por aquí.
  // FAIL CLOSED: si no podemos verificar el límite (p.ej. la RPC de
  // Supabase falla), NO llamamos a Anthropic — devolvemos 503 en vez de
  // continuar silenciosamente sin protección de costos.
  // Las precargas (capítulo anterior/siguiente en segundo plano) tienen su
  // propio cupo, para que nunca le quiten al lector el cupo del capítulo que
  // realmente quiere leer. Si se agota, el cliente simplemente no precarga.
  const isPrefetch = req.body?.prefetch === true;
  let rl;
  try {
    rl = isPrefetch
      ? await checkRateLimit(userId, 'textual_prefetch', 30, 3600)
      : await checkRateLimit(userId, 'textual_generate', 20, 3600);
  } catch(e) {
    console.error('[Textual] rate limit check failed — failing closed, no Anthropic call:', e.message);
    return sendError(res, 503, ERR.unavailable, e, 'textual:rate-limit-unavailable');
  }
  if (!rl.allowed) return sendError(res, 429, ERR.rateLimited, null, 'textual:rate-limit');

  // 4 — Necesitamos el texto RVR60 como ancla — el cliente lo envía. Se
  // valida tamaño y forma antes de construir el prompt.
  const sourceVerses = sanitizeSourceVerses(req.body?.sourceVerses, { maxVerses: 176, maxLen: 2000 });
  if (!sourceVerses) return sendError(res, 400, ERR.badRequest, null, 'textual:sourceVerses');

  // 5 — Bloqueo distribuido: impide que dos instancias generen el MISMO
  // libro/capítulo a la vez (p.ej. dos pestañas, o dos usuarios premium
  // abriendo el mismo capítulo sin caché en el mismo instante). FAIL
  // CLOSED igual que el rate limit — si no podemos verificar el lock, no
  // generamos.
  const leaseToken = randomUUID();
  let lock;
  try {
    lock = await acquireGenerationLock('textual', bookId, chapter, leaseToken, 120);
  } catch(e) {
    console.error('[Textual] lock check failed — failing closed, no Anthropic call:', e.message);
    return sendError(res, 503, ERR.unavailable, e, 'textual:lock-unavailable');
  }
  if (!lock.acquired) {
    return sendError(res, 409, ERR.conflict, null, 'textual:already-generating');
  }

  const verseKeys = sortedVerseKeys(sourceVerses);
  const verseCount = verseKeys.length;

  try {
   try {
    // Hasta 2 intentos. Un capítulo solo se guarda en caché si pasa la
    // validación (api/_textualCheck.js): todos los versículos presentes, en
    // español y sin notas de manuscritos donde no corresponden.
    let verses = null;
    let problems = [{ type: 'not_generated' }];
    for (let attempt = 1; attempt <= 2 && problems.length; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(buildTextualParams(bookId, chapter, sourceVerses, attempt === 1 ? null : problems)),
      });
      const data = await response.json();
      ({ verses, problems } = parseTextualReply(bookId, chapter, data?.content?.[0]?.text, verseKeys, data?.stop_reason));
      if (problems.length) console.warn(`[Textual] ${bookId} ${chapter} intento ${attempt}:`, JSON.stringify(problems).slice(0, 300));
    }

    if (problems.length) {
      // No se guarda en caché. Se muestra lo que sí salió bien y, en los
      // versículos con problema, el texto RVR60 (para no dejar huecos ni
      // mostrar inglés). La próxima apertura vuelve a intentar.
      const bad = new Set(problems.map(p => p.verse).filter(Boolean));
      const shown = {};
      for (const k of verseKeys) shown[k] = (verses && verses[k] && !bad.has(k)) ? verses[k] : sourceVerses[k];
      console.warn(`[Textual] ${bookId} ${chapter} NO se guarda en caché (${problems.length} problemas)`);
      return res.status(200).json({ found: true, verses: shown, verseCount, reportCount: 0, fromCache: false, partial: true });
    }

    // Guardar en caché
    await saveChapter(bookId, chapter, verses, verseCount);

    return res.status(200).json({
      found: true,
      verses,
      verseCount,
      reportCount: 0,
      fromCache: false,
    });
   } catch(e) {
    console.error('[Textual] Error:', e.message);
    return res.status(500).json({ error: 'No se pudo generar la traducción. Intenta de nuevo.' });
   }
  } finally {
    try { await releaseGenerationLock('textual', bookId, chapter, leaseToken); }
    catch(e) { console.warn('[Textual] lock release failed:', e.message); }
  }
}
