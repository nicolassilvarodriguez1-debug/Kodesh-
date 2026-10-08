/* KODESH — Fiestas y raíces hebreas.
   - A · Subrayado con trasfondo: las frases que solo se entienden desde la
     fiesta o la costumbre se subrayan en azul; al tocar, el lexicón abre como
     siempre con un aviso «🕎 Raíz hebrea · … Ver».
   - B · El capítulo dentro de la fiesta: una pastilla arriba del capítulo.
   - C · Calendario de las fiestas de Levítico 23 con las fechas de este año.
   - D · Dónde ocurrió en el Templo: esquema con los lugares que nombra el texto.
   - E · La fiesta de punta a punta: mandamiento, historia, profecía y cumplimiento.
   Datos curados: data/fiestas.json (scripts/fiestas/build.py valida citas).
   Notas de raíces: admin → api/roots-pregen.js → bible-audio/raices/index.json.
   Expone window.KodeshFeasts. */
(function () {
  'use strict';
  const REMOTE = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/bible-audio/raices/index.json';
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const bookName = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;
  const nice = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](.+)$/.exec(r); return m ? `${bookName(m[1])} ${m[2].replace('-', '–')}` : r; };
  const readUrl = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](\d+)(?::(\d+))?/.exec(r); return m ? `index.html?book=${m[1]}&chapter=${m[2]}${m[3] ? '&verse=' + m[3] : ''}` : 'index.html'; };
  const TEMA = { templo: 'El Templo', costumbre: 'Costumbre', 'torá': 'La Torá', idioma: 'Expresión hebrea', shabat: 'Shabat' };

  let DATA = null, ROOTS = rj('kodesh_fr_roots', null), dataP = null, rootsP = null;
  function loadData() { if (!dataP) dataP = fetch('./data/fiestas.json').then(r => r.json()).then(j => (DATA = j)).catch(() => { dataP = null; return null; }); return dataP; }
  function loadRoots() {
    if (!rootsP) rootsP = fetch(`${REMOTE}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.items) { ROOTS = { items: j.items }; wj('kodesh_fr_roots', ROOTS); } return ROOTS; }).catch(() => ROOTS);
    return rootsP;
  }
  const fest = id => DATA && DATA.f.find(f => f.id === id);
  const notesOf = key => (ROOTS && ROOTS.items && ROOTS.items[key]) || [];
  const placesOf = key => (DATA ? DATA.templo.filter(p => p.ch.includes(key)) : []);
  const temaName = t => (fest(t) ? fest(t).n : TEMA[t] || 'Raíz hebrea');

  /* ── Calendario: fechas de este año con el calendario hebreo del sistema ── */
  let CAL = null;
  function calendar() {
    if (CAL) return CAL;
    CAL = {};
    try {
      const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' });
      const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - 8);
      for (let i = 0; i < 400; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const p = fmt.formatToParts(d), m = (p.find(x => x.type === 'month') || {}).value, day = +(p.find(x => x.type === 'day') || {}).value;
        const k = `${m === 'Adar II' ? 'Adar' : m}|${day}`;
        if (m === 'Adar I') continue;                 // Purim cae en Adar II en año bisiesto
        (CAL[k] = CAL[k] || []).push(d);
      }
    } catch (e) {}
    return CAL;
  }
  // Próxima fecha (o la actual si la fiesta está en curso)
  function dateOf(f) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const first of calendar()[`${f.hd[0]}|${f.hd[1]}`] || []) {
      const end = new Date(first); end.setDate(end.getDate() + (f.dias || 1) - 1);
      if (end >= today) return { start: first, end, now: first <= new Date() };
    }
    return null;
  }
  const fmtDay = d => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

  /* ── Ajustes ── */
  const isOn = () => { try { return localStorage.getItem('kodesh_fr_on') !== '0'; } catch (e) { return true; } };
  function paintToggle() {
    document.documentElement.classList.toggle('fr-off', !isOn());
    const t = document.getElementById('frToggle');
    if (t) { t.classList.toggle('on', isOn()); t.setAttribute('aria-checked', String(isOn())); }
  }
  window.toggleFeasts = function () {
    try { localStorage.setItem('kodesh_fr_on', isOn() ? '0' : '1'); } catch (e) {}
    paintToggle();
    if (typeof showToast === 'function') showToast(isOn() ? 'Fiestas y raíces activadas' : 'Fiestas y raíces desactivadas');
  };

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.fr-pill { display: flex; align-items: center; gap: 8px; width: 100%; margin: 0 0 12px; padding: 8px 12px; border-radius: 14px; border: 1px solid rgba(90,156,240,.35); background: rgba(90,156,240,.07); color: var(--text, #e9e3d3); font: inherit; font-size: .9rem; text-align: left; cursor: pointer; }
.fr-pill .fr-he { font-family: 'Frank Ruhl Libre', serif; color: #5a9cf0; font-size: 1.05rem; }
.fr-pill b { font-weight: 600; }
.fr-pill small { color: var(--text-mid, #b8af9c); font-size: .85rem; }
.fr-pill .fr-go { margin-left: auto; color: #5a9cf0; }
.word.fr-u { text-decoration: underline solid #5a9cf0 2px; text-underline-offset: 4px; }
html.fr-off .fr-pill { display: none !important; }
html.fr-off .word.fr-u { text-decoration: none; }
.fr-ov { position: fixed; inset: 0; z-index: 579; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.fr-ov.open { opacity: 1; pointer-events: auto; }
.fr-sheet { width: min(720px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); overflow: hidden; }
.fr-ov.open .fr-sheet { transform: none; }
.fr-head { padding: 16px 18px 6px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; flex-shrink: 0; }
.fr-kick { font-family: 'Cinzel', serif; font-size: .6rem; letter-spacing: 2.5px; text-transform: uppercase; color: #5a9cf0; }
.fr-h { font-family: var(--font-display, serif); font-size: 1.6rem; font-weight: 600; line-height: 1.15; margin-top: 2px; }
.fr-heb { font-family: 'Frank Ruhl Libre', serif; font-size: 1.4rem; color: #5a9cf0; }
.fr-sub { color: var(--text-mid, #b8af9c); font-size: .95rem; margin-top: 2px; }
.fr-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.fr-tabs { display: flex; gap: 6px; padding: 6px 18px 10px; overflow-x: auto; flex-shrink: 0; }
.fr-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 18px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.fr-tab.on { border-color: #5a9cf0; color: #5a9cf0; }
.fr-body { flex: 1; overflow: auto; padding: 4px 18px 28px; }
.fr-sec { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2px; text-transform: uppercase; color: #5a9cf0; margin: 18px 0 6px; }
.fr-p { line-height: 1.6; font-size: 1.02rem; }
.fr-ul { margin: 0; padding-left: 18px; line-height: 1.55; font-size: 1rem; }
.fr-ul li { margin: 4px 0; }
.fr-card { border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); border-radius: 14px; padding: 12px 14px; margin: 8px 0; }
.fr-card.here { border-color: rgba(90,156,240,.6); }
.fr-card .fr-q { color: #5a9cf0; font-size: .8rem; margin-top: 3px; }
.fr-card[data-go], .fr-card[data-fest] { cursor: pointer; }
.fr-note h4 { margin: 0; font-family: var(--font-display, serif); font-size: 1.2rem; font-weight: 600; }
.fr-note .fr-vv { color: var(--text-mid, #b8af9c); font-size: .88rem; margin-bottom: 4px; }
.fr-note .fr-vv u { text-decoration: underline solid #5a9cf0 2px; text-underline-offset: 3px; }
.fr-refs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.fr-ref { border: 1px solid var(--border2, #2a2836); border-radius: 12px; padding: 3px 9px; font-size: .85rem; color: var(--text-mid, #b8af9c); text-decoration: none; background: none; font-family: inherit; cursor: pointer; }
.fr-src { font-size: .8rem; color: var(--text-dim, #6e6656); margin-top: 6px; }
.fr-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.fr-strip { display: flex; justify-content: space-between; gap: 4px; }
.fr-strip.fall { justify-content: space-around; }
.fr-fe { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 25%; text-align: center; background: none; border: none; color: var(--text, #e9e3d3); font: inherit; cursor: pointer; padding: 0; }
.fr-fe i { width: 42px; height: 42px; border-radius: 21px; border: 1.5px solid var(--border2, #2a2836); display: flex; align-items: center; justify-content: center; font-family: 'Frank Ruhl Libre', serif; font-style: normal; font-size: 1.05rem; color: var(--text-mid, #b8af9c); }
.fr-fe.on i { background: #5a9cf0; border-color: #5a9cf0; color: #0b0b12; }
.fr-fe span { font-size: .8rem; line-height: 1.15; }
.fr-fe small { font-size: .72rem; color: var(--text-dim, #6e6656); }
.fr-fe.on small { color: #5a9cf0; }
.fr-line { height: 2px; background: var(--border2, #2a2836); margin: 14px 20px; }
.fr-thread { position: relative; padding-left: 40px; }
.fr-thread:before { content: ''; position: absolute; left: 13px; top: 10px; bottom: 10px; width: 2px; background: rgba(90,156,240,.45); }
.fr-step { position: relative; padding: 4px 0 16px; cursor: pointer; }
.fr-step:before { content: ''; position: absolute; left: -36px; top: 4px; width: 24px; height: 24px; border-radius: 12px; border: 2px solid #5a9cf0; background: var(--bg, #0b0b12); box-sizing: border-box; }
.fr-step.y:before { background: #5a9cf0; }
.fr-step b { display: block; font-family: 'Cinzel', serif; font-size: .6rem; letter-spacing: 2px; text-transform: uppercase; color: #5a9cf0; font-weight: 500; }
.fr-step span { font-size: 1.02rem; line-height: 1.45; }
.fr-step small { display: block; color: var(--text-dim, #6e6656); font-size: .82rem; }
.fr-tpl svg { width: 100%; height: auto; display: block; max-width: 420px; margin: 0 auto; }
.fr-tpl .z { cursor: pointer; }`;
  document.head.appendChild(css);

  /* ── Hoja ── */
  let ov = null, ctx = null;
  function sheet() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'fr-ov';
      ov.innerHTML = '<section class="fr-sheet" role="dialog" aria-label="Fiestas y raíces hebreas"></section>';
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov.querySelector('.fr-sheet');
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }

  function rootsHtml() {
    const notes = notesOf(ctx.key);
    if (!notes.length) return '<p class="fr-p" style="color:var(--text-mid,#b8af9c)">Este capítulo aún no tiene notas de raíces hebreas.</p>';
    const verse = v => { const el = ctx.container && ctx.container.querySelector(`.verse[data-verse="${v}"]`); return el ? el.textContent.replace(/^\s*\d+\s*/, '').trim() : ''; };
    return notes.map((n, i) => {
      let vt = esc(verse(n.v));
      if (vt) { const k = norm(n.frase); const words = vt.split(' '); for (let s = 0; s < words.length; s++) { let acc = ''; for (let e = s; e < Math.min(words.length, s + 10); e++) { acc = norm(words.slice(s, e + 1).join(' ')); if (acc === k) { words[s] = '<u>' + words[s]; words[e] = words[e] + '</u>'; s = words.length; break; } if (!k.startsWith(acc)) break; } } vt = words.join(' '); }
      return `<div class="fr-card fr-note${ctx.note === i ? ' here' : ''}" id="frn${i}">
        <div class="fr-kick">${esc(temaName(n.tema))}${n.he ? ` · <span lang="he" dir="rtl" style="font-family:'Frank Ruhl Libre',serif;letter-spacing:0;text-transform:none;font-size:.95rem">${esc(n.he)}</span>` : ''}</div>
        <h4>${esc(n.titulo)}</h4>
        <div class="fr-vv">v. ${n.v}${vt ? ` · ${vt}` : ` · «${esc(n.frase)}»`}</div>
        <div class="fr-p">${esc(n.texto)}</div>
        ${n.fuente ? `<div class="fr-src">Fuente: ${esc(n.fuente)}</div>` : ''}
        ${(n.refs && n.refs.length) || fest(n.tema) ? `<div class="fr-refs">${(n.refs || []).map(r => `<a class="fr-ref" href="${readUrl(r)}">${esc(nice(r))}</a>`).join('')}${fest(n.tema) ? `<button class="fr-ref" data-fest="${esc(n.tema)}">Sobre ${esc(fest(n.tema).n)} →</button>` : ''}</div>` : ''}
      </div>`;
    }).join('') + '<p class="fr-src">Notas preparadas con IA y revisadas contra el texto bíblico.</p>';
  }
  function feastHtml(f) {
    const d = dateOf(f), ch = ctx.key && DATA.ch[ctx.key];
    const others = ch ? ch[0].filter(x => x !== f.id && fest(x)) : [];
    return `${others.length ? `<div class="fr-chips" style="margin-top:0">${ch[0].map(x => `<button class="fr-tab${x === f.id ? ' on' : ''}" data-fest="${x}">${esc(fest(x).n)}</button>`).join('')}</div>` : ''}
      ${ch ? `<div class="fr-card here"><div class="fr-kick">En este capítulo</div><div class="fr-p" style="margin-top:4px">${esc(ch[1])}</div></div>` : ''}
      <div class="fr-sec">Qué mandó YHWH</div><ul class="fr-ul">${f.que.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="fr-sec">En tiempos de Yeshúa</div><ul class="fr-ul">${f.siglo.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${d ? `<div class="fr-card" style="border-color:rgba(90,156,240,.5)"><div class="fr-kick">${d.now ? 'Se celebra ahora' : 'Este año'}</div><div class="fr-p" style="margin-top:2px">${esc(fmtDay(d.start))}${f.dias > 1 ? ` al ${esc(fmtDay(d.end))}` : ''}</div><div class="fr-src">Las fiestas comienzan al atardecer del día anterior.${f.nota ? ' ' + esc(f.nota.replace(/^Este año: /, '')) : ''}</div></div>` : ''}
      <div class="fr-sec">Para leer</div><div class="fr-refs">${[f.mand, ...f.lee].filter((x, i, a) => a.indexOf(x) === i).map(r => `<a class="fr-ref" href="${readUrl(r)}">${esc(nice(r))}</a>`).join('')}</div>`;
  }
  const initial = he => he.normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/^יום\s+/, '').replace(/^ה(?=כ)/, '')[0];
  function calHtml(f) {
    const fe = x => { const d = dateOf(x); return `<button class="fr-fe${x.id === f.id ? ' on' : ''}" data-fest="${x.id}"><i>${esc(initial(x.he))}</i><span>${esc(x.n)}</span><small>${d ? esc(d.start.toLocaleDateString('es', { day: 'numeric', month: 'short' })) : esc(x.fecha.split(' (')[0])}</small></button>`; };
    const main = DATA.f.filter(x => !x.extra), extra = DATA.f.filter(x => x.extra);
    const inBible = Object.entries(DATA.ch).filter(([, v]) => v[0].includes(f.id)).sort((a, b) => (b[0] === ctx.key) - (a[0] === ctx.key));
    return `<div class="fr-sec" style="margin-top:6px">Primavera</div><div class="fr-strip">${main.slice(0, 4).map(fe).join('')}</div>
      <div class="fr-line"></div><div class="fr-sec" style="margin-top:0">Otoño</div><div class="fr-strip fall">${main.slice(4).map(fe).join('')}</div>
      <div class="fr-sec">También en la Biblia</div><div class="fr-strip fall">${extra.map(fe).join('')}</div>
      <div class="fr-sec">${esc(f.n)} en la Biblia</div>
      ${inBible.map(([k, v]) => `<div class="fr-card${k === ctx.key ? ' here' : ''}" data-go="${k.replace(':', ' ')}"><div>${esc(nice(k.replace(':', ' ')))}</div><div class="fr-src" style="margin-top:2px">${esc(v[1])}</div>${k === ctx.key ? '<div class="fr-q">Estás aquí</div>' : ''}</div>`).join('')}
      <p class="fr-src">Fechas según el calendario hebreo. Las fiestas comienzan al atardecer del día anterior.</p>`;
  }
  function threadHtml(f) {
    return `<div class="fr-thread">${f.hilo.map(([k, r, t]) => `<div class="fr-step${/Yeshúa|Cumplimiento/.test(k) ? ' y' : ''}" data-go="${esc(r)}"><b>${esc(k)}</b><span>${esc(t)}</span><small>${esc(nice(r))}</small></div>`).join('')}</div>`;
  }
  // D · Esquema del Templo del siglo I (simplificado, no a escala; el oriente abajo)
  const ZONES = {
    gentiles: [4, 4, 352, 452, 'Atrio de los gentiles', 1],
    salomon: [16, 414, 328, 30, 'Pórtico de Salomón · oriente'],
    almenas: [282, 380, 66, 26, 'Almenas'],
    mujeres: [100, 266, 160, 82, 'Atrio de las mujeres'],
    hermosa: [146, 348, 68, 22, 'La Hermosa'],
    altar: [150, 190, 60, 44, 'Altar'],
    santo: [136, 118, 88, 58, 'Santuario'],
    santisimo: [146, 72, 68, 44, 'Santísimo'],
  };
  function templeHtml() {
    const here = new Set(placesOf(ctx.key).map(p => p.id));
    const sel = ctx.place || [...here][0] || null;
    const z = (id) => { const [x, y, w, h, l, top] = ZONES[id]; const on = here.has(id), s = sel === id;
      return `<g class="z" data-place="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${s ? 'rgba(90,156,240,.22)' : on ? 'rgba(90,156,240,.1)' : 'transparent'}" stroke="${on || s ? '#5a9cf0' : 'rgba(150,130,90,.55)'}" stroke-width="${s ? 2.5 : 1.5}" ${id === 'gentiles' ? 'stroke-dasharray="6 5"' : ''}/>
        <text x="${x + w / 2}" y="${top ? y + 22 : y + h / 2 + 5}" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="${w < 80 ? 13 : 15}" fill="${on || s ? '#5a9cf0' : 'var(--text-mid,#b8af9c)'}">${esc(l)}</text></g>`; };
    const svg = `<svg viewBox="0 0 360 460" role="img" aria-label="Esquema del Templo">${z('gentiles')}<rect x="90" y="60" width="180" height="296" rx="8" fill="none" stroke="rgba(150,130,90,.55)" stroke-width="1.5"/><text x="180" y="256" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="12" fill="var(--text-dim,#6e6656)">Atrio de Israel y de los sacerdotes</text>${['santisimo', 'santo', 'altar', 'mujeres', 'hermosa', 'almenas', 'salomon'].map(z).join('')}</svg>`;
    const list = DATA.templo.filter(p => !sel || p.id === sel || here.has(p.id));
    return `<div class="fr-tpl">${svg}</div><p class="fr-src" style="text-align:center">Esquema simplificado del Templo en el siglo I, no a escala. Toca un lugar.</p>
      ${list.map(p => `<div class="fr-card${p.id === sel ? ' here' : ''}"><div class="fr-kick">${esc(p.n)}</div><div class="fr-p" style="margin-top:4px">${esc(p.t)}</div><div class="fr-refs">${p.refs.map(r => `<a class="fr-ref" href="${readUrl(r)}"${r.replace(/:\d+$/, '').replace(' ', ':') === ctx.key ? ' style="border-color:#5a9cf0;color:#5a9cf0"' : ''}>${esc(nice(r))}</a>`).join('')}</div></div>`).join('')}`;
  }
  function render() {
    const s = sheet(), f = fest(ctx.fest) || DATA.f[0];
    const tabs = [];
    if (ctx.key && notesOf(ctx.key).length) tabs.push(['raices', 'Raíces hebreas']);
    tabs.push(['fiesta', 'La fiesta'], ['cal', 'Calendario'], ['hilo', 'De punta a punta']);
    if (!ctx.key || placesOf(ctx.key).length) tabs.push(['templo', 'En el Templo']);
    if (!tabs.some(t => t[0] === ctx.tab)) ctx.tab = tabs[0][0];
    const body = ctx.tab === 'raices' ? rootsHtml() : ctx.tab === 'cal' ? calHtml(f) : ctx.tab === 'hilo' ? threadHtml(f) : ctx.tab === 'templo' ? templeHtml() : feastHtml(f);
    const showFest = ctx.tab !== 'raices' && ctx.tab !== 'templo';
    s.innerHTML = `<div class="fr-head"><div>
        <div class="fr-kick">${showFest ? 'Moadim de YHWH' : ctx.tab === 'templo' ? 'El Templo en el siglo I' : 'Raíces hebreas'}${ctx.key ? ' · ' + esc(nice(ctx.key.replace(':', ' '))) : ''}</div>
        ${showFest ? `<div class="fr-h">${esc(f.n)} <span class="fr-heb" lang="he" dir="rtl">${esc(f.he)}</span></div><div class="fr-sub">${esc(f.alt)} · ${esc(f.sig)} · ${esc(f.fecha)}</div>`
          : `<div class="fr-h">${ctx.tab === 'templo' ? 'Dónde ocurrió' : 'Lo que hay detrás del texto'}</div>`}
      </div><button class="fr-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="fr-tabs">${tabs.map(([k, l]) => `<button class="fr-tab${ctx.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="fr-body">${body}</div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ctx.tab = b.dataset.tab; render(); });
    s.querySelectorAll('[data-fest]').forEach(b => b.onclick = e => { e.stopPropagation(); ctx.fest = b.dataset.fest; if (ctx.tab === 'raices') ctx.tab = 'fiesta'; render(); s.querySelector('.fr-body').scrollTop = 0; });
    s.querySelectorAll('[data-place]').forEach(b => b.onclick = () => { ctx.place = b.dataset.place; render(); });
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { close(); location.href = readUrl(b.dataset.go.replace(' ', ':')); });
    if (ctx.tab === 'raices' && ctx.note != null) { const n = s.querySelector('#frn' + ctx.note); if (n) setTimeout(() => n.scrollIntoView({ block: 'start' }), 30); }
  }
  async function open(opts = {}) {
    await loadData(); if (!DATA) return;
    if (opts.key) await loadRoots();
    const ch = opts.key && DATA.ch[opts.key];
    let f = opts.fest || (ch && ch[0][0]);
    if (!f) { // la próxima fiesta
      const up = DATA.f.map(x => [x.id, dateOf(x)]).filter(x => x[1]).sort((a, b) => a[1].start - b[1].start);
      f = up.length ? up[0][0] : 'pesaj';
    }
    ctx = { key: opts.key || null, container: opts.container || null, fest: f, tab: opts.tab || (opts.key ? (opts.note != null || notesOf(opts.key).length ? 'raices' : ch ? 'fiesta' : 'templo') : 'cal'), note: opts.note, place: null };
    sheet(); render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  /* ── A + B · Pastilla del capítulo y subrayado ── */
  function underline(container, notes) {
    notes.forEach((n, i) => {
      const vEl = container.querySelector(`.verse[data-verse="${n.v}"]`); if (!vEl) return;
      const words = [...vEl.querySelectorAll('.word')], target = norm(n.frase);
      for (let s = 0; s < words.length; s++) {
        let acc = '';
        for (let e = s; e < Math.min(words.length, s + 10); e++) {
          acc = norm(acc + ' ' + words[e].textContent);
          if (acc === target) { for (let k = s; k <= e; k++) { words[k].classList.add('fr-u'); words[k].dataset.fr = i; } return; }
          if (!target.startsWith(acc)) break;
        }
      }
    });
  }
  async function decorate(container, book, chapter) {
    if (!container || !book || !chapter || container.dataset.fr === `${book}:${chapter}`) return;
    container.dataset.fr = `${book}:${chapter}`;
    await Promise.all([loadData(), loadRoots()]);
    if (!DATA) return;
    const key = `${book}:${chapter}`, ch = DATA.ch[key], notes = notesOf(key), places = placesOf(key);
    if (!ch && !notes.length && !places.length) return;
    if (notes.length) underline(container, notes);
    let prev = container.previousElementSibling;
    while (prev && prev.classList.contains('pp-row')) prev = prev.previousElementSibling;
    if (prev && prev.classList.contains('fr-pill')) return;
    const fs = ch ? ch[0].map(fest).filter(Boolean) : [];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fr-pill';
    const nr = notes.length ? `${notes.length} ${notes.length === 1 ? 'raíz hebrea' : 'raíces hebreas'}` : '';
    b.innerHTML = fs.length
      ? `<span class="fr-he" lang="he" dir="rtl">${esc(key === 'LEV:23' ? 'מוֹעֲדִים' : fs[0].he)}</span><span>${key === 'LEV:23' ? '<b>Las fiestas de YHWH</b>' : `<b>${esc(fs.slice(0, 2).map(f => f.n).join(' · '))}</b>${fs.length > 2 ? ` <small>+${fs.length - 2}</small>` : ''}`}${nr ? ` <small>· ${nr}</small>` : ''}</span><span class="fr-go">›</span>`
      : notes.length ? `<span>🕎</span><span><b>${nr[0].toUpperCase() + nr.slice(1)}</b> <small>en este capítulo</small></span><span class="fr-go">›</span>`
      : `<span>🏛</span><span><b>Lugares del Templo</b> <small>en este capítulo</small></span><span class="fr-go">›</span>`;
    b.onclick = () => open({ key, container, tab: fs.length ? 'fiesta' : notes.length ? 'raices' : 'templo' });
    container.before(b);
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }

  /* ── A · Tocar una frase subrayada: aviso dentro del lexicón ── */
  document.addEventListener('click', ev => {
    const old = document.getElementById('frLexBanner'); if (old) old.remove();
    const w = ev.target.closest && ev.target.closest('#mainContent .word.fr-u');
    if (!w || !isOn() || document.body.classList.contains('verse-select-mode')) return;
    const box = w.closest('[data-fr]:not(.word)') || w.closest('.bible-text');
    const key = box && box.dataset.fr; if (!key) return;
    const i = Number(w.dataset.fr), n = notesOf(key)[i]; if (!n) return;
    (async () => {
      for (let k = 0; k < 20; k++) { const pop = document.getElementById('lexiconPopup'); if (pop && pop.classList.contains('visible')) break; await new Promise(r => setTimeout(r, 60)); }
      const pop = document.getElementById('lexiconPopup');
      if (!pop || !pop.classList.contains('visible') || document.getElementById('frLexBanner')) return;
      const b = document.createElement('button');
      b.id = 'frLexBanner'; b.type = 'button';
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:calc(100% - 24px);margin:10px 12px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(90,156,240,.4);background:rgba(90,156,240,.08);color:var(--text);font:inherit;font-size:.9rem;text-align:left;cursor:pointer';
      b.innerHTML = `<span>🕎</span><span style="flex:1"><b style="color:#5a9cf0">Raíz hebrea · ${esc(temaName(n.tema))}</b><br>${esc(n.titulo)}</span><span style="color:#5a9cf0;white-space:nowrap">Ver →</span>`;
      b.onclick = e => { e.stopPropagation(); if (typeof closeLexicon === 'function') closeLexicon(); open({ key, container: box, note: i, tab: 'raices' }); };
      pop.insertBefore(b, pop.firstChild);
    })();
  }, true);

  paintToggle();
  document.addEventListener('DOMContentLoaded', paintToggle);
  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 140); }).observe(main, { childList: true });
    setTimeout(decorateAll, 600);
  }
  window.KodeshFeasts = { open, decorateAll, dateOf: id => { const f = fest(id); return f ? dateOf(f) : null; }, load: loadData };
})();
