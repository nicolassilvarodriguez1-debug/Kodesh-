/* KODESH — Línea de tiempo bíblica.
   - A · «Estás aquí»: una línea fina sobre el capítulo con su época (se puede apagar en Ajustes).
   - B · La historia completa: las épocas con sus libros, la del capítulo resaltada.
   - C · Profetas y reyes: los reyes que nombra cada libro profético y quiénes fueron contemporáneos.
   - D · El salmo en su momento: los salmos cuyo título cuenta cuándo se escribieron, enlazados a la historia (y al revés).
   - E · Vidas comparadas: las edades que da el texto, cada una con su versículo.
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
.tl-life button { margin-top: 3px; font-size: .8rem; color: var(--text-dim, #6e6656); }`;
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
  function vidasHtml() {
    const max = 969;
    return D.lives.map(([g, list]) => `<div class="tl-sec">${esc(g)}</div>` + list.map(([n, a, r]) =>
      `<div class="tl-life"><div class="tl-row"><span>${esc(n)}</span><em>${a} años</em></div><div class="bb" style="width:${Math.max(3, a / max * 100).toFixed(1)}%"></div><button class="tl-link" data-go="${r}">${esc(nice(r))}</button></div>`).join('')).join('')
      + `<div class="tl-sec">Datos</div>` + D.facts.map(([t, r1, r2]) => `<div class="tl-card"><div>${esc(t)}</div><div style="margin-top:4px"><button class="tl-link" data-go="${r1}">${esc(nice(r1))}</button>${r2 ? ` · <button class="tl-link" data-go="${r2}">${esc(nice(r2))}</button>` : ''}</div></div>`).join('')
      + '<p class="tl-src">Solo las edades que dice el texto bíblico, con el versículo de cada una.</p>';
  }
  function render() {
    const s = sheet(), w = ctx.book ? where(ctx.book, ctx.ch) : null;
    const tabs = [['historia', 'La historia'], ['profetas', 'Profetas y reyes'], ['salmos', 'Salmos con su historia'], ['vidas', 'Vidas comparadas']];
    const body = ctx.tab === 'profetas' ? profetasHtml() : ctx.tab === 'salmos' ? salmosHtml() : ctx.tab === 'vidas' ? vidasHtml() : historiaHtml(w);
    s.innerHTML = `<div class="tl-grab" data-grab></div><div class="tl-head"><div><div class="tl-kick">Línea de tiempo</div><div class="tl-h">${ctx.tab === 'profetas' ? 'Profetas y reyes' : ctx.tab === 'salmos' ? 'El salmo en su momento' : ctx.tab === 'vidas' ? 'Vidas comparadas' : 'De Génesis a Apocalipsis'}</div></div><button class="tl-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="tl-tabs">${tabs.map(([k, l]) => `<button class="tl-tab${ctx.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="tl-body">${body}</div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ctx.tab = b.dataset.tab; render(); });
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
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
