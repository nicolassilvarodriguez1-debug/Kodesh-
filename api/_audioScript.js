// KODESH — Audio dramatizado: guion por capítulo (quién dice qué) y reparto
// de voces. Funciones puras, probadas en tests/audio.test.js.
//
// La IA divide cada versículo en partes (narrador / personajes) SIN cambiar
// ninguna palabra; aquí se valida eso y se decide qué voz lee cada parte.

// ── Elenco ──
// Papeles fijos. Si un papel no tiene voz asignada, usa la de su respaldo.
export const CAST = [
  { role: 'narrador', label: 'Narrador' },
  { role: 'yeshua', label: 'Yeshúa', fallback: 'narrador' },
  { role: 'pedro', label: 'Pedro (Simón, Cefas)', fallback: 'hombre_1' },
  { role: 'juan', label: 'Juan (discípulo)', fallback: 'hombre_2' },
  { role: 'jacobo', label: 'Jacobo / Santiago', fallback: 'hombre_3' },
  { role: 'andres', label: 'Andrés', fallback: 'hombre_4' },
  { role: 'felipe', label: 'Felipe', fallback: 'hombre_2' },
  { role: 'tomas', label: 'Tomás', fallback: 'hombre_3' },
  { role: 'natanael', label: 'Natanael / Bartolomé', fallback: 'hombre_4' },
  { role: 'mateo', label: 'Mateo / Leví', fallback: 'hombre_1' },
  { role: 'judas', label: 'Judas Iscariote', fallback: 'hombre_3' },
  { role: 'juan_bautista', label: 'Juan el Bautista', fallback: 'hombre_1' },
  { role: 'voz_cielo', label: 'Voz del cielo / ángeles', fallback: 'narrador' },
  { role: 'mujer_1', label: 'Mujer 1', fallback: 'narrador' },
  { role: 'mujer_2', label: 'Mujer 2', fallback: 'mujer_1' },
  { role: 'mujer_3', label: 'Mujer 3', fallback: 'mujer_1' },
  { role: 'mujer_4', label: 'Mujer 4', fallback: 'mujer_2' },
  { role: 'hombre_1', label: 'Hombre 1 (mayor: sacerdotes, fariseos…)', fallback: 'narrador' },
  { role: 'hombre_2', label: 'Hombre 2', fallback: 'hombre_1' },
  { role: 'hombre_3', label: 'Hombre 3', fallback: 'hombre_1' },
  { role: 'hombre_4', label: 'Hombre 4 (joven)', fallback: 'hombre_2' },
];
const NAMED = [
  [/^(yesh[uú]a|jes[uú]s|el se[nñ]or yesh[uú]a)$/, 'yeshua'],
  [/^(sim[oó]n )?pedro$|^sim[oó]n( hijo de jon[aá]s)?$|^cefas$|^kefa$/, 'pedro'],
  [/^juan el bautista$|^el bautista$|^juan bautista$/, 'juan_bautista'],
  [/^juan( el (disc[ií]pulo|ap[oó]stol))?$/, 'juan'],
  [/^(jacobo|santiago)( hijo de zebedeo)?$/, 'jacobo'],
  [/^andr[eé]s$/, 'andres'],
  [/^felipe$/, 'felipe'],
  [/^tom[aá]s( d[ií]dimo)?$/, 'tomas'],
  [/^(natanael|bartolom[eé])$/, 'natanael'],
  [/^(mateo|lev[ií])$/, 'mateo'],
  [/^judas( iscariote)?$/, 'judas'],
  [/^(una )?voz (del|desde el) cielo$|^[aá]ngel|^el [aá]ngel|^gabriel$|^elohim$|^el padre$/, 'voz_cielo'],
];
const GROUP = /^(multitud|la multitud|el pueblo|los jud[ií]os|los fariseos|los disc[ií]pulos|ellos|todos|la gente|grupo|los soldados|los principales sacerdotes|los demonios)$/;

const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Papel para un personaje. Mismo nombre → misma voz en todos los capítulos
// (las mujeres y los demás hombres se reparten con un hash del nombre).
export function roleFor(character, gender) {
  const c = norm(character);
  if (!c || c === 'narrador' || GROUP.test(c) || gender === 'grupo') return 'narrador';
  for (const [re, role] of NAMED) if (re.test(c)) return role;
  if (gender === 'f') return `mujer_${(hash(c) % 4) + 1}`;
  return `hombre_${(hash(c) % 4) + 1}`;
}

// Voz final de un papel siguiendo la cadena de respaldos.
export function voiceFor(role, castVoices) {
  const byRole = Object.fromEntries(CAST.map(c => [c.role, c]));
  const seen = new Set();
  let r = role;
  while (r && !seen.has(r)) {
    seen.add(r);
    if (castVoices[r]) return castVoices[r];
    r = byRole[r]?.fallback || (r !== 'narrador' ? 'narrador' : null);
  }
  return castVoices.narrador || null;
}

// ── Instrucciones para la IA ──
export const ALLOWED_TAGS = ['reverent', 'softly', 'warmly', 'calm', 'gentle', 'firm', 'urgent', 'joyful', 'sad', 'pleading', 'astonished', 'angry', 'fearful', 'whispering', 'shouting', 'questioning', 'tender', 'solemn', 'excited', 'weary', 'mocking', 'pause'];
export function scriptPrompt(bookName, chapter, verses, redLetter) {
  const lines = Object.keys(verses).map(Number).sort((a, b) => a - b).map(v => `${v}|${verses[String(v)]}`).join('\n');
  const wj = redLetter && Object.keys(redLetter).length ? `\nVersículos donde habla Yeshúa (según las letras rojas): ${Object.keys(redLetter).join(', ')}.` : '';
  return {
    system: `Preparas el guion de una Biblia en audio dramatizada en español (Traducción Kodesh). Divides cada versículo en partes y dices quién lee cada parte: el narrador o el personaje que habla.

REGLAS ESTRICTAS
1. No cambies, quites, agregues ni reordenes NINGUNA palabra ni signo. Si unes los "text" de un versículo en orden (separados por un espacio) debe quedar EXACTAMENTE el versículo original.
2. Cada parte pertenece a un solo versículo ("v"). Nunca juntes dos versículos en una parte.
3. Las frases que introducen lo que alguien dice ("Respondió Yeshúa y le dijo:", "Le dijo Nicodemo:") son del narrador. Lo que la persona dice es del personaje.
4. "character": "narrador" o el nombre del personaje tal como lo llama el texto (Yeshúa, Pedro, Nicodemo, Marta, María Magdalena, Juan el Bautista, la samaritana, un ángel…). Si hablan varios a la vez (la multitud, los judíos, los fariseos, los discípulos juntos), usa "multitud".
5. "gender": "m", "f" o "grupo".
6. "tags": de 0 a 2 marcas de interpretación en inglés, SOLO de esta lista: ${ALLOWED_TAGS.join(', ')}. Úsalas con mesura y reverencia; el narrador casi siempre sin marcas.
7. Si nadie habla en el versículo, una sola parte del narrador.

Responde SOLO con JSON: {"segments":[{"v":1,"character":"narrador","gender":"m","tags":[],"text":"..."}]}`,
    user: `${bookName} capítulo ${chapter}.${wj}\nVersículos (número|texto):\n${lines}`,
  };
}

// ── Validación: el guion debe reproducir el texto exacto ──
const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
export function validateScript(verses, segments) {
  const errors = [];
  if (!Array.isArray(segments) || !segments.length) return { ok: false, errors: ['sin partes'], bad: Object.keys(verses).map(Number) };
  const byV = {};
  for (const s of segments) {
    const v = Number(s?.v);
    if (!verses[String(v)]) { errors.push(`versículo inexistente ${s?.v}`); continue; }
    (byV[v] = byV[v] || []).push(s);
  }
  const bad = [];
  for (const k of Object.keys(verses)) {
    const v = Number(k);
    const got = flat((byV[v] || []).map(s => s.text).join(' '));
    if (got !== flat(verses[k])) { bad.push(v); errors.push(`v${v} no coincide`); }
  }
  // Orden: los versículos deben aparecer en orden
  let last = 0;
  for (const s of segments) { const v = Number(s?.v); if (v < last) { errors.push(`orden v${v}`); break; } last = v; }
  return { ok: errors.length === 0, errors, bad };
}

// Limpia el guion de la IA y repara versículos que no coinciden (los deja al narrador).
export function cleanScript(verses, segments) {
  const { bad } = validateScript(verses, segments);
  const badSet = new Set(bad);
  const out = [];
  const keys = Object.keys(verses).map(Number).sort((a, b) => a - b);
  for (const v of keys) {
    if (badSet.has(v)) { out.push({ v, character: 'narrador', gender: 'm', tags: [], text: flat(verses[String(v)]) }); continue; }
    for (const s of (segments || []).filter(x => Number(x?.v) === v)) {
      const tags = (Array.isArray(s.tags) ? s.tags : []).map(t => String(t).toLowerCase().trim()).filter(t => ALLOWED_TAGS.includes(t)).slice(0, 2);
      const g = ['m', 'f', 'grupo'].includes(s.gender) ? s.gender : 'm';
      const text = flat(s.text);
      if (text) out.push({ v, character: String(s.character || 'narrador').slice(0, 60), gender: g, tags, text });
    }
  }
  return { segments: out, repaired: bad };
}

// Parte el guion en llamadas a ElevenLabs: partes seguidas con la misma voz
// se juntan (menos llamadas, lectura más fluida). Cada llamada recuerda en qué
// posición de su texto empieza cada versículo.
export function planCalls(segments, castVoices, { intro = '', maxChars = 3500 } = {}) {
  const calls = [];
  let cur = null;
  const push = () => { if (cur) calls.push(cur); cur = null; };
  const add = (voice, role, piece, verse) => {
    if (!cur || cur.voice !== voice || (cur.text.length + piece.length + 1) > maxChars) {
      push(); cur = { voice, role, text: '', marks: [] };
    }
    if (cur.text) cur.text += ' ';
    if (verse != null && !cur.marks.some(m => m.v === verse)) cur.marks.push({ v: verse, at: cur.text.length });
    cur.text += piece;
  };
  const narr = voiceFor('narrador', castVoices);
  if (intro) add(narr, 'narrador', intro, null);
  let lastV = null;
  for (const s of segments) {
    const role = roleFor(s.character, s.gender);
    const voice = voiceFor(role, castVoices);
    const tagStr = (s.tags || []).map(t => `[${t}]`).join(' ');
    const piece = (tagStr ? tagStr + ' ' : '') + s.text;
    add(voice, role, piece, s.v !== lastV ? s.v : null);
    lastV = s.v;
  }
  push();
  return calls;
}
