// KODESH — Preguntas para el grupo (células, congregación y familias):
// prompt y validación. Probadas en tests/groups.test.js.
// La IA escribe las preguntas de cada porción a partir de la Traducción Kodesh;
// aquí se revisa que cada referencia exista y caiga dentro de la porción, y
// que toda frase citada entre «» esté de verdad en el texto.

export const GROUPS_MODEL = 'claude-sonnet-4-5';

export function parseRange(ref) {
  const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(String(ref || '').trim());
  if (!m) return null;
  const c1 = +m[2], v1 = +m[3];
  const c2 = m[4] ? +m[4] : c1, v2 = m[5] ? +m[5] : v1;
  if (c2 < c1 || (c2 === c1 && v2 < v1)) return null;
  return { book: m[1], c1, v1, c2, v2 };
}
const pos = (c, v) => c * 1000 + v;
export function existsIn(bible, r) {
  const b = bible?.[r.book];
  return !!(b && b[String(r.c1)]?.[String(r.v1)] && b[String(r.c2)]?.[String(r.v2)]);
}
export function inParasha(r, p) {
  return r.book === p.book && pos(r.c1, r.v1) >= pos(p.startChapter, p.startVerse) && pos(r.c2, r.v2) <= pos(p.endChapter, p.endVerse);
}
export function verseCount(bible, r) {
  let n = 0;
  for (let c = r.c1; c <= r.c2; c++) {
    const ch = bible?.[r.book]?.[String(c)] || {};
    for (const v of Object.keys(ch)) { const k = +v; if (pos(c, k) >= pos(r.c1, r.v1) && pos(c, k) <= pos(r.c2, r.v2)) n++; }
  }
  return n;
}
const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[«»“”"'.,;:¿?¡!()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
// Toda cita entre «» debe aparecer en el texto de la porción
export function quotesOk(q, textNorm) {
  const quotes = [...String(q).matchAll(/«([^»]{3,})»/g)].map(m => norm(m[1]));
  return quotes.every(x => textNorm.includes(x));
}

export function groupsPrompt(p, text) {
  return `Eres un pastor hebreo-mesiánico que prepara material para células, congregaciones y familias que estudian juntas la porción semanal de la Torá.

Porción ${p.num}: ${p.nombre} (${p.heb}) — «${p.sig}» — ${p.torah}
Tema: ${p.tema}
Lectura mesiánica: ${p.mesianica}

Texto de la porción (Traducción Kodesh; cada línea empieza con LIBRO capítulo:versículo):
${text}

Escribe en español, cálido y claro. Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), Elohim o YHWH (nunca "Jehová").

REGLAS
- Cada pregunta lleva "ref" con el versículo de la porción en que se basa, con el formato exacto "${p.book} 3:9" (o un rango "${p.book} 3:8-10"). Debe estar DENTRO de la porción.
- Si citas palabras del texto, ponlas entre «» y cópialas EXACTAMENTE como están en el texto de arriba. Si no, no uses «».
- Preguntas abiertas que lleven a conversar y a aplicar, no de memoria.
- "lectura": un pasaje central de la porción para leer en voz alta (máx. 35 versículos), formato "${p.book} 1:1-2:3".

Responde SOLO con JSON:
{
 "central": {"q": "una sola pregunta para meditar toda la semana, breve (máx. 90 caracteres)", "ref": ""},
 "adultos": [{"q": "", "ref": ""}, … 4 preguntas],
 "jovenes": [{"q": "", "ref": ""}, … 3 preguntas],
 "ninos": [{"q": "", "ref": ""}, … 3 preguntas sencillas para niños de 5 a 10 años],
 "actividad": "una actividad práctica para niños (máx. 160 caracteres)",
 "rompehielo": "pregunta ligera para abrir la reunión (máx. 100 caracteres)",
 "lectura": {"ref": "", "nota": "qué se lee, en pocas palabras"},
 "conexion": "una frase (máx. 160 caracteres) que conecte la porción con Yeshúa a partir de ${p.mesianica}",
 "preparar": ["2 o 3 consejos breves para quien dirige"]
}`;
}

// Limpia y valida. Devuelve { data } o { error }.
export function cleanGroups(raw, p, bible, kodeshText) {
  const textNorm = norm(kodeshText);
  const s = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const okQ = (x, needRef = true) => {
    const q = s(x?.q, 260);
    if (!q || !quotesOk(q, textNorm)) return null;
    const ref = s(x?.ref, 20);
    if (!ref) return needRef ? null : { q };
    const r = parseRange(ref);
    if (!r || !existsIn(bible, r) || !inParasha(r, p)) return needRef ? null : { q };
    return { q, ref };
  };
  const list = (arr, n, needRef) => (Array.isArray(arr) ? arr : []).map(x => okQ(x, needRef)).filter(Boolean).slice(0, n);
  const adultos = list(raw?.adultos, 4, true);
  const jovenes = list(raw?.jovenes, 3, true);
  const ninos = list(raw?.ninos, 3, false);
  let central = okQ(raw?.central, true);
  if (central && central.q.length > 120) central = null;
  if (!central && adultos[0]) central = adultos[0];
  if (adultos.length < 3 || jovenes.length < 2 || ninos.length < 2 || !central) return { error: 'preguntas insuficientes o con citas/referencias inválidas' };
  let lectura = null;
  const lr = parseRange(s(raw?.lectura?.ref, 24));
  if (lr && existsIn(bible, lr) && inParasha(lr, p) && verseCount(bible, lr) <= 40) lectura = { ref: `${lr.book} ${lr.c1}:${lr.v1}-${lr.c2 !== lr.c1 ? lr.c2 + ':' : ''}${lr.v2}`, nota: s(raw?.lectura?.nota, 120) };
  const conexion = quotesOk(raw?.conexion, textNorm) ? s(raw?.conexion, 220) : '';
  return {
    data: {
      num: p.num, central, adultos, jovenes, ninos,
      actividad: s(raw?.actividad, 220),
      rompehielo: s(raw?.rompehielo, 140),
      lectura, conexion,
      preparar: (Array.isArray(raw?.preparar) ? raw.preparar : []).map(x => s(x, 160)).filter(Boolean).slice(0, 3),
    },
  };
}
