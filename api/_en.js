// KODESH — Ayudas del lado del servidor para el modo inglés (notificaciones, calendario).
// Texto bíblico: World Messianic Bible (biblia-wmb.json, dominio público, con YHWH).
import fs from 'node:fs';

let WMB = null;
const wmb = () => WMB || (WMB = JSON.parse(fs.readFileSync(new URL('../biblia-wmb.json', import.meta.url), 'utf8')));

export const BOOK_EN = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy', JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
  '1SA': '1 Samuel', '2SA': '2 Samuel', '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles', EZR: 'Ezra',
  NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Songs', ISA: 'Isaiah',
  JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah',
  MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew',
  MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians',
  EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians', '1TI': '1 Timothy',
  '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John',
  '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
};

// Texto WMB de un pasaje corto y su referencia en inglés
export function wmbPassage(book, chapter, v1, v2 = v1) {
  const ch = wmb()[book] && wmb()[book][String(chapter)];
  if (!ch) return null;
  const parts = [];
  for (let v = v1; v <= v2; v++) if (ch[String(v)]) parts.push(ch[String(v)]);
  if (!parts.length) return null;
  return { text: parts.join(' '), ref: `${BOOK_EN[book] || book} ${chapter}:${v1}${v2 > v1 ? '–' + v2 : ''}` };
}

// «Séptimo mes» (calendario.js) → «the seventh month»
const ORD_EN = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth'];
const OLD_EN = { Aviv: 'Aviv', Ziv: 'Ziv', Etanim: 'Ethanim', Bul: 'Bul' };
export function monthNameEn(num, old) {
  return `the ${ORD_EN[num] || num + 'th'} month${old ? ` (${OLD_EN[old] || old})` : ''}`;
}
