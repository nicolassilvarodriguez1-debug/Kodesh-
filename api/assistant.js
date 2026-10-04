import { requireUser } from './_auth.js';
import { consumeUsage, releaseUsage } from './_limits.js';
import { BOOK_NAMES } from './_textualPrompt.js';
import { applyCors, handleOptions, sendError, ERR, isNonEmptyString, sanitizeHistory, isValidBookId, isValidChapter, isValidVerse, clampString } from './_security.js';

// El cliente manda el libro como id ("GEN") o, en las apps ya instaladas,
// como nombre en español ("Génesis"). Antes solo se aceptaba el id, así que
// el asistente nunca sabía qué capítulo se estaba leyendo.
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const ID_BY_NAME = new Map(Object.entries(BOOK_NAMES).map(([id, name]) => [norm(name), id]));
export function resolveBookId(bookId, book) {
  for (const v of [bookId, book]) {
    if (isValidBookId(v)) return v.toUpperCase();
    const byName = ID_BY_NAME.get(norm(v));
    if (byName) return byName;
  }
  return null;
}

export function buildAssistantSystem({ bookId, chapter, verse, userName, userGoals }) {
  const ref = bookId ? `${BOOK_NAMES[bookId] || bookId} ${chapter || ''}${verse ? ':' + verse : ''}`.trim() : '';
  const context = ref
    ? `CAPÍTULO ACTUAL: el usuario está leyendo ${ref} en este momento. Cuando diga "este capítulo", "este pasaje", "aquí" o pregunte sin nombrar un pasaje, se refiere a ${ref}: responde directamente sobre ese texto, sin preguntarle cuál es.`
    : '';
  const userCtx = userName
    ? `El nombre del usuario es ${userName}.${userGoals.length ? ` Sus objetivos: ${userGoals.join(', ')}.` : ''} Puedes llamarlo por su nombre de vez en cuando, sin repetirlo en cada mensaje.`
    : '';
  return `Eres el Asistente de Estudio Bíblico de KODESH — plataforma Hebreo-Mesiánica hispanohablante.
${context}
${userCtx}

SOBRE YESHÚA (INAMOVIBLE): Es el Hijo de Dios eterno y divino (Juan 1:1, Col 2:9). Único camino al Padre (Juan 14:6). Resurrección corporal y literal. Defiendes su divinidad siempre.
SOBRE TORAH: No fue abolida (Mat 5:17-19). Fiestas bíblicas vigentes. Shabat séptimo día eterno.
NOMBRES: Usa siempre YHWH, Yeshúa, Mashíaj, Ruaj HaKodesh, Brit Hadashá.
PUEDES: contexto histórico, exégesis, conexiones Torah→Profetas→Brit Hadashá, aplicación mesiánica.
NO PUEDES: responder fuera de las Escrituras, decir que Torah/fiestas/Shabat fueron abolidos.
Si preguntan algo no bíblico: "Solo puedo ayudarte con el estudio de las Escrituras."
TONO: cálido y natural, como un maestro que estudia junto al usuario. Si solo saluda o agradece, responde breve (1-2 frases) e invítalo a preguntar sobre el capítulo; no le muestres menús de opciones, casillas ni listas de "¿qué prefieres hacer?".
FORMATO: español, máximo 4 párrafos. Para preguntas de estudio: contexto → texto → conexión mesiánica → aplicación. Usa **negritas** con moderación y listas con "- " solo si ayudan.`;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  const body = req.body || {};
  const { message, book, chapter, verse } = body;
  if (!isNonEmptyString(message, 2000)) return sendError(res, 400, ERR.badRequest, null, 'assistant');

  const history = sanitizeHistory(body.history, { maxItems: 20, maxContentLen: 4000 });
  const safeBook = resolveBookId(body.bookId, book);
  const safeChapter = safeBook && isValidChapter(chapter) ? Number(chapter) : null;
  const safeVerse = safeChapter && isValidVerse(verse) ? Number(verse) : null;
  // Display-only fields — sanitized/clamped, never trusted as identity.
  const userName = clampString(typeof body.userName === 'string' ? body.userName : '', 80);
  const userGoals = Array.isArray(body.userGoals) ? body.userGoals.filter(g => typeof g === 'string').slice(0, 10).map(g => clampString(g, 80)) : [];

  let usageResult;
  try {
    usageResult = await consumeUsage(userId, 'assistant');
  } catch(e) {
    // Fail closed: if we can't verify/reserve quota, don't call Anthropic.
    return sendError(res, 503, ERR.unavailable, e, 'assistant:consumeUsage');
  }
  if (!usageResult.allowed) {
    return res.status(429).json({
      error: 'limit_reached', plan: usageResult.plan, used: usageResult.used, limit: usageResult.limit,
      message: usageResult.plan === 'free'
        ? `Alcanzaste tu límite de ${usageResult.limit} consultas al asistente este mes. Actualiza a Premium para continuar estudiando sin límites.`
        : `Alcanzaste tu límite de ${usageResult.limit} consultas este mes.`,
    });
  }

  const SYSTEM = buildAssistantSystem({ bookId: safeBook, chapter: safeChapter, verse: safeVerse, userName, userGoals });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: SYSTEM, messages: [...history, { role: 'user', content: message }] })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    return res.status(200).json({ reply });
  } catch(err) {
    await releaseUsage(userId, 'assistant');
    return sendError(res, 500, ERR.internal, err, 'assistant');
  }
}
