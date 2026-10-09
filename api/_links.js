// KODESH — «Red bíblica»: las citas, cumplimientos y alusiones del Tanaj
// (profetas, Torá, Salmos…) que aparecen en cada versículo del Nuevo
// Testamento. Se generan una vez con IA (lote de Anthropic) y se validan:
// el libro, el capítulo y el versículo citados tienen que existir, y la frase
// subrayada tiene que estar de verdad en el versículo.
import { BOOK_NAMES, NT_BOOKS, sortedVerseKeys } from './_textualPrompt.js';

export const LINKS_MODEL = 'claude-sonnet-4-5';
export const OT_IDS = Object.keys(BOOK_NAMES).filter(b => !NT_BOOKS.has(b));
const KINDS = new Set(['cita', 'cumplimiento', 'alusion']);

const SYSTEM = `Eres un erudito bíblico hebreo-mesiánico. Para un capítulo del Nuevo Testamento identificas cada lugar donde el texto CITA, CUMPLE o ALUDE CLARAMENTE a un pasaje del Tanaj (profetas, Torá, Salmos y demás escritos), para una red de conexiones bíblicas.

TIPOS
- "cita": el texto reproduce palabras del Tanaj (con o sin «como está escrito»).
- "cumplimiento": el texto presenta algo como cumplimiento de una profecía («para que se cumpliese lo dicho por el profeta…»), aunque no copie palabras.
- "alusion": eco claro y reconocido por los comentaristas (imágenes, frases o hechos inconfundibles). No inventes alusiones débiles.

REGLAS
- Solo conexiones reales y ampliamente reconocidas. Si dudas, no la pongas. Puede haber capítulos sin ninguna.
- "ref": código del libro + capítulo:versículo del Tanaj, con rango si hace falta. Códigos: ${OT_IDS.join(', ')}. Ejemplos: "ISA 7:14", "PSA 22:1", "MIC 5:2", "ZEC 9:9", "DEU 6:4-5". Usa la numeración de la Reina-Valera (los Salmos con su número en español).
- "phrase": las palabras EXACTAS del versículo del NT (tal como aparecen en el texto que te doy) que hacen la referencia, de 2 a 12 palabras. Si la conexión es todo el versículo, deja "".
- "note": una frase breve en español (máx. 140 caracteres) que explique la conexión. Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), Elohim/YHWH.
- "note_en": la misma nota en inglés natural (máx. 140 caracteres), para la edición en inglés. Usa Yeshua (nunca "Jesus"), Messiah (nunca "Christ"), YHWH (nunca "the LORD"), Elohim/God; libros y nombres en su forma inglesa.
- Máximo 15 conexiones por capítulo; prioriza profecías y citas explícitas.

Responde SOLO con JSON: {"l":[{"v":23,"ref":"ISA 7:14","kind":"cumplimiento","phrase":"He aquí la virgen concebirá","note":"Isaías anunció que una virgen daría a luz al Emanuel.","note_en":"Isaiah announced that a virgin would give birth to Immanuel."}]}`;

export function linksParams(bookId, chapter, sourceVerses) {
  const keys = sortedVerseKeys(sourceVerses);
  const text = keys.map(k => `${k}. ${sourceVerses[k]}`).join('\n');
  return {
    model: LINKS_MODEL,
    max_tokens: 3500,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${BOOK_NAMES[bookId] || bookId} ${chapter} (Reina-Valera):\n\n${text}` }],
  };
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// "ISA 7:14" / "PSA 22:1-2" → { book, chapter, verse, verseEnd } si existe en la Biblia
export function parseRef(ref, bibleData) {
  const m = String(ref || '').trim().toUpperCase().match(/^([1-3]?[A-Z]{2,3})\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
  if (!m || !OT_IDS.includes(m[1])) return null;
  const ch = bibleData?.[m[1]]?.[String(Number(m[2]))];
  if (!ch || !ch[String(Number(m[3]))]) return null;
  let end = m[4] ? Number(m[4]) : null;
  if (end != null && (end <= Number(m[3]) || !ch[String(end)])) end = null;
  return { book: m[1], chapter: Number(m[2]), verse: Number(m[3]), verseEnd: end };
}

// Texto de la IA → filas validadas para bible_links (o null si no es JSON útil)
export function parseLinks(raw, ntBook, ntChapter, sourceVerses, bibleData) {
  let obj = null;
  const s = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { obj = JSON.parse(s); } catch (e) {
    const mm = s.match(/\{[\s\S]*\}/);
    try { obj = mm ? JSON.parse(mm[0]) : null; } catch (e2) { obj = null; }
  }
  const list = Array.isArray(obj) ? obj : obj?.l;
  if (!Array.isArray(list)) return null;
  const out = []; const seen = new Set();
  for (const it of list.slice(0, 20)) {
    const v = Number(it?.v);
    const verseText = sourceVerses[String(v)];
    if (!verseText) continue;
    const r = parseRef(it?.ref, bibleData);
    if (!r) continue;
    const key = `${v}|${r.book}.${r.chapter}.${r.verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let phrase = String(it?.phrase || '').trim().slice(0, 160);
    if (phrase && !norm(verseText).includes(norm(phrase))) phrase = '';   // solo si está de verdad en el versículo
    let note = String(it?.note || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (/\bJes[uú]s\b|\bCristo\b/i.test(note)) note = note.replace(/\bJes[uú]s\b/g, 'Yeshúa').replace(/\bCristo\b/g, 'Mashíaj');
    // Nota en inglés (edición en inglés): sin ella, la conexión no se muestra en inglés.
    let noteEn = String(it?.note_en || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (/[áéíóúñ¿¡«»]/i.test(noteEn) || /\b(el|los|las|del|que|para|con|por|una)\b/i.test(noteEn)) noteEn = '';
    noteEn = noteEn.replace(/\bJesus\b/g, 'Yeshua').replace(/\bChrist\b/g, 'Messiah').replace(/\bthe LORD\b/g, 'YHWH').replace(/\bLORD\b/g, 'YHWH');
    out.push({
      nt_book: ntBook, nt_chapter: ntChapter, nt_verse: v,
      ot_book: r.book, ot_chapter: r.chapter, ot_verse: r.verse, ot_verse_end: r.verseEnd,
      kind: KINDS.has(it?.kind) ? it.kind : 'alusion', phrase: phrase || null, note: note || null, note_en: noteEn || null, model_version: LINKS_MODEL,
    });
  }
  return out.slice(0, 15);
}
