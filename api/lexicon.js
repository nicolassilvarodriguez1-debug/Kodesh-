// KODESH Lexicon API — Full Strong's Hebrew & Greek
// Loads from JSON files and provides word lookup by Spanish word

import { readFileSync } from 'fs';
import { join } from 'path';

// NT books use Greek, AT books use Hebrew
const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

let hebrewData = null;
let greekData = null;

function loadData() {
  if (!hebrewData) {
    try {
      hebrewData = JSON.parse(readFileSync(join(process.cwd(), 'strongs-hebrew.json'), 'utf8'));
    } catch(e) { hebrewData = {}; }
  }
  if (!greekData) {
    try {
      greekData = JSON.parse(readFileSync(join(process.cwd(), 'strongs-greek.json'), 'utf8'));
    } catch(e) { greekData = {}; }
  }
}

// Spanish word → Strong's number mapping for common words
const SPANISH_TO_STRONGS = {
  // Key theological terms
  'dios': { heb: 'H0430', grk: 'G2316' },    // Elohim / Theos
  'dios.': { heb: 'H0430', grk: 'G2316' },
  'señor': { heb: 'H0136', grk: 'G2962' },   // Adonai / Kyrios
  'yhwh': { heb: 'H3068', grk: null },
  'padre': { heb: 'H0001', grk: 'G3962' },   // Av / Pater
  'hijo': { heb: 'H1121', grk: 'G5207' },    // Ben / Huios
  'espíritu': { heb: 'H7307', grk: 'G4151' },// Ruaj / Pneuma
  'espiritu': { heb: 'H7307', grk: 'G4151' },
  'amor': { heb: 'H0160', grk: 'G0026' },    // Ahavah / Agape
  'gracia': { heb: 'H2580', grk: 'G5485' },  // Jen / Charis
  'fe': { heb: 'H0530', grk: 'G4102' },      // Emunah / Pistis
  'salvación': { heb: 'H3444', grk: 'G4991' },// Yeshuah / Soteria
  'salvacion': { heb: 'H3444', grk: 'G4991' },
  'paz': { heb: 'H7965', grk: 'G1515' },     // Shalom / Eirene
  'vida': { heb: 'H2416', grk: 'G2222' },    // Jayim / Zoe
  'verdad': { heb: 'H0571', grk: 'G0225' },  // Emet / Aletheia
  'palabra': { heb: 'H1697', grk: 'G3056' }, // Davar / Logos
  'ley': { heb: 'H8451', grk: 'G3551' },     // Torah / Nomos
  'torah': { heb: 'H8451', grk: null },
  'rey': { heb: 'H4428', grk: 'G0935' },     // Melek / Basileus
  'pueblo': { heb: 'H5971', grk: 'G2992' },  // Am / Laos
  'tierra': { heb: 'H0776', grk: 'G1093' },  // Eretz / Ge
  'cielo': { heb: 'H8064', grk: 'G3772' },   // Shamayim / Ouranos
  'cielos': { heb: 'H8064', grk: 'G3772' },
  'ángel': { heb: 'H4397', grk: 'G0032' },   // Malak / Angelos
  'angel': { heb: 'H4397', grk: 'G0032' },
  'gloria': { heb: 'H3519', grk: 'G1391' },  // Kavod / Doxa
  'santo': { heb: 'H6918', grk: 'G0040' },   // Kadosh / Hagios
  'santa': { heb: 'H6918', grk: 'G0040' },
  'sangre': { heb: 'H1818', grk: 'G0129' },  // Dam / Haima
  'pecado': { heb: 'H2399', grk: 'G0266' },  // Jet / Hamartia
  'luz': { heb: 'H0216', grk: 'G5457' },     // Or / Phos
  'tinieblas': { heb: 'H2822', grk: 'G4655' },// Joshek / Skotos
  'corazón': { heb: 'H3820', grk: 'G2588' }, // Lev / Kardia
  'corazon': { heb: 'H3820', grk: 'G2588' },
  'alma': { heb: 'H5315', grk: 'G5590' },    // Nefesh / Psuche
  'espíritu': { heb: 'H7307', grk: 'G4151' },
  'poder': { heb: 'H3581', grk: 'G1411' },   // Koaj / Dynamis
  'nombre': { heb: 'H8034', grk: 'G3686' },  // Shem / Onoma
  'creó': { heb: 'H1254', grk: null },        // Bara
  'cre': { heb: 'H1254', grk: null },
  'principio': { heb: 'H7225', grk: 'G0746' },// Bereshit / Arche
  'pacto': { heb: 'H1285', grk: 'G1242' },   // Brit / Diatheke
  'profeta': { heb: 'H5030', grk: 'G4396' }, // Navi / Prophetes
  'sacerdote': { heb: 'H3548', grk: 'G2409' },// Kohen / Hiereus
  'juicio': { heb: 'H4941', grk: 'G2920' },  // Mishpat / Krisis
  'misericordia': { heb: 'H2617', grk: 'G1656' },// Jesed / Eleos
  'fiel': { heb: 'H0539', grk: 'G4103' },    // Aman / Pistos
  'eterno': { heb: 'H5769', grk: 'G0166' },  // Olam / Aionios
  'eterna': { heb: 'H5769', grk: 'G0166' },
  'bendito': { heb: 'H1288', grk: 'G2128' }, // Baruj / Eulogetos
  'bendita': { heb: 'H1288', grk: 'G2128' },
  'Israel': { heb: 'H3478', grk: 'G2474' },  // Yisrael
  'israel': { heb: 'H3478', grk: 'G2474' },
  'jerusalén': { heb: 'H3389', grk: 'G2419' },
  'jerusalem': { heb: 'H3389', grk: 'G2419' },
  'templo': { heb: 'H1964', grk: 'G2411' },  // Hejal / Hieron
  'sión': { heb: 'H6726', grk: 'G4622' },
  'resurreccion': { grk: 'G0386' },           // Anastasis
  'resurrección': { grk: 'G0386' },
  'bautismo': { grk: 'G0908' },               // Baptisma
  'evangelio': { grk: 'G2098' },              // Euangelion
  'apóstol': { grk: 'G0652' },               // Apostolos
  'apostol': { grk: 'G0652' },
  'iglesia': { grk: 'G1577' },               // Ekklesia
  'congregación': { grk: 'G1577' },
  'congregacion': { grk: 'G1577' },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, bookId } = req.body;
  if (!word) return res.status(400).json({ error: 'word required' });

  loadData();

  const isNT = NT_BOOKS.has(bookId);
  const wordLower = word.toLowerCase().replace(/[.,;:!?'"()]/g, '');

  const mapping = SPANISH_TO_STRONGS[wordLower] || SPANISH_TO_STRONGS[wordLower + '.'];

  if (!mapping) {
    return res.status(404).json({ found: false });
  }

  const strongsNum = isNT ? (mapping.grk || mapping.heb) : (mapping.heb || mapping.grk);
  if (!strongsNum) {
    return res.status(404).json({ found: false });
  }

  const data = strongsNum.startsWith('H') ? hebrewData : greekData;
  const entry = data[strongsNum];

  if (!entry) {
    return res.status(404).json({ found: false });
  }

  const lang = strongsNum.startsWith('H') ? 'hebreo' : 'griego';

  return res.status(200).json({
    found: true,
    strongs: strongsNum,
    lemma: entry.lemma,
    transliteration: entry.xlit,
    pronunciation: entry.pron,
    definition: entry.definition,
    language: lang,
    testament: isNT ? 'NT' : 'AT',
  });
}
