// KODESH — Títulos de sección (como los de las Biblias de estudio:
// "Mensaje a la iglesia en Pérgamo", "Parábola del sembrador", "Oración de
// confianza en YHWH"…). Son títulos PROPIOS de KODESH generados con IA: los
// de RVR1960/NVI y otras versiones tienen derechos de autor, así que el
// prompt pide redactarlos de cero.
import { BOOK_NAMES, NT_BOOKS, sortedVerseKeys } from './_textualPrompt.js';
import { looksEnglish } from './_textualCheck.js';

export const HEADINGS_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `Eres editor de una Biblia de estudio en español para KODESH, una plataforma bíblica Hebreo-Mesiánica.

TAREA: divide el capítulo en sus secciones naturales y escribe un TÍTULO DE SECCIÓN para cada una, como los subtítulos que traen las Biblias de estudio (p. ej. "La creación", "Mensaje a la iglesia en Pérgamo", "Parábola del sembrador", "Yeshúa calma la tempestad").

REGLAS:
- Títulos ORIGINALES, redactados por ti. No copies los subtítulos de la Reina-Valera 1960, la NVI ni de otras versiones.
- Breves: de 2 a 8 palabras, sin punto final, en español, con mayúscula solo al inicio y en nombres propios.
- Nombres KODESH: Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), YHWH cuando el texto habla de Jehová/el SEÑOR, Elohim o Dios, Ruaj HaKódesh o Espíritu Santo. Personas con su nombre habitual en español (Moisés, Abraham, Pablo…).
- La primera sección empieza en el primer versículo del capítulo.
- Entre 1 y 5 títulos según la extensión y los cambios de tema. Un salmo es una sola sección (un título que resuma su tema). Genealogías y listas largas: un solo título.
- Cada título describe lo que pasa o se enseña en esa sección, sin interpretar de más.

Responde SOLO con JSON: {"h":[{"v":1,"t":"Título"},{"v":12,"t":"Otro título"}]} donde "v" es el número del versículo donde empieza la sección.`;

export function headingsParams(bookId, chapter, sourceVerses) {
  const keys = sortedVerseKeys(sourceVerses);
  const text = keys.map(k => `${k}. ${sourceVerses[k]}`).join('\n');
  return {
    model: HEADINGS_MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `${BOOK_NAMES[bookId] || bookId} ${chapter} (${NT_BOOKS.has(bookId) ? 'Nuevo Testamento' : 'Tanaj'}), versículos ${keys[0]}–${keys[keys.length - 1]}:\n\n${text}`,
    }],
  };
}

// Texto de la IA → [{v, t}] validado, o null si no sirve.
export function parseHeadings(raw, verseKeys) {
  let obj = null;
  const s = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { obj = JSON.parse(s); } catch (e) {
    const m = s.match(/\{[\s\S]*\}/);
    try { obj = m ? JSON.parse(m[0]) : null; } catch (e2) { obj = null; }
  }
  const list = Array.isArray(obj) ? obj : obj?.h;
  if (!Array.isArray(list) || !list.length) return null;
  const valid = new Set(verseKeys.map(Number));
  const out = [];
  for (const it of list) {
    const v = Number(it?.v);
    const t = String(it?.t || '').trim().replace(/\.$/, '').replace(/\s+/g, ' ');
    if (!valid.has(v) || !t || t.length > 80 || looksEnglish(t) || /\bJes[uú]s\b|\bCristo\b|\bJehov[aá]\b/i.test(t)) continue;
    if (out.length && v <= out[out.length - 1].v) continue;   // en orden y sin repetir
    out.push({ v, t });
  }
  if (!out.length) return null;
  out[0].v = Math.min(...valid);   // la primera sección empieza en el v1
  return out.slice(0, 8);
}
