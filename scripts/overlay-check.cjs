// KODESH — Revisa que ninguna hoja cerrada (invisible) quede tapando la pantalla.
// Abre y cierra cada hoja/panel y luego prueba una cuadrícula de puntos: si el elemento que recibe el toque está
// dentro de algo invisible (opacity 0 / visibility hidden), es un botón fantasma (como el «Compartir» de Pésaj
// que abría la hoja de compartir al tocar el perfil).
// Uso: python3 -m http.server 8765 & ; NODE_PATH=$(npm root -g) node scripts/overlay-check.cjs 8765
const { chromium } = require('playwright');
const PORT = process.argv[2] || 8765, BASE = `http://localhost:${PORT}/`;
const STUB = `window.supabase={createClient(){const ch=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(ok)=>Promise.resolve({data:null,error:null}).then(ok):()=>ch(),apply:()=>ch()});return{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},getUser:async()=>({data:{user:null}})},from:()=>ch(),rpc:()=>ch(),storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}}}};`;
const ESC = "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))";
const click = sel => `(() => { const b = document.querySelector('${sel}'); if (b) b.click(); })()`;
const STEPS = [
  ['inicio (sin abrir nada)', '0', '0'],
  ['fiesta (Pésaj)', "KodeshMoedim.open('pesaj')", click('.md-ov [data-x]')],
  ['Shabat', "KodeshMoedim.open('shabat')", click('.md-ov [data-x]')],
  ['luna', 'KodeshLuna.open()', ESC],
  ['línea de tiempo', 'KodeshTiempo.open()', ESC],
  ['mapas', 'KodeshMaps.openIndex()', ESC],
  ['personaje', "KodeshPeople.open('moses_2108')", ESC],
  ['armonía', 'KodeshParallels.harmony()', ESC],
  ['fiestas del lector', "KodeshFeasts.open({ key: 'LEV:23', tab: 'fiesta' })", ESC],
];
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const lang of ['es', 'en']) for (const [name, openJs, closeJs] of STEPS) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(l => { localStorage.setItem('kodesh_lang', l); localStorage.setItem('kodesh_welcome_seen', '1'); localStorage.setItem('kodesh_guest', '1'); localStorage.setItem('kodesh_home_cal', '1'); }, lang);
    await ctx.route(/supabase-js|@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await ctx.route(/supabase\.co\/|\/api\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const p = await ctx.newPage();
    await p.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await p.evaluate(openJs).catch(() => {});
    await p.waitForTimeout(1200);
    await p.evaluate(closeJs).catch(() => {});
    await p.waitForTimeout(900);
    const ghosts = await p.evaluate(() => {
      const out = new Set();
      const hidden = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (+cs.opacity === 0 || cs.visibility === 'hidden') return e; } return null; };
      for (let x = 10; x < innerWidth; x += 24) for (let y = 10; y < innerHeight; y += 24) {
        const el = document.elementFromPoint(x, y); if (!el) continue;
        const h = hidden(el); if (h) out.add(`${(h.className || h.id || h.tagName).toString().slice(0, 40)} → ${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? ' «' + el.getAttribute('aria-label') + '»' : ''}`);
      }
      return [...out];
    });
    if (ghosts.length) { bad += ghosts.length; console.log(`✗ ${lang} · ${name}:\n   ${ghosts.join('\n   ')}`); } else console.log(`✓ ${lang} · ${name}`);
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `\n${bad} zonas invisibles que reciben toques.` : '\nNinguna hoja cerrada tapa la pantalla.');
  process.exit(bad ? 1 : 0);
})();
