/* KODESH — Idioma de la app (Español / English).
   - El idioma se guarda en localStorage «kodesh_lang». Sin elección: quien ya usaba la app sigue en español;
     una instalación nueva toma el idioma del teléfono.
   - En inglés: la Biblia es la World Messianic Bible (biblia-wmb.json, dominio público), los libros llevan
     su nombre en inglés y la interfaz se traduce con el diccionario de i18n-en.js.
   - Traducción por contenido: la app está escrita en español; un observador cambia cada texto de la
     interfaz que esté en el diccionario (y los atributos placeholder / title / aria-label). Nunca toca
     el texto bíblico (.verse), lo que escribe el usuario (inputs, textarea, contenteditable) ni lo marcado
     con data-noi18n. Para textos armados en código: KodeshI18n.t('texto en español', { n: 3 }).
   Expone window.KodeshI18n. */
(function () {
  'use strict';
  const KEY = 'kodesh_lang';
  function pick() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'es' || v === 'en') return v;
      // Usuarios de antes: tienen datos de la app guardados → siguen en español
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k !== KEY && /^(kodesh|sb-|welcome)/.test(k)) return 'es'; }
    } catch (e) {}
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
    return /^es\b/i.test(nav) ? 'es' : 'en';
  }
  const lang = pick();
  const isEn = lang === 'en';
  document.documentElement.lang = lang;
  if (isEn) document.documentElement.classList.add('lang-en');

  // Fechas y números: el código pide 'es' / 'es-ES'; en inglés se formatean en 'en-US' («Thursday, October 9»)
  if (isEn) {
    const loc = l => typeof l === 'string' ? l.replace(/^es(-[A-Za-z]{2}(?=$|-))?/, 'en-US').replace(/^en-US-u-/, 'en-u-') : Array.isArray(l) ? l.map(loc) : l;
    const wrap = (proto, name) => { const f = proto[name]; proto[name] = function (l, o) { return f.call(this, loc(l), o); }; };
    wrap(Date.prototype, 'toLocaleDateString'); wrap(Date.prototype, 'toLocaleTimeString'); wrap(Date.prototype, 'toLocaleString'); wrap(Number.prototype, 'toLocaleString');
    for (const k of ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'PluralRules', 'ListFormat']) {
      const C = Intl[k]; if (!C) continue;
      const W = function (l, o) { return new C(loc(l), o); };
      W.prototype = C.prototype; W.supportedLocalesOf = C.supportedLocalesOf; Intl[k] = W;
    }
  }

  const BOOKS_EN = {
    GEN: ['Genesis', 'Gen'], EXO: ['Exodus', 'Exo'], LEV: ['Leviticus', 'Lev'], NUM: ['Numbers', 'Num'], DEU: ['Deuteronomy', 'Deu'],
    JOS: ['Joshua', 'Josh'], JDG: ['Judges', 'Judg'], RUT: ['Ruth', 'Ruth'], '1SA': ['1 Samuel', '1Sa'], '2SA': ['2 Samuel', '2Sa'],
    '1KI': ['1 Kings', '1Ki'], '2KI': ['2 Kings', '2Ki'], '1CH': ['1 Chronicles', '1Ch'], '2CH': ['2 Chronicles', '2Ch'], EZR: ['Ezra', 'Ezra'],
    NEH: ['Nehemiah', 'Neh'], EST: ['Esther', 'Est'], JOB: ['Job', 'Job'], PSA: ['Psalms', 'Psa'], PRO: ['Proverbs', 'Pro'],
    ECC: ['Ecclesiastes', 'Ecc'], SNG: ['Song of Songs', 'Song'], ISA: ['Isaiah', 'Isa'], JER: ['Jeremiah', 'Jer'], LAM: ['Lamentations', 'Lam'],
    EZK: ['Ezekiel', 'Ezek'], DAN: ['Daniel', 'Dan'], HOS: ['Hosea', 'Hos'], JOL: ['Joel', 'Joel'], AMO: ['Amos', 'Amos'], OBA: ['Obadiah', 'Obad'],
    JON: ['Jonah', 'Jon'], MIC: ['Micah', 'Mic'], NAM: ['Nahum', 'Nah'], HAB: ['Habakkuk', 'Hab'], ZEP: ['Zephaniah', 'Zeph'], HAG: ['Haggai', 'Hag'],
    ZEC: ['Zechariah', 'Zech'], MAL: ['Malachi', 'Mal'], MAT: ['Matthew', 'Mat'], MRK: ['Mark', 'Mark'], LUK: ['Luke', 'Luke'], JHN: ['John', 'John'],
    ACT: ['Acts', 'Acts'], ROM: ['Romans', 'Rom'], '1CO': ['1 Corinthians', '1Co'], '2CO': ['2 Corinthians', '2Co'], GAL: ['Galatians', 'Gal'],
    EPH: ['Ephesians', 'Eph'], PHP: ['Philippians', 'Phil'], COL: ['Colossians', 'Col'], '1TH': ['1 Thessalonians', '1Th'], '2TH': ['2 Thessalonians', '2Th'],
    '1TI': ['1 Timothy', '1Ti'], '2TI': ['2 Timothy', '2Ti'], TIT: ['Titus', 'Tit'], PHM: ['Philemon', 'Phm'], HEB: ['Hebrews', 'Heb'], JAS: ['James', 'Jas'],
    '1PE': ['1 Peter', '1Pe'], '2PE': ['2 Peter', '2Pe'], '1JN': ['1 John', '1Jn'], '2JN': ['2 John', '2Jn'], '3JN': ['3 John', '3Jn'], JUD: ['Jude', 'Jude'],
    REV: ['Revelation', 'Rev'],
  };
  // Nombre en español de cada libro (lo llena bible-ref.js) → para traducir textos que lo nombran
  const ES2EN = new Map();
  // Abreviaturas en español seguidas de capítulo («Hch 7:4», «Gá 3:17»)
  const ABBR = { 'Gn': 'Gen', 'Gén': 'Gen', 'Éx': 'Exod', 'Ex': 'Exod', 'Éxo': 'Exod', 'Lv': 'Lev', 'Nm': 'Num', 'Núm': 'Num', 'Dt': 'Deut', 'Jos': 'Josh', 'Jue': 'Judg', 'Rt': 'Ruth',
    '1 S': '1 Sam', '2 S': '2 Sam', '1 Sa': '1 Sam', '2 Sa': '2 Sam', '1 R': '1 Kgs', '2 R': '2 Kgs', '1 Re': '1 Kgs', '2 Re': '2 Kgs', '1 Cr': '1 Chr', '2 Cr': '2 Chr', 'Esd': 'Ezra',
    'Sal': 'Ps', 'Pr': 'Prov', 'Prov': 'Prov', 'Ec': 'Eccl', 'Ecl': 'Eccl', 'Cnt': 'Song', 'Cant': 'Song', 'Is': 'Isa', 'Lm': 'Lam', 'Ez': 'Ezek', 'Dn': 'Dan', 'Os': 'Hos', 'Jl': 'Joel',
    'Am': 'Amos', 'Abd': 'Obad', 'Jon': 'Jonah', 'Mi': 'Mic', 'Miq': 'Mic', 'Sof': 'Zeph', 'Hag': 'Hag', 'Zac': 'Zech', 'Mt': 'Matt', 'Mr': 'Mark', 'Mc': 'Mark', 'Lc': 'Luke', 'Jn': 'John',
    'Hch': 'Acts', 'Ro': 'Rom', '1 Co': '1 Cor', '2 Co': '2 Cor', 'Gá': 'Gal', 'Gál': 'Gal', 'Ef': 'Eph', 'Fil': 'Phil', 'Flp': 'Phil', '1 Ts': '1 Thess', '2 Ts': '2 Thess', '1 Tes': '1 Thess',
    '2 Tes': '2 Thess', '1 Ti': '1 Tim', '2 Ti': '2 Tim', 'Tit': 'Titus', 'Flm': 'Phlm', 'He': 'Heb', 'Stg': 'Jas', 'Sant': 'Jas', '1 P': '1 Pet', '2 P': '2 Pet', '1 Pe': '1 Pet', '2 Pe': '2 Pet',
    '1 Jn': '1 John', '2 Jn': '2 John', '3 Jn': '3 John', 'Jud': 'Jude', 'Ap': 'Rev' };

  /* ── Diccionario ── */
  const DICT = new Map();        // texto exacto en español → inglés
  const RULES = [];              // [RegExp, reemplazo | función]
  function add(obj) { for (const k in obj) DICT.set(norm(k), obj[k]); }
  function rule(re, to) { RULES.push([re, to]); }
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  function tr(text) {
    const k = norm(text);
    if (!k || !/[A-Za-zÁÉÍÓÚÑáéíóúñ¿¡]/.test(k)) return null;
    let v = look(k);
    if (v == null) {
      const k2 = bookSub(k);
      if (k2 !== k) v = look(k2) ?? k2;
      else if (ES2EN.has(k)) v = ES2EN.get(k);
    }
    if (v == null) {
      // «Bereshit · En el principio», «Lej Lejá — Ve tú»: se traduce cada parte por separado
      const parts = k.split(/( · | — | \| )/);
      if (parts.length > 1) {
        let hit = false;
        const out = parts.map((x, i) => { if (i % 2) return x; const y = look(x) ?? (ES2EN.get(x) || null) ?? (bookSub(x) !== x ? bookSub(x) : null); if (y != null) { hit = true; return y; } return x; });
        if (hit) v = out.join('');
      }
    }
    if (v == null) {
      // «· c. 5 a.C.», «— Salmos 119:105»: prefijo de puntuación
      const pm = /^([·—–•›‹←→✦✓·]+\s*)(.+)$/.exec(k);
      if (pm) { const y = tr(pm[2]); if (y != null) v = pm[1] + y.trim(); }
    }
    if (v == null) return null;
    v = bookSub(v);
    // conserva los espacios de los lados
    const m = /^(\s*)[\s\S]*?(\s*)$/.exec(text);
    return m[1] + v + m[2];
  }
  function look(k) {
    let v = DICT.get(k);
    if (v == null) for (const [re, to] of RULES) { if (re.test(k)) { v = k.replace(re, to); break; } }
    return v;
  }
  // Nombres de libros en español seguidos de capítulo («Génesis 1:1», «— Salmos 119:105», «Juan 1»)
  let BRE = null, BRE_N = 0;
  function bookSub(k) {
    if (!BRE || BRE_N !== ES2EN.size) {
      for (const a in ABBR) if (!ES2EN.has(a)) ES2EN.set(a, ABBR[a]);
      const names = [...ES2EN.keys()].filter(n => n !== ES2EN.get(n)).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      BRE = new RegExp(`(^|[\\s(«“—–-])(${names.join('|')})(?=\\s+\\d|\\s+—)`, 'g'); BRE_N = ES2EN.size;
    }
    return k.replace(BRE, (m, a, n) => a + ES2EN.get(n));
  }
  function t(es, vars) {
    let s = isEn ? (tr(es) ?? es) : es;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  /* ── Traductor del DOM ── */
  const SKIP = 'script,style,textarea,input,select option[data-noi18n],[contenteditable=""],[contenteditable="true"],.verse,.verse-sheet-text,[data-noi18n],code,pre';
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tooltip'];
  const done = new WeakMap();
  function skipNode(el) { return !el || (el.closest && el.closest(SKIP)); }
  // Campos de texto: su contenido es del usuario, pero el placeholder / title sí se traducen
  const FIELD = 'input,textarea,select';
  const attrOk = el => el && el.closest && !el.closest('[data-noi18n],.verse') && (!skipNode(el) || el.matches(FIELD));
  /* ── Detector de mezcla: en inglés, todo texto que parezca español y no tenga traducción se anota.
     KodeshI18n.misses() los lista; scripts/i18n-audit.cjs recorre la app y falla si hay alguno. ── */
  const ES_WORDS = /(^|[^\p{L}])(de|del|la|las|los|el|que|para|con|una|por|sin|más|tu|tus|su|sus|este|esta|aquí|cuando|también|como|pero|desde|hasta|hoy|ahora|toca|leer|ver|cerrar|guardar|buscar|abrir|capítulo|versículo|años|año|días|día)(?=$|[^\p{L}])/iu;
  const looksEs = s => /[áéíóúñ¿¡]/i.test(s.replace(/Yeshúa|Mashíaj|Shabat|Pésaj|Sucot|Teruá|Bereshit|Jayé|Lejá|Vayerá|Vayetsé|Vayéshev|Mikéts|Vayejí|Vaerá|Yitró|Terumá|Tetsavé|Tisá|Pekudéi|Vayikrá|Sheminí|Tazría|Metsorá|Ajaréi|Bejukotái|Nasó|Behaalotjá|Lejá|Kóraj|Pinjás|Maséi|Vaetjanán|Ékev|Reé|Tetsé|Tavó|Vayélej|Haberajá|Shemá|Jodesh|Torá|Haftará|Jadashá|Mishkán|Teruá/g, '')) || ES_WORDS.test(s);
  const MISS = new Map();
  function miss(v, where) {
    const k = norm(v);
    if (!k || k.length < 2 || !looksEs(k)) return;
    if (!MISS.has(k)) { MISS.set(k, where); if (window.KODESH_I18N_DEBUG) console.warn('[i18n] sin traducir:', k, where); }
  }
  const where = el => { const e = el && el.closest ? el.closest('[id],[class]') : null; return e ? (e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) : ''; };
  function doText(n) {
    const v = n.nodeValue;
    if (done.get(n) === v) return;
    const out = tr(v);
    if (out != null && out !== v) { n.nodeValue = out; done.set(n, out); } else { done.set(n, v); if (out == null) miss(v, where(n.parentElement)); }
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v) continue;
      const out = tr(v);
      if (out != null && out !== v) el.setAttribute(a, out);
      else if (out == null) miss(v, where(el) + ' @' + a);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipNode(root.parentElement)) doText(root); return; }
    if (root.nodeType !== 1) return;
    if (skipNode(root)) { if (attrOk(root)) doAttrs(root); return; }
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.matches(SKIP)) { if (attrOk(n)) doAttrs(n); return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  if (isEn) {
    const mo = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') { if (!skipNode(m.target.parentElement)) doText(m.target); }
        else if (m.type === 'attributes') { if (attrOk(m.target)) doAttrs(m.target); }
        else m.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.addEventListener('DOMContentLoaded', () => walk(document.body));
    // document.title
    const tt = () => { const o = tr(document.title); if (o) document.title = o; };
    document.addEventListener('DOMContentLoaded', tt);
  }

  /* ── Libros ── */
  function bookName(id, fallback) { return isEn && BOOKS_EN[id] ? BOOKS_EN[id][0] : fallback; }
  // BIBLE_BOOKS de index.html: { AT: [{id, name, abbr}], NT: [...] }
  function patchBooks(groups) {
    for (const g in groups) for (const b of groups[g]) {
      if (!b.esName) b.esName = b.name;
      ES2EN.set(b.esName, (BOOKS_EN[b.id] || [b.name])[0]);
      if (isEn && BOOKS_EN[b.id]) { b.name = BOOKS_EN[b.id][0]; b.abbr = BOOKS_EN[b.id][1]; }
    }
  }
  // KodeshRef.BOOKS: [id, nombre, capítulos, alias…] → en inglés también entiende los nombres en inglés
  function patchRef() {
    const R = window.KodeshRef; if (!R || !R.BOOKS || R.__i18n) return; R.__i18n = true;
    for (const b of R.BOOKS) {
      const en = BOOKS_EN[b[0]]; if (!en) continue;
      ES2EN.set(b[1], en[0]);
      const al = en[0].toLowerCase().replace(/\s+/g, '');
      if (!b.includes(al)) b.push(al);
      if (isEn) b[1] = en[0];
    }
  }
  patchRef();
  document.addEventListener('DOMContentLoaded', patchRef);

  /* ── Funciones aún sin traducir: en inglés se esconden sus entradas (data-feature="…") hasta estar listas,
     así nunca aparece una pantalla a medio traducir. Al terminar una, se agrega a READY. ── */
  // función → dónde están sus entradas (además de cualquier elemento con data-feature="…")
  const FEATURES = {
    tiempo: '.tl-pill, [onclick*="KodeshTiempo"]',
    moedim: '[onclick*="KodeshMoedim"], [data-moedim-home], .hm-ask',
    luna: '[onclick*="KodeshLuna"]',
    maps: '[onclick*="KodeshMaps"]',
    harmony: '[onclick*="harmony"]',
    parashot: 'a[href^="parashot.html"], a[href^="/parashot.html"], .parasha-banner-link',
    estudio: 'a[href^="estudio.html"], a[href^="/estudio.html"]',
    lexicon: 'a[href^="lexicon.html"], a[href^="/lexicon.html"]',
    cronicas: 'a[href^="cronicas.html"], a[href^="/cronicas.html"]',
    actividades: 'a[href^="actividades.html"], a[href^="/actividades.html"]',
    profile: 'a[href^="profile.html"], a[href^="/profile.html"]',
    ayuda: 'a[href^="ayuda.html"], a[href^="/ayuda.html"]',
    interlinear: '#btnInterlinearToggle, .btn-interlinear, [onclick*="verseSheetAction(\'interlinear\')"]',
    audio: '.audio-chip, .ka-player, .hm-play, [data-act="play"], [data-act="listen"]',
    verseday: '',
    calpage: 'a[href^="calendario-biblico.html"], a[href^="/calendario-biblico.html"]',
  };
  const READY = new Set(['tiempo', 'moedim', 'luna']);
  const ok = f => !isEn || READY.has(f);
  if (isEn) {
    const st = document.createElement('style');
    st.textContent = Object.keys(FEATURES).filter(f => !READY.has(f)).map(f => `${[`[data-feature~="${f}"]`, ...FEATURES[f].split(',').filter(x => x.trim())].map(x => 'html.lang-en ' + x.trim()).join(', ')}{display:none!important}`).join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  function setLang(l) {
    if (l !== 'es' && l !== 'en') return;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    location.reload();
  }

  // Traducciones de los módulos (data/i18n → i18n-en-data.js): solo en inglés, antes de que corra el resto
  if (isEn && document.readyState === 'loading') document.write('<script src="/i18n-en-data.js"><\/script>');

  window.KodeshI18n = {
    lang, isEn, t, tr, add, rule, setLang, bookName, patchBooks, patchRef, BOOKS_EN, walk, ok, READY, looksEs,
    misses: () => [...MISS.entries()].map(([t, w]) => ({ t, w })),
    // ¿Es una palabra/nombre en español que tiene traducción? (la auditoría la usa para nombres sin tilde: «Lamec», «Sem»)
    esWord: w => { const v = DICT.get(w); return v != null && v !== w; },
    bible: isEn ? './biblia-wmb.json' : './biblia-rvr.json',
    version: isEn ? 'WMB' : 'RVR60',
  };
})();
