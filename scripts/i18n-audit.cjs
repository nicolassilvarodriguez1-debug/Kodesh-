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
  ['login', 'login.html', ''],
  ['login · correo', 'login.html?mode=login', ''],
];
const EXTRA = (process.env.AUDIT_STEPS || '').split('|').filter(Boolean).map(x => x.split('::'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const report = [];
  for (const [name, page, js] of [...STEPS, ...EXTRA]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((LANG) => { try { localStorage.setItem('kodesh_lang', LANG); localStorage.setItem('welcome_seen', '1'); } catch (e) {} }, process.env.AUDIT_LANG || 'en');
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
        const w = t.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g) || [];
        const bad = w.filter(x => I.esWord(x) && !['Asa', 'Dan', 'Gad', 'Job', 'Is', 'He', 'Am', 'Mi', 'Ex'].includes(x));
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
