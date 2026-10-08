/* KODESH — Mapas bíblicos.
   - B · La ruta del viaje: el recorrido numerado; cada parada lleva al versículo.
   - D · Los viajes de Pablo: los cuatro viajes con su color.
   - E · Tocar un lugar en el texto: los nombres de lugar se subrayan; al tocar
     la palabra se abre el lexicón (como siempre) con un aviso «📍 Ver en el
     mapa» que abre la ficha del lugar con su ubicación.
   Datos: costas, lagos y ríos de Natural Earth (dominio público) en
   data/mapa-base.json; ubicaciones de OpenBible.info (CC BY 4.0) en
   data/lugares.json; rutas en data/viajes.json. Expone window.KodeshMaps. */
(function () {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[«»“”"'.,;:¿?¡!()—–]/g, ' ').replace(/\s+/g, ' ').trim();
  const JERUSALEM = [35.2345, 31.7767];
  let BASE = null, PLACES = null, TRIPS = null, P = {};
  const cache = {};
  const get = f => cache[f] || (cache[f] = fetch(f).then(r => r.json()).catch(() => { delete cache[f]; return null; }));
  async function loadPlaces() { if (!PLACES) { PLACES = await get('./data/lugares.json'); P = (PLACES && PLACES.p) || {}; } return PLACES; }
  async function loadAll() { [BASE, TRIPS] = await Promise.all([get('./data/mapa-base.json'), get('./data/viajes.json')]); await loadPlaces(); }
  const bookName = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;
  const nice = r => { const m = /^([1-3]?[A-Z]{2,3}) (.+)$/.exec(r); return m ? `${bookName(m[1])} ${m[2]}` : r; };
  const readUrl = r => { const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)/.exec(r); return m ? `index.html?book=${m[1]}&chapter=${m[2]}&verse=${m[3]}` : 'index.html'; };
  function km(a, b) {
    const R = 6371, t = Math.PI / 180;
    const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function dirFrom(a, b) {
    const ang = Math.atan2(b[1] - a[1], (b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180)) * 180 / Math.PI;
    const dirs = ['al este', 'al noreste', 'al norte', 'al noroeste', 'al oeste', 'al suroeste', 'al sur', 'al sureste'];
    return dirs[((Math.round(ang / 45) % 8) + 8) % 8];
  }
  const confLabel = c => c >= 700 ? 'Ubicación segura' : c >= 300 ? 'Ubicación probable' : 'Ubicación incierta';

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.mp-head, .mp-tabs { flex-shrink: 0; }
:root { --mp-sea: #0d1420; --mp-land: #1d1a22; --mp-coast: #5b4c2a; --mp-river: #3f6f99; --mp-label: #d9d0bb; --mp-halo: #0d1420; }
html.light { --mp-sea: #dfe8ee; --mp-land: #f3ecdc; --mp-coast: #b49a5c; --mp-river: #6f9cc4; --mp-label: #3b3326; --mp-halo: #f3ecdc; }
.word.mp-place { text-decoration: underline; text-decoration-color: rgba(201,168,76,.6); text-underline-offset: 4px; }
html.mp-off .word.mp-place { text-decoration: none; }
html.mp-off .mp-chips { display: none !important; }
.mp-chip { display: inline-flex; align-items: center; gap: 6px; margin: 4px 6px 10px 0; border: 1px solid var(--gold-dim, #6e5a2a); color: var(--gold, #c9a84c); background: none; border-radius: 16px; padding: 5px 12px; font: inherit; font-size: .85rem; cursor: pointer; }
.mp-chips { margin: 6px 0 2px; }
.mp-ov { position: fixed; inset: 0; z-index: 578; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.mp-ov.open { opacity: 1; pointer-events: auto; }
.mp-sheet { width: min(760px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); overflow: hidden; }
.mp-ov.open .mp-sheet { transform: none; }
.mp-head { padding: 16px 18px 8px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.mp-kick { font-family: 'Cinzel', var(--font-display, serif); font-size: .6rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.mp-h { font-family: var(--font-display, serif); font-size: 1.4rem; font-weight: 600; margin-top: 2px; }
.mp-sub { color: var(--text-dim, #6e6656); font-size: .88rem; margin-top: 2px; }
.mp-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.mp-body { flex: 1; overflow: auto; }
.mp-map { position: relative; margin: 0 14px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border2, #2a2836); background: var(--mp-sea); }
.mp-map svg { display: block; width: 100%; height: auto; touch-action: none; }
.mp-zoom { position: absolute; right: 8px; top: 8px; display: grid; gap: 6px; }
.mp-zoom button { width: 34px; height: 34px; border-radius: 17px; border: 1px solid var(--border2, #2a2836); background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); font-size: 18px; cursor: pointer; }
.mp-src { font-size: .68rem; color: var(--text-dim, #6e6656); padding: 6px 16px 0; }
.mp-list { list-style: none; margin: 8px 0 0; padding: 0 16px 20px; }
.mp-list li { display: grid; grid-template-columns: 30px 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border2, #2a2836); cursor: pointer; }
.mp-n { width: 26px; height: 26px; border-radius: 13px; color: #15120a; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 600; }
.mp-list b { font-family: var(--font-display, serif); font-size: 1.08rem; font-weight: 600; }
.mp-list small { color: var(--gold, #c9a84c); margin-left: 6px; }
.mp-list p { margin: 2px 0 0; color: var(--text-mid, #b8af9c); font-size: .95rem; line-height: 1.45; }
.mp-tabs { display: flex; gap: 6px; padding: 0 16px 10px; overflow-x: auto; }
.mp-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 16px; padding: 6px 12px; font: inherit; font-size: .88rem; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.mp-tab.on { border-color: var(--gold, #c9a84c); color: var(--text, #e9e3d3); }
.mp-tab i { width: 10px; height: 10px; border-radius: 5px; display: inline-block; }
.mp-facts { padding: 10px 16px 0; display: grid; gap: 4px; color: var(--text-mid, #b8af9c); font-size: .95rem; }
.mp-sec { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold, #c9a84c); padding: 16px 16px 4px; }
.mp-trips { padding: 4px 16px 20px; display: grid; gap: 10px; }
.mp-trip { text-align: left; border: 1px solid var(--border2, #2a2836); border-radius: 14px; padding: 12px 14px; background: none; color: var(--text, #e9e3d3); font: inherit; cursor: pointer; display: grid; grid-template-columns: 12px 1fr; gap: 12px; align-items: center; }
.mp-trip i { width: 12px; height: 12px; border-radius: 6px; }
.mp-trip b { font-family: var(--font-display, serif); font-size: 1.1rem; display: block; }
.mp-trip span { color: var(--text-dim, #6e6656); font-size: .85rem; }`;
  document.head.appendChild(css);

  /* ── Ajustes ── */
  const isOn = () => { try { return localStorage.getItem('kodesh_mp_on') !== '0'; } catch (e) { return true; } };
  function paintToggle() {
    document.documentElement.classList.toggle('mp-off', !isOn());
    const t = document.getElementById('mpToggle');
    if (t) { t.classList.toggle('on', isOn()); t.setAttribute('aria-checked', String(isOn())); }
  }
  window.toggleMapPlaces = function () {
    try { localStorage.setItem('kodesh_mp_on', isOn() ? '0' : '1'); } catch (e) {}
    paintToggle();
    if (typeof showToast === 'function') showToast(isOn() ? 'Lugares en el mapa activados' : 'Lugares en el mapa desactivados');
  };
  paintToggle();
  document.addEventListener('DOMContentLoaded', paintToggle);

  /* ── Dibujo del mapa (SVG) ── */
  function fit(points, minSpan = 1.4) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max(x1 - x0, minSpan) * 1.3, h = Math.max(y1 - y0, minSpan * 0.7) * 1.3;
    return { cx, cy, w, h };
  }
  function drawMap(box, { stops = [], routes = [], markers = [], W = 520, H = 390 } = {}) {
    const k0 = Math.cos(box.cy * Math.PI / 180);
    // encaja el recuadro en el lienzo sin deformar
    const sx = W / (box.w * k0), sy = H / box.h, s = Math.min(sx, sy);
    const px = lon => W / 2 + (lon - box.cx) * k0 * s;
    const py = lat => H / 2 - (lat - box.cy) * s;
    const lonMin = box.cx - W / 2 / (k0 * s) - 1, lonMax = box.cx + W / 2 / (k0 * s) + 1;
    const latMin = box.cy - H / 2 / s - 1, latMax = box.cy + H / 2 / s + 1;
    const inView = cs => cs.some(([x, y]) => x >= lonMin && x <= lonMax && y >= latMin && y <= latMax);
    const path = (cs, close) => cs.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('') + (close ? 'Z' : '');
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">`;
    svg += `<rect width="${W}" height="${H}" fill="var(--mp-sea)"/>`;
    if (BASE) {
      svg += `<path d="${BASE.land.filter(inView).map(c => path(c, true)).join('')}" fill="var(--mp-land)" stroke="var(--mp-coast)" stroke-width="1.1" stroke-linejoin="round"/>`;
      svg += `<path d="${BASE.lakes.filter(l => inView(l.c)).map(l => path(l.c, true)).join('')}" fill="var(--mp-sea)" stroke="var(--mp-coast)" stroke-width=".8"/>`;
      svg += `<path d="${BASE.rivers.filter(r => inView(r.c)).map(r => path(r.c)).join('')}" fill="none" stroke="var(--mp-river)" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>`;
    }
    for (const r of routes) {
      const pts = r.stops.map(st => [px(st.ll[0]), py(st.ll[1])]);
      svg += `<path d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}" fill="none" stroke="${r.color}" stroke-width="2.6" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round" opacity="${r.dim ? .25 : .95}"/>`;
    }
    const placed = [];
    const label = (x, y, text, bold) => {
      let ly = y - 15, anchor = 'middle', lx = x;
      for (const p of placed) if (Math.abs(p[0] - lx) < 80 && Math.abs(p[1] - ly) < 19) { ly = y + 30; break; }
      placed.push([lx, ly]);
      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-family="EB Garamond, Georgia, serif" font-size="${bold ? 21 : 18}" font-weight="${bold ? 600 : 500}" fill="var(--mp-label)" stroke="var(--mp-halo)" stroke-width="4" paint-order="stroke">${esc(text)}</text>`;
    };
    for (const m of markers) {
      const x = px(m.ll[0]), y = py(m.ll[1]);
      svg += m.main ? `<circle cx="${x}" cy="${y}" r="11" fill="#c9a84c" stroke="#15120a" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="5.5" fill="var(--mp-label)" opacity=".75"/>`;
      svg += label(x, y, m.n, m.main);
    }
    const seen = new Map();
    stops.forEach((st, i) => {
      const x = px(st.ll[0]), y = py(st.ll[1]);
      const key = `${x.toFixed(0)},${y.toFixed(0)}`;
      const again = seen.get(key);
      if (again) { seen.set(key, again + ', ' + (i + 1)); return; }
      seen.set(key, String(i + 1));
    });
    stops.forEach((st, i) => {
      const x = px(st.ll[0]), y = py(st.ll[1]);
      const key = `${x.toFixed(0)},${y.toFixed(0)}`;
      if (!seen.has(key)) return;
      const num = seen.get(key); seen.delete(key);
      const wide = num.length > 2;
      svg += `<g data-stop="${i}" style="cursor:pointer">${wide ? `<rect x="${x - 8 - num.length * 3.8}" y="${y - 13}" width="${16 + num.length * 7.6}" height="26" rx="13"` : `<circle cx="${x}" cy="${y}" r="13"`} fill="${st.color || '#c9a84c'}" stroke="#15120a" stroke-width="1.5"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial" font-size="14" font-weight="700" fill="#15120a">${num}</text></g>`;
      svg += label(x, y - 6, st.n, false);
    });
    return svg + '</svg>';
  }
  // Zoom con botones y pellizco sencillo (cambia el recuadro y redibuja)
  function mountMap(el, state, opts) {
    const paint = () => { el.querySelector('[data-svg]').innerHTML = drawMap(state.box, opts()); wireStops(); };
    const wireStops = () => el.querySelectorAll('[data-stop]').forEach(g => g.onclick = () => opts().onStop && opts().onStop(+g.dataset.stop));
    el.innerHTML = `<div data-svg></div><div class="mp-zoom"><button data-z="0.7" aria-label="Acercar">+</button><button data-z="1.4" aria-label="Alejar">−</button></div>`;
    el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const z = +b.dataset.z; state.box = { ...state.box, w: state.box.w * z, h: state.box.h * z }; paint(); });
    // arrastrar para mover
    let drag = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button,[data-stop]')) return; drag = { x: e.clientX, y: e.clientY, box: { ...state.box } }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = el.getBoundingClientRect();
      const k0 = Math.cos(drag.box.cy * Math.PI / 180);
      const s = Math.min(r.width / (drag.box.w * k0), r.height / drag.box.h);
      state.box = { ...drag.box, cx: drag.box.cx - (e.clientX - drag.x) / (k0 * s), cy: drag.box.cy + (e.clientY - drag.y) / s };
      cancelAnimationFrame(state.raf); state.raf = requestAnimationFrame(paint);
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('pointercancel', () => { drag = null; });
    paint();
  }

  /* ── Hoja ── */
  let ov = null;
  function sheet() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'mp-ov';
      ov.innerHTML = '<section class="mp-sheet" role="dialog" aria-label="Mapas bíblicos"></section>';
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov.querySelector('.mp-sheet');
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }
  function show() { requestAnimationFrame(() => ov.classList.add('open')); document.body.style.overflow = 'hidden'; }
  function head(kick, title, sub, back) {
    return `<div class="mp-head"><div>${back ? '<button class="mp-chip" data-back style="margin:0 0 8px">‹ Mapas</button>' : ''}<div class="mp-kick">${esc(kick)}</div><div class="mp-h">${esc(title)}</div>${sub ? `<div class="mp-sub">${sub}</div>` : ''}</div><button class="mp-x" data-close aria-label="Cerrar">✕</button></div>`;
  }
  function wireHead(s) {
    s.querySelector('[data-close]').onclick = close;
    const b = s.querySelector('[data-back]'); if (b) b.onclick = () => openIndex();
  }
  const goVerse = r => { close(); location.href = readUrl(r); };

  /* B + D · Un viaje (o varios de Pablo) */
  function routeKm(stops) { let t = 0; for (let i = 1; i < stops.length; i++) t += km(stops[i - 1].ll, stops[i].ll); return Math.round(t / 50) * 50; }
  async function openTrip(id) {
    await loadAll(); if (!TRIPS) return;
    const pablo = TRIPS.j.filter(j => j.pablo);
    let trip = TRIPS.j.find(j => j.id === id);
    const isPablo = id === 'pablo' || (trip && trip.pablo);
    const s = sheet();
    const render = (sel) => {
      const list = sel === 'all' ? pablo : [TRIPS.j.find(j => j.id === sel)];
      const stops = list.flatMap(j => j.stops.map(st => ({ ...st, color: j.color })));
      const box = fit(stops.map(st => st.ll));
      const one = list.length === 1 ? list[0] : null;
      s.innerHTML = head(isPablo ? 'Los viajes de Pablo' : 'La ruta del viaje', one ? one.t : 'Los cuatro viajes', one ? `${esc(one.ref)} · unos ${routeKm(one.stops).toLocaleString('es')} km entre paradas` : 'Hechos 13 – 28', true)
        + (isPablo ? `<div class="mp-tabs">${pablo.map(j => `<button class="mp-tab${sel === j.id ? ' on' : ''}" data-trip="${j.id}"><i style="background:${j.color}"></i>${j.pablo === 4 ? 'A Roma' : j.pablo + '.º viaje'}</button>`).join('')}<button class="mp-tab${sel === 'all' ? ' on' : ''}" data-trip="all">Todos</button></div>` : '')
        + `<div class="mp-body"><div class="mp-map" data-map></div><div class="mp-src">${one && one.note ? esc(one.note) + ' ' : ''}Costas: Natural Earth · Ubicaciones: OpenBible.info (CC BY 4.0) · Ríos y lagos aproximados.</div>
          <ol class="mp-list">${(one ? one.stops : []).map((st, i) => `<li data-go="${i}"><span class="mp-n" style="background:${one.color}">${i + 1}</span><div><b>${esc(st.n)}</b><small>${esc(nice(st.r))}</small><p>${esc(st.note)}${st.c < 300 ? ' <i>(ubicación incierta)</i>' : ''}</p></div></li>`).join('')}</ol>
          ${!one ? `<div class="mp-trips">${pablo.map(j => `<button class="mp-trip" data-trip="${j.id}"><i style="background:${j.color}"></i><div><b>${esc(j.t)}</b><span>${esc(j.ref)} · ${j.stops.length} paradas</span></div></button>`).join('')}</div>` : ''}</div>`;
      wireHead(s);
      const state = { box };
      mountMap(s.querySelector('[data-map]'), state, () => ({ stops: one ? stops : [], routes: list.map(j => ({ stops: j.stops, color: j.color })), markers: one ? [] : pablo.flatMap(j => j.stops).filter((st, i, a) => a.findIndex(x => x.id === st.id) === i).map(st => ({ ll: st.ll, n: st.n.replace(' de Siria', '') })), onStop: i => { if (one) goVerse(one.stops[i].r); } }));
      s.querySelectorAll('[data-trip]').forEach(b => b.onclick = () => render(b.dataset.trip));
      s.querySelectorAll('[data-go]').forEach(li => li.onclick = () => goVerse(one.stops[+li.dataset.go].r));
    };
    render(id === 'pablo' ? 'all' : id);
    show();
  }

  /* E · Ficha de un lugar */
  let REV = null;
  function reverseIndex() {
    if (REV) return REV;
    REV = {};
    for (const [k, list] of Object.entries(PLACES.v)) for (const [v, id] of list) (REV[id] = REV[id] || []).push(`${k.replace(':', ' ')}:${v}`);
    const order = {}; ((window.KodeshRef && KodeshRef.BOOKS) || []).forEach((b, i) => { order[b[0]] = i; });
    const k = r => { const m = /^(\w+) (\d+):(\d+)$/.exec(r); return (order[m[1]] ?? 99) * 1e6 + +m[2] * 1e3 + +m[3]; };
    for (const id in REV) REV[id] = [...new Set(REV[id])].sort((a, b) => k(a) - k(b));
    return REV;
  }
  async function openPlace(id) {
    await loadAll();
    const p = P[id]; if (!p) return;
    const [n, lon, lat, type, conf] = p;
    const ll = [lon, lat];
    const refs = (reverseIndex()[id] || []);
    const B = typeof loadBibleData === 'function' ? await loadBibleData() : await get('./biblia-rvr.json');
    const snip = r => { const m = /^(\w+) (\d+):(\d+)$/.exec(r); const t = m && B && B[m[1]]?.[m[2]]?.[m[3]]; return t ? (t.length > 110 ? t.slice(0, 108).replace(/\s+\S*$/, '') + '…' : t) : ''; };
    const d = Math.round(km(JERUSALEM, ll));
    const trips = (TRIPS ? TRIPS.j : []).filter(j => j.stops.some(st => st.id === id));
    const s = sheet();
    s.innerHTML = head('Lugar', n, `${esc(type)} · ${confLabel(conf)}`, true)
      + `<div class="mp-body"><div class="mp-map" data-map></div>
        <div class="mp-facts">${d < 8 ? '<div>En Jerusalén o junto a ella</div>' : `<div>Unos ${d.toLocaleString('es')} km ${dirFrom(JERUSALEM, ll)} de Jerusalén</div>`}
        ${conf < 300 ? '<div><i>Los estudiosos no coinciden en dónde estaba; el punto es la propuesta más aceptada.</i></div>' : ''}</div>
        ${trips.length ? `<div class="mp-sec">En los viajes</div><div class="mp-trips">${trips.map(j => `<button class="mp-trip" data-trip="${j.id}"><i style="background:${j.color}"></i><div><b>${esc(j.t)}</b><span>${esc(j.ref)}</span></div></button>`).join('')}</div>` : ''}
        <div class="mp-sec">Lo que pasó aquí · ${refs.length} ${refs.length === 1 ? 'mención' : 'menciones'}</div>
        <ol class="mp-list">${refs.slice(0, 40).map((r, i) => `<li data-r="${esc(r)}"><span class="mp-n" style="background:var(--gold,#c9a84c)">${i + 1}</span><div><b style="font-size:1rem">${esc(nice(r))}</b><p>${esc(snip(r))}</p></div></li>`).join('')}</ol>
        <div class="mp-src" style="padding-bottom:20px">Ubicación: OpenBible.info (CC BY 4.0) · Costas: Natural Earth.</div></div>`;
    wireHead(s);
    const near = Object.entries(P).filter(([pid, x]) => pid !== id && x[4] >= 500 && Math.abs(x[1] - lon) < 0.9 && Math.abs(x[2] - lat) < 0.7).sort((a, b) => b[1][4] - a[1][4]).slice(0, 6);
    const hasJer = d > 8 && d < 120;
    const state = { box: fit([ll, ...(hasJer ? [JERUSALEM] : [])], 0.9) };
    mountMap(s.querySelector('[data-map]'), state, () => ({ markers: [...near.map(([, x]) => ({ ll: [x[1], x[2]], n: x[0] })), ...(hasJer ? [{ ll: JERUSALEM, n: 'Jerusalén' }] : []), { ll, n, main: true }] }));
    s.querySelectorAll('[data-r]').forEach(li => li.onclick = () => goVerse(li.dataset.r));
    s.querySelectorAll('[data-trip]').forEach(b => b.onclick = () => openTrip(b.dataset.trip));
    show();
  }

  /* Índice: todos los mapas */
  async function openIndex() {
    await loadAll(); if (!TRIPS) return;
    const s = sheet();
    const other = TRIPS.j.filter(j => !j.pablo);
    s.innerHTML = head('Mapas bíblicos', 'Viajes de la Biblia', 'Toca un viaje para ver su ruta', false)
      + `<div class="mp-body"><div class="mp-trips">${other.map(j => `<button class="mp-trip" data-trip="${j.id}"><i style="background:${j.color}"></i><div><b>${esc(j.t)}</b><span>${esc(j.ref)} · ${j.stops.length} paradas</span></div></button>`).join('')}
        <button class="mp-trip" data-trip="pablo"><i style="background:linear-gradient(90deg,#c9a84c,#d08a5a,#6fa8c9,#a98fd1)"></i><div><b>Los viajes de Pablo</b><span>Hechos 13 – 28 · los tres viajes misioneros y el viaje a Roma</span></div></button></div>
        <div class="mp-src" style="padding:0 16px 20px">Además, en el texto los nombres de lugar llevan un subrayado dorado: al tocarlos, el lexicón muestra «Ver en el mapa».</div></div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-trip]').forEach(b => b.onclick = () => openTrip(b.dataset.trip));
    show();
  }

  /* ── En el lector ── */
  function markPhrase(vEl, phrase, cls, id) {
    const words = [...vEl.querySelectorAll('.word')];
    const target = norm(phrase).split(' ').filter(Boolean);
    const toks = words.map(w => norm(w.textContent));
    for (let i = 0; i < toks.length; i++) {
      let j = 0, k = i;
      while (k < toks.length && j < target.length) {
        if (!toks[k]) { k++; continue; }
        const parts = toks[k].split(' ');
        if (parts.every((p, n) => p === target[j + n])) { j += parts.length; k++; } else break;
      }
      if (j >= target.length) { for (let m = i; m < k; m++) { words[m].classList.add(cls); words[m].dataset.place = id; } return true; }
    }
    return false;
  }
  async function decorate(container, book, chapter) {
    if (!container || !book || !chapter || container.dataset.mp === `${book}:${chapter}`) return;
    container.dataset.mp = `${book}:${chapter}`;
    await loadPlaces(); if (!PLACES) return;
    const list = PLACES.v[`${book}:${chapter}`] || [];
    const done = new Set();
    for (const [v, id, form] of list) {
      if (done.has(id)) continue;   // solo la primera mención de cada lugar en el capítulo
      const vEl = container.querySelector(`.verse[data-verse="${v}"]`);
      if (vEl && markPhrase(vEl, form, 'mp-place', id)) done.add(id);
    }
    // B / D · aviso de ruta al comienzo del capítulo
    if (!TRIPS) TRIPS = await get('./data/viajes.json');
    const trips = (TRIPS ? TRIPS.j : []).filter(j => j.stops.some(st => st.r.startsWith(`${book} ${chapter}:`)));
    if (trips.length && !container.previousElementSibling?.classList?.contains('mp-chips')) {
      const box = document.createElement('div'); box.className = 'mp-chips';
      box.innerHTML = trips.map(j => `<button type="button" class="mp-chip" data-trip="${j.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>Mapa: ${esc(j.t)}</button>`).join('');
      container.before(box);
      box.querySelectorAll('[data-trip]').forEach(b => b.onclick = () => openTrip(b.dataset.trip));
    }
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }
  // E · tocar el nombre: el lexicón abre como siempre y lleva «📍 Ver en el mapa»
  document.addEventListener('click', ev => {
    const w = ev.target.closest && ev.target.closest('#mainContent .word.mp-place');
    const old = document.getElementById('mpLexBanner'); if (old) old.remove();
    if (!w || !isOn() || document.body.classList.contains('verse-select-mode')) return;
    const id = w.dataset.place;
    (async () => {
      for (let i = 0; i < 20; i++) { const pop = document.getElementById('lexiconPopup'); if (pop && pop.classList.contains('visible')) break; await new Promise(r => setTimeout(r, 60)); }
      const pop = document.getElementById('lexiconPopup');
      const p = P[id];
      if (!p) return;
      const b = document.createElement('button');
      b.id = 'mpLexBanner'; b.type = 'button';
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:calc(100% - 24px);margin:10px 12px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--gold-dim,#3a3220);background:var(--gold-soft,rgba(201,168,76,.06));color:var(--text);font:inherit;font-size:.9rem;text-align:left;cursor:pointer';
      b.innerHTML = `<span>📍</span><span style="flex:1"><b style="color:var(--gold)">${esc(p[0])}</b> · ${esc(p[3])}</span><span style="color:var(--gold);white-space:nowrap">Ver en el mapa →</span>`;
      b.onclick = e => { e.stopPropagation(); if (typeof closeLexicon === 'function') closeLexicon(); openPlace(id); };
      if (pop && pop.classList.contains('visible')) pop.insertBefore(b, pop.firstChild);
      else openPlace(id);   // si no hay lexicón (p. ej. la palabra no tiene entrada), abre la ficha directo
    })();
  }, true);

  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 110); }).observe(main, { childList: true });
    setTimeout(decorateAll, 500);
  }
  window.KodeshMaps = { openIndex, openTrip, openPlace, decorateAll };
})();
