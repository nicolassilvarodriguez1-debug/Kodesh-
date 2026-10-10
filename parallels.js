/* KODESH — Paralelos de los Evangelios.
   - A · Aviso de paralelos: al comienzo de cada hecho, chips con los otros
     Evangelios que lo cuentan (o «Solo en Juan»).
   - B · Lado a lado: dos Evangelios en columnas, lo propio de cada uno resaltado.
   - C · Qué aporta cada uno: tabla con el detalle que solo trae cada Evangelio.
   - D · Armonía: la vida de Yeshúa en orden, un punto por Evangelio.
   - E · «Solo aquí»: en el texto, una marca en lo que ningún otro cuenta.
   Orden y referencias: data/paralelos.json (basado en la sinopsis de K. Aland).
   Las comparaciones las prepara el admin (api/parallels-pregen.js) y viven en
   Storage (bible-audio/paralelos/index.json). Expone window.KodeshParallels. */
(function () {
  'use strict';
  const REMOTE = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/bible-audio/paralelos/index.json';
  const G = ['MAT', 'MRK', 'LUK', 'JHN'];
  const EN = !!(window.KodeshI18n && KodeshI18n.isEn);
  const TX = (t, v) => { if (window.KodeshI18n) return KodeshI18n.t(t, v); let r = t; for (const k in v || {}) r = r.split('{' + k + '}').join(v[k]); return r; };
  const NAME = EN ? { MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John' } : { MAT: 'Mateo', MRK: 'Marcos', LUK: 'Lucas', JHN: 'Juan' };
  const SHORT = EN ? { MAT: 'Mt', MRK: 'Mk', LUK: 'Lk', JHN: 'Jn' } : { MAT: 'Mt', MRK: 'Mr', LUK: 'Lc', JHN: 'Jn' };
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[«»“”"'.,;:¿?¡!()—–\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const refTxt = ([c1, v1, c2, v2]) => c1 === c2 ? (v1 === v2 ? `${c1}:${v1}` : `${c1}:${v1}–${v2}`) : `${c1}:${v1}–${c2}:${v2}`;

  let DATA = null, DET = rj('kodesh_pl_det', null), dataP = null, detP = null;
  function loadData() { if (!dataP) dataP = fetch('./data/paralelos.json').then(r => r.json()).then(j => (DATA = j)).catch(() => (dataP = null, null)); return dataP; }
  function loadDet() {
    if (!detP) detP = fetch(`${REMOTE}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.items) { DET = j; wj('kodesh_pl_det', j); } return DET; }).catch(() => DET);
    return detP;
  }
  const det = id => (!EN && DET && DET.items && DET.items[id]) || null;
  const ev = id => DATA && DATA.events.find(e => e.id === id);
  async function bibleText() {
    if (typeof loadBibleData === 'function') return loadBibleData();
    if (!window.__plBible) window.__plBible = fetch(window.KodeshI18n ? KodeshI18n.bible : './biblia-rvr.json').then(r => r.json());
    return window.__plBible;
  }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.pl-head { flex-shrink: 0; }
.pl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 14px 0 6px; font-family: var(--font-body, serif); }
.pl-row .pl-t { width: 100%; font-family: 'Cinzel', var(--font-display, serif); font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim, #6e6656); }
.pl-chip { border: 1px solid var(--gold-dim, #6e5a2a); color: var(--gold, #c9a84c); background: none; border-radius: 14px; padding: 3px 10px; font: inherit; font-size: .82rem; cursor: pointer; }
.pl-chip.solo { border-color: rgba(110,160,220,.55); color: #8fb6e6; }
html.light .pl-chip.solo { color: #2f5d94; border-color: rgba(47,93,148,.45); }
.word.pl-solo { text-decoration: underline dotted rgba(110,160,220,.9); text-underline-offset: 4px; text-decoration-thickness: 2px; }
.pl-mark { border: none; background: none; color: #8fb6e6; font-size: .8rem; padding: 0 2px; cursor: pointer; vertical-align: super; }
html.light .pl-mark { color: #2f5d94; }
.pl-ov { position: fixed; inset: 0; z-index: 575; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.pl-ov.open { opacity: 1; pointer-events: auto; }
.pl-sheet { width: min(760px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); }
.pl-ov.open .pl-sheet { transform: none; }
.pl-head { padding: 16px 18px 6px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.pl-kick { font-family: 'Cinzel', var(--font-display, serif); font-size: 0.75rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.pl-h { font-family: var(--font-display, serif); font-size: 1.35rem; font-weight: 600; margin-top: 2px; }
.pl-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.pl-tabs { display: flex; gap: 6px; padding: 4px 18px 10px; overflow-x: auto; flex-shrink: 0; }
.pl-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 18px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; }
.pl-tab.on { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }
.pl-body { flex: 1; overflow: auto; padding: 4px 18px 20px; }
.pl-pick { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.pl-g { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 14px; padding: 4px 12px; font: inherit; font-size: .85rem; cursor: pointer; }
.pl-g.on { background: var(--gold, #c9a84c); border-color: var(--gold, #c9a84c); color: #15120a; }
.pl-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pl-col h4 { margin: 0 0 6px; font-family: 'Cinzel', serif; font-size: 0.77rem; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gold, #c9a84c); position: sticky; top: 0; background: var(--bg, #0b0b12); padding: 4px 0; }
.pl-col p { margin: 0 0 6px; font-size: .98rem; line-height: 1.55; }
.pl-col sup { color: var(--gold, #c9a84c); font-size: 0.754rem; margin-right: 2px; }
.pl-u { background: rgba(110,160,220,.22); color: inherit; border-radius: 3px; padding: 0 2px; }
html.light .pl-u { background: rgba(47,93,148,.16); }
.pl-notes { margin-top: 14px; display: grid; gap: 8px; }
.pl-note { border-left: 3px solid rgba(110,160,220,.6); padding: 6px 10px; font-size: .92rem; line-height: 1.5; color: var(--text-mid, #b8af9c); }
.pl-note b { color: var(--text, #e9e3d3); font-weight: 600; }
.pl-tbl { display: grid; gap: 0; }
.pl-tr { display: grid; grid-template-columns: 92px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--border2, #2a2836); }
.pl-tr .k { font-family: var(--font-display, serif); font-weight: 600; font-size: 1.05rem; }
.pl-tr .k small { display: block; font-family: var(--font-body, serif); font-weight: 400; color: var(--text-dim, #6e6656); font-size: .8rem; }
.pl-tr ul { margin: 0; padding-left: 18px; color: var(--text-mid, #b8af9c); line-height: 1.5; font-size: .95rem; }
.pl-tr ul i { color: var(--text, #e9e3d3); }
.pl-all { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(201,168,76,.08); border: 1px solid var(--gold-dim, #6e5a2a); line-height: 1.5; }
.pl-hsec { font-family: 'Cinzel', serif; font-size: 0.758rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold, #c9a84c); margin: 18px 0 4px; }
.pl-hrow { display: grid; grid-template-columns: 1fr repeat(4, 30px); align-items: center; gap: 2px; padding: 9px 0; border-top: 1px solid var(--border2, #2a2836); cursor: pointer; }
.pl-hrow span { font-size: .98rem; }
.pl-hrow i { text-align: center; color: var(--text-dim, #6e6656); font-style: normal; }
.pl-hrow i.on { color: var(--gold, #c9a84c); }
.pl-hhead { display: grid; grid-template-columns: 1fr repeat(4, 30px); gap: 2px; font-family: 'Cinzel', serif; font-size: 0.754rem; color: var(--text-dim, #6e6656); position: sticky; top: 0; background: var(--bg, #0b0b12); padding: 6px 0; z-index: 1; }
.pl-hhead b { text-align: center; font-weight: 600; }
.pl-tog { display: flex; align-items: center; gap: 8px; font-size: .9rem; color: var(--text-mid, #b8af9c); margin: 4px 0 6px; }
.pl-pop { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 90px); transform: translateX(-50%); width: min(440px, calc(100% - 32px)); z-index: 580; background: var(--bg2, #12111a); border: 1px solid rgba(110,160,220,.5); border-radius: 14px; padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font-family: var(--font-body, serif); color: var(--text, #e9e3d3); line-height: 1.5; }
.pl-pop .pl-kick { color: #8fb6e6; }
@media (max-width: 420px) { .pl-col p { font-size: .92rem; } }
html.pl-off .pl-row, html.pl-off .pl-mark { display: none !important; }
html.pl-off .word.pl-solo { text-decoration: none; }`;
  document.head.appendChild(css);

  /* ── Ajustes: activar o desactivar los avisos y marcas en el lector ── */
  const isOn = () => { try { return localStorage.getItem('kodesh_pl_on') !== '0'; } catch (e) { return true; } };
  function paintToggle() {
    document.documentElement.classList.toggle('pl-off', !isOn());
    const t = document.getElementById('plToggle');
    if (t) { t.classList.toggle('on', isOn()); t.setAttribute('aria-checked', String(isOn())); }
  }
  window.toggleParallels = function () {
    try { localStorage.setItem('kodesh_pl_on', isOn() ? '0' : '1'); } catch (e) {}
    paintToggle();
    if (typeof showToast === 'function') showToast(TX(isOn() ? 'Paralelos activados' : 'Paralelos desactivados'));
  };
  paintToggle();
  document.addEventListener('DOMContentLoaded', paintToggle);

  /* ── A + E · En el lector ── */
  function markPhrase(vEl, phrase, cls) {
    const words = [...vEl.querySelectorAll('.word')];
    const target = norm(phrase).split(' ').filter(Boolean);
    if (!target.length) return false;
    const toks = words.map(w => norm(w.textContent));
    for (let i = 0; i < toks.length; i++) {
      let j = 0, k = i;
      while (k < toks.length && j < target.length) {
        if (!toks[k]) { k++; continue; }
        const parts = toks[k].split(' ');
        if (parts.every((p, n) => p === target[j + n])) { j += parts.length; k++; } else break;
      }
      if (j >= target.length) { for (let m = i; m < k; m++) words[m].classList.add(cls); return true; }
    }
    return false;
  }
  async function decorate(container, book, chapter) {
    if (!container || !NAME[book] || !chapter || container.dataset.pl === `${book}:${chapter}`) return;
    container.dataset.pl = `${book}:${chapter}`;
    await Promise.all([loadData(), loadDet()]);
    if (!DATA) return;
    const here = DATA.events.filter(e => !e.dup && e.r[book] && e.r[book].some(r => r[0] === chapter));
    const groups = new Map();
    for (const e of here) {
      const r = e.r[book].find(x => x[0] === chapter);
      const key = r[1];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    for (const [v, list] of [...groups].sort((a, b) => a[0] - b[0])) {
      const vEl = container.querySelector(`.verse[data-verse="${v}"]`);
      if (!vEl || (vEl.previousElementSibling && vEl.previousElementSibling.classList.contains('pl-row'))) continue;
      const row = document.createElement('div');
      row.className = 'pl-row';
      const others = [], seen = new Set();
      for (const e of list) for (const g of G) if (g !== book && e.r[g] && !seen.has(g + refTxt(e.r[g][0]))) { seen.add(g + refTxt(e.r[g][0])); others.push([g, e]); }
      row.innerHTML = `<div class="pl-t">${esc(TX(list[0].t))}</div>` + (others.length
        ? others.slice(0, 4).map(([g, e]) => `<button type="button" class="pl-chip" data-e="${e.id}" data-g="${g}">${NAME[g]} ${refTxt(e.r[g][0])}</button>`).join('')
        : `<button type="button" class="pl-chip solo" data-solo="${list[0].id}">${esc(TX('Solo en {g}', { g: NAME[book] }))}</button>`);
      vEl.before(row);
      row.querySelectorAll('[data-e]').forEach(b => b.onclick = () => open(Number(b.dataset.e), { a: book, b: b.dataset.g }));
      row.querySelectorAll('[data-solo]').forEach(b => b.onclick = () => pop(TX('Solo en {g}', { g: NAME[book] }), TX('Ningún otro Evangelio cuenta «{t}».', { t: TX(list[0].t) }), { harmony: true }));
    }
    // E · lo que solo trae este Evangelio, marcado en el texto
    for (const e of here) {
      const d = det(e.id); if (!d || !d.u || !d.u[book]) continue;
      for (const x of d.u[book]) {
        if (x.c !== chapter) continue;
        const vEl = container.querySelector(`.verse[data-verse="${x.v}"]`); if (!vEl) continue;
        if (!markPhrase(vEl, x.f, 'pl-solo')) continue;
        if (!vEl.querySelector('.pl-mark')) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'pl-mark'; b.textContent = '◆'; b.setAttribute('aria-label', `Solo en ${NAME[book]}`);
          b.onclick = ev2 => { ev2.stopPropagation(); const items = d.u[book].filter(y => y.c === chapter && y.v === x.v); pop(`Solo en ${NAME[book]}`, items.map(y => `<b>«${esc(y.f)}»</b> — ${esc(y.n)}`).join('<br><br>'), { id: e.id, a: book, html: true }); };
          vEl.appendChild(b);
        }
      }
    }
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }
  let popEl = null;
  function pop(title, body, { id, a, html, harmony } = {}) {
    if (popEl) popEl.remove();
    popEl = document.createElement('div'); popEl.className = 'pl-pop'; popEl.setAttribute('role', 'dialog');
    popEl.innerHTML = `<div class="pl-kick">${esc(title)}</div><div style="margin-top:6px">${html ? body : esc(body)}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        ${id ? `<button class="pl-chip" data-cmp>${TX('Comparar')}</button>` : ''}${harmony ? `<button class="pl-chip" data-har>${TX('Ver la armonía')}</button>` : ''}
        <button class="pl-chip" data-x style="margin-left:auto">${TX('Cerrar')}</button></div>`;
    document.body.appendChild(popEl);
    popEl.querySelector('[data-x]').onclick = () => { popEl.remove(); popEl = null; };
    const c = popEl.querySelector('[data-cmp]'); if (c) c.onclick = () => { popEl.remove(); popEl = null; open(id, { a }); };
    const h = popEl.querySelector('[data-har]'); if (h) h.onclick = () => { popEl.remove(); popEl = null; harmony(); };
    setTimeout(() => document.addEventListener('click', function f(e) { if (popEl && !popEl.contains(e.target)) { popEl.remove(); popEl = null; } document.removeEventListener('click', f, true); }, true), 0);
  }

  /* ── Hoja: B, C y D ── */
  let ov = null, cur = { id: null, a: null, b: null, tab: 'lado' }, onlyMulti = rj('kodesh_pl_multi', true);
  function sheet() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'pl-ov';
      ov.innerHTML = `<section class="pl-sheet" role="dialog" aria-label="${esc(TX('Paralelos de los Evangelios'))}"></section>`;
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov.querySelector('.pl-sheet');
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }
  function show() { requestAnimationFrame(() => ov.classList.add('open')); document.body.style.overflow = 'hidden'; }
  function highlight(text, phrases) {
    let html = esc(text);
    for (const f of phrases) {
      const words = norm(f).split(' ').filter(Boolean); if (!words.length) continue;
      const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.,;:¡!¿?«»“”"\'()—–-]+'), 'i');
      html = html.replace(re, m => `<mark class="pl-u">${m}</mark>`);
    }
    return html;
  }
  async function colHtml(e, g, d) {
    const B = await bibleText();
    const [c1, v1, c2, v2] = e.r[g][0];
    const u = (d && d.u && d.u[g]) || [];
    const out = [];
    for (let c = c1; c <= c2; c++) {
      const ch = (B[g] || {})[String(c)] || {};
      for (const k of Object.keys(ch).map(Number).sort((a, b) => a - b)) {
        if ((c === c1 && k < v1) || (c === c2 && k > v2)) continue;
        out.push(`<p><sup>${c1 !== c2 ? c + ':' : ''}${k}</sup>${highlight(ch[String(k)], u.filter(x => x.c === c && x.v === k).map(x => x.f))}</p>`);
      }
    }
    return `<div class="pl-col"><h4>${NAME[g]} ${refTxt(e.r[g][0])}</h4>${out.join('')}</div>`;
  }
  async function render() {
    const s = sheet();
    const e = cur.id ? ev(cur.id) : null;
    const d = e ? det(e.id) : null;
    const gs = e ? G.filter(g => e.r[g]) : [];
    const tabs = (e ? (EN ? [['lado', 'Lado a lado'], ['armonia', 'Armonía']] : [['lado', 'Lado a lado'], ['aporta', 'Qué aporta cada uno'], ['armonia', 'Armonía']]) : [['armonia', 'Armonía']]).map(([k, l]) => [k, TX(l)]);
    if (EN && cur.tab === 'aporta') cur.tab = 'lado';
    let body = '';
    if (cur.tab === 'lado' && e) {
      if (!gs.includes(cur.a)) cur.a = gs[0];
      if (!gs.includes(cur.b) || cur.b === cur.a) cur.b = gs.find(g => g !== cur.a);
      body = `<div class="pl-pick">${gs.map(g => `<button class="pl-g${g === cur.a || g === cur.b ? ' on' : ''}" data-pg="${g}">${NAME[g]}</button>`).join('')}</div>
        <div class="pl-cols">${await colHtml(e, cur.a, d)}${await colHtml(e, cur.b, d)}</div>
        ${d ? `<div class="pl-notes">${[cur.a, cur.b].flatMap(g => ((d.u && d.u[g]) || []).map(x => `<div class="pl-note"><b>Solo en ${NAME[g]}</b> (${x.c}:${x.v}) · «${esc(x.f)}» — ${esc(x.n)}</div>`)).join('')}</div>` : EN ? '' : `<div class="pl-note" style="margin-top:14px">Lo resaltado en azul (lo que solo trae cada uno) aparecerá cuando se prepare esta comparación.</div>`}`;
    } else if (cur.tab === 'aporta' && e) {
      body = `<div class="pl-tbl">${gs.map(g => {
        const u = (d && d.u && d.u[g]) || [];
        return `<div class="pl-tr"><div class="k">${NAME[g]}<small>${refTxt(e.r[g][0])}</small></div>
          <ul>${u.length ? u.map(x => `<li><i>«${esc(x.f)}»</i> (v.${x.v}) — ${esc(x.n)}</li>`).join('') : `<li>${d ? 'Nada propio: cuenta lo mismo que los demás.' : 'Comparación pendiente.'}</li>`}</ul></div>`;
      }).join('')}</div>
        ${d && d.c ? `<div class="pl-all"><span class="pl-kick">${gs.length === 4 ? 'Los cuatro coinciden' : gs.length === 3 ? 'Los tres coinciden' : 'Los dos coinciden'}</span><br>${esc(d.c)}</div>` : ''}`;
    } else {
      cur.tab = 'armonia';
      const secs = DATA.sections;
      const rows = DATA.events.filter(x => !x.dup && (!onlyMulti || Object.keys(x.r).length >= 2));
      let si = -1, html = '';
      for (const x of rows) {
        let k = -1; secs.forEach((sc, i) => { if (x.id >= sc.from) k = i; });
        if (k !== si) { si = k; html += `<div class="pl-hsec">${esc(TX(secs[k].t))}</div>`; }
        html += `<div class="pl-hrow" data-h="${x.id}"><span>${esc(TX(x.t))}</span>${G.map(g => `<i class="${x.r[g] ? 'on' : ''}">${x.r[g] ? '●' : '·'}</i>`).join('')}</div>`;
      }
      body = `<label class="pl-tog"><input type="checkbox" data-multi ${onlyMulti ? 'checked' : ''}> ${TX('Solo los hechos que cuentan dos o más')}</label>
        <div class="pl-hhead"><span>${TX('Hecho')}</span>${G.map(g => `<b>${SHORT[g]}</b>`).join('')}</div>${html}
        <div style="margin-top:16px;font-size:.78rem;color:var(--text-dim,#6e6656)">${TX('Orden basado en la sinopsis de los Evangelios de Kurt Aland.')}</div>`;
    }
    s.innerHTML = `<div class="pl-head"><div><div class="pl-kick">${TX('Paralelos de los Evangelios')}</div><div class="pl-h">${esc(e && cur.tab !== 'armonia' ? TX(e.t) : TX('La vida de Yeshúa'))}</div></div>
      <button class="pl-x" data-close aria-label="${esc(TX('Cerrar'))}">✕</button></div>
      <div class="pl-tabs">${tabs.map(([k, l]) => `<button class="pl-tab${cur.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="pl-body">${body}</div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { cur.tab = b.dataset.tab; render(); });
    s.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
      const g = b.dataset.pg;
      if (g === cur.a || g === cur.b) return;
      cur.b = cur.a; cur.a = g; render();
    });
    const m = s.querySelector('[data-multi]'); if (m) m.onchange = () => { onlyMulti = m.checked; wj('kodesh_pl_multi', onlyMulti); render(); };
    s.querySelectorAll('[data-h]').forEach(r => r.onclick = () => {
      const x = ev(Number(r.dataset.h));
      if (Object.keys(x.r).length >= 2) { cur = { id: x.id, a: G.find(g => x.r[g]), b: null, tab: 'lado' }; render(); s.querySelector('.pl-body').scrollTop = 0; }
      else { const g = G.find(k => x.r[k]); close(); location.href = `index.html?book=${g}&chapter=${x.r[g][0][0]}&verse=${x.r[g][0][1]}`; }
    });
  }
  async function open(id, { a, b, tab } = {}) {
    await Promise.all([loadData(), loadDet()]);
    if (!DATA || !ev(id)) return;
    cur = { id, a: a || null, b: b || null, tab: tab || 'lado' };
    sheet(); await render(); show();
  }
  async function harmony() {
    await Promise.all([loadData(), loadDet()]);
    if (!DATA) return;
    cur = { id: null, a: null, b: null, tab: 'armonia' };
    sheet(); await render(); show();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && ov.classList.contains('open')) close(); });

  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 90); }).observe(main, { childList: true });
    setTimeout(decorateAll, 400);
  }
  loadDet();
  window.KodeshParallels = { open, harmony, decorateAll };
})();
