// ════════════════════════════════════════════════════════════════
// KodeshRef — entiende citas bíblicas escritas "como sea"
//
//   "juan 1"        → Juan 1
//   "jn 3:16"       → Juan 3:16        (abreviaturas)
//   "1 cor 13"      → 1 Corintios 13   ("1", "1ra", "primera", "I"…)
//   "genisis 1"     → Génesis 1        (errores pequeños de ortografía)
//   "salmo 23.1-4"  → Salmos 23:1-4    (":" "." "," y rangos)
//   "apocalipsis"   → Apocalipsis      (solo el libro)
//
// Script sin dependencias: en el navegador queda en window.KodeshRef y en
// los tests de Node en globalThis.KodeshRef.
// ════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  // [id, nombre, capítulos, alias…]  (los alias se comparan sin tildes)
  const BOOKS = [
    ['GEN', 'Génesis', 50, 'gen', 'gn', 'ge', 'bereshit', 'bereshith', 'genesis'],
    ['EXO', 'Éxodo', 40, 'exo', 'ex', 'exod', 'shemot', 'exodus'],
    ['LEV', 'Levítico', 27, 'lev', 'lv', 'vayikra'],
    ['NUM', 'Números', 36, 'num', 'nm', 'nu', 'bamidbar', 'numbers'],
    ['DEU', 'Deuteronomio', 34, 'deu', 'deut', 'dt', 'devarim'],
    ['JOS', 'Josué', 24, 'jos', 'jsh', 'yehoshua', 'joshua'],
    ['JDG', 'Jueces', 21, 'jue', 'jc', 'jueses', 'shoftim', 'judges'],
    ['RUT', 'Rut', 4, 'rt', 'ruth'],
    ['1SA', '1 Samuel', 31, '1sa', '1sam', '1sm', '1s'],
    ['2SA', '2 Samuel', 24, '2sa', '2sam', '2sm', '2s'],
    ['1KI', '1 Reyes', 22, '1re', '1rey', '1r', '1rs', '1kings'],
    ['2KI', '2 Reyes', 25, '2re', '2rey', '2r', '2rs', '2kings'],
    ['1CH', '1 Crónicas', 29, '1cr', '1cro', '1cron', '1chr'],
    ['2CH', '2 Crónicas', 36, '2cr', '2cro', '2cron', '2chr'],
    ['EZR', 'Esdras', 10, 'esd', 'ezra'],
    ['NEH', 'Nehemías', 13, 'neh', 'ne', 'nehemiah'],
    ['EST', 'Ester', 10, 'est', 'esther'],
    ['JOB', 'Job', 42, 'jb'],
    ['PSA', 'Salmos', 150, 'sal', 'sl', 'salmo', 'salm', 'slm', 'ps', 'psa', 'tehilim', 'tehillim', 'psalms', 'psalm'],
    ['PRO', 'Proverbios', 31, 'pro', 'prov', 'pr', 'prv', 'proverbio', 'mishlei', 'proverbs'],
    ['ECC', 'Eclesiastés', 12, 'ecl', 'ec', 'ecles', 'qohelet', 'kohelet', 'ecclesiastes'],
    ['SNG', 'Cantares', 8, 'cnt', 'cant', 'cantar', 'cantar de los cantares', 'cantico de los canticos', 'canticos', 'shir hashirim'],
    ['ISA', 'Isaías', 66, 'isa', 'is', 'yeshayahu', 'isaiah'],
    ['JER', 'Jeremías', 52, 'jer', 'jr', 'yirmeyahu', 'jeremiah'],
    ['LAM', 'Lamentaciones', 5, 'lam', 'lm', 'eja', 'eicha'],
    ['EZK', 'Ezequiel', 48, 'eze', 'ez', 'ezeq', 'yejezkel', 'yechezkel', 'ezekiel'],
    ['DAN', 'Daniel', 12, 'dan', 'dn'],
    ['HOS', 'Oseas', 14, 'ose', 'os', 'hoshea', 'hosea'],
    ['JOL', 'Joel', 3, 'joe', 'jl'],
    ['AMO', 'Amós', 9, 'am'],
    ['OBA', 'Abdías', 1, 'abd', 'ab', 'ovadia', 'obadiah'],
    ['JON', 'Jonás', 4, 'jon', 'yona', 'jonah'],
    ['MIC', 'Miqueas', 7, 'miq', 'mi', 'mija', 'micah'],
    ['NAM', 'Nahúm', 3, 'nah', 'na', 'nahum'],
    ['HAB', 'Habacuc', 3, 'hab', 'habakuk'],
    ['ZEP', 'Sofonías', 3, 'sof', 'tzefania', 'zephaniah'],
    ['HAG', 'Hageo', 2, 'hag', 'ag', 'hageo', 'jagai', 'haggai'],
    ['ZEC', 'Zacarías', 14, 'zac', 'za', 'zejaria', 'zechariah'],
    ['MAL', 'Malaquías', 4, 'mal', 'ml', 'malaji', 'malachi'],
    ['MAT', 'Mateo', 28, 'mat', 'mt', 'mateo', 'san mateo', 'mattityahu', 'matityahu', 'matthew'],
    ['MRK', 'Marcos', 16, 'mar', 'mc', 'mr', 'mrc', 'marco', 'san marcos', 'mark'],
    ['LUK', 'Lucas', 24, 'luc', 'lc', 'lu', 'san lucas', 'luke'],
    ['JHN', 'Juan', 21, 'jua', 'jn', 'jo', 'san juan', 'yojanan', 'yochanan', 'iojanan', 'john'],
    ['ACT', 'Hechos', 28, 'hch', 'hech', 'hec', 'hechos de los apostoles', 'acts'],
    ['ROM', 'Romanos', 16, 'rom', 'ro', 'rm', 'romans'],
    ['1CO', '1 Corintios', 16, '1co', '1cor', '1corinthians'],
    ['2CO', '2 Corintios', 13, '2co', '2cor', '2corinthians'],
    ['GAL', 'Gálatas', 6, 'gal', 'ga', 'galatians'],
    ['EPH', 'Efesios', 6, 'efe', 'ef', 'efes', 'ephesians'],
    ['PHP', 'Filipenses', 4, 'fil', 'flp', 'filip', 'philippians'],
    ['COL', 'Colosenses', 4, 'col', 'colossians'],
    ['1TH', '1 Tesalonicenses', 5, '1te', '1tes', '1ts', '1thess'],
    ['2TH', '2 Tesalonicenses', 3, '2te', '2tes', '2ts', '2thess'],
    ['1TI', '1 Timoteo', 6, '1ti', '1tim', '1tm'],
    ['2TI', '2 Timoteo', 4, '2ti', '2tim', '2tm'],
    ['TIT', 'Tito', 3, 'tit', 'tt', 'titus'],
    ['PHM', 'Filemón', 1, 'flm', 'filem', 'fm', 'philemon'],
    ['HEB', 'Hebreos', 13, 'heb', 'he', 'hebrews'],
    ['JAS', 'Santiago', 5, 'stg', 'snt', 'sant', 'stgo', 'santi', 'yaakov', 'jacobo', 'james'],
    ['1PE', '1 Pedro', 5, '1pe', '1ped', '1p', '1pd', '1peter'],
    ['2PE', '2 Pedro', 3, '2pe', '2ped', '2p', '2pd', '2peter'],
    ['1JN', '1 Juan', 5, '1jn', '1jua', '1j', '1john'],
    ['2JN', '2 Juan', 1, '2jn', '2jua', '2j', '2john'],
    ['3JN', '3 Juan', 1, '3jn', '3jua', '3j', '3john'],
    ['JUD', 'Judas', 1, 'jud', 'jd', 'jude'],
    ['REV', 'Apocalipsis', 22, 'apo', 'ap', 'apoc', 'apocalipsis', 'revelacion', 'revelaciones', 'rev', 'revelation'],
  ];

  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9:.,\-–— ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const squash = s => s.replace(/\s+/g, '');

  const byId = {};
  const ALIAS = new Map();   // clave sin espacios → id
  const FULL = new Set();    // nombres completos ("juan", "1corintios")
  const NAMES = [];          // [clave, id] para fuzzy / prefijos (solo nombres completos)
  for (const [id, name, chapters, ...aliases] of BOOKS) {
    byId[id] = { id, name, chapters };
    const full = squash(norm(name));
    ALIAS.set(full, id);
    FULL.add(full);
    NAMES.push([full, id]);
    for (const a of aliases) {
      const k = squash(norm(a));
      if (!ALIAS.has(k)) ALIAS.set(k, id);
      if (k.length >= 5) NAMES.push([k, id]);
    }
  }

  // Ordinales al inicio: "1", "1ra", "primera", "I", "II"…  → número
  const ORD = [
    [/^(1|i|1ra|1ro|1a|1o|1era|1ero|primera|primero|primer)\b\s*(de\s+)?/, '1'],
    [/^(2|ii|2da|2do|2a|2o|segunda|segundo)\b\s*(de\s+)?/, '2'],
    [/^(3|iii|3ra|3ro|3a|3o|3era|3ero|tercera|tercero|tercer)\b\s*(de\s+)?/, '3'],
  ];
  // "1juan", "2cor" (número pegado al nombre)
  const GLUED = /^([123])([a-z].*)$/;

  function damerau(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }
  const maxTypos = len => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3);

  // Resuelve el nombre de un libro. Devuelve { id, how } con how ∈
  // 'exact' | 'prefix' | 'fuzzy', o null.
  function resolveBook(text, { allowShort = true } = {}) {
    let t = norm(text).replace(/[.:,\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    t = t.replace(/^(san|s)\s+(?=\S{3,})/, '');   // "san juan", "s. mateo"
    let num = '';
    for (const [re, n] of ORD) {
      const m = t.match(re);
      if (m && m[0].length < t.length) { num = n; t = t.slice(m[0].length).trim(); break; }
    }
    if (!num) {
      const g = squash(t).match(GLUED);
      if (g) { num = g[1]; t = g[2]; }
    }
    const base = squash(t);
    if (!base) return null;
    const key = num + base;
    // Sin número de capítulo exigimos más (si no, "sal" o "rey" serían libros)
    const minLen = allowShort ? 1 : 4;

    // 1) Exacto: nombre completo o alias
    if (ALIAS.has(key) && (FULL.has(key) || base.length >= minLen || num)) {
      return { id: ALIAS.get(key), how: 'exact' };
    }
    // Libro numerado escrito sin número ("corintios 13" → 1 Corintios)
    if (!num && FULL.has('1' + base)) return { id: ALIAS.get('1' + base), how: 'exact' };
    if (base.length < Math.max(3, minLen)) return null;

    // Candidatos: con número → solo ese número; sin número → libros sin
    // número o el "1" de los numerados ("corintos" → 1 Corintios).
    const pool = [];
    for (const [k, id] of NAMES) {
      const d = /^[123]/.test(k) ? k[0] : '';
      if (num ? d === num : (d === '' || d === '1')) pool.push([d ? k.slice(1) : k, id]);
    }
    // 2) Prefijo de un nombre ("deutero", "apoc", "filip")
    const pre = pool.find(([k]) => k.startsWith(base));
    if (pre) return { id: pre[1], how: 'prefix' };

    // 3) Errores pequeños de ortografía (distancia de edición)
    const limit = maxTypos(base.length);
    let best = null;
    for (const [k, id] of pool) {
      const dist = Math.min(
        damerau(base, k),
        // escribió solo el inicio, con un error ("deuteronimo", "apocalisis")
        base.length >= 5 && k.length > base.length ? damerau(base, k.slice(0, base.length)) + 1 : 99,
      );
      if (dist <= limit && (!best || dist < best.dist)) best = { id, dist };
    }
    return best ? { id: best.id, how: 'fuzzy' } : null;
  }

  // Parte una consulta en { bookId, bookName, chapter?, verse?, verseEnd?, how }
  // Devuelve null si no parece una cita. Con { error } si el libro existe
  // pero el capítulo no.
  function parseRef(query) {
    let q = norm(query)
      .replace(/\b(capitulo|cap|cp|versiculo|vers|vs|v)\b\.?/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!q) return null;
    // números al final: "3", "3:16", "3.16", "3,16", "3:16-18"
    const m = q.match(/^(.*?[a-z].*?)\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?\s*$/);
    let bookText = q, chapter = null, verse = null, verseEnd = null;
    if (m) {
      bookText = m[1];
      chapter = parseInt(m[2], 10);
      if (m[3]) verse = parseInt(m[3], 10);
      if (m[4]) verseEnd = parseInt(m[4], 10);
    } else if (/\d\s*[:.,]?\s*$/.test(q) && !/[a-z]/.test(q)) {
      return null;
    }
    const book = resolveBook(bookText, { allowShort: chapter != null });
    if (!book) return null;
    const info = byId[book.id];
    // Libros de un solo capítulo: "Judas 5" = Judas 1:5
    if (info.chapters === 1 && chapter != null && verse == null && chapter > 1) {
      verse = chapter; chapter = 1;
    }
    const out = { bookId: info.id, bookName: info.name, how: book.how, chapters: info.chapters };
    if (chapter != null) {
      if (chapter < 1 || chapter > info.chapters) return { ...out, error: 'chapter', chapter };
      out.chapter = chapter;
      if (verse != null && verse >= 1) {
        out.verse = verse;
        if (verseEnd != null && verseEnd > verse) out.verseEnd = verseEnd;
      }
    }
    return out;
  }

  function formatRef(r) {
    if (!r) return '';
    let s = r.bookName;
    if (r.chapter != null) s += ' ' + r.chapter;
    if (r.verse != null) s += ':' + r.verse + (r.verseEnd ? '-' + r.verseEnd : '');
    return s;
  }

  root.KodeshRef = { parseRef, resolveBook, formatRef, norm, BOOKS };
})(typeof window !== 'undefined' ? window : globalThis);
