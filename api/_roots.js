// KODESH — Raíces hebreas: la IA señala en cada capítulo las frases que solo
// se entienden desde el trasfondo hebreo (fiestas, costumbres, Templo, Torá,
// idioma) y explica la costumbre que hay detrás. Probadas en tests/roots.test.js.
// Todo se valida: la frase debe estar en el versículo, las referencias deben
// existir, las citas «» deben estar en el texto y las fuentes extrabíblicas
// solo se aceptan de una lista corta (Misná, Talmud, Josefo, Filón, Macabeos).
import { parseRef, refText } from './_people.js';

export const ROOTS_MODEL = 'claude-sonnet-4-5';
export const TEMAS = ['pesaj', 'matzot', 'bikurim', 'shavuot', 'terua', 'kipur', 'sukot', 'shabat', 'templo', 'costumbre', 'torá', 'idioma'];
const GOSPELS_ACTS = { MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, HEB: 13 };
const NAMES = { MAT: 'Mateo', MRK: 'Marcos', LUK: 'Lucas', JHN: 'Juan', ACT: 'Hechos', HEB: 'Hebreos' };

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// Capítulos a preparar: Evangelios, Hechos y Hebreos + los capítulos de fiestas
export function rootsChapters(fiestas) {
  const out = [];
  for (const [b, n] of Object.entries(GOSPELS_ACTS)) for (let c = 1; c <= n; c++) out.push(`${b}:${c}`);
  for (const k of Object.keys(fiestas?.ch || {})) if (!out.includes(k)) out.push(k);
  return out;
}

export function rootsPrompt(items, fiestas) {
  const fest = (fiestas?.f || []).map(f => `${f.id} = ${f.n}`).join(', ');
  return `Eres un maestro bíblico hebreo-mesiánico, experto en el judaísmo del Segundo Templo. Lees la Biblia en español (Reina-Valera).

En cada capítulo, señala de 0 a 4 frases que se entienden mucho mejor desde el trasfondo hebreo: una fiesta, una costumbre judía, el Templo, la Torá o una expresión hebrea. Solo lo que de verdad ilumina el texto; si el capítulo no tiene nada así, devuelve [] para ese capítulo. No repitas lo obvio.

Para CADA nota:
- "v": número de versículo.
- "frase": de 2 a 7 palabras COPIADAS EXACTAMENTE del versículo (con su ortografía antigua, p. ej. «venga á mí»).
- "tema": uno de ${TEMAS.join(', ')} (fiestas: ${fest}).
- "titulo": máx. 55 caracteres, p. ej. "El agua del estanque de Siloé".
- "he": término hebreo con vocales (opcional, solo si existe y estás seguro), "xlit": su transliteración.
- "texto": 2 a 4 frases (máx. 480 caracteres) que expliquen la costumbre y cómo ilumina el versículo. Sin especular.
- "refs": hasta 3 referencias bíblicas relacionadas, formato "ISA 12:3" o "LEV 23:40-43".
- "fuente": OPCIONAL, solo si estás seguro de la cita exacta: Misná, Talmud, Josefo, Filón o 1/2 Macabeos (p. ej. "Misná, Sucá 4:9"). Si dudas, omítela.

Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), Elohim/YHWH. Si citas palabras de la Biblia ponlas entre «».

${items.map(it => `CAPÍTULO ${it.key} (${it.name} ${it.c}):\n${Object.entries(it.verses).map(([v, t]) => `${v} ${t}`).join('\n')}`).join('\n\n')}

Responde SOLO con JSON: {"d":{"${items[0]?.key || 'JHN:7'}":[{"v":37,"frase":"","tema":"sukot","titulo":"","he":"","xlit":"","texto":"","refs":["ISA 12:3"],"fuente":""}]}}`;
}

export function chapterItem(bible, key) {
  const [book, c] = key.split(':');
  return { key, book, c: +c, name: NAMES[book] || book, verses: bible?.[book]?.[c] || {} };
}

const FUENTE = /^(Misná|Mishná|Talmud|Josefo|Filón|1 Macabeos|2 Macabeos)(?=[\s,.]|$)/;
const HEB = /^[֐-׿\s־־]+$/;

export function cleanRoots(raw, items, bible) {
  const s = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const out = {};
  const d = raw && raw.d && typeof raw.d === 'object' ? raw.d : {};
  for (const it of items) {
    const list = Array.isArray(d[it.key]) ? d[it.key] : [];
    const notes = [];
    for (const n of list) {
      const v = Math.round(Number(n?.v)); const vt = it.verses[String(v)];
      if (!vt) continue;
      const frase = s(n.frase, 80), fn = norm(frase);
      const words = fn.split(' ').filter(Boolean).length;
      if (words < 1 || words > 8 || !norm(vt).includes(fn)) continue;          // la frase está en el versículo
      const tema = TEMAS.includes(n.tema) ? n.tema : null; if (!tema) continue;
      const titulo = s(n.titulo, 70), texto = s(n.texto, 560);
      if (!titulo || texto.length < 40) continue;
      const refs = [];
      const pool = [norm(vt)];
      for (const r0 of Array.isArray(n.refs) ? n.refs.slice(0, 4) : []) {
        const r = parseRef(s(r0, 24)); if (!r) continue;
        const t = refText(bible, r); if (!t) continue;
        refs.push(`${r.book} ${r.c}:${r.v1}${r.v2 > r.v1 ? '-' + r.v2 : ''}`); pool.push(norm(t));
      }
      // Toda cita «» debe estar en el versículo o en una de las referencias
      const quotes = [...texto.matchAll(/«([^»]{3,})»/g)].map(q => norm(q[1]));
      if (quotes.some(q => !pool.some(p => p.includes(q)))) continue;
      if (notes.some(x => x.v === v && norm(x.frase) === fn)) continue;
      const e = { v, frase, tema, titulo, texto };
      const he = s(n.he, 40); if (he && HEB.test(he)) { e.he = he; const x = s(n.xlit, 40); if (x) e.xlit = x; }
      if (refs.length) e.refs = refs;
      const f = s(n.fuente, 60); if (f && FUENTE.test(f)) e.fuente = f;
      notes.push(e);
      if (notes.length >= 4) break;
    }
    out[it.key] = notes;
  }
  return out;
}
