// KODESH — Audio de la Biblia (ElevenLabs): funciones puras.
// Probadas en tests/audio.test.js. Las usa api/audio-pregen.js.

// ── Números en palabras (para «Juan, capítulo tres») ──
const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = { 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa' };
export function numberToSpanish(n) {
  n = Math.floor(Number(n));
  if (!(n >= 0) || n > 199) return String(n);
  if (n < 30) return UNITS[n];
  if (n < 100) { const t = Math.floor(n / 10) * 10, u = n % 10; return u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t]; }
  if (n === 100) return 'cien';
  return 'ciento ' + numberToSpanish(n - 100);
}

// ── Texto que se lee ──
// YHWH se pronuncia «Adonai» (decisión de Niko). Se quitan corchetes y
// marcas que no se leen en voz alta.
export function speakable(text) {
  return String(text || '')
    .replace(/\bY\s?H\s?W\s?H\b/gi, 'Adonai')
    .replace(/יהוה/g, 'Adonai')
    .replace(/[\[\]{}<>*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Arma la narración del capítulo y recuerda dónde empieza cada versículo.
// verses: { "1": "texto", "2": "texto", … }
export function buildNarration(bookName, chapter, verses) {
  const intro = `${bookName}, capítulo ${numberToSpanish(chapter)}.`;
  const keys = Object.keys(verses || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  let text = intro;
  const marks = [];
  for (const v of keys) {
    const t = speakable(verses[String(v)]);
    if (!t) continue;
    text += ' ';
    marks.push({ v, at: text.length });
    text += t;
  }
  return { text, marks, introLength: intro.length };
}

// Parte la narración en trozos de hasta `max` caracteres, siempre en el
// inicio de un versículo (o de una oración si un versículo es enorme).
export function chunkNarration(narration, max = 4000) {
  const { text, marks } = narration;
  const cuts = [0];
  let start = 0;
  const bounds = marks.map(m => m.at);
  while (text.length - start > max) {
    const limit = start + max;
    let cut = 0;
    for (const b of bounds) { if (b > start && b <= limit) cut = b; }
    if (!cut) {   // un versículo larguísimo: cortar en el último punto
      const slice = text.slice(start, limit);
      const p = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf(': '));
      cut = p > max * 0.3 ? start + p + 2 : limit;
    }
    cuts.push(cut);
    start = cut;
  }
  const chunks = [];
  for (let i = 0; i < cuts.length; i++) {
    const s = cuts[i], e = i + 1 < cuts.length ? cuts[i + 1] : text.length;
    chunks.push({ start: s, end: e, text: text.slice(s, e).trim(), lead: text.slice(s, e).length - text.slice(s, e).trimStart().length });
  }
  return chunks;
}

// ── Duración de un MP3 contando sus frames (más exacto que el alineado) ──
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];   // MPEG-1 Layer III
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];     // MPEG-2/2.5 Layer III
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
export function mp3Duration(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = 0, seconds = 0, frames = 0;
  // Saltar etiqueta ID3v2
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 && b.length > 10) {
    i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
    const bri = (b[i + 2] >> 4) & 15, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const rate = RATES[ver][sri];
    const kbps = (ver === 3 ? BITRATES : BITRATES_V2)[bri];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor((samples / 8) * kbps * 1000 / rate) + pad;
    if (len < 4) { i++; continue; }
    seconds += samples / rate; frames++;
    i += len;
  }
  return { seconds, frames };
}

// Tiempo de inicio de cada versículo a partir del alineado de ElevenLabs.
// chunkResults: [{ chunk, alignment: { characters, character_start_times_seconds }, offset }]
export function verseTimings(narration, chunkResults) {
  const out = [];
  for (const m of narration.marks) {
    const r = chunkResults.find(c => m.at >= c.chunk.start && m.at < c.chunk.end);
    if (!r) continue;
    const idx = m.at - r.chunk.start - r.chunk.lead;
    const starts = r.alignment?.character_start_times_seconds || [];
    let t;
    if (starts.length && (r.alignment.characters || []).length === r.chunk.text.length) {
      t = starts[Math.max(0, Math.min(idx, starts.length - 1))];
    } else {   // si el alineado no coincide carácter a carácter, proporcional
      t = (idx / Math.max(1, r.chunk.text.length)) * r.duration;
    }
    out.push([m.v, Math.round((r.offset + t) * 100) / 100]);
  }
  return out;
}

// Huella del texto narrado: si cambia la Traducción Kodesh, el audio queda desactualizado.
export async function textHash(text) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
