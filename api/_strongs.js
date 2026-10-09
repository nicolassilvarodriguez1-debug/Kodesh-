// KODESH — Diccionario Strong's (fuente de verdad para números ↔ palabras).
//
// Por qué existe: el lexicón le pedía a la IA "genera la entrada para G458"
// y la IA, de memoria, devolvía una palabra vecina (G458 ἀνομία "iniquidad"
// salía como ἀνόητος "insensato", G946 βδέλυγμα "abominación" como βαστάζω
// "cargar", H1882 דָּת "ley" como דֶּשֶׁן "grasa"). Ahora el número y el
// lema SIEMPRE salen de strongs-greek.json / strongs-hebrew.json, y la IA
// solo redacta la explicación en español a partir del lema correcto.

import fs from 'node:fs';

let GREEK = null;
let HEBREW = null;
let REVERSE = null; // lema normalizado → [códigos]

function load() {
  if (GREEK) return;
  GREEK = JSON.parse(fs.readFileSync(new URL('../strongs-greek.json', import.meta.url), 'utf8'));
  HEBREW = JSON.parse(fs.readFileSync(new URL('../strongs-hebrew.json', import.meta.url), 'utf8'));
  REVERSE = new Map();
  for (const dict of [GREEK, HEBREW]) {
    for (const [code, e] of Object.entries(dict)) {
      const k = normalizeLemma(e.lemma);
      if (!k) continue;
      if (!REVERSE.has(k)) REVERSE.set(k, []);
      REVERSE.get(k).push(code);
    }
  }
  // Orden estable: el código más bajo primero (suele ser la entrada principal).
  for (const list of REVERSE.values()) list.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

// "g0906" → "G906"; devuelve null si no tiene forma de código Strong's.
export function normalizeCode(code) {
  const m = String(code || '').trim().match(/^([HGhg])0*(\d{1,5})[a-z]?$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : null;
}

// Quita acentos, espíritus, puntos masoréticos y cantilación; unifica
// letras finales hebreas y la sigma final griega. Sirve para comparar
// "היה" con "הָיָה" o "Ἀβραάμ" con "αβρααμ".
export function normalizeLemma(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // diacríticos latinos/griegos combinados
    .replace(/[֑-ׇ]/g, '')          // niqqud y te'amim
    .replace(/[־‐-―\-־\s]/g, '') // maqaf, guiones, espacios
    .replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]))
    .replace(/ς/g, 'σ')
    .toLowerCase();
}

export function getEntry(code) {
  load();
  const c = normalizeCode(code);
  if (!c) return null;
  const e = (c[0] === 'G' ? GREEK : HEBREW)[c];
  return e ? { code: c, ...e } : null;
}

export function codesForLemma(lemma, prefix) {
  load();
  const list = REVERSE.get(normalizeLemma(lemma)) || [];
  return prefix ? list.filter(c => c[0] === prefix) : list;
}

export function lemmaMatches(code, lemma) {
  const e = getEntry(code);
  return !!e && !!lemma && normalizeLemma(e.lemma) === normalizeLemma(lemma);
}

// Transliteración simple del griego (el diccionario griego no la trae).
const GR = { α:'a', β:'b', γ:'g', δ:'d', ε:'e', ζ:'z', η:'ē', θ:'th', ι:'i', κ:'k', λ:'l', μ:'m', ν:'n',
  ξ:'x', ο:'o', π:'p', ρ:'r', σ:'s', ς:'s', τ:'t', υ:'y', φ:'ph', χ:'ch', ψ:'ps', ω:'ō' };
export function transliterateGreek(word) {
  if (!word) return '';
  const base = String(word).normalize('NFD');
  const rough = /̔/.test(base.slice(0, 3)); // espíritu áspero inicial → h
  let out = base.replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/γ(?=[γκξχ])/g, 'n')
    .split('').map(ch => GR[ch] ?? ch).join('')
    .replace(/(?<=[aeēoō])y/g, 'u'); // diptongos: αυ, ευ, ου → au, eu, ou
  if (rough) out = 'h' + out;
  return out;
}

// ── Comparación de formas ──
// Forma "con vocales": solo quita cantilación, meteg y espacios. Sirve para
// distinguir en hebreo palabras que sin vocales se escriben igual.
function vocalized(s) {
  return String(s || '').normalize('NFD')
    .replace(/[֑-ֽ֯͏]/g, '')
    .replace(/[־\s\-־]/g, '')
    .replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]));
}
const hasHebrewVowels = s => /[ְ-ׇֻׁׂ]/.test(s || '');
const isGreekText = s => /[Ͱ-Ͽἀ-῿]/.test(s || '');
// Nombres propios en el diccionario: "Succoth, the name of...", "Abram, ..."
const isProperName = code => /^[A-Z][^\s,]*[,(]|\bname of\b/.test(getEntry(code)?.definition || '');

// Griego: misma raíz si comparten las 3 primeras letras (κατέβησαν ~ καταβαίνω).
function greekSameStem(dictLemma, aiLemma) {
  const d = normalizeLemma(dictLemma), a = normalizeLemma(aiLemma);
  return d.length >= 3 && a.slice(0, 3) === d.slice(0, 3);
}

// Hebreo: ¿es la forma de la IA el lema del diccionario con prefijo y/o
// sufijo? (סֻכּוֹת = סֻכָּה + ות; חַטָּאת = חַטָּאָה; כּוֹכָבִים = כּוֹכָב + ים).
// Se ignoran las letras ו/י intermedias (escritura plena/defectiva).
const HEB_SUFFIXES = ['', 'מ', 'ת', 'ה', 'י', 'ו', 'כ', 'נו', 'כמ', 'המ', 'נ', 'ימ', 'ות', 'יה', 'יו', 'תי', 'ית', 'ינו', 'יכ', 'ותי'];
function hebrewSameStem(dictLemma, aiLemma) {
  const plain = x => x.length > 1 ? x[0] + x.slice(1).replace(/[וי]/g, '') : x;
  let d = normalizeLemma(dictLemma);
  if (d.length > 2 && d.endsWith('ה')) d = d.slice(0, -1);
  const stem = plain(d);
  const a = normalizeLemma(aiLemma);
  const forms = [a];
  if (/^[והבלמכש]/.test(a) && a.length > 2) forms.push(a.slice(1));
  return forms.some(f => {
    const pf = plain(f);
    if (!pf.startsWith(stem)) return false;
    return HEB_SUFFIXES.includes(pf.slice(stem.length)) || HEB_SUFFIXES.map(plain).includes(pf.slice(stem.length));
  });
}

// Devuelve la entrada con el número y el lema verificados contra el
// diccionario, o null si no hay forma de verificarla. Ver tests/strongs.test.js
// para los casos reales (G458/ἀνόητος, H7704/קַנָּא, H5521/סֻכּוֹת…).
export function verifyEntry(entry, testament) {
  if (!entry || !entry.found) return null;
  const prefix = testament === 'NT' ? 'G' : testament === 'AT' ? 'H' : null;
  let code = normalizeCode(entry.strongs);
  if (code && prefix && code[0] !== prefix) code = null;
  let dictEntry = code ? getEntry(code) : null;
  const lemma = entry.lemma;

  // 1. Número y lema coinciden.
  if (!(dictEntry && normalizeLemma(dictEntry.lemma) === normalizeLemma(lemma))) {
    const candidates = codesForLemma(lemma, prefix);
    if (isGreekText(lemma)) {
      // Griego: el lema de diccionario manda; si no está, forma conjugada.
      if (candidates.length) code = candidates[0];
      else if (!(dictEntry && greekSameStem(dictEntry.lemma, lemma))) return null;
    } else {
      const exact = hasHebrewVowels(lemma)
        ? candidates.filter(c => vocalized(getEntry(c).lemma) === vocalized(lemma))
        : candidates;
      const common = exact.filter(c => !isProperName(c));
      if (dictEntry && hebrewSameStem(dictEntry.lemma, lemma)) {
        // 2. El número encaja con la palabra (plural/sufijo/prefijo): se respeta.
      } else if (common.length) {
        code = common[0];            // 3. palabra común idéntica
      } else if (exact.length) {
        code = exact[0];             // 3b. solo coincide un nombre propio
      } else {
        return null;                 // 4. no verificable
      }
    }
    dictEntry = getEntry(code);
  }
  const translit = entry.transliteration
    || dictEntry.xlit
    || (code[0] === 'G' ? transliterateGreek(dictEntry.lemma) : '');
  return {
    ...entry,
    found: true,
    strongs: code,
    lemma: dictEntry.lemma,
    transliteration: translit,
    language: code[0] === 'G' ? 'griego' : 'hebreo',
  };
}

// ── Entrada para la caché del lexicón (búsqueda por número) ──
// La usan api/lexicon.js (al vuelo) y api/lexicon-pregen.js (por lotes),
// para que ambos produzcan exactamente lo mismo.
export const LEXICON_MODEL = 'claude-haiku-4-5-20251001';

export function strongsCacheKey(code, en) { return `strongs_${code.toLowerCase()}${en ? '_en' : ''}`; }

export function strongsTranslit(entry) {
  return entry.xlit || (entry.code[0] === 'G' ? transliterateGreek(entry.lemma) : '');
}

export function strongsPromptParams(entry, en) {
  const lang = entry.code[0] === 'G' ? 'griego' : 'hebreo';
  const translit = strongsTranslit(entry);
  if (en) return {
    model: LEXICON_MODEL,
    max_tokens: 400,
    system: `You are an expert in biblical ${entry.code[0] === 'G' ? 'Greek' : 'Hebrew'} lexicography for KODESH (a Hebrew-Messianic platform). Use Messianic names: YHWH, Yeshua, Messiah.

You receive the ALREADY VERIFIED Strong's entry (number, lemma and original definition). Your only task is to explain it in clear modern English, faithful to that definition: 2-3 sentences, main meaning and nuances of biblical usage. Do not change the word or the number, do not invent another meaning.

Reply ONLY with JSON: {"definition":"...","pronunciation":"..."}`,
    messages: [{
      role: 'user',
      content: `Strong's ${entry.code}
Lemma: ${entry.lemma}${translit ? `\nTransliteration: ${translit}` : ''}
Strong's definition: ${entry.definition || '—'}`,
    }],
  };
  return {
    model: LEXICON_MODEL,
    max_tokens: 400,
    system: `Eres un experto en léxico bíblico ${lang} para KODESH (plataforma Hebreo-Mesiánica). Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj.

Te damos la entrada YA VERIFICADA del diccionario Strong's (número, lema y definición original en inglés). Tu tarea es SOLO explicarla en español, fiel a esa definición: 2-3 oraciones, significado principal y matices de uso bíblico. No cambies de palabra ni de número, no inventes otro significado.

Responde SOLO JSON: {"definition":"...","pronunciation":"..."}`,
    messages: [{
      role: 'user',
      content: `Strong's ${entry.code}
Lema (${lang}): ${entry.lemma}${translit ? `\nTransliteración: ${translit}` : ''}
Definición de Strong (inglés): ${entry.definition || '—'}`,
    }],
  };
}

// Texto de la IA → { definition, pronunciation } o null.
export function parseStrongsReply(text) {
  let parsed = null;
  try { parsed = JSON.parse(String(text || '').trim()); }
  catch (e) { const m = String(text || '').match(/\{[\s\S]*\}/); try { parsed = m ? JSON.parse(m[0]) : null; } catch (e2) {} }
  return parsed && typeof parsed.definition === 'string' && parsed.definition.trim() ? parsed : null;
}

// Fila de lexicon_cache para un número Strong's.
export function strongsCacheRow(entry, reply, en) {
  return {
    word: strongsCacheKey(entry.code, en),
    testament: entry.code[0] === 'G' ? 'NT' : 'AT',
    strongs: entry.code,
    lemma: entry.lemma,
    transliteration: strongsTranslit(entry),
    pronunciation: reply.pronunciation || entry.pron || '',
    definition: reply.definition.trim(),
    language: en ? (entry.code[0] === 'G' ? 'Greek' : 'Hebrew') : (entry.code[0] === 'G' ? 'griego' : 'hebreo'),
  };
}

// Todos los códigos del diccionario (para la pre-generación).
export function allStrongsCodes() {
  load();
  const sortKey = c => (c[0] === 'G' ? 0 : 1e6) + Number(c.slice(1));
  return [...new Set([...Object.keys(GREEK), ...Object.keys(HEBREW)].map(normalizeCode).filter(Boolean))]
    .filter(c => getEntry(c))   // G0026 (nota añadida) → G26, que sí existe
    .sort((a, b) => sortKey(a) - sortKey(b));
}
