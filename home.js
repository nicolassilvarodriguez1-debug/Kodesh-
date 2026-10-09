/* KODESH — Página de inicio (lo primero al abrir la app).
   Saludo · Promesa del día (con audio) · Continúa tu lectura (el versículo
   exacto) · Parashá de la semana con la lectura de hoy (7 aliyot, una por
   día) · [opcional: Shabat y la próxima fiesta] · Explora Kodesh.
   El calendario bíblico va apagado por defecto: se activa en el propio inicio
   («¿Guardas el Shabat…?») o en Ajustes. Imágenes: insignias/inicio.json
   (fotos realistas desde el admin). Expone window.KodeshHome. */
(function () {
  'use strict';
  const IMG_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/inicio.json';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const BOOK_NAME = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;

  /* ── Ajustes ── */
  const homeOn = () => lsGet('kodesh_home_on') !== '0';
  const calOn = () => lsGet('kodesh_home_cal') === '1';
  const calAsked = () => lsGet('kodesh_home_cal') !== null;
  function paintToggles() {
    for (const [id, on] of [['homeToggle', homeOn()], ['homeCalToggle', calOn()]]) {
      const t = document.getElementById(id); if (t) { t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); }
    }
  }
  window.toggleHomeStart = function () { lsSet('kodesh_home_on', homeOn() ? '0' : '1'); paintToggles(); if (typeof showToast === 'function') showToast(homeOn() ? 'El inicio se mostrará al abrir' : 'La app abrirá en tu lectura'); };
  window.toggleHomeCalendar = function () { lsSet('kodesh_home_cal', calOn() ? '0' : '1'); paintToggles(); if (isOpen()) render(); };

  /* ── Datos ── */
  let IMG = rj('kodesh_home_img', {}), PARASHOT = null, CAL = null, ALIYOT = null, P = null;
  function load() {
    if (!P) P = Promise.all([
      fetch('./parashot-data.json').then(r => r.json()).then(j => { PARASHOT = j; }).catch(() => {}),
      fetch('./parashot-calendar.json').then(r => r.json()).then(j => { CAL = j; }).catch(() => {}),
      fetch('./data/aliyot.json').then(r => r.json()).then(j => { ALIYOT = j.a; }).catch(() => {}),
      fetch(`${IMG_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === 'object') { IMG = j; wj('kodesh_home_img', j); } }).catch(() => {}),
      window.KodeshVerseDay ? KodeshVerseDay.load().catch(() => {}) : null,
    ]).catch(() => { P = null; });
    return P;
  }
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const localDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  // La porción de esta semana: la del próximo Shabat (o el de hoy)
  function week() {
    if (!PARASHOT || !CAL) return null;
    const t = today0();
    for (const ds of Object.keys(CAL).sort()) {
      const sat = localDate(ds);
      if (sat >= t) return { nums: CAL[ds], sat, ps: CAL[ds].map(n => PARASHOT.find(p => p.num === n)).filter(Boolean) };
    }
    return null;
  }
  // Lectura de hoy: domingo = 1.ª … Shabat = 7.ª
  function todayAliya(w) {
    if (!ALIYOT || !w) return null;
    const list = ALIYOT[w.nums.join(',')]; if (!list) return null;
    const days = Math.round((w.sat - today0()) / 864e5);
    if (days > 6) return null;                      // la semana aún no empezó (no debería pasar)
    const n = 7 - days;                            // 1..7
    const [a, b] = list[n - 1];
    return { n, a, b, book: w.ps[0].book };
  }
  const aliyaKey = w => `kodesh_aliyot_${w.nums.join(',')}_${w.sat.getFullYear()}`;
  const aliyaDone = (w, n) => !!(rj(aliyaKey(w), {})[n]);
  function toggleAliya(w, n) { const m = rj(aliyaKey(w), {}); m[n] = !m[n]; wj(aliyaKey(w), m); }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
#homeView { position: fixed; inset: 0; z-index: 260; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); overflow-y: auto; -webkit-overflow-scrolling: touch; opacity: 0; pointer-events: none; transition: opacity .25s; font-family: var(--font-body, 'EB Garamond', serif); }
#homeView.on { opacity: 1; pointer-events: auto; }
body.home-on { overflow: hidden; }
.hm-in { max-width: 720px; margin: 0 auto; padding-bottom: calc(110px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); }
.hm-top { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 10px) 18px 6px; }
.hm-logo { display: flex; align-items: center; gap: 10px; font-family: var(--font-display, 'Cormorant Garamond', serif); font-size: 1.1rem; letter-spacing: 4px; color: var(--text); text-decoration: none; }
.hm-logo .he { font-family: 'Frank Ruhl Libre', serif; font-size: 1.45rem; letter-spacing: 0; color: var(--gold, #c9a84c); }
.hm-logo i { width: 1px; height: 22px; background: var(--border2, #2a2836); }
.hm-ic { display: flex; gap: 6px; }
.hm-ic { gap: 8px; }
.hm-ic button { width: 40px; height: 40px; border: 1px solid rgba(255,255,255,.16); background: rgba(10,10,16,.42); color: #f0d48a; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 20px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 2px 10px rgba(0,0,0,.25); }
html.light .hm-ic button { background: rgba(255,252,244,.82); color: #74540f; border-color: rgba(116,84,15,.22); box-shadow: 0 2px 10px rgba(70,50,15,.16); }
.hm-logo { text-shadow: 0 1px 10px rgba(0,0,0,.55); }
html.light .hm-logo { text-shadow: 0 1px 10px rgba(255,250,238,.9), 0 0 2px rgba(255,250,238,.9); }
.hm-hero { transition: background-image .5s ease; position: relative; margin-top: calc(-1 * (var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 56px)); padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 86px) 22px 26px; min-height: 250px; box-sizing: border-box; background-size: cover; background-position: center; }
.hm-hero.noimg { background: linear-gradient(180deg, #f1d9a8 0%, #e7c68c 55%, var(--bg) 100%); }
html:not(.light) .hm-hero.noimg { background: linear-gradient(180deg, #3a2a18 0%, #20170e 60%, var(--bg) 100%); }
.hm-hero::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 45%; background: linear-gradient(180deg, transparent, var(--bg)); pointer-events: none; }
.hm-hero > * { position: relative; z-index: 1; }
.hm-k { font-family: 'Cinzel', var(--font-display, serif); font-size: .66rem; letter-spacing: 3px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.hm-h1 { font-family: var(--font-display, 'Cormorant Garamond', serif); font-size: 3.4rem; font-weight: 600; line-height: 1; margin-top: 4px; }
.hm-sub { font-family: var(--font-display, serif); font-style: italic; font-size: 1.35rem; margin-top: 2px; }
.hm-wrap { padding: 0 16px; display: grid; gap: 16px; }
.hm-card { position: relative; border-radius: 18px; background: var(--bg2, #12111a); border: 1px solid var(--border2, #2a2836); overflow: hidden; }
.hm-card .bgimg { position: absolute; top: 0; right: 0; bottom: 0; width: 55%; background-size: cover; background-position: center; }
.hm-card .bgimg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--bg2, #12111a) 0%, transparent 60%); }
.hm-pad { position: relative; padding: 16px 18px; }
.hm-q { font-family: var(--font-display, serif); font-style: italic; font-size: 1.4rem; line-height: 1.3; margin-top: 8px; max-width: 78%; }
.hm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
.hm-chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 17px; border: 1px solid var(--border2, #2a2836); background: var(--bg, #0b0b12); color: var(--text-mid, #b8af9c); font: inherit; font-size: .92rem; cursor: pointer; }
.hm-ref { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 1.6px; text-transform: uppercase; color: var(--text-mid, #b8af9c); }
.hm-cont { background: #2a1f14; border-color: #2a1f14; color: #f6efdf; }
.hm-cont .bgimg::after { background: linear-gradient(90deg, #2a1f14 0%, rgba(42,31,20,.2) 70%); }
.hm-cont h3 { margin: 0; font-family: var(--font-display, serif); font-size: 1.65rem; font-weight: 600; display: flex; align-items: center; gap: 10px; }
.hm-cont .t { font-size: 1.05rem; margin-top: 4px; }
.hm-cont .x { font-size: .92rem; color: #d3c4a2; max-width: 68%; margin-top: 2px; font-style: italic; }
.hm-prog { height: 4px; border-radius: 2px; background: rgba(255,255,255,.15); margin: 12px 0; }
.hm-prog i { display: block; height: 4px; border-radius: 2px; background: #e8c27a; }
.hm-btns { display: flex; gap: 8px; }
.hm-go { flex: 1; height: 48px; border: none; border-radius: 12px; background: #c9a24e; color: #241d12; font: inherit; font-size: 1.05rem; cursor: pointer; }
.hm-play { width: 52px; height: 48px; border: none; border-radius: 12px; background: rgba(255,255,255,.12); color: #e8c27a; font-size: 1.1rem; cursor: pointer; }
.hm-sh { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.hm-sh a { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold, #c9a84c); text-decoration: none; }
.hm-par .pimg { display: block; height: 170px; background-size: cover; background-position: center; background-color: #cbb48a; }
.hm-par .pimg.noimg { background: linear-gradient(160deg, #e9dcc0 0%, #cbb48a 60%, #9a8058 100%); }
html:not(.light) .hm-par .pimg.noimg { background: linear-gradient(160deg, #4a3c28 0%, #2a2014 70%, #12111a 100%); }
.hm-par h3 { margin: 0; font-family: var(--font-display, serif); font-size: 2.2rem; font-weight: 600; line-height: 1; display: flex; align-items: baseline; gap: 10px; }
.hm-par h3 span { font-family: 'Frank Ruhl Libre', serif; font-size: 1.5rem; color: var(--gold, #c9a84c); }
.hm-par .tm { font-family: var(--font-display, serif); font-style: italic; font-size: 1.1rem; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hm-today { display: flex; align-items: center; gap: 10px; width: 100%; margin: 12px 0; padding: 10px 12px; border-radius: 12px; border: none; background: var(--bg3, rgba(201,168,76,.08)); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.hm-today .ck { width: 26px; height: 26px; border-radius: 13px; border: 2px solid var(--gold, #c9a84c); box-sizing: border-box; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: .8rem; background: none; cursor: pointer; }
.hm-today .ck.on { background: var(--gold, #c9a84c); }
.hm-reads { display: flex; gap: 8px; }
.hm-reads a { flex: 1; border-left: 1px solid var(--border2, #2a2836); padding-left: 8px; text-decoration: none; color: inherit; }
.hm-reads a:first-child { border-left: none; padding-left: 0; }
.hm-reads b { display: block; font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 1.4px; text-transform: uppercase; color: var(--gold, #c9a84c); font-weight: 600; }
.hm-reads small { font-size: .82rem; color: var(--text-mid, #b8af9c); }
.hm-ask { display: flex; gap: 12px; align-items: center; padding: 14px 16px; }
.hm-ask p { margin: 0; flex: 1; font-size: .98rem; color: var(--text-mid, #b8af9c); }
.hm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.hm-tile { position: relative; display: flex; align-items: center; gap: 10px; min-height: 76px; padding: 12px; border-radius: 14px; border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; }
.hm-tile .bgimg { position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background-size: cover; background-position: center; opacity: .55; }
.hm-tile .bgimg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--bg2, #12111a) 0%, transparent 80%); }
.hm-tile > svg, .hm-tile > span { position: relative; }
.hm-tile b { display: block; font-family: 'Cinzel', serif; font-size: .66rem; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 600; }
.hm-tile small { display: block; font-size: .85rem; color: var(--text-mid, #b8af9c); line-height: 1.25; margin-top: 2px; }
.hm-tile svg { color: var(--gold, #c9a84c); flex-shrink: 0; }
@media (min-width: 900px) { .hm-grid { grid-template-columns: 1fr 1fr 1fr; } .hm-hero { min-height: 320px; } }`;
  document.head.appendChild(css);

  /* ── Pantalla ── */
  let el = null, audio = null;
  const isOpen = () => !!(el && el.classList.contains('on'));
  function greet() { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
  function userName() {
    try {
      if (typeof userProfile !== 'undefined' && userProfile && userProfile.display_name) return userProfile.display_name.split(' ')[0];
      if (typeof currentUser !== 'undefined' && currentUser) { const m = currentUser.user_metadata || {}; return (m.display_name || m.full_name || '').split(' ')[0]; }
    } catch (e) {}
    return '';
  }
  // Portada según el tema: claro → Jerusalén de día; oscuro → Jerusalén de noche
  const night = () => !document.documentElement.classList.contains('light');
  const ICON = {
    search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    theme: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    book: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e8c27a" stroke-width="1.7" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5z"/><path d="M12 6v13"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 15V3M8 7l4-4 4 4M5 12v7h14v-7"/></svg>',
  };
  const TILES = [
    ['ex_asistente', 'Asistente', 'Pregunta sobre las Escrituras', '<path d="M4 5h16v11H9l-5 4z"/>', () => { hide(); if (typeof openAssistant === 'function') openAssistant(); }],
    ['ex_ciclo', 'Ciclo de estudio', '54 porciones de la Torá', '<path d="M4 9l8-5 8 5M5 9v10M19 9v10M9 9v10M15 9v10M3 20h18"/>', () => { location.href = 'parashot.html'; }],
    ['ex_mapas', 'Mapas', 'Viajes y lugares en el globo', '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>', () => { if (window.KodeshMaps) KodeshMaps.openIndex(); }],
    ['ex_buscar', 'Buscar', 'Encuentra cualquier pasaje', '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', () => { hide(); if (typeof openSearch === 'function') openSearch(); }],
    ['ex_estudio', 'Mi estudio', 'Tus notas y estudios', '<path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/>', () => { location.href = 'estudio.html'; }],
    ['ex_tutorial', 'Tutorial', 'Aprende a usar Kodesh', '<circle cx="12" cy="12" r="8"/><path d="M15 9l-2 4-4 2 2-4z"/>', () => { location.href = 'ayuda.html'; }],
  ];
  const bg = key => IMG[key] ? ` style="background-image:url('${esc(IMG[key])}')"` : '';

  async function render() {
    if (!el) return;
    const vd = window.KodeshVerseDay && KodeshVerseDay.today && KodeshVerseDay.today();
    let prom = vd ? { text: vd.text, ref: vd.refText, audio: vd.audio, dur: vd.dur, book: vd.book, ch: vd.chapter, v: vd.v1 } : null;
    if (!prom && typeof getDailyPromise === 'function') {
      try { const x = getDailyPromise((typeof currentUser !== 'undefined' && currentUser && currentUser.id) || 'kodesh'); if (x) prom = { text: x.texto, ref: x.ref, book: x.libro, ch: x.cap, v: x.verso }; } catch (e) {}
    }
    const last = typeof readLastPosition === 'function' ? readLastPosition() : null;
    const w = week(), p = w && w.ps[0], al = todayAliya(w);
    const name = userName();
    const heroKey = night() ? (IMG.hero_night ? 'hero_night' : 'hero_day') : 'hero_day';
    let lastText = '', lastInfo = '', pct = 0;
    if (last) {
      try {
        const B = typeof loadBibleData === 'function' ? await loadBibleData() : null;
        const ch = B && B[last.book] && B[last.book][String(last.chapter)];
        const v = last.verse > 1 ? last.verse : 1;
        if (ch && ch[String(v)]) lastText = ch[String(v)].length > 90 ? ch[String(v)].slice(0, 88).replace(/\s+\S*$/, '') + '…' : ch[String(v)];
        const bk = typeof getAllBooks === 'function' ? getAllBooks().find(b => b.id === last.book) : null;
        if (bk) pct = Math.round(last.chapter / bk.chapters * 100);
      } catch (e) {}
      lastInfo = `${BOOK_NAME(last.book)} ${last.chapter}${last.verse > 1 ? ` · desde el versículo ${last.verse}` : ''}`;
    }
    el.innerHTML = `<div class="hm-in">
      <div class="hm-top"><a class="hm-logo" href="#" data-act="noop"><span class="he">קדש</span><i></i><span>KODESH</span></a>
        <div class="hm-ic"><button data-act="search" aria-label="Buscar">${ICON.search}</button><button data-act="theme" aria-label="Cambiar tema">${ICON.theme}</button><button data-act="profile" aria-label="Perfil">${ICON.user}</button></div></div>
      <section class="hm-hero${IMG[heroKey] ? '' : ' noimg'}" data-hero${bg(heroKey)}>
        <div class="hm-k">${greet()}</div><div class="hm-h1">Hoy</div><div class="hm-sub">${name ? `Bendiciones, ${esc(name)}` : 'Bienvenido a Kodesh'}</div>
      </section>
      <div class="hm-wrap">
        ${prom ? `<div class="hm-card">${IMG.promesa ? `<span class="bgimg"${bg('promesa')}></span>` : ''}<div class="hm-pad">
          <div class="hm-sh"><span class="hm-k">❝ Promesa del día</span><button class="hm-chip" data-act="share" aria-label="Compartir" style="height:30px;padding:0 10px">${ICON.share}</button></div>
          <div class="hm-q">«${esc(prom.text)}»</div>
          <div class="hm-row">${prom.audio ? '<button class="hm-chip" data-act="play">▸ Escuchar</button>' : '<span></span>'}<button class="hm-ref" data-act="promverse" style="border:none;background:none;cursor:pointer">— ${esc(prom.ref)}</button></div>
        </div></div>` : ''}
        <div class="hm-card hm-cont">${IMG.continua ? `<span class="bgimg"${bg('continua')}></span>` : ''}<div class="hm-pad">
          <h3>${ICON.book}${last ? 'Continúa tu lectura' : 'Empieza a leer'}</h3>
          ${last ? `<div class="t">${esc(lastInfo)}</div>${lastText ? `<div class="x">«${esc(lastText)}»</div>` : ''}<div class="hm-prog"><i style="width:${Math.max(3, pct)}%"></i></div>`
            : '<div class="t" style="margin:6px 0 12px">Comienza por Génesis 1 o por el evangelio de Juan.</div>'}
          <div class="hm-btns">${last ? '<button class="hm-go" data-act="continue">Seguir leyendo →</button><button class="hm-play" data-act="listen" aria-label="Escuchar el capítulo">▸</button>'
            : '<button class="hm-go" data-act="gen1">Génesis 1</button><button class="hm-go" data-act="jhn1" style="background:rgba(255,255,255,.12);color:#e8c27a">Juan 1</button>'}</div>
        </div></div>
        ${p ? `<div class="hm-sh"><span class="hm-k">Parashá de la semana</span><a href="parashot.html">Ver más ›</a></div>
        <div class="hm-card hm-par"><a href="parashot.html" class="pimg${IMG['p' + p.num] ? '' : ' noimg'}"${bg('p' + p.num)} aria-label="Abrir el ciclo de estudio"></a><div class="hm-pad">
          <h3>${esc(w.ps.map(x => x.nombre).join(' – '))}<span lang="he">${esc(p.heb)}</span></h3>
          <div class="hm-k" style="color:var(--text-mid);margin-top:6px">${esc(p.torah)}</div>
          <div class="tm">${esc(p.tema)}</div>
          ${al ? `<div class="hm-today"><button class="ck${aliyaDone(w, al.n) ? ' on' : ''}" data-act="aliya" aria-label="Marcar la lectura de hoy">${aliyaDone(w, al.n) ? '✓' : ''}</button><button data-act="readaliya" style="flex:1;border:none;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0"><b>Lectura de hoy</b> · ${esc(BOOK_NAME(al.book))} ${esc(al.a)}–${esc(al.b.split(':')[0] === al.a.split(':')[0] ? al.b.split(':')[1] : al.b)}</button><span style="color:var(--text-mid);font-size:.85rem">${al.n} de 7</span></div>` : '<div style="height:12px"></div>'}
          <div class="hm-reads">${[['Torá', p.torah], ['Haftará', p.haftarah], ['Brit Jadashá', p.mesianica]].map(([l, r]) => `<a href="#" data-ref="${esc(r)}"><b>${l}</b><small>${esc(r)}</small></a>`).join('')}</div>
        </div></div>` : ''}
        ${calOn() ? '<div data-moedim-home hidden></div>' : ''}
        ${!calAsked() ? `<div class="hm-card hm-ask"><p>¿Guardas el Shabat y las fiestas bíblicas? Puedes verlos aquí en tu inicio.</p><div style="display:grid;gap:6px"><button class="hm-chip" data-act="calyes" style="color:var(--gold)">Mostrar</button><button class="hm-chip" data-act="calno">Ahora no</button></div></div>` : ''}
        <div class="hm-k" style="margin-top:4px">Explora Kodesh</div>
        <div class="hm-grid">${TILES.map(([k, t, s, path], i) => `<button class="hm-tile" data-tile="${i}">${IMG[k] ? `<span class="bgimg"${bg(k)}></span>` : ''}<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
      </div></div>`;
    wire(prom, w, al);
    const mh = el.querySelector('[data-moedim-home]'); if (mh && window.KodeshMoedim) KodeshMoedim.renderHome(mh);
  }
  // «Génesis 6:9–11:32» → { book, chapter, verse } (bible-ref.js)
  function refOf(ref) {
    const first = String(ref || '').split(/[–—]|-(?=\s*\d+:)/)[0].trim();
    const r = window.KodeshRef ? KodeshRef.parseRef(first) : null;
    return r && !r.error && r.chapter ? { book: r.bookId, ch: r.chapter, v: r.verse || 1 } : null;
  }
  function goVerse(book, ch, v) {
    hide();
    if (typeof selectBook === 'function') selectBook(book);
    if (typeof loadChapter === 'function') loadChapter(book, ch).then(() => {
      if (v > 1) setTimeout(() => { const e = document.querySelector(`.verse[data-verse="${v}"]`); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 400);
    });
  }
  function wire(prom, w, al) {
    const on = (act, fn) => { const b = el.querySelector(`[data-act="${act}"]`); if (b) b.onclick = e => { e.preventDefault(); fn(e); }; };
    on('noop', () => {});
    on('search', () => { hide(); if (typeof openSearch === 'function') openSearch(); });
    on('theme', () => { if (typeof toggleTheme === 'function') toggleTheme(); });
    on('profile', () => { if (typeof openProfile === 'function') openProfile(); });
    on('continue', () => hide());
    on('listen', () => { hide(); if (typeof window.onChapterAudio === 'function') setTimeout(() => window.onChapterAudio(), 300); });
    on('gen1', () => goVerse('GEN', 1, 1));
    on('jhn1', () => goVerse('JHN', 1, 1));
    on('promverse', () => { if (prom && prom.book) goVerse(prom.book, prom.ch, prom.v); });
    on('share', async () => {
      const v = window.KodeshVerseDay && KodeshVerseDay.today && KodeshVerseDay.today();
      if (v && KodeshVerseDay.shareStory) return KodeshVerseDay.shareStory(v);
      if (!prom) return;
      const text = `«${prom.text}» — ${prom.ref}\nKodesh Bible`;
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); if (typeof showToast === 'function') showToast('Copiado'); } } catch (e) {}
    });
    on('play', e => {
      if (!prom || !prom.audio) return;
      const b = e.currentTarget;
      if (!audio) { audio = new Audio(prom.audio); audio.addEventListener('ended', () => { b.textContent = '▸ Escuchar'; }); audio.addEventListener('pause', () => { b.textContent = '▸ Escuchar'; }); audio.addEventListener('play', () => { b.textContent = '❚❚ Pausa'; }); }
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    });
    on('aliya', () => { toggleAliya(w, al.n); render(); });
    on('readaliya', () => { const [c, v] = al.a.split(':').map(Number); goVerse(al.book, c, v); });
    on('calyes', () => { lsSet('kodesh_home_cal', '1'); paintToggles(); render(); });
    on('calno', () => { lsSet('kodesh_home_cal', '0'); paintToggles(); render(); });
    el.querySelectorAll('[data-ref]').forEach(a => a.onclick = e => { e.preventDefault(); const r = refOf(a.dataset.ref); if (r) goVerse(r.book, r.ch, r.v); });
    el.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => TILES[+b.dataset.tile][4]());
  }
  function navActive(home) {
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    const b = document.getElementById(home ? 'mnav-inicio' : 'mnav-biblia'); if (b) b.classList.add('active');
  }
  async function show() {
    if (!el) el = document.getElementById('homeView');
    if (!el) { el = document.createElement('div'); el.id = 'homeView'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Inicio'); document.body.appendChild(el); }
    navActive(true);
    // La promesa ya está en el inicio: no se abre la tarjeta flotante hoy
    try { if (typeof getLocalDateStr === 'function') localStorage.setItem('kodesh_promise_' + getLocalDateStr(), '1'); } catch (e) {}
    await load();
    await render();
    el.scrollTop = 0;
    el.removeAttribute('style'); el.classList.remove('boot');
    requestAnimationFrame(() => el.classList.add('on'));
    document.body.classList.add('home-on');
    navActive(true);
  }
  function hide() {
    if (!el) return;
    el.classList.remove('on'); document.body.classList.remove('home-on');
    if (audio) { audio.pause(); audio = null; }
    navActive(false);
  }
  // Botón «Biblia» de la barra: desde el inicio vuelve a la lectura; si ya se está leyendo, abre libros
  window.onBibliaNav = function () { if (isOpen()) hide(); else if (typeof openNav === 'function') openNav(); };
  // Marcadores y Estudiar desde la barra: primero se cierra el inicio, para que lo que abren se vea
  function wrapNav() {
    for (const name of ['mobileNavTo', 'openAssistant']) {
      const f = window[name];
      if (typeof f !== 'function' || f.__home) continue;
      const w = function () { if (isOpen()) hide(); return f.apply(this, arguments); };
      w.__home = true; window[name] = w;
    }
  }
  wrapNav(); document.addEventListener('DOMContentLoaded', wrapNav); window.addEventListener('load', wrapNav);
  // Al cambiar de tema, cambia la portada (con un fundido suave)
  new MutationObserver(() => {
    const h = el && el.querySelector('[data-hero]'); if (!h) return;
    const key = night() ? (IMG.hero_night ? 'hero_night' : 'hero_day') : 'hero_day';
    if (!IMG[key]) return;
    h.style.backgroundImage = `url('${IMG[key]}')`;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.KodeshHome = { show, hide, isOpen, render };

  // Al abrir la app sin un enlace a un capítulo concreto
  const qs = new URLSearchParams(location.search);
  const deep = ['book', 'chapter', 'verse', 'study', 'play', 'upgrade', 'q'].some(k => qs.has(k));
  document.addEventListener('DOMContentLoaded', () => { paintToggles(); if (homeOn() && !deep && document.getElementById('mainContent')) show(); });
})();
