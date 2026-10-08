// KODESH — Versículo del día con audio: la lista y funciones puras.
// La usan api/verse-day.js (lote del admin), api/cron-daily-reminder.js
// (push de la mañana) y verse-day.js (app, misma fórmula del día).
// Probadas en tests/verse-day.test.js.
import { numberToSpanish, speakable } from './_audioCore.js';

// Pasajes cortos (1–3 versículos) de aliento. El texto sale de la Traducción
// Kodesh (textual_cache), no de esta lista. Agregar al FINAL para no mover
// el versículo de los días ya asignados.
export const VERSES = [
  'GEN 1:1', 'GEN 12:2', 'GEN 28:15', 'GEN 50:20', 'EXO 14:14', 'EXO 15:2', 'EXO 33:14', 'NUM 6:24-26',
  'DEU 6:4-5', 'DEU 31:6', 'DEU 31:8', 'JOS 1:9', 'RUT 1:16', '1SA 16:7', '1CH 16:34', '2CH 7:14',
  'NEH 8:10', 'JOB 19:25', 'PSA 1:1-2', 'PSA 4:8', 'PSA 16:11', 'PSA 18:2', 'PSA 19:14', 'PSA 23:1-3',
  'PSA 27:1', 'PSA 27:14', 'PSA 30:5', 'PSA 31:24', 'PSA 32:8', 'PSA 34:8', 'PSA 34:18', 'PSA 37:4-5',
  'PSA 40:1', 'PSA 42:11', 'PSA 46:1', 'PSA 46:10', 'PSA 51:10', 'PSA 55:22', 'PSA 56:3', 'PSA 62:1-2',
  'PSA 63:1', 'PSA 73:26', 'PSA 84:10', 'PSA 86:5', 'PSA 90:12', 'PSA 91:1-2', 'PSA 91:11', 'PSA 100:4-5',
  'PSA 103:12', 'PSA 107:1', 'PSA 118:24', 'PSA 119:105', 'PSA 121:1-2', 'PSA 121:7-8', 'PSA 126:5', 'PSA 133:1',
  'PSA 136:1', 'PSA 139:14', 'PSA 145:18', 'PSA 147:3', 'PSA 150:6', 'PRO 3:5-6', 'PRO 4:23', 'PRO 16:3',
  'PRO 16:9', 'PRO 18:10', 'PRO 17:17', 'ECC 3:1', 'ISA 9:6', 'ISA 26:3', 'ISA 40:8', 'ISA 40:31',
  'ISA 41:10', 'ISA 43:2', 'ISA 43:19', 'ISA 53:5', 'ISA 54:10', 'ISA 55:8-9', 'ISA 60:1', 'JER 17:7',
  'JER 29:11', 'JER 31:3', 'JER 33:3', 'LAM 3:22-23', 'EZK 36:26', 'MIC 6:8', 'NAM 1:7', 'HAB 3:19',
  'ZEP 3:17', 'ZEC 4:6', 'MAT 5:14', 'MAT 5:16', 'MAT 6:33', 'MAT 6:34', 'MAT 7:7', 'MAT 11:28-29',
  'MAT 28:20', 'MRK 9:23', 'MRK 10:27', 'LUK 1:37', 'JHN 1:14', 'JHN 3:16', 'JHN 8:12', 'JHN 8:32',
  'JHN 10:10', 'JHN 11:25', 'JHN 14:6', 'JHN 14:27', 'JHN 15:5', 'JHN 16:33', 'ACT 1:8', 'ROM 5:8',
  'ROM 8:1', 'ROM 8:28', 'ROM 8:38-39', 'ROM 10:9', 'ROM 12:2', 'ROM 12:12', 'ROM 15:13', '1CO 10:13',
  '1CO 15:57', '1CO 16:14', '2CO 5:17', '2CO 12:9', 'GAL 2:20', 'GAL 6:9', 'EPH 2:8-9', 'EPH 3:20',
  'EPH 6:10', 'PHP 1:6', 'PHP 4:6-7', 'PHP 4:13', 'PHP 4:19', 'COL 3:23', '1TH 5:16-18', '2TI 1:7',
  'HEB 4:16', 'HEB 11:1', 'HEB 13:5', 'HEB 13:8', 'JAS 1:5', 'JAS 4:8', '1PE 2:9', '1PE 5:7',
  '1JN 1:9', '1JN 4:18', '1JN 4:19', 'REV 3:20', 'REV 21:4',
];

export function parseRef(ref) {
  const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?$/.exec(String(ref || '').trim());
  if (!m) return null;
  const v1 = +m[3], v2 = m[4] ? +m[4] : v1;
  if (v2 < v1 || v2 - v1 > 3) return null;
  return { book: m[1], chapter: +m[2], v1, v2 };
}

// Mismo día para todos: la fecha local (YYYY-MM-DD) → número de día →
// posición en la lista, saltando de 37 en 37 para que días seguidos no
// caigan en el mismo libro. 37 no divide al largo de la lista (ver test).
export const STEP = 37;
export function dayNumber(dateStr) {
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
}
export function dayIndex(dateStr, n = VERSES.length) {
  return ((dayNumber(dateStr) * STEP) % n + n) % n;
}
export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// «Lamentaciones, capítulo tres, versículos veintidós y veintitrés.»
export function spokenRef(bookName, chapter, v1, v2) {
  const cap = `${bookName}, capítulo ${numberToSpanish(chapter)}`;
  if (v1 === v2) return `${cap}, versículo ${numberToSpanish(v1)}.`;
  if (v2 === v1 + 1) return `${cap}, versículos ${numberToSpanish(v1)} y ${numberToSpanish(v2)}.`;
  return `${cap}, versículos ${numberToSpanish(v1)} al ${numberToSpanish(v2)}.`;
}
// «Lamentaciones 3:22–23»
export function displayRef(bookName, chapter, v1, v2) {
  return `${bookName} ${chapter}:${v1}${v2 > v1 ? '–' + v2 : ''}`;
}

// Inicio de cada palabra del texto que se MUESTRA, a partir del alineado
// carácter a carácter del texto que se LEE (speakable cambia YHWH→Adonai,
// palabra por palabra, así que el orden de palabras coincide). Si los conteos
// no coinciden, se reparte proporcionalmente. offset = segundos antes de la voz.
export function wordTimings(display, alignment, offset = 0) {
  const shown = String(display || '').split(/\s+/).filter(Boolean);
  const spoken = speakable(display);
  const chars = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  const r2 = x => Math.round((x + offset) * 100) / 100;
  const wordStarts = [];
  let inWord = false;
  for (let i = 0; i < Math.min(chars.length, spoken.length); i++) {
    const sp = /\s/.test(chars[i]);
    if (!sp && !inWord) wordStarts.push(starts[i] ?? 0);
    inWord = !sp;
  }
  const spokenWords = spoken.split(/\s+/).filter(Boolean).length;
  if (wordStarts.length === shown.length && spokenWords === shown.length) return wordStarts.map(r2);
  const total = (ends.length ? ends[Math.min(ends.length, spoken.length) - 1] : starts[starts.length - 1]) || 0;
  return shown.map((_, i) => r2((i / Math.max(1, shown.length)) * total));
}

// Música de fondo según el día (biblioteca de la radionovela).
export const BEDS = ['m_paz', 'm_esperanza', 'm_reverente'];
export const bedFor = n => BEDS[n % BEDS.length];

// ── Enriquecimiento con IA: contexto, pregunta, oración y palabra clave ──
export const ENRICH_MODEL = 'claude-sonnet-4-5';
export function enrichPrompt(items) {
  return `Eres un pastor hebreo-mesiánico que prepara un devocional matutino de 5 minutos para cada versículo.

Para CADA versículo devuelve:
- "contexto": una frase (máx. 150 caracteres) con el contexto histórico real del pasaje (quién habla, a quién, en qué situación). Nada inventado.
- "pregunta": una pregunta de reflexión personal (máx. 120 caracteres).
- "oracion": una oración breve en primera persona (50–80 palabras) basada en el versículo, dirigida al Padre, que termine «en el nombre de Yeshúa, amén».
- "strong": el número de Strong de UNA palabra clave del versículo en el idioma original (H#### para el Tanaj, G#### para el Nuevo Testamento). Solo si estás seguro; si no, "".
- "palabra": la palabra en español del versículo que traduce esa palabra clave (tal como aparece en el texto).

Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), YHWH o Elohim (nunca "Jehová").

Versículos:
${items.map(it => `[${it.n}] ${it.ref}: ${it.text}`).join('\n')}

Responde SOLO con JSON: {"d":[{"n":0,"contexto":"","pregunta":"","oracion":"","strong":"","palabra":""}]}`;
}
// Limpia la respuesta y valida la palabra clave contra los diccionarios de
// Strong's (el hebreo/griego que se muestra sale del diccionario, no de la IA).
export function cleanEnrich(raw, items, strongs) {
  const byN = new Map(items.map(it => [it.n, it]));
  const out = {};
  for (const d of (raw && Array.isArray(raw.d) ? raw.d : [])) {
    const it = byN.get(Number(d?.n));
    if (!it) continue;
    const s = v => String(v || '').replace(/\s+/g, ' ').trim();
    const e = { contexto: s(d.contexto).slice(0, 200), pregunta: s(d.pregunta).slice(0, 160), oracion: s(d.oracion).slice(0, 700) };
    const num = s(d.strong).toUpperCase();
    const palabra = s(d.palabra);
    const nt = it.nt;
    const entry = /^[HG]\d{1,5}$/.test(num) && (num[0] === 'G') === nt ? strongs?.[num] : null;
    if (entry && palabra && it.text.toLowerCase().includes(palabra.toLowerCase())) {
      e.word = { strong: num, lemma: entry.lemma, xlit: entry.xlit || '', es: palabra };
    }
    if (e.contexto && e.pregunta && e.oracion) out[it.n] = e;
  }
  return out;
}
