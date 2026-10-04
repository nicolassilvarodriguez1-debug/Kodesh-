// KODESH — Controles de calidad de la Traducción Kodesh (api/textual.js).
//
// Problemas reales encontrados en textual_cache (oct 2026):
//   - Filipenses 2:2 salió entero en inglés.
//   - 1 Juan 5:7 se reemplazó por la nota de "no aparece", cuando solo la
//     frase añadida (Comma Johanneum) es tardía; y el v8 conservó "en la tierra".
//   - La nota de Juan 7:53–8:11 quedó en 8:1 en vez de 7:53.
//   - Si la IA se cortaba (capítulos largos) o faltaban versículos, se
//     guardaba el texto RVR60 como si fuera la Traducción Kodesh.
// Aquí: las notas de manuscritos se aplican de forma determinista y cada
// capítulo se valida antes de guardarlo.

export const INTERPOLATED_NOTE = '[Este versículo no aparece en los manuscritos más antiguos y confiables.]';

// Versículos completos ausentes en NA28/UBS5.
export const INTERPOLATED = {
  MAT: { 17: [21], 18: [11], 23: [14] },
  MRK: { 7: [16], 9: [44, 46], 11: [26], 15: [28] },
  LUK: { 17: [36], 23: [17] },
  JHN: { 5: [4] },
  ACT: { 8: [37], 15: [34], 24: [7], 28: [29] },
  ROM: { 16: [24] },
};

// Notas al inicio de pasajes disputados (se traducen igual).
export const PASSAGE_NOTES = {
  'MRK:16:9': '[Los manuscritos más antiguos concluyen Marcos en 16:8. Los versículos 9-20 aparecen en manuscritos posteriores.] ',
  'JHN:7:53': '[Este pasaje (7:53–8:11) no aparece en los manuscritos más antiguos. Su ubicación varía en los que lo incluyen.] ',
};

// Texto fijo donde la IA se equivoca de forma recurrente.
export const FIXED_VERSES = {
  // Comma Johanneum: el v7 existe ("tres son los que dan testimonio"); lo
  // tardío es "en el cielo… en la tierra". Se traduce solo el griego antiguo.
  '1JN:5:7': 'Porque tres son los que dan testimonio:',
  '1JN:5:8': 'el Espíritu, el agua y la sangre; y los tres concuerdan en uno.',
};

const EN_WORDS = /\b(the|and|of|that|with|unto|shall|which|said|they|them|their|his|him|was|were|from|this|upon|into|thou|thee|thy|hath|you|your|will|have|had|but|who|when|then|there|what|would|should|could|because|having|thing|my|is|are|be|not|for|all|in|to)\b/gi;
const EN_STRONG = /\b(the|and|of|that|with|unto|shall|which|said|they|them|their|his|him|was|were|from|this|thou|thee|thy|hath|you|your|would|should|could|because|having)\b/i;

// ¿Está este versículo (total o parcialmente) en inglés?
export function looksEnglish(text) {
  const t = String(text || '');
  const hits = (t.match(EN_WORDS) || []).length;
  return hits >= 3 && EN_STRONG.test(t);
}

const isNote = t => /^\[(Este versículo no aparece|Este pasaje|Los manuscritos)/.test(String(t || '').trim());

// Aplica las reglas de manuscritos de forma determinista.
export function applyManuscriptRules(bookId, chapter, verses) {
  const out = { ...verses };
  for (const v of INTERPOLATED[bookId]?.[chapter] || []) {
    if (String(v) in out) out[String(v)] = INTERPOLATED_NOTE;
  }
  for (const [key, note] of Object.entries(PASSAGE_NOTES)) {
    const [b, c, v] = key.split(':');
    if (b === bookId && Number(c) === chapter && out[v] != null) {
      out[v] = note + String(out[v]).replace(/^\[[^\]]*\]\s*/, '');
    }
  }
  for (const [key, text] of Object.entries(FIXED_VERSES)) {
    const [b, c, v] = key.split(':');
    if (b === bookId && Number(c) === chapter && out[v] != null) out[v] = text;
  }
  // Notas puestas por la IA donde no corresponde: se quitan del inicio
  // (p. ej. la de 7:53 repetida en 8:1). Si el versículo quedó SOLO con la
  // nota y no está en la lista, es un error → se reporta en validateChapter.
  const allowed = new Set([
    ...(INTERPOLATED[bookId]?.[chapter] || []).map(String),
    ...Object.keys(PASSAGE_NOTES).filter(k => k.startsWith(`${bookId}:${chapter}:`)).map(k => k.split(':')[2]),
  ]);
  for (const k of Object.keys(out)) {
    if (!allowed.has(k) && isNote(out[k])) {
      const rest = String(out[k]).replace(/^\[[^\]]*\]\s*/, '');
      if (rest) out[k] = rest;
    }
  }
  return out;
}

// Problemas que impiden guardar el capítulo en caché.
export function validateChapter(bookId, chapter, verses, verseKeys) {
  const problems = [];
  const allowedNotes = new Set((INTERPOLATED[bookId]?.[chapter] || []).map(String));
  for (const k of verseKeys) {
    const t = verses[k];
    if (typeof t !== 'string' || !t.trim()) { problems.push({ verse: k, type: 'missing' }); continue; }
    if (looksEnglish(t)) problems.push({ verse: k, type: 'english' });
    if (t.trim() === INTERPOLATED_NOTE && !allowedNotes.has(k)) problems.push({ verse: k, type: 'spurious_note' });
  }
  for (const k of Object.keys(verses)) if (!verseKeys.includes(k)) problems.push({ verse: k, type: 'extra' });
  return problems;
}

// Tokens de salida para el capítulo: ~90 por versículo + margen (Salmo 119
// necesita ~16 000; antes el tope fijo de 4 096 cortaba la respuesta).
export function maxTokensFor(verseCount) {
  return Math.min(20000, 1200 + verseCount * 95);
}
