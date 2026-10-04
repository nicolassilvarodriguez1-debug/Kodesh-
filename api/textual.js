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
import { applyManuscriptRules, validateChapter, maxTokensFor } from './_textualCheck.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

const BOOK_NAMES = {
  GEN:'Génesis',EXO:'Éxodo',LEV:'Levítico',NUM:'Números',DEU:'Deuteronomio',
  JOS:'Josué',JDG:'Jueces',RUT:'Rut','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Reyes','2KI':'2 Reyes','1CH':'1 Crónicas','2CH':'2 Crónicas',
  EZR:'Esdras',NEH:'Nehemías',EST:'Ester',JOB:'Job',PSA:'Salmos',
  PRO:'Proverbios',ECC:'Eclesiastés',SNG:'Cantares',ISA:'Isaías',
  JER:'Jeremías',LAM:'Lamentaciones',EZK:'Ezequiel',DAN:'Daniel',
  HOS:'Oseas',JOL:'Joel',AMO:'Amós',OBA:'Abdías',JON:'Jonás',
  MIC:'Miqueas',NAM:'Nahúm',HAB:'Habacuc',ZEP:'Sofonías',HAG:'Hageo',
  ZEC:'Zacarías',MAL:'Malaquías',MAT:'Mateo',MRK:'Marcos',LUK:'Lucas',
  JHN:'Juan',ACT:'Hechos',ROM:'Romanos','1CO':'1 Corintios','2CO':'2 Corintios',
  GAL:'Gálatas',EPH:'Efesios',PHP:'Filipenses',COL:'Colosenses',
  '1TH':'1 Tesalonicenses','2TH':'2 Tesalonicenses','1TI':'1 Timoteo',
  '2TI':'2 Timoteo',TIT:'Tito',PHM:'Filemón',HEB:'Hebreos',JAS:'Santiago',
  '1PE':'1 Pedro','2PE':'2 Pedro','1JN':'1 Juan','2JN':'2 Juan',
  '3JN':'3 Juan',JUD:'Judas',REV:'Apocalipsis'
};

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
        model_version: 'claude-haiku-4-5-20251001',
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

  const verseKeys = Object.keys(sourceVerses).sort((a, b) => parseInt(a) - parseInt(b));
  const verseCount = verseKeys.length;

  // 3 — Construir el texto fuente formateado para el prompt
  const sourceText = verseKeys.map(k => `${k}. ${sourceVerses[k]}`).join('\n');
  const isNT = NT_BOOKS.has(bookId);
  const lang = isNT ? 'griego koiné' : 'hebreo bíblico';
  const bookName = BOOK_NAMES[bookId] || bookId;

  try {
   try {
    // Prompt del sistema (reglas KODESH de traducción y manuscritos).
    const systemPrompt = `Eres un traductor bíblico experto en ${lang} para KODESH, una plataforma de estudio bíblico Hebreo-Mesiánica.

IDIOMA: Escribe TODO en español. Nunca respondas un versículo en inglés ni mezcles palabras en inglés, aunque pienses en otro idioma.

MISIÓN: A partir del texto bíblico en español (RVR60) que te proporciono como referencia, producir una traducción NUEVA al español de EQUIVALENCIA FORMAL — lo más cercana posible al texto original en ${lang}.

PRINCIPIOS DE TRADUCCIÓN:
1. FIDELIDAD AL ORIGINAL: Consulta mentalmente el texto en ${lang} de ${bookName} ${chapter}. Donde la RVR60 se aleja del original (por paráfrasis, adiciones interpretativas, o suavizaciones idiomáticas), corrige hacia lo que dice el ${lang}.
2. ESPAÑOL NATURAL: La traducción debe sonar digna y clara en español — NUNCA arcaica, forzada ni "palabra por palabra sin sentido". Si la estructura literal del ${lang} no funciona en español, reorganiza la frase preservando el significado exacto.
3. PRECISIÓN LÉXICA: Elige la palabra española que mejor refleje el campo semántico de la palabra original. No uses sinónimos genéricos cuando hay una equivalencia precisa disponible.

NOMBRES Y CONVENCIONES KODESH (obligatorias):
- El Tetragrámaton יהוה (solo estas cuatro letras exactas, YHWH) → YHWH. NO confundas Elohim con YHWH. Cuando el hebreo original dice אֱלֹהִים (Elohim, "Dios") → traduce como "Elohim" o "Dios". Cuando el hebreo dice יהוה → YHWH. Cuando dice יהוה אֱלֹהִים (YHWH Elohim) → YHWH Elohim. NUNCA sustituyas Elohim por YHWH. Ejemplo: Génesis 1:1 dice "Bereshit bara Elohim" = "En el principio Elohim creó" (NO YHWH). YHWH aparece por primera vez en Génesis 2:4.
- En el NT griego, κύριος (kurios) cuando cita textos del AT donde había YHWH → YHWH. Cuando κύριος se refiere a un señor humano o título genérico → "señor" (minúscula).
- ישוע / Ἰησοῦς → Yeshúa (nunca "Jesús")
- משיח / Χριστός → Mashíaj (nunca "Cristo", excepto si usas "Mesías" como alternativa aceptable)
- רוח הקודש / Πνεῦμα Ἅγιον → Ruaj HaKódesh o Espíritu Santo (ambos aceptables)
- תורה → Torah (no "la Ley" cuando se refiere a los cinco libros de Moisés)
- Nombres propios hebreos: mantén la forma hebrea cuando sea reconocible (Moshé, Avraham, Yaakov, Yitzjak, Yosef, Miriam, Shaúl/Pablo). Si el nombre hebreo es poco conocido, usa la forma española seguida de la hebrea entre paréntesis solo la primera vez.

CRÍTICA TEXTUAL — VERSÍCULOS INTERPOLADOS:
Algunos versículos en la RVR60 NO aparecen en los manuscritos más antiguos y confiables (NA28/UBS5 para el NT). Son adiciones tardías de copistas. Para estos versículos, NO traduzcas el contenido de la RVR60. En su lugar, escribe EXACTAMENTE:
"[Este versículo no aparece en los manuscritos más antiguos y confiables.]"

Lista de versículos interpolados conocidos del NT (reemplazar con la nota anterior):
- Mateo 17:21, 18:11, 23:14
- Marcos 7:16, 9:44, 9:46, 11:26, 15:28
- Lucas 17:36, 23:17
- Juan 5:4
- Hechos 8:37, 15:34, 24:7, 28:29
- Romanos 16:24

Pasajes extensos disputados (traducir pero con nota al inicio del pasaje):
- Marcos 16:9-20: traducir normalmente pero agregar al inicio del verso 9: "[Los manuscritos más antiguos concluyen Marcos en 16:8. Los versículos 9-20 aparecen en manuscritos posteriores.] "
- Juan 7:53-8:11: traducir normalmente pero agregar al inicio de 7:53: "[Este pasaje no aparece en los manuscritos más antiguos. Su ubicación varía en los que lo incluyen.] "

Adiciones dentro de versículos (palabras o frases añadidas por copistas):
- Cuando una palabra o frase dentro de un versículo NO está en el texto original más antiguo pero sí aparece en la RVR60, OMÍTELA de tu traducción. Traduce solo lo que el manuscrito más antiguo contiene.
- Ejemplo: Mateo 6:13 — la doxología final ("porque tuyo es el reino, y el poder, y la gloria, por todos los siglos. Amén") NO está en los manuscritos más antiguos del NT. No la incluyas.
- Ejemplo: 1 Juan 5:7-8 — el Comma Johanneum ("en el cielo: el Padre, el Verbo y el Espíritu Santo; y estos tres son uno. Y tres son los que dan testimonio en la tierra") es una adición tardía. El versículo 7 SÍ existe: tradúcelo como "Porque tres son los que dan testimonio:" y el 8 como "el Espíritu, el agua y la sangre; y los tres concuerdan en uno." NO pongas la nota de "no aparece" en el 5:7.
- La nota de "[Este versículo no aparece…]" va SOLO en los versículos de la lista de arriba, nunca en otros.

REGLA CRÍTICA DE ESTRUCTURA:
- El texto RVR60 tiene EXACTAMENTE ${verseCount} versículos (del ${verseKeys[0]} al ${verseKeys[verseKeys.length - 1]}).
- Tu traducción DEBE tener EXACTAMENTE los mismos ${verseCount} versículos, con la MISMA numeración.
- NUNCA fusiones, dividas, omitas ni agregues versículos. Verso 1 traduce verso 1, verso 2 traduce verso 2, etc.

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin backticks, sin texto adicional):
{"1":"traducción del verso 1","2":"traducción del verso 2",...,"${verseKeys[verseKeys.length - 1]}":"traducción del último verso"}`;

    // Hasta 2 intentos. Un capítulo solo se guarda en caché si pasa la
    // validación (api/_textualCheck.js): todos los versículos presentes, en
    // español y sin notas de manuscritos donde no corresponden.
    let verses = null;
    let problems = [{ type: 'not_generated' }];
    for (let attempt = 1; attempt <= 2 && problems.length; attempt++) {
      const retryNote = attempt === 1 ? '' : `\n\nATENCIÓN: el intento anterior tuvo errores (${problems.map(p => `${p.verse ? 'v' + p.verse + ' ' : ''}${p.type}`).join(', ')}). Devuelve los ${verseCount} versículos completos, TODO en español.`;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokensFor(verseCount),
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Aquí está ${bookName} ${chapter} en RVR60 (${verseCount} versículos). Tradúcelo según las reglas:\n\n${sourceText}${retryNote}`,
          }],
        })
      });

      const data = await response.json();
      const raw = data?.content?.[0]?.text || '';
      let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];

      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch (parseErr) {
        console.error(`[Textual] JSON parse error (intento ${attempt}, stop_reason ${data?.stop_reason}):`, parseErr.message);
        problems = [{ type: data?.stop_reason === 'max_tokens' ? 'truncated' : 'bad_json' }];
        continue;
      }
      // Solo las claves del capítulo, con las reglas de manuscritos aplicadas.
      const only = {};
      for (const k of verseKeys) if (parsed[k] != null) only[k] = String(parsed[k]);
      verses = applyManuscriptRules(bookId, chapter, only);
      problems = validateChapter(bookId, chapter, verses, verseKeys);
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
