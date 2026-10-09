/* KODESH — Línea de tiempo bíblica.
   - A · «Estás aquí»: una línea fina sobre el capítulo con su época (se puede apagar en Ajustes).
   - B · La historia completa: las épocas con sus libros, la del capítulo resaltada.
   - C · Profetas y reyes: los reyes que nombra cada libro profético y quiénes fueron contemporáneos.
   - D · El salmo en su momento: los salmos cuyo título cuenta cuándo se escribieron, enlazados a la historia (y al revés).
   - E · ¿Quién vivía?: de Adán a José en años desde la creación (sumados de Gn 5 y 11). Se arrastra el tiempo con una aguja;
     al tocar una vida se ve a quién conoció (su vida en vinotinto y, encima, el tramo compartido). Más las edades que da el texto.
   Datos: data/linea-tiempo.json (scripts/tiempo/build.py valida todas las citas). Fechas aproximadas, con «c.».
   Expone window.KodeshTiempo. */
(function () {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bookName = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;
  const nice = r => { const m = /^([1-3]?[A-Z]{2,3}) (.+)$/.exec(r); return m ? `${bookName(m[1])} ${m[2].replace('-', '–')}` : r; };
  const isOn = () => { try { return localStorage.getItem('kodesh_tl_on') !== '0'; } catch (e) { return true; } };

  let D = null, P = null;
  function load() { if (!P) P = fetch('./data/linea-tiempo.json').then(r => r.json()).then(j => (D = j)).catch(() => { P = null; return null; }); return P; }
  const ERA = id => D.eras.find(e => e[0] === id);

  // Época de un capítulo: { id, era, label, note }
  function where(book, ch) {
    if (!D || !(book in D.books)) return null;
    let id = null, note = D.notes[book] || '';
    const v = D.books[book];
    if (book === 'PSA') { const p = D.psalms[ch]; if (p) { id = p[0]; note = p[1]; } }
    else if (Array.isArray(v)) {
      const r = v.find(x => ch >= x[0] && ch <= x[1]); id = r ? r[2] : null;
      if (r && r[2] === null) note = D.notes[`${book}:${r[0]}-${r[1]}`] || note;
    } else id = v;
    const era = id ? ERA(id) : null;
    const pr = D.prophets.find(p => p[0] === book);
    return { id, era, note, prophet: pr || null };
  }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.tl-pill { display: flex; align-items: center; gap: 10px; width: 100%; margin: 0 0 10px; padding: 7px 12px; border-radius: 14px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text, #e9e3d3); font: inherit; font-size: .88rem; text-align: left; cursor: pointer; }
.tl-mini { position: relative; display: flex; align-items: center; justify-content: space-between; width: 92px; flex-shrink: 0; height: 12px; }
.tl-mini:before { content: ''; position: absolute; left: 2px; right: 2px; top: 50%; height: 1px; background: var(--border2, #2a2836); }
.tl-mini i { position: relative; width: 5px; height: 5px; border-radius: 3px; background: var(--text-dim, #6e6656); opacity: .6; }
.tl-mini i.on { width: 10px; height: 10px; border-radius: 5px; background: var(--gold, #c9a84c); opacity: 1; box-shadow: 0 0 0 3px rgba(201,168,76,.2); }
.tl-pill b { font-weight: 600; color: var(--gold, #c9a84c); }
.tl-pill small { color: var(--text-mid, #b8af9c); }
.tl-pill .go { margin-left: auto; color: var(--gold, #c9a84c); white-space: nowrap; }
.tl-ps { border-color: var(--gold-dim, #6e5a2a); background: rgba(201,168,76,.06); }
html.tl-off .tl-pill { display: none !important; }
.tl-ov { position: fixed; inset: 0; z-index: 579; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.tl-ov.open { opacity: 1; pointer-events: auto; }
.tl-sheet { width: min(720px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); overflow: hidden; }
.tl-ov.open .tl-sheet { transform: none; }
.tl-grab { width: 42px; height: 5px; border-radius: 3px; background: var(--border2, #2a2836); margin: 8px auto 0; flex-shrink: 0; }
.tl-head { padding: 10px 18px 4px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-shrink: 0; }
.tl-kick { font-family: 'Cinzel', serif; font-size: .6rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.tl-h { font-family: var(--font-display, serif); font-size: 1.6rem; font-weight: 600; line-height: 1.15; margin-top: 2px; }
.tl-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.tl-tabs { display: flex; gap: 6px; padding: 8px 18px 10px; overflow-x: auto; flex-shrink: 0; scrollbar-width: none; }
.tl-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 18px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; }
.tl-tab.on { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }
.tl-body { flex: 1; overflow: auto; padding: 4px 18px 28px; overscroll-behavior: contain; }
.tl-sec { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold, #c9a84c); margin: 18px 0 8px; }
.tl-src { font-size: .78rem; color: var(--text-dim, #6e6656); margin-top: 16px; line-height: 1.4; }
.tl-era { display: grid; grid-template-columns: 86px 6px 1fr; gap: 12px; align-items: stretch; width: 100%; padding: 8px 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.tl-era .yr { font-size: .8rem; color: var(--text-dim, #6e6656); text-align: right; padding-top: 3px; }
.tl-era .eb { border-radius: 3px; background: var(--border2, #2a2836); }
.tl-era b { display: block; font-weight: 500; font-size: 1.06rem; }
.tl-era small { display: block; color: var(--text-mid, #b8af9c); font-size: .86rem; line-height: 1.35; }
.tl-era small + small { color: var(--text-dim, #6e6656); }
.tl-era.on .yr, .tl-era.on b { color: var(--gold, #c9a84c); }
.tl-era.on .eb { background: var(--gold, #c9a84c); box-shadow: 0 0 10px rgba(201,168,76,.4); }
.tl-era.quiet { cursor: default; opacity: .75; }
.tl-here { padding: 10px 12px; border-radius: 12px; border: 1px solid var(--gold-dim, #6e5a2a); background: rgba(201,168,76,.07); font-size: .95rem; }
.tl-grid { overflow-x: auto; padding-bottom: 6px; }
.tl-grid table { border-collapse: separate; border-spacing: 3px 6px; }
.tl-grid th { font-weight: 500; font-size: .74rem; color: var(--text-mid, #b8af9c); min-width: 62px; text-align: center; padding: 4px 2px; border-radius: 8px; background: var(--bg2, #12111a); }
.tl-grid td.bar { cursor: pointer; }
.tl-grid td.bar span { display: block; height: 26px; line-height: 26px; padding: 0 8px; border-radius: 7px; background: rgba(110,160,220,.22); color: var(--text, #e9e3d3); font-size: .8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-grid td.bar.on span { background: var(--gold, #c9a84c); color: #15120a; font-weight: 600; }
.tl-grid td.bar.co span { background: rgba(201,168,76,.35); }
.tl-card { border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); border-radius: 14px; padding: 12px 14px; margin: 8px 0; }
.tl-card.on { border-color: var(--gold, #c9a84c); }
.tl-card b { font-weight: 600; }
.tl-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.tl-link { border: none; background: none; color: var(--gold, #c9a84c); font: inherit; font-size: .9rem; cursor: pointer; padding: 0; white-space: nowrap; }
.tl-life { margin: 10px 0 14px; }
.tl-life .tl-row span { font-size: 1rem; }
.tl-life .tl-row em { font-style: normal; color: var(--gold, #c9a84c); }
.tl-life .bb { height: 10px; border-radius: 5px; margin-top: 5px; background: rgba(201,168,76,.55); }
.tl-life button { margin-top: 3px; font-size: .8rem; color: var(--text-dim, #6e6656); }
.tl-seg { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .84rem; color: var(--text-mid, #b8af9c); margin: 6px 0 2px; }
.tl-seg span { flex: 1 1 160px; min-width: 0; line-height: 1.3; }
.tl-seg .sg { display: inline-flex; padding: 3px; gap: 3px; border-radius: 11px; background: var(--bg2, #12111a); border: 1px solid var(--border2, #2a2836); }
.tl-seg .sg button { border: none; background: none; color: var(--text-mid, #b8af9c); font: inherit; font-size: .8rem; padding: 5px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.tl-seg .sg button.on { background: var(--gold, #c9a84c); color: #15120a; }
.tl-yr { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 10px 0 4px; }
.tl-yr b { font-family: var(--font-display, serif); font-size: 2rem; font-weight: 600; color: var(--gold, #c9a84c); font-variant-numeric: tabular-nums; line-height: 1; }
.tl-yr b small { font-family: var(--font-body, serif); font-size: .8rem; font-weight: 400; color: var(--text-dim, #6e6656); margin-left: 6px; }
.tl-yr > small { color: var(--text-mid, #b8af9c); text-align: right; }
.tl-gantt { position: relative; height: 300px; margin: 0 -18px; overflow: hidden; touch-action: pan-y; cursor: grab; user-select: none; -webkit-user-select: none; border-top: 1px solid var(--border2, #2a2836); border-bottom: 1px solid var(--border2, #2a2836); }
.tl-gantt svg { position: absolute; inset: 0; }
.tl-zoom { position: absolute; right: 10px; bottom: 26px; display: flex; gap: 6px; }
.tl-zoom button { width: 34px; height: 34px; border-radius: 17px; border: 1px solid var(--border2, #2a2836); background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); font-size: 1.2rem; line-height: 1; cursor: pointer; opacity: .92; }
.tl-zoom button:disabled { opacity: .35; cursor: default; }
.tl-needle { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; background: #e0603c; pointer-events: none; }
.tl-needle:before { content: ''; position: absolute; top: 0; left: -6px; border: 7px solid transparent; border-top: 10px solid #e0603c; }
.tl-alive { padding: 10px 0 0; }
.tl-alive p { margin: 4px 0 0; line-height: 1.5; }
.tl-alive button { border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: rgba(201,168,76,.4); text-underline-offset: 3px; }
.tl-alive small { color: var(--text-dim, #6e6656); }
.tl-back { border: none; background: none; color: var(--gold, #c9a84c); font: inherit; font-size: .95rem; padding: 6px 0; cursor: pointer; }
.tl-chips { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 8px; scrollbar-width: none; }
.tl-chip { flex-shrink: 0; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text, #e9e3d3); border-radius: 15px; padding: 5px 12px; font: inherit; font-size: .88rem; cursor: pointer; }
.tl-chip.on { background: #7a1f33; border-color: #7a1f33; color: #fff; }
.tl-lifebar { height: 12px; border-radius: 6px; background: #7a1f33; margin-top: 10px; }
.tl-lifeax { display: flex; justify-content: space-between; color: var(--text-dim, #6e6656); font-size: .78rem; margin-top: 4px; font-variant-numeric: tabular-nums; }
.tl-kn { margin: 12px 0; }
.tl-kn .tl-row { align-items: baseline; }
.tl-kn .tl-row button { border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.tl-kn small { color: var(--text-dim, #6e6656); }
.tl-kn em { font-style: normal; color: var(--gold, #c9a84c); white-space: nowrap; }
.tl-kn .tr { position: relative; height: 12px; margin-top: 5px; border-radius: 6px; background: #7a1f33; }
.tl-kn .tr i { position: absolute; top: 0; bottom: 0; border-radius: 6px; box-shadow: 0 0 0 2px var(--bg, #0b0b12); }`;
  document.head.appendChild(css);

  function paintToggle() {
    document.documentElement.classList.toggle('tl-off', !isOn());
    const t = document.getElementById('tlToggle');
    if (t) { t.classList.toggle('on', isOn()); t.setAttribute('aria-checked', String(isOn())); }
  }
  window.toggleTimeline = function () {
    try { localStorage.setItem('kodesh_tl_on', isOn() ? '0' : '1'); } catch (e) {}
    paintToggle();
    if (typeof showToast === 'function') showToast(isOn() ? 'Línea de tiempo activada' : 'Línea de tiempo desactivada');
  };

  /* ── Ir a un pasaje ── */
  function go(ref) {
    const m = /^([1-3]?[A-Z]{2,3}) (\d+)(?::(\d+))?/.exec(ref); if (!m) return;
    const [, b, c, v] = m;
    close();
    if (window.KodeshHome && KodeshHome.isOpen && KodeshHome.isOpen()) KodeshHome.hide();
    if (typeof selectBook === 'function') selectBook(b);
    if (typeof loadChapter === 'function') loadChapter(b, +c).then(() => {
      if (v && +v > 1) setTimeout(() => { const e = document.querySelector(`.verse[data-verse="${v}"]`); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 400);
    });
    else location.href = `index.html?book=${b}&chapter=${c}${v ? '&verse=' + v : ''}`;
  }

  /* ── Hoja ── */
  let ov = null, ctx = { book: null, ch: null, tab: 'historia' };
  function sheet() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'tl-ov';
      ov.innerHTML = '<section class="tl-sheet" role="dialog" aria-label="Línea de tiempo"></section>';
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov.querySelector('.tl-sheet');
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }

  function historiaHtml(w) {
    const here = ctx.book ? `<div class="tl-here">Estás en <b>${esc(bookName(ctx.book))} ${ctx.ch}</b>${w && w.era ? ` · <span style="color:var(--gold,#c9a84c)">${esc(w.era[1])}</span>` : ''}${w && w.note ? `<br><small style="color:var(--text-mid,#b8af9c)">${esc(w.note)}</small>` : ''}</div>` : '';
    return here + `<div class="tl-sec">De Génesis a Apocalipsis</div>` + D.eras.map(([id, n, yr, desc, books, start]) =>
      `<button type="button" class="tl-era${w && w.id === id ? ' on' : ''}${start ? '' : ' quiet'}"${start ? ` data-go="${start}"` : ''}><span class="yr">${esc(yr || '—')}</span><span class="eb"></span><span><b>${esc(n)}</b><small>${esc(desc)}</small>${books ? `<small>${esc(books)}</small>` : ''}</span></button>`).join('')
      + `<p class="tl-src">Fechas aproximadas («c.»): la Biblia no siempre da años, y algunas (como la del Éxodo) se discuten. Toca una época para empezar a leerla.</p>`;
  }
  function profetasHtml() {
    const R = D.reigns, cur = ctx.book;
    const col = k => { const i = R.indexOf(k); return i; };
    const span = p => { const ks = p[3].length ? p[3] : ['Uzías']; const is = ks.map(col).filter(i => i >= 0); return [Math.min(...is), Math.max(...is)]; };
    const me = D.prophets.find(p => p[0] === cur);
    const co = me ? D.prophets.filter(p => p !== me && (p[3].some(k => me[3].includes(k)) || p[4].some(k => me[4].includes(k)))) : [];
    const rows = D.prophets.map(p => {
      const [a, b] = span(p), cls = p === me ? ' on' : co.includes(p) ? ' co' : '';
      return `<tr>${a ? `<td colspan="${a}"></td>` : ''}<td class="bar${cls}" colspan="${b - a + 1}" data-go="${p[0]} 1"><span>${esc(p[1])}</span></td>${b < R.length - 1 ? `<td colspan="${R.length - 1 - b}"></td>` : ''}</tr>`;
    }).join('');
    let card = '';
    if (me) {
      const kings = [...me[3].filter(k => k !== 'Exilio' && k !== 'Persia'), ...me[4]];
      card = `<div class="tl-card on"><div class="tl-kick">${esc(me[1])}</div>
        <div style="margin-top:4px">${kings.length ? `Habló en días de <b>${esc(kings.join(', '))}</b>.` : ''} ${esc(D.prophetNote[me[0]] || '')}</div>
        ${co.length ? `<div style="margin-top:6px;color:var(--text-mid,#b8af9c)">Contemporáneos: ${co.map(p => `<button class="tl-link" data-go="${p[0]} 1">${esc(p[1])}</button>`).join(' · ')}. Puedes leer sus mensajes uno al lado del otro.</div>` : ''}
        <div style="margin-top:6px"><button class="tl-link" data-go="${me[2]}">${esc(nice(me[2]))} →</button></div></div>`;
    }
    return card + `<div class="tl-sec">Reyes de Judá y profetas</div><div class="tl-grid"><table><tr>${D.reigns.map(k => `<th>${esc(k)}</th>`).join('')}</tr>${rows}</table></div>
      <p class="tl-src">Según los reyes que nombra el primer versículo de cada libro (Jonás, por 2 Reyes 14:25). Jeroboam II de Israel reinó al mismo tiempo que Uzías. No nombran rey: ${esc(D.noking.join(', '))}.</p>`;
  }
  function salmosHtml() {
    const cur = ctx.book === 'PSA' ? ctx.ch : null;
    return `<p style="margin:4px 0 0;color:var(--text-mid,#b8af9c)">Estos salmos dicen en su título cuándo se escribieron. Lee el salmo junto a la historia que lo provocó.</p>`
      + D.pshist.map(([n, t, r]) => `<div class="tl-card${cur === n ? ' on' : ''}"><div class="tl-row"><button class="tl-link" style="color:inherit;font-size:1rem" data-go="PSA ${n}"><b>Salmo ${n}</b></button><button class="tl-link" data-go="${r}">${esc(nice(r))} →</button></div><div style="color:var(--text-mid,#b8af9c);margin-top:2px">${esc(t)}</div></div>`).join('');
  }
  /* E · ¿Quién vivía? */
  const pref = (k, v) => { try { return localStorage.getItem(k) === v; } catch (e) { return false; } };
  let gy = 1656, who = null, tShift = pref('kodesh_tl_tare', '130') ? 60 : 0, eShift = 0, eShiftSet = false;
  const GCOL = p => p.kind === 'o' ? '#c98a9e' : p.kind ? '#a58fd0' : p.b >= 1656 ? '#c9a84c' : '#6fa0d8';
  const sh = g => (g >= 1 ? tShift : 0) + (g === 2 ? eShift : 0);
  function genPeople() {
    if (!eShiftSet) { eShiftSet = true; eShift = pref('kodesh_tl_eg', '430') ? D.gen.egAlt : 0; }
    return D.gen.people.map(([n, b, d, r, g, kind]) => ({ n, b: b + sh(g), d: d + sh(g), r, kind, reign: kind === 'k' }));
  }
  // Carriles: vidas que no se cruzan comparten fila (con aire para el nombre)
  function lanes(G) {
    const end = [], L = [];
    [...G].sort((a, b) => a.b - b.b).forEach(p => {
      let i = end.findIndex(e => p.b > e + 40); if (i < 0) { i = end.length; end.push(0); }
      end[i] = p.d; L.push([p, i]);
    });
    return { n: end.length, at: new Map(L) };
  }
  function genEvents(G) {
    return D.gen.events.map(([y, t, r, g]) => [y + sh(g), t, r]);
  }
  const shared = (a, b) => Math.max(0, Math.min(a.d, b.d) - Math.max(a.b, b.b));
  const MAXY = 3400, ZOOM = [0.42, 1, 2.4], ROW = 13;
  let zi = 0, PX = ZOOM[0];
  function tareHtml() {
    return `<div class="tl-seg"><span>Años en Egipto: Gálatas 3:17 cuenta los 430 desde la promesa a Abram (215 en Egipto); Éxodo 12:40 en el hebreo, 430 en Egipto.</span><span class="sg" role="group" aria-label="Años en Egipto"><button type="button" data-eg="0" class="${eShift ? '' : 'on'}">215 · Gá 3:17</button><button type="button" data-eg="${D.gen.egAlt}" class="${eShift ? 'on' : ''}">430 · Éx 12:40</button></span></div>
      <div class="tl-seg"><span>Edad de Taré al nacer Abram: Génesis 11:26 se lee como 70; con Hechos 7:4 serían 130.</span><span class="sg" role="group" aria-label="Edad de Taré"><button type="button" data-tare="0" class="${tShift ? '' : 'on'}">70 · Gn 11:26</button><button type="button" data-tare="60" class="${tShift ? 'on' : ''}">130 · Hch 7:4</button></span></div>`;
  }
  function vidasHtml() {
    genPeople();
    if (who) return conocioHtml();
    return tareHtml()
      + `<div class="tl-yr"><b data-gy></b><small data-gev></small></div>
      <div class="tl-gantt" data-gantt><svg></svg><div class="tl-needle"></div><div class="tl-zoom"><button type="button" data-zoom="-1" aria-label="Alejar">−</button><button type="button" data-zoom="1" aria-label="Acercar">+</button></div></div>
      <div class="tl-alive"><div class="tl-kick" data-gk></div><p data-gp></p></div>
      <p class="tl-src" style="margin-top:8px">Arrastra para moverte en el tiempo, de la creación al exilio. Toca una barra o un nombre para ver a quién conoció.<br>Años contados desde la creación sumando el texto: las edades de Génesis 5 y 11, Éxodo 7:7, los 480 años de 1 Reyes 6:1 y los reinados de Judá tal como están escritos (algunos reinados se superpusieron, por eso son la suma del texto y no fechas exactas). Las barras punteadas son solo el reinado: el texto no da su edad. Enoc no murió: «le llevó Dios» (Génesis 5:24).</p>`
      + `<div class="tl-sec">Edades que da el texto</div>` + D.lives.map(([g, list]) => `<div class="tl-sec" style="color:var(--text-mid,#b8af9c)">${esc(g)}</div>` + list.map(([n, a, r]) =>
      `<div class="tl-life"><div class="tl-row"><span>${esc(n)}</span><em>${a} años</em></div><div class="bb" style="width:${Math.max(3, a / 969 * 100).toFixed(1)}%"></div><button class="tl-link" data-go="${r}">${esc(nice(r))}</button></div>`).join('')).join('')
      + `<div class="tl-sec">Datos</div>` + D.facts.map(([t, r1, r2]) => `<div class="tl-card"><div>${esc(t)}</div><div style="margin-top:4px"><button class="tl-link" data-go="${r1}">${esc(nice(r1))}</button>${r2 ? ` · <button class="tl-link" data-go="${r2}">${esc(nice(r2))}</button>` : ''}</div></div>`).join('');
  }
  function conocioHtml() {
    const G = genPeople().filter(p => !p.reign), me = G.find(p => p.n === who) || G[0], span = me.d - me.b, rel = y => (y - me.b) / span * 100;
    const list = G.filter(p => p !== me && shared(p, me) > 0).sort((a, b) => shared(b, me) - shared(a, me));
    return `<button type="button" class="tl-back" data-who="">‹ ¿Quién vivía?</button>
      <div class="tl-chips">${G.map(p => `<button type="button" class="tl-chip${p === me ? ' on' : ''}" data-who="${esc(p.n)}">${esc(p.n)}</button>`).join('')}</div>
      <div class="tl-card"><div class="tl-kick">${esc(me.n)} · año ${me.b} – ${me.d}</div>
        <div style="margin-top:4px">Compartió años de vida con <b>${list.length}</b> de esta lista. <button class="tl-link" data-go="${me.r}">${esc(nice(me.r))}</button></div>
        <div class="tl-lifebar"></div><div class="tl-lifeax"><span>nace</span><span>${Math.round(span / 2)} años</span><span>${me.n === 'Enoc' ? 'Dios se lo llevó' : 'muere'} a los ${span}</span></div></div>`
      + list.map(p => { const a = Math.max(rel(p.b), 0), b = Math.min(rel(p.d), 100);
        return `<div class="tl-kn"><div class="tl-row"><button type="button" data-who="${esc(p.n)}">${esc(p.n)} <small>· de sus ${Math.max(p.b, me.b) - me.b} a sus ${Math.min(p.d, me.d) - me.b}</small></button><em>${shared(p, me)} años juntos</em></div><div class="tr"><i style="left:${a.toFixed(2)}%;width:${Math.max(1, b - a).toFixed(2)}%;background:${GCOL(p)}"></i></div></div>`; }).join('')
      + `<p class="tl-src">La línea vinotinto es la vida de ${esc(me.n)}, de su nacimiento (izquierda) a su muerte (derecha). Lo coloreado encima es el tramo que vivió junto a cada persona.${tShift ? ' Con Taré de 130 años (Hechos 7:4).' : ''}${eShift ? ' Con 430 años en Egipto (Éxodo 12:40).' : ''}</p>`;
  }
  function drawGantt(s) {
    const g = s.querySelector('[data-gantt]'); if (!g) return;
    const svg = g.querySelector('svg'), G = genPeople(), EV = genEvents(G), W = g.clientWidth, H = 6 + lanes(G).n * ROW + 24;
    if (g.clientHeight !== H) g.style.height = H + 'px';
    const NS = 'http://www.w3.org/2000/svg', X = y => W / 2 + (y - gy) * PX;
    const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.textContent = '';
    const lab = PX > 2 ? 100 : PX > .8 ? 250 : 500;
    for (let y = 0; y <= MAXY; y += 50) {
      const x = X(y); if (x < -40 || x > W + 40 || (y % 100 && PX < 2)) continue;
      el('line', { x1: x, y1: 0, x2: x, y2: H, style: `stroke:var(--border2,#2a2836);opacity:${y % lab ? .45 : 1}` });
      if (y % lab === 0) el('text', { x: x + 3, y: H - 6, 'font-size': 10, style: 'fill:var(--text-dim,#6e6656)' }).textContent = y;
    }
    for (const [y] of EV) { const x = X(y); if (x > -10 && x < W + 10) el('line', { x1: x, y1: 0, x2: x, y2: H - 18, stroke: '#6fa0d8', 'stroke-dasharray': '3 3' }); }
    for (const [y1, y2, k, g1, g2] of D.gen.bands) {
      const a = X(y1 + sh(g1)), b = X(y2 + sh(g2)); if (b < 0 || a > W) continue;
      el('rect', { x: a, y: 0, width: b - a, height: H - 18, fill: '#7a1f33', opacity: .16 });
      if (k === 'esclavitud') el('text', { x: Math.max(a, 4) + 4, y: H - 24, 'font-size': 10, style: 'fill:var(--text-mid,#b8af9c)' }).textContent = `hasta ${y2 + sh(g2) - y1 - sh(g1)} años de esclavitud`;
    }
    const LN = lanes(G);
    G.forEach(p => {
      const y0 = 6 + LN.at.get(p) * ROW, x1 = X(p.b), x2 = X(p.d), on = gy >= p.b && gy <= p.d;
      if (x2 < 0 || x1 > W) return;
      const r = el('rect', { x: x1, y: y0, width: Math.max(2, x2 - x1), height: ROW - 3, rx: 4, fill: GCOL(p), opacity: p.reign ? (on ? .45 : .15) : on ? .95 : .25 });
      if (p.reign) { r.setAttribute('stroke', GCOL(p)); r.setAttribute('stroke-dasharray', '3 2'); }
      const vx = Math.max(x1, 0);
      if (Math.min(x2, W) - vx > 30) el('text', { x: vx + 5, y: y0 + ROW - 5, 'font-size': 10, style: `fill:${on && !p.reign ? '#15120a' : 'var(--text,#e9e3d3)'}` }).textContent = p.n;
    });
    s.querySelector('[data-gy]').innerHTML = `${Math.round(gy)}<small>desde la creación</small>`;
    const ev = EV.find(([y]) => Math.abs(y - gy) <= 6);
    s.querySelector('[data-gev]').textContent = ev ? `${ev[1]} · ${nice(ev[2])}` : '';
    const alive = G.filter(p => gy >= p.b && gy <= p.d && !p.reign), king = G.find(p => p.reign && gy >= p.b && gy < p.d);
    s.querySelector('[data-gk]').textContent = alive.length ? `Vivían ${alive.length}` : 'Vivían';
    const pEl = s.querySelector('[data-gp]');
    pEl.innerHTML = (alive.length ? alive.map(p => `<button type="button" data-who="${esc(p.n)}">${esc(p.n)}</button> <small>(${Math.round(gy - p.b)})</small>`).join(' · ') : (gy > 2493 + sh(2) && gy < 2860 + sh(2) ? 'Josué, los jueces y Samuel: el texto no da sus años de nacimiento.' : 'Nadie con fechas en el texto.'))
      + (king ? ` <small>· reinaba ${esc(king.n)}</small>` : '');
    pEl.querySelectorAll('[data-who]').forEach(b => b.onclick = () => openWho(b.dataset.who));
  }
  function openWho(n) { who = n || null; render(); const b = sheet().querySelector('.tl-body'); if (b) b.scrollTop = 0; }
  function bindGantt(s) {
    const g = s.querySelector('[data-gantt]'); if (!g) return;
    let x0 = null, t0 = null, v = 0, lt = 0, raf = 0;
    const clamp = y => Math.max(0, Math.min(MAXY, y));
    const zb = [...g.querySelectorAll('[data-zoom]')], zpaint = () => { zb[0].disabled = zi === 0; zb[1].disabled = zi === ZOOM.length - 1; };
    zb.forEach(b => { b.addEventListener('pointerdown', e => e.stopPropagation()); b.onclick = () => { zi = Math.max(0, Math.min(ZOOM.length - 1, zi + +b.dataset.zoom)); PX = ZOOM[zi]; zpaint(); drawGantt(s); }; });
    zpaint();
    g.addEventListener('pointerdown', e => { x0 = e.clientX; t0 = [e.clientX, e.clientY]; lt = performance.now(); v = 0; cancelAnimationFrame(raf); try { g.setPointerCapture(e.pointerId); } catch (_) {} });
    g.addEventListener('pointermove', e => { if (x0 == null) return; const dx = e.clientX - x0, now = performance.now(); x0 = e.clientX; gy = clamp(gy - dx / PX); v = -dx / PX / Math.max(8, now - lt); lt = now; drawGantt(s); });
    const up = e => {
      if (x0 == null) return; x0 = null;
      if (t0 && e && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 6) {
        const r = g.getBoundingClientRect(), G = genPeople(), LN = lanes(G), lane = Math.floor((e.clientY - r.top - 6) / ROW), yr = gy + (e.clientX - r.left - g.clientWidth / 2) / PX;
        const p = G.filter(q => !q.reign && LN.at.get(q) === lane).find(q => yr >= q.b - 25 && yr <= q.d + 25);
        if (p) return openWho(p.n);
      }
      let vv = v * 16; const step = () => { gy = clamp(gy + vv); vv *= .92; drawGantt(s); if (Math.abs(vv) > .3) raf = requestAnimationFrame(step); };
      if (Math.abs(vv) > .3) raf = requestAnimationFrame(step);
    };
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', () => { x0 = null; });
    drawGantt(s);
  }
  function render() {
    const s = sheet(), w = ctx.book ? where(ctx.book, ctx.ch) : null;
    const tabs = [['historia', 'La historia'], ['profetas', 'Profetas y reyes'], ['salmos', 'Salmos con su historia'], ['vidas', '¿Quién vivía?']];
    const body = ctx.tab === 'profetas' ? profetasHtml() : ctx.tab === 'salmos' ? salmosHtml() : ctx.tab === 'vidas' ? vidasHtml() : historiaHtml(w);
    s.innerHTML = `<div class="tl-grab" data-grab></div><div class="tl-head"><div><div class="tl-kick">Línea de tiempo</div><div class="tl-h">${ctx.tab === 'profetas' ? 'Profetas y reyes' : ctx.tab === 'salmos' ? 'El salmo en su momento' : ctx.tab === 'vidas' ? (who ? 'A quién conoció' : '¿Quién vivía entonces?') : 'De Génesis a Apocalipsis'}</div></div><button class="tl-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="tl-tabs">${tabs.map(([k, l]) => `<button class="tl-tab${ctx.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="tl-body">${body}</div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ctx.tab = b.dataset.tab; who = null; render(); });
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    s.querySelectorAll('.tl-body [data-who]').forEach(b => b.onclick = () => openWho(b.dataset.who));
    s.querySelectorAll('[data-eg]').forEach(b => b.onclick = () => { eShift = +b.dataset.eg; try { localStorage.setItem('kodesh_tl_eg', eShift ? '430' : '215'); } catch (e) {} render(); });
    s.querySelectorAll('[data-tare]').forEach(b => b.onclick = () => { tShift = +b.dataset.tare; try { localStorage.setItem('kodesh_tl_tare', tShift ? '130' : '70'); } catch (e) {} render(); });
    if (ctx.tab === 'vidas' && !who) requestAnimationFrame(() => bindGantt(s));
    if (ctx.tab === 'vidas' && who) { const c = s.querySelector('.tl-chip.on'); if (c) setTimeout(() => c.scrollIntoView({ inline: 'center', block: 'nearest' }), 30); }
    let y0 = null; const head = s.querySelector('.tl-head'), grab = s.querySelector('[data-grab]');
    for (const h of [head, grab]) {
      h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
      h.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) close(); y0 = null; }, { passive: true });
    }
    if (ctx.tab === 'profetas') { const on = s.querySelector('.tl-grid td.bar.on'); if (on) setTimeout(() => on.scrollIntoView({ inline: 'center', block: 'nearest' }), 30); }
  }
  async function open(opts = {}) {
    await load(); if (!D) return;
    ctx = { book: opts.book || (typeof state !== 'undefined' ? state.currentBook : null), ch: opts.ch || (typeof state !== 'undefined' ? state.currentChapter : null), tab: opts.tab || 'historia' };
    who = opts.who || null;
    sheet(); render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  /* ── A y D · En el capítulo ── */
  async function decorate(container, book, ch) {
    if (!container || !book || !ch || container.dataset.tl === `${book}:${ch}`) return;
    container.dataset.tl = `${book}:${ch}`;
    await load(); if (!D) return;
    const w = where(book, ch);
    const prev = container.parentNode && [...container.parentNode.querySelectorAll(`.tl-pill[data-for="${book}:${ch}"]`)];
    if (prev && prev.length) return;
    const add = el => { el.dataset.for = `${book}:${ch}`; container.before(el); };
    // D · salmo con su historia, o historia que dio un salmo
    const ps = book === 'PSA' ? D.pshist.find(p => p[0] === ch) : null;
    const born = D.pshist.filter(p => p[2].split(':')[0] === `${book} ${ch}`);
    if (ps) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tl-pill tl-ps';
      b.innerHTML = `<span>📜</span><span><b>Escrito</b> <small>${esc(ps[1].charAt(0).toLowerCase() + ps[1].slice(1))}</small></span><span class="go">${esc(nice(ps[2]))} ›</span>`;
      b.onclick = () => go(ps[2]); add(b);
    } else if (born.length) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tl-pill tl-ps';
      b.innerHTML = `<span>📜</span><span><b>Aquí nació ${born.length > 1 ? 'el ' + born.map(p => 'Salmo ' + p[0]).join(' y el ') : 'el Salmo ' + born[0][0]}</b> <small>${esc(born[0][1].charAt(0).toLowerCase() + born[0][1].slice(1))}</small></span><span class="go">›</span>`;
      b.onclick = () => go(`PSA ${born[0][0]}`); add(b);
    }
    // A · la época
    const idx = w && w.id ? D.eras.findIndex(e => e[0] === w.id) : -1;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tl-pill';
    const kings = w && w.prophet ? [...w.prophet[3].filter(k => k !== 'Exilio' && k !== 'Persia'), ...w.prophet[4]] : [];
    const label = w && w.era ? `<b>${esc(w.era[1])}</b>${w.era[2] ? ` <small>· ${esc(w.era[2])}</small>` : ''}` : `<b>${esc(bookName(book))}</b> <small>· ${esc((w && w.note) || 'varias épocas')}</small>`;
    b.innerHTML = `<span class="tl-mini" aria-hidden="true">${D.eras.map((e, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</span><span>${label}${kings.length && ch === 1 ? ` <small>· en días de ${esc(kings.slice(0, 2).join(', '))}${kings.length > 2 ? '…' : ''}</small>` : ''}</span><span class="go">›</span>`;
    b.setAttribute('aria-label', 'Línea de tiempo');
    b.onclick = () => open({ book, ch, tab: w && w.prophet && ch === 1 ? 'profetas' : ps ? 'salmos' : 'historia' });
    add(b);
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }

  paintToggle();
  document.addEventListener('DOMContentLoaded', paintToggle);
  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 160); }).observe(main, { childList: true });
    setTimeout(decorateAll, 700);
  }
  window.KodeshTiempo = { open, where, load, decorateAll };
})();
