// KODESH — Personas: prompt y validación de la ficha de cada personaje
// (significado del nombre, resumen, momentos clave y edades). Probadas en
// tests/people.test.js. Los nombres, parentescos y menciones vienen de
// data/personas.json (Theographic, CC BY-SA 4.0); la IA solo agrega lo
// narrativo, y todo se valida contra el texto y contra Strong's.
import { numberToSpanish } from './_audioCore.js';

export const PEOPLE_MODEL = 'claude-sonnet-4-5';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»“”"'.,;:¿?¡!()—–\-]/g, ' ').replace(/\s+/g, ' ').trim();

export function parseRef(ref) {
  const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?$/.exec(String(ref || '').trim());
  if (!m) return null;
  const v1 = +m[3], v2 = m[4] ? +m[4] : v1;
  return v2 >= v1 && v2 - v1 <= 20 ? { book: m[1], c: +m[2], v1, v2 } : null;
}
export function refText(bible, r) {
  const ch = bible?.[r.book]?.[String(r.c)];
  if (!ch) return null;
  const out = [];
  for (let v = r.v1; v <= r.v2; v++) { if (!ch[String(v)]) return null; out.push(ch[String(v)]); }
  return out.join(' ');
}
// ¿El número aparece en el versículo (en cifras o en palabras)?
export function hasNumber(text, n) {
  const t = norm(text);
  if (new RegExp(`\\b${n}\\b`).test(t)) return true;
  const w = norm(numberToSpanish(n));
  return t.includes(w) || t.includes(w.replace(/^ciento /, 'ciento y '));
}

export function peoplePrompt(items) {
  return `Eres un erudito bíblico hebreo-mesiánico. Para cada personaje escribe una ficha breve y exacta, en español.

Para CADA personaje devuelve:
- "strong": el número de Strong de su nombre (H#### si es del Tanaj, G#### si es solo del Nuevo Testamento). Solo si estás seguro.
- "sig": el significado del nombre en español, breve (máx. 50 caracteres), p. ej. "padre de una multitud". Si cambió de nombre, indícalo: "Abram, «padre enaltecido» → Abraham, «padre de una multitud»" (máx. 120).
- "resumen": quién es, en 1 o 2 frases (máx. 260 caracteres).
- "momentos": de 2 a 6 momentos clave de su vida, en orden, cada uno con "ref" (formato "GEN 12:1" o "GEN 22:1-14", donde de verdad ocurre) y "t" (máx. 80 caracteres). Si citas palabras del texto, ponlas entre «».
- "edades": SOLO las edades que el texto bíblico dice explícitamente, con "edad" (número), "ref" (el versículo que lo dice) y "t" (qué pasó, máx. 70 caracteres). Si la Biblia no da edades, deja [].

Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), Elohim/YHWH.

EDICIÓN EN INGLÉS: agrega también "resumen_en" y "sig_en", y en cada momento y cada edad "t_en": el mismo texto en inglés natural (Yeshua, Messiah, YHWH — nunca "Jesus", "Christ" ni "the LORD"; nombres en su forma inglesa, salvo que en español uses la forma hebrea, que se deja igual; citas entre “ ”).

${items.map(it => `PERSONA ${it.id}: ${it.n} (${it.en}) — ${it.g === 'F' ? 'mujer' : 'hombre'}${it.fam ? ` · familia: ${it.fam}` : ''}\nAparece en: ${it.ch}${it.ez ? `\nNota: ${it.ez}` : ''}`).join('\n\n')}

Responde SOLO con JSON: {"d":[{"id":"abraham_58","strong":"H85","sig":"","sig_en":"","resumen":"","resumen_en":"","momentos":[{"ref":"GEN 12:1","t":"","t_en":""}],"edades":[{"edad":75,"ref":"GEN 12:4","t":"","t_en":""}]}]}`;
}

// items: [{ id, en, alias:[], chapters:Set('GEN:12') }]; strongs: diccionarios
// Texto en inglés limpio: nombres mesiánicos y sin restos de español (si los tiene, se descarta)
function enText(v, max) {
  let t = String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (/[áéíóúñ¿¡«»]/i.test(t) || /\b(el|los|las|del|que|para|con|por|una)\b/i.test(t)) return '';
  return t.replace(/\bJesus\b/g, 'Yeshua').replace(/\bChrist\b/g, 'Messiah').replace(/\bthe LORD\b/g, 'YHWH').replace(/\bLORD\b/g, 'YHWH');
}
export function cleanPeople(raw, items, bible, strongs) {
  const byId = new Map(items.map(it => [it.id, it]));
  const s = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const out = {};
  for (const d of (raw && Array.isArray(raw.d) ? raw.d : [])) {
    const it = byId.get(String(d?.id)); if (!it) continue;
    const e = { resumen: s(d.resumen, 320) };
    if (!e.resumen) continue;
    // Nombre original: el lema sale de Strong's y su definición debe nombrar al personaje
    const num = s(d.strong, 8).toUpperCase();
    const st = /^[HG]\d{1,5}$/.test(num) ? strongs?.[num] : null;
    const names = [it.en, ...(it.alias || [])].map(x => String(x || '').toLowerCase()).filter(Boolean);
    if (st && names.some(nm => String(st.definition || '').toLowerCase().includes(nm))) {
      e.heb = { strong: num, lemma: st.lemma, xlit: st.xlit || '' };
      const sig = s(d.sig, 140); if (sig) e.heb.sig = sig;
    }
    const momentos = [];
    for (const m of Array.isArray(d.momentos) ? d.momentos : []) {
      const r = parseRef(s(m?.ref, 24)), t = s(m?.t, 110);
      if (!r || !t) continue;
      const txt = refText(bible, r);
      if (!txt || !it.chapters.has(`${r.book}:${r.c}`)) continue;     // debe aparecer en ese capítulo
      const quotes = [...t.matchAll(/«([^»]{3,})»/g)].map(q => norm(q[1]));
      if (quotes.some(q => !norm(txt).includes(q))) continue;
      momentos.push({ ref: `${r.book} ${r.c}:${r.v1}${r.v2 > r.v1 ? '-' + r.v2 : ''}`, t, ten: enText(m?.t_en, 110) });
      if (momentos.length >= 6) break;
    }
    if (momentos.length) e.momentos = momentos;
    const edades = [];
    for (const a of Array.isArray(d.edades) ? d.edades : []) {
      const n = Math.round(Number(a?.edad)), r = parseRef(s(a?.ref, 24)), t = s(a?.t, 90);
      if (!(n >= 1 && n <= 999) || !r || !t) continue;
      const txt = refText(bible, r);
      if (!txt || !hasNumber(txt, n)) continue;                       // la edad debe estar en el versículo
      edades.push({ edad: n, ref: `${r.book} ${r.c}:${r.v1}${r.v2 > r.v1 ? '-' + r.v2 : ''}`, t, ten: enText(a?.t_en, 90) });
    }
    if (edades.length) e.edades = edades.sort((a, b) => a.edad - b.edad).slice(0, 10);
    // Edición en inglés: solo si TODO trae su texto en inglés (si no, en inglés no se muestra la ficha)
    const en = { resumen: enText(d.resumen_en, 320), sig: e.heb && e.heb.sig ? enText(d.sig_en, 140) : '', momentos: (e.momentos || []).map(m => m.ten), edades: (e.edades || []).map(a => a.ten) };
    if (en.resumen && (!e.heb || !e.heb.sig || en.sig) && en.momentos.every(Boolean) && en.edades.every(Boolean)) e.en = en;
    (e.momentos || []).forEach(m => delete m.ten); (e.edades || []).forEach(a => delete a.ten);
    out[it.id] = e;
  }
  return out;
}
