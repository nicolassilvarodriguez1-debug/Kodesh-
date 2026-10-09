// KODESH — Auditoría del modo inglés: abre la app en inglés, recorre las pantallas y lista todo texto
// VISIBLE que parezca español. Uso: node scripts/i18n-audit.cjs [puerto]   (sirve la carpeta con
// python3 -m http.server en ese puerto). Sale con código 1 si encuentra mezcla de idiomas.
const { chromium } = require('playwright');
const PORT = process.argv[2] || 8765, BASE = `http://localhost:${PORT}/`;

// Pasos: [nombre, página, acción en la página (string de JS) ]
const STEPS = [
  ['inicio', 'index.html', ''],
  ['menú', 'index.html', "KodeshHome.hide(); openAppMenu()"],
  ['lector AT', 'index.html', "KodeshHome.hide(); selectBook('GEN'); loadChapter('GEN', 12)"],
  ['lector Salmos', 'index.html', "KodeshHome.hide(); selectBook('PSA'); loadChapter('PSA', 23)"],
  ['lector NT', 'index.html', "KodeshHome.hide(); selectBook('MAT'); loadChapter('MAT', 5)"],
  ['libros', 'index.html', "KodeshHome.hide(); openNav && openNav()"],
  ['búsqueda', 'index.html', "KodeshHome.hide(); openSearch()"],
  ['perfil', 'index.html', "KodeshHome.hide(); openProfile()"],
  ['asistente', 'index.html', "KodeshHome.hide(); openAssistant('Genesis', 1)"],
  ['versículo', 'index.html', "KodeshHome.hide(); selectBook('JHN'); loadChapter('JHN', 3).then(() => openVerseSheetDesktop({ preventDefault(){}, stopPropagation(){} }, 'JHN', 3, 16))"],
  ['notas', 'index.html', "KodeshHome.hide(); selectBook('JHN'); loadChapter('JHN', 3).then(() => openChapterNotes('JHN', 'John', 3))"],
  ['tiempo · historia', 'index.html', "KodeshHome.hide(); selectBook('ISA'); loadChapter('ISA', 6).then(() => KodeshTiempo.open({ book: 'ISA', ch: 6 }))"],
  ['tiempo · profetas', 'index.html', "KodeshHome.hide(); selectBook('AMO'); loadChapter('AMO', 1).then(() => KodeshTiempo.open({ book: 'AMO', ch: 1, tab: 'profetas' }))"],
  ['tiempo · salmos', 'index.html', "KodeshHome.hide(); KodeshTiempo.open({ book: 'PSA', ch: 51, tab: 'salmos' })"],
  ['tiempo · quién vivía', 'index.html', "KodeshHome.hide(); KodeshTiempo.open({ tab: 'vidas' })"],
  ['tiempo · a quién conoció', 'index.html', "KodeshHome.hide(); KodeshTiempo.open({ tab: 'vidas', who: 'Moisés' })"],
  ['tiempo · Yeshúa', 'index.html', "KodeshHome.hide(); KodeshTiempo.open({ tab: 'vidas', who: 'Yeshúa' })"],
  ['tiempo · pill salmo', 'index.html', "KodeshHome.hide(); selectBook('PSA'); loadChapter('PSA', 3)"],
  ['fiestas', 'index.html', "KodeshHome.hide(); KodeshMoedim.open()"],
  ['fiestas · pésaj info', 'index.html', "KodeshHome.hide(); KodeshMoedim.open('pesaj').then(() => document.querySelector('.md-ov [data-up]').click())"],
  ['fiestas · sucot info', 'index.html', "KodeshHome.hide(); KodeshMoedim.open('sukot').then(() => document.querySelector('.md-ov [data-up]').click())"],
  ['fiestas · kipur', 'index.html', "KodeshHome.hide(); KodeshMoedim.open('kipur')"],
  ['shabat', 'index.html', "KodeshHome.hide(); KodeshMoedim.open('shabat')"],
  ['shabat · info', 'index.html', "KodeshHome.hide(); KodeshMoedim.open('shabat').then(() => document.querySelector('.md-ov [data-up]').click())"],
  ['ciudad', 'index.html', "KodeshHome.hide(); KodeshMoedim.pickPlace(() => {})"],
  ['luna', 'index.html', "KodeshHome.hide(); KodeshLuna.open()"],
  ['luna · abajo', 'index.html', "KodeshHome.hide(); KodeshLuna.open().then(() => { const b = document.querySelector('.ln-ov .ln-body, .ln-ov [class*=scroll], .ln-ov'); if (b) b.scrollTop = 99999; })"],
  ['ciclo (parashot)', 'parashot.html', ''],
  ['ciclo · abajo', 'parashot.html', "window.scrollTo(0, 99999)"],
  ['perfil (página)', 'profile.html', ''],
  ['estudio (página)', 'estudio.html', ''],
  ['lexicón (página)', 'lexicon.html', ''],
  ['estudio · cuaderno', 'estudio.html', "createStudy('notebook')"],
  ['estudio · lienzo', 'estudio.html', "createStudy('canvas')"],
  ['estudio · biblia', 'estudio.html', "createStudy('notebook').then(() => togglePanel('left'))"],
  ['estudio · asistente', 'estudio.html', "createStudy('notebook').then(() => togglePanel('right'))"],
  ['estudio · menú', 'estudio.html', "createStudy('notebook').then(() => toggleMenu({ stopPropagation(){}, preventDefault(){} }))"],
  ['actividades', 'actividades.html', ''],
  ['onboarding', 'onboarding.html', ''],
  ['ayuda → help', 'ayuda.html', ''],
  ['calendario → en', 'calendario-biblico.html', ''],
  ['términos → en', 'terminos.html', ''],
  ['privacidad → en', 'privacidad.html', ''],
  ['eliminar cuenta → en', 'eliminar-cuenta.html', ''],
  ['cuenta · inicio', 'index.html', ''],
  ['cuenta · perfil', 'index.html', "KodeshHome.hide(); openProfile()"],
  ['cuenta · perfil marcadores', 'index.html', "KodeshHome.hide(); openProfile(); switchProfileTab('bookmarks')"],
  ['cuenta · perfil notas', 'index.html', "KodeshHome.hide(); openProfile(); switchProfileTab('notes')"],
  ['cuenta · historial', 'index.html', "KodeshHome.hide(); typeof openHistory === 'function' && openHistory()"],
  ['cuenta · premium', 'index.html', "KodeshHome.hide(); typeof openPremium === 'function' ? openPremium() : (typeof showPaywall === 'function' && showPaywall())"],
  ['cuenta · página perfil', 'profile.html', ''],
  ['cuenta · ciclo', 'parashot.html', ''],
  ['cuenta · estudio', 'estudio.html', ''],
  ['mapas', 'index.html', "KodeshHome.hide(); KodeshMaps.openIndex()"],
  ['mapas · abram', 'index.html', "KodeshHome.hide(); KodeshMaps.openTrip('abram')"],
  ['mapas · éxodo', 'index.html', "KodeshHome.hide(); KodeshMaps.openTrip('exodo')"],
  ['mapas · pablo', 'index.html', "KodeshHome.hide(); KodeshMaps.openTrip('pablo1')"],
  ['mapas · lugar', 'index.html', "KodeshHome.hide(); KodeshMaps.openPlace('a6d9af3')"],
  ['personajes · fila', 'index.html', "KodeshHome.hide(); selectBook('GEN'); loadChapter('GEN', 12).then(() => setTimeout(() => { const c = document.querySelector('.pp-chip'); if (c) c.click(); }, 1500))"],
  ['personajes · ficha', 'index.html', "KodeshHome.hide(); KodeshPeople.open('abraham_58')"],
  ['personajes · familia', 'index.html', "KodeshHome.hide(); KodeshPeople.open('abraham_58').then(() => { const t = document.querySelector('[data-tab=familia]'); if (t) t.click(); })"],
  ['personajes · relaciones', 'index.html', "KodeshHome.hide(); KodeshPeople.open('moses_2108').then(() => { const t = document.querySelector('[data-tab=red]'); if (t) t.click(); })"],
  ['personajes · dos genealogías', 'index.html', "KodeshHome.hide(); KodeshPeople.open('x_yeshua').then(() => { const t = document.querySelector('[data-tab=dos]'); if (t) t.click(); })"],
  ['lugares en el texto', 'index.html', "KodeshHome.hide(); selectBook('GEN'); loadChapter('GEN', 12).then(() => setTimeout(() => { const w = document.querySelector('.mp-place'); if (w) w.click(); }, 1800))"],
  ['ruta en el capítulo', 'index.html', "KodeshHome.hide(); selectBook('ACT'); loadChapter('ACT', 13)"],
  ['armonía', 'index.html', "KodeshHome.hide(); KodeshParallels.harmony()"],
  ['armonía · lado a lado', 'index.html', "KodeshHome.hide(); KodeshParallels.open(20)"],
  ['paralelos en el lector', 'index.html', "KodeshHome.hide(); selectBook('MAT'); loadChapter('MAT', 3)"],
  ['paralelos · solo en', 'index.html', "KodeshHome.hide(); selectBook('JHN'); loadChapter('JHN', 2).then(() => setTimeout(() => { const w = document.querySelector('.pl-chip.solo'); if (w) w.click(); }, 1800))"],
  ['login', 'login.html', ''],
  ['login · correo', 'login.html?mode=login', ''],
];
const STUB_USER = `window.__STUB_SESSION = { access_token: 'x', user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@kodesh.app', user_metadata: { full_name: 'Test' } } };`;
const STUB = `(function(){
  const res = { data: [], error: null, count: 0 };
  const chain = () => new Proxy(function(){}, { get: (t, k) => k === 'then' ? (ok, ko) => Promise.resolve(res).then(ok, ko) : (k === 'single' || k === 'maybeSingle') ? () => Promise.resolve({ data: null, error: null }) : () => chain(), apply: () => chain() });
  const S = window.__STUB_SESSION || null;
  const auth = { getSession: async () => ({ data: { session: S }, error: null }), getUser: async () => ({ data: { user: S && S.user }, error: null }),
    onAuthStateChange: (cb) => { if (S) setTimeout(() => cb('SIGNED_IN', S), 50); return { data: { subscription: { unsubscribe() {} } } }; }, signOut: async () => ({}), mfa: { listFactors: async () => ({ data: { all: [], totp: [] } }), getAuthenticatorAssuranceLevel: async () => ({ data: {} }) } };
  window.supabase = { createClient: () => ({ auth, from: () => chain(), rpc: () => chain(), storage: { from: () => chain() }, functions: { invoke: async () => ({ data: null }) }, channel: () => chain(), removeChannel() {} }) };
})();`;
const EXTRA = (process.env.AUDIT_STEPS || '').split('|').filter(Boolean).map(x => x.split('::'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const report = [];
  const ONLY = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY, 'i') : null;
  for (const [name, page, js] of [...STEPS, ...EXTRA].filter(x => !ONLY || ONLY.test(x[0]))) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((LANG) => { try { localStorage.setItem('kodesh_lang', LANG); localStorage.setItem('welcome_seen', '1'); localStorage.setItem('kodesh_home_cal', '1'); localStorage.setItem('kodesh_guest', '1'); } catch (e) {} }, process.env.AUDIT_LANG || 'en');
    // Sin red: Supabase de mentira (sin sesión) para que las páginas terminen de pintar
    await ctx.route(/supabase-js|@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: (name.startsWith('cuenta') ? STUB_USER : '') + STUB }));
    await ctx.route(/\/api\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await ctx.route(/supabase\.co\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + page, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(2500);
    if (js) { await p.evaluate(js).catch(e => errs.push('paso: ' + e.message)); await p.waitForTimeout(1800); }
    const found = await p.evaluate(() => {
      const I = window.KodeshI18n; if (!I) return { vis: ['(sin i18n.js)'], miss: [] };
      const vis = new Set();
      const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const el = n.parentElement; if (!el || el.closest('script,style,.verse,[data-noi18n],textarea')) continue;
        const t = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (!t || !shown(el)) continue;
        if (I.looksEs(t)) { vis.add(t); continue; }
        // nombres y palabras sueltas en español sin tilde («Lamec», «Hch 7:4»): palabra con mayúscula que el diccionario traduce
        const voc = I.esVocab(t).filter(x => !['amen', 'shalom', 'torah', 'yeshua', 'yhwh', 'kodesh', 'abba', 'messiah', 'mar', 'sun', 'sat'].includes(x));
        if (voc.length) { vis.add(t + '   ⟵ ' + voc.join(', ')); continue; }
        const w = t.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g) || [];
        const bad = w.filter(x => I.esWord(x) && !['Asa', 'Dan', 'Gad', 'Job', 'Is', 'He', 'Am', 'Mi', 'Ex', 'Mar', 'Sal', 'Ziv', 'Bul'].includes(x));
        if (bad.length) vis.add(t + '   ⟵ ' + bad.join(', '));
      }
      document.querySelectorAll('input[placeholder],textarea[placeholder],[aria-label],[title]').forEach(e => { if (e.closest('[data-noi18n]') || !shown(e)) return; for (const a of ['placeholder', 'aria-label', 'title']) { const v = e.getAttribute(a); if (v && I.looksEs(v)) vis.add(`@${a}: ${v}`); } });
      return { vis: [...vis] };
    });
    if (process.env.AUDIT_SHOTS) await p.screenshot({ path: `${process.env.AUDIT_SHOTS}/${name.replace(/\W+/g, '_')}.png` });
    report.push({ name, page, vis: found.vis, errs });
    await ctx.close();
  }
  await b.close();
  let bad = 0;
  for (const r of report) {
    if (r.vis.length) bad += r.vis.length;
    console.log(`\n■ ${r.name} (${r.page}) — ${r.vis.length ? r.vis.length + ' en español' : 'OK'}${r.errs.length ? ' · errores: ' + r.errs.join(' | ').slice(0, 200) : ''}`);
    r.vis.forEach(t => console.log('   · ' + t.slice(0, 160)));
  }
  console.log(`\nTotal: ${bad} textos en español visibles en modo inglés.`);
  process.exit(bad ? 1 : 0);
})();
