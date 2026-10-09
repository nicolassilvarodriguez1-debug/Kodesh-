// Construye data/strongs-en.json para el lexicón en inglés: el diccionario original de Strong
// (dominio público, en inglés) tal cual, con transliteración griega calculada.
// Formato: [[código, lema, transliteración, pronunciación, definición], ...] — hebreo primero.
import fs from 'node:fs';
import { transliterateGreek } from '../api/_strongs.js';
// Notas propias de KODESH que en strongs-*.json están en español → su versión en inglés.
const EN_NOTES = {
  H1285: 'Brit (covenant) — a solemn covenant. YHWH’s covenant with Abraham, Moses, David, and the Brit Hadashah in Yeshua.',
  H3068: 'YHWH — the proper name of the God of Israel. The Eternal One, who Is, who Was and who Will Be. The sacred Tetragrammaton.',
  H3091: 'Yehoshua (Joshua/Yeshua) — “YHWH is salvation.” The full form of the name of Yeshua the Messiah.',
  H4899: 'Mashiach — “the Anointed One.” The promised King and Redeemer of Israel, fulfilled in Yeshua of Nazareth.',
  H8451: 'Torah — instruction, teaching. The five books of Moses. Not simply “law” but YHWH’s instruction for life.',
  G2316: 'Elohim/God (Greek: Theos) — the one supreme God. In John 1:1 Yeshua is identified as Theos.',
  G2424: 'Yeshua (Greek: Iesous) — the Greek form of the Hebrew Yehoshua. “YHWH is salvation.” The Messiah, Son of God.',
  G4151: 'Ruach HaKodesh (Greek: Pneuma) — spirit, wind, breath. The Holy Spirit of God.',
  G5547: 'Mashiach (Greek: Christos) — “the Anointed One.” The Greek equivalent of the Hebrew Mashiach. A Messianic title of Yeshua.',
};
const rows = [];
for (const f of ['strongs-hebrew.json', 'strongs-greek.json']) {
  const d = JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
  for (const [code, e] of Object.entries(d)) {
    const m = code.match(/^([HG])0*(\d+)$/); if (!m || !e.lemma) continue;
    const c = m[1] + m[2];
    rows.push([c, e.lemma, e.xlit || (m[1] === 'G' ? transliterateGreek(e.lemma) : ''), e.pron || '', EN_NOTES[c] || (e.definition || '').trim()]);
  }
}
const key = c => (c[0] === 'H' ? 0 : 1e6) + Number(c.slice(1));
const seen = new Set();
const out = rows.sort((a, b) => key(a[0]) - key(b[0])).filter(r => !seen.has(r[0]) && seen.add(r[0]));
fs.writeFileSync(new URL('../data/strongs-en.json', import.meta.url), JSON.stringify(out));
const ES = /[áéíóúñ¿¡]|\b(el|la|los|las|del|que|nombre|por|con|para)\b/;
const left = out.filter(r => ES.test(r[4]) && !/^(El-|Beth-El|Migdal-El|Jiphtach-el|lo!|a \(female\))/.test(r[4]));
if (left.length) { console.error('Definiciones en español sin versión en inglés:', left.map(r => r[0]).join(', ')); process.exit(1); }
console.log(out.length, 'entradas');
