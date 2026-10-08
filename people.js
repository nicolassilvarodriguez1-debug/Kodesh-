/* KODESH — Personas de la Biblia.
   - A · Ficha del personaje: al tocar un nombre, el lexicón abre como siempre
     con un aviso «👤 Abraham · Ver ficha»: nombre original y significado,
     resumen, familia, momentos clave y dónde aparece en el Nuevo Testamento.
   - B · Árbol de familia (padres, hermanos, pareja, hijos y nietos).
   - C · Red de relaciones: familia y con quién aparece más.
   - D · Quién aparece en el capítulo: una fila arriba; tocar marca dónde.
   - E · La vida en una línea: las edades que dice el texto.
   Datos: data/personas.json + data/personas/{LIBRO}.json (Theographic Bible
   Metadata, CC BY-SA 4.0); fichas narrativas desde el admin
   (api/people-pregen.js → bible-audio/personas/index.json).
   Expone window.KodeshPeople. */
(function () {
  'use strict';
  const REMOTE = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/bible-audio/personas/index.json';
  const NT = new Set(['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV']);
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[«»“”"'.,;:¿?¡!()—–]/g, ' ').replace(/\s+/g, ' ').trim();
  const bookName = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;
  const nice = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](.+)$/.exec(r); return m ? `${bookName(m[1])} ${m[2].replace('-', '–')}` : r; };
  const readUrl = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](\d+)(?::(\d+))?/.exec(r); return m ? `index.html?book=${m[1]}&chapter=${m[2]}${m[3] ? '&verse=' + m[3] : ''}` : 'index.html'; };

  let DATA = null, DET = rj('kodesh_pp_det', null), dataP = null, detP = null;
  const books = {};
  function loadData() { if (!dataP) dataP = fetch('./data/personas.json').then(r => r.json()).then(j => (DATA = j)).catch(() => { dataP = null; return null; }); return dataP; }
  function loadBook(b) { if (!books[b]) books[b] = fetch(`./data/personas/${b}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})); return books[b]; }
  function loadDet() {
    if (!detP) detP = fetch(`${REMOTE}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.items) { DET = j; wj('kodesh_pp_det', j); } return DET; }).catch(() => DET);
    return detP;
  }
  const P = id => DATA && DATA.p[id];
  const nameOf = id => (P(id) || [id])[0];
  const R = id => (DATA && DATA.r[id]) || {};
  const det = id => (DET && DET.items && DET.items[id]) || null;

  /* ── Ajustes ── */
  const isOn = () => { try { return localStorage.getItem('kodesh_pp_on') !== '0'; } catch (e) { return true; } };
  function paintToggle() {
    document.documentElement.classList.toggle('pp-off', !isOn());
    const t = document.getElementById('ppToggle');
    if (t) { t.classList.toggle('on', isOn()); t.setAttribute('aria-checked', String(isOn())); }
  }
  window.togglePeople = function () {
    try { localStorage.setItem('kodesh_pp_on', isOn() ? '0' : '1'); } catch (e) {}
    paintToggle();
    if (typeof showToast === 'function') showToast(isOn() ? 'Personajes activados' : 'Personajes desactivados');
  };

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.pp-row { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 10px; margin-bottom: 4px; scrollbar-width: none; }
.pp-row::-webkit-scrollbar { display: none; }
.pp-row .pp-lbl { font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim, #6e6656); align-self: center; white-space: nowrap; margin-right: 2px; }
.pp-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text, #e9e3d3); border-radius: 18px; padding: 4px 11px 4px 4px; font: inherit; font-size: .88rem; cursor: pointer; white-space: nowrap; }
.pp-chip.on { border-color: var(--gold, #c9a84c); }
.pp-av { width: 24px; height: 24px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-family: 'Frank Ruhl Libre', serif; font-size: .85rem; background: rgba(201,168,76,.16); color: var(--gold, #c9a84c); flex-shrink: 0; }
.pp-av.f { background: rgba(196,120,150,.18); color: #d99ab3; }
.word.pp-hl { background: rgba(201,168,76,.28); border-radius: 3px; }
html.pp-off .pp-row { display: none !important; }
.pp-bar { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 92px); transform: translateX(-50%); z-index: 560; display: flex; align-items: center; gap: 12px; background: var(--bg2, #12111a); border: 1px solid var(--gold-dim, #6e5a2a); border-radius: 22px; padding: 8px 8px 8px 16px; box-shadow: 0 10px 30px rgba(0,0,0,.4); font-family: var(--font-body, serif); color: var(--text, #e9e3d3); white-space: nowrap; }
.pp-bar button { border: none; border-radius: 16px; padding: 6px 12px; font: inherit; cursor: pointer; background: var(--gold, #c9a84c); color: #15120a; }
.pp-bar button.x { background: none; color: var(--text-dim, #6e6656); padding: 6px 8px; }
.pp-ov { position: fixed; inset: 0; z-index: 579; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.pp-ov.open { opacity: 1; pointer-events: auto; }
.pp-sheet { width: min(720px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); overflow: hidden; }
.pp-ov.open .pp-sheet { transform: none; }
.pp-head { padding: 16px 18px 6px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; flex-shrink: 0; }
.pp-kick { font-family: 'Cinzel', serif; font-size: .6rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.pp-h { font-family: var(--font-display, serif); font-size: 1.6rem; font-weight: 600; line-height: 1.15; margin-top: 2px; }
.pp-heb { font-family: 'Frank Ruhl Libre', serif; font-size: 1.5rem; color: var(--gold, #c9a84c); }
.pp-sig { color: var(--text-mid, #b8af9c); font-style: italic; font-size: .95rem; margin-top: 2px; }
.pp-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.pp-tabs { display: flex; gap: 6px; padding: 6px 18px 10px; overflow-x: auto; flex-shrink: 0; }
.pp-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 18px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; }
.pp-tab.on { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }
.pp-body { flex: 1; overflow: auto; padding: 4px 18px 24px; }
.pp-sec { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold, #c9a84c); margin: 18px 0 6px; }
.pp-p { line-height: 1.6; color: var(--text, #e9e3d3); font-size: 1.02rem; }
.pp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pp-chips small { color: var(--text-dim, #6e6656); font-size: .78rem; margin-left: 2px; }
.pp-mom { display: grid; grid-template-columns: 92px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border2, #2a2836); cursor: pointer; }
.pp-mom b { color: var(--gold, #c9a84c); font-weight: 500; font-size: .9rem; }
.pp-refs { display: flex; flex-wrap: wrap; gap: 6px; }
.pp-ref { border: 1px solid var(--border2, #2a2836); border-radius: 12px; padding: 3px 9px; font-size: .85rem; color: var(--text-mid, #b8af9c); text-decoration: none; }
.pp-tree { display: grid; gap: 14px; justify-items: center; padding-top: 6px; }
.pp-gen { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.pp-gen-l { font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim, #6e6656); text-align: center; margin-bottom: -6px; }
.pp-node { border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); border-radius: 12px; padding: 7px 12px; font: inherit; font-size: .95rem; cursor: pointer; }
.pp-node.me { border-color: var(--gold, #c9a84c); background: rgba(201,168,76,.12); font-weight: 600; }
.pp-line { width: 1px; height: 10px; background: var(--border2, #2a2836); }
.pp-net svg { width: 100%; height: auto; display: block; }
.pp-life { position: relative; margin-left: 28px; border-left: 2px solid var(--gold-dim, #6e5a2a); padding-left: 0; }
.pp-age { position: relative; padding: 4px 0 14px 34px; cursor: pointer; }
.pp-age i { position: absolute; left: -22px; top: 2px; width: 42px; height: 30px; border-radius: 15px; background: var(--gold, #c9a84c); color: #15120a; font-style: normal; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: .9rem; }
.pp-age b { display: block; font-weight: 500; font-size: 1rem; }
.pp-age small { color: var(--text-dim, #6e6656); }
.pp-src { font-size: .7rem; color: var(--text-dim, #6e6656); margin-top: 18px; }`;
  document.head.appendChild(css);

  /* ── Hoja del personaje ── */
  let ov = null, cur = null, tab = 'ficha';
  function sheet() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'pp-ov';
      ov.innerHTML = '<section class="pp-sheet" role="dialog" aria-label="Personaje"></section>';
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    return ov.querySelector('.pp-sheet');
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }
  const av = id => { const p = P(id); return `<span class="pp-av${p && p[1] === 'F' ? ' f' : ''}">${esc((p ? p[0] : '?')[0])}</span>`; };
  const chip = (id, label) => `<button type="button" class="pp-chip" data-p="${esc(id)}">${av(id)}${esc(nameOf(id))}${label ? `<small>${esc(label)}</small>` : ''}</button>`;

  function fichaHtml(id) {
    const p = P(id), r = R(id), d = det(id);
    const fam = [];
    (r.pa || []).forEach(x => fam.push([x, 'padre'])); (r.ma || []).forEach(x => fam.push([x, 'madre']));
    (r.pr || []).forEach(x => fam.push([x, p[1] === 'F' ? 'esposo' : 'esposa'])); (r.he || []).forEach(x => fam.push([x, 'hermano/a']));
    (r.hi || []).forEach(x => fam.push([x, 'hijo/a']));
    const nt = !NT.has((p[4][0] || '').split(':')[0]) ? p[4].filter(k => NT.has(k.split(':')[0])) : [];
    return `${d && d.resumen ? `<p class="pp-p">${esc(d.resumen)}</p>` : `<p class="pp-p" style="color:var(--text-mid,#b8af9c)">Aparece en ${p[2]} ${p[2] === 1 ? 'versículo' : 'versículos'} de la Biblia.</p>`}
      ${fam.length ? `<div class="pp-sec">Familia</div><div class="pp-chips">${fam.slice(0, 14).map(([x, l]) => chip(x, l)).join('')}</div>` : ''}
      ${d && d.momentos ? `<div class="pp-sec">Momentos clave</div>${d.momentos.map(m => `<div class="pp-mom" data-go="${esc(m.ref)}"><b>${esc(nice(m.ref))}</b><span>${esc(m.t)}</span></div>`).join('')}` : ''}
      ${nt.length ? `<div class="pp-sec">En el Nuevo Testamento</div><div class="pp-refs">${nt.slice(0, 16).map(k => `<a class="pp-ref" href="${readUrl(k)}">${esc(nice(k))}</a>`).join('')}</div>` : ''}
      <div class="pp-sec">Dónde aparece · ${p[4].length} ${p[4].length === 1 ? 'capítulo' : 'capítulos'}</div>
      <div class="pp-refs">${p[4].slice(0, 60).map(k => `<a class="pp-ref" href="${readUrl(k)}">${esc(nice(k))}</a>`).join('')}${p[4].length > 60 ? `<span class="pp-ref">y ${p[4].length - 60} más</span>` : ''}</div>`;
  }
  function treeHtml(id) {
    const r = R(id);
    const gp = [...new Set([...(r.pa || []), ...(r.ma || [])].flatMap(x => [...(R(x).pa || []), ...(R(x).ma || [])]))];
    const parents = [...(r.pa || []), ...(r.ma || [])];
    const sibs = r.he || [];
    const kids = r.hi || [];
    const grand = [...new Set(kids.flatMap(x => R(x).hi || []))];
    const row = (label, ids, me) => ids.length || me ? `<div class="pp-gen-l">${label}</div><div class="pp-gen">${ids.slice(0, 14).map(x => `<button type="button" class="pp-node" data-p="${esc(x)}">${esc(nameOf(x))}</button>`).join('')}${me || ''}</div>` : '';
    const meNode = `<button type="button" class="pp-node me">${esc(nameOf(id))}</button>${(r.pr || []).map(x => `<span style="color:var(--text-dim,#6e6656)">♥</span><button type="button" class="pp-node" data-p="${esc(x)}">${esc(nameOf(x))}</button>`).join('')}`;
    const parts = [row('Abuelos', gp), row('Padres', parents), row(sibs.length ? 'Con sus hermanos' : '', sibs, meNode), row('Hijos', kids), row('Nietos', grand)].filter(Boolean);
    if (parts.length <= 1) return '<p class="pp-p" style="color:var(--text-mid,#b8af9c)">La Biblia no da datos de su familia.</p>';
    return `<div class="pp-tree">${parts.join('<div class="pp-line"></div>')}</div><p class="pp-src" style="text-align:center">Toca cualquier nombre para abrir su ficha</p>`;
  }
  function netHtml(id) {
    const r = R(id);
    const byVc = a => [...a].sort((x, y) => ((P(y) || [])[2] || 0) - ((P(x) || [])[2] || 0));
    const fam = [...new Set([...(r.pa || []), ...(r.ma || []), ...byVc(r.pr || []).slice(0, 2), ...byVc(r.he || []).slice(0, 2), ...byVc(r.hi || []).slice(0, 3)])].slice(0, 8);
    const co = (r.co || []).filter(x => !fam.includes(x)).slice(0, 4);
    const nodes = [...fam.map(x => [x, 'fam']), ...co.map(x => [x, 'co'])];
    if (!nodes.length) return '<p class="pp-p" style="color:var(--text-mid,#b8af9c)">Sin relaciones registradas.</p>';
    const W = 600, H = 580, cx = W / 2, cy = H / 2 - 18, rad = 205;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    nodes.forEach(([x, k], i) => {
      const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2, nx = cx + Math.cos(a) * rad, ny = cy + Math.sin(a) * rad * 0.82;
      svg += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${k === 'fam' ? 'rgba(201,168,76,.55)' : 'rgba(110,160,220,.45)'}" stroke-width="2" ${k === 'co' ? 'stroke-dasharray="5 5"' : ''}/>`;
    });
    nodes.forEach(([x, k], i) => {
      const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2, nx = cx + Math.cos(a) * rad, ny = cy + Math.sin(a) * rad * 0.82;
      const rel = k === 'co' ? 'aparece con' : (r.pa || []).includes(x) ? 'padre' : (r.ma || []).includes(x) ? 'madre' : (r.pr || []).includes(x) ? 'pareja' : (r.hi || []).includes(x) ? 'hijo/a' : 'hermano/a';
      svg += `<g data-p="${esc(x)}" style="cursor:pointer"><circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="30" fill="var(--bg2,#12111a)" stroke="${k === 'fam' ? '#c9a84c' : '#6fa0d8'}" stroke-width="2"/>
        <text x="${nx.toFixed(1)}" y="${(ny + 8).toFixed(1)}" text-anchor="middle" font-family="Frank Ruhl Libre, serif" font-size="22" fill="${k === 'fam' ? '#c9a84c' : '#8fb6e6'}">${esc(nameOf(x)[0])}</text>
        <text x="${nx.toFixed(1)}" y="${(ny + 52).toFixed(1)}" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="21" fill="var(--text,#e9e3d3)">${esc(nameOf(x))}</text>
        <text x="${nx.toFixed(1)}" y="${(ny + 72).toFixed(1)}" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="17" fill="var(--text-dim,#6e6656)">${rel}</text></g>`;
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="48" fill="rgba(201,168,76,.18)" stroke="#c9a84c" stroke-width="2.5"/><text x="${cx}" y="${cy + 7}" text-anchor="middle" font-family="EB Garamond, Georgia, serif" font-size="22" font-weight="600" fill="var(--text,#e9e3d3)">${esc(nameOf(id))}</text></svg>`;
    return `<div class="pp-net">${svg}</div><div style="display:flex;gap:16px;justify-content:center;font-size:.85rem;color:var(--text-dim,#6e6656)"><span><b style="color:#c9a84c">—</b> Familia</span><span><b style="color:#6fa0d8">- -</b> Aparece con (comparten versículos)</span></div>`;
  }
  function lifeHtml(id) {
    const d = det(id);
    if (!d || !d.edades) return '';
    return `<div class="pp-life">${d.edades.map(a => `<div class="pp-age" data-go="${esc(a.ref)}"><i>${a.edad}</i><b>${esc(a.t)}</b><small>${esc(nice(a.ref))}</small></div>`).join('')}</div>
      <p class="pp-src">Solo las edades que dice el texto bíblico, con el versículo de cada una.</p>`;
  }
  function render() {
    const s = sheet(), id = cur, p = P(id), d = det(id);
    const tabs = [['ficha', 'Ficha'], ['familia', 'Familia'], ['red', 'Relaciones']];
    if (d && d.edades) tabs.push(['vida', 'Línea de vida']);
    if (!tabs.some(t => t[0] === tab)) tab = 'ficha';
    const body = tab === 'familia' ? treeHtml(id) : tab === 'red' ? netHtml(id) : tab === 'vida' ? lifeHtml(id) : fichaHtml(id);
    s.innerHTML = `<div class="pp-head"><div><div class="pp-kick">${p[1] === 'F' ? 'Mujer' : 'Hombre'} de la Biblia · ${p[2]} ${p[2] === 1 ? 'versículo' : 'versículos'}</div>
        <div class="pp-h">${esc(p[0])} ${d && d.heb ? `<span class="pp-heb" lang="${d.heb.strong[0] === 'H' ? 'he' : 'el'}">${esc(d.heb.lemma)}</span>` : ''}</div>
        ${d && d.heb && d.heb.sig ? `<div class="pp-sig">${esc(d.heb.sig)}</div>` : ''}</div>
        <button class="pp-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="pp-tabs">${tabs.map(([k, l]) => `<button class="pp-tab${tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="pp-body">${body}<p class="pp-src">Personajes y parentescos: Theographic Bible Metadata (CC BY-SA 4.0).</p></div>`;
    s.querySelector('[data-close]').onclick = close;
    s.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    s.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { if (P(b.dataset.p)) { cur = b.dataset.p; render(); s.querySelector('.pp-body').scrollTop = 0; } });
    s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { close(); location.href = readUrl(b.dataset.go.replace(' ', ':')); });
  }
  async function open(id, startTab) {
    await Promise.all([loadData(), loadDet()]);
    if (!P(id)) return;
    cur = id; tab = startTab || 'ficha';
    sheet(); render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  /* ── D · Quién aparece en el capítulo ── */
  function markWords(container, list, id) {
    let n = 0;
    container.querySelectorAll('.word.pp-hl').forEach(w => w.classList.remove('pp-hl'));
    for (const [v, pid, form] of list) {
      if (pid !== id) continue;
      const vEl = container.querySelector(`.verse[data-verse="${v}"]`); if (!vEl) continue;
      const target = norm(form);
      vEl.querySelectorAll('.word').forEach(w => { if (norm(w.textContent) === target) { w.classList.add('pp-hl'); n++; } });
    }
    return n;
  }
  let bar = null;
  function showBar(container, list, id) {
    const n = markWords(container, list, id);
    if (bar) bar.remove();
    bar = document.createElement('div'); bar.className = 'pp-bar';
    const lbl = (list.find(x => x[1] === id) || [])[2] || nameOf(id);
    bar.innerHTML = `<span><b>${esc(lbl)}</b> aparece ${n} ${n === 1 ? 'vez' : 'veces'}</span><button type="button" data-f>Ficha →</button><button type="button" class="x" data-x aria-label="Quitar">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-f]').onclick = () => open(id);
    bar.querySelector('[data-x]').onclick = () => { bar.remove(); bar = null; markWords(container, [], null); container.parentElement && container.parentElement.querySelectorAll('.pp-chip.on').forEach(c => c.classList.remove('on')); };
    const first = container.querySelector('.word.pp-hl'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function decorate(container, book, chapter) {
    if (!container || !book || !chapter || container.dataset.pp === `${book}:${chapter}`) return;
    container.dataset.pp = `${book}:${chapter}`;
    const [, byCh] = await Promise.all([loadData(), loadBook(book)]);
    const list = (byCh && byCh[String(chapter)]) || [];
    if (!DATA || !list.length) return;
    // Cuántas veces aparece cada uno y con qué nombre (Abram, Sarai… como dice el texto)
    const cnt = {}, forms = {};
    for (const [, pid, form] of list) { cnt[pid] = (cnt[pid] || 0) + 1; (forms[pid] = forms[pid] || {})[form] = (forms[pid][form] || 0) + 1; }
    const label = pid => Object.entries(forms[pid]).sort((a, b) => b[1] - a[1])[0][0];
    const seenLabel = new Set();
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([pid]) => pid).filter(P)
      .filter(pid => { const l = norm(label(pid)); if (seenLabel.has(l)) return false; seenLabel.add(l); return true; }).slice(0, 8);
    if (!top.length || (container.previousElementSibling && container.previousElementSibling.classList.contains('pp-row'))) return;
    const row = document.createElement('div'); row.className = 'pp-row';
    row.innerHTML = `<span class="pp-lbl">En este capítulo</span>` + top.map(pid => `<button type="button" class="pp-chip" data-p="${esc(pid)}">${av(pid)}${esc(label(pid))}</button>`).join('');
    container.before(row);
    row.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      row.querySelectorAll('.pp-chip').forEach(c => c.classList.toggle('on', c === b));
      showBar(container, list, b.dataset.p);
    });
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    if (bar) { bar.remove(); bar = null; }
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }

  /* ── A · Tocar un nombre: aviso dentro del lexicón ── */
  document.addEventListener('click', ev => {
    const w = ev.target.closest && ev.target.closest('#mainContent .word');
    const old = document.getElementById('ppLexBanner'); if (old) old.remove();
    if (!w || w.classList.contains('mp-place') || document.body.classList.contains('verse-select-mode')) return;
    const vEl = w.closest('.verse[data-verse]'); if (!vEl) return;
    const box = vEl.closest('.book-cont');
    const book = (box && box.dataset.book) || (typeof state !== 'undefined' && state.currentBook);
    const ch = Number((box && box.dataset.chapter) || (typeof state !== 'undefined' && state.currentChapter));
    const v = Number(vEl.dataset.verse);
    const word = norm(w.textContent);
    (async () => {
      const byCh = await loadBook(book); await loadData();
      const hit = ((byCh && byCh[String(ch)]) || []).find(([vv, , form]) => vv === v && norm(form) === word);
      if (!hit || !P(hit[1])) return;
      const id = hit[1];
      for (let i = 0; i < 20; i++) { const pop = document.getElementById('lexiconPopup'); if (pop && pop.classList.contains('visible')) break; await new Promise(r => setTimeout(r, 60)); }
      const pop = document.getElementById('lexiconPopup');
      const b = document.createElement('button');
      b.id = 'ppLexBanner'; b.type = 'button';
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:calc(100% - 24px);margin:10px 12px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--gold-dim,#3a3220);background:var(--gold-soft,rgba(201,168,76,.06));color:var(--text);font:inherit;font-size:.9rem;text-align:left;cursor:pointer';
      b.innerHTML = `<span>👤</span><span style="flex:1"><b style="color:var(--gold)">${esc(nameOf(id))}</b> · ${P(id)[2]} versículos</span><span style="color:var(--gold);white-space:nowrap">Ver ficha →</span>`;
      b.onclick = e => { e.stopPropagation(); if (typeof closeLexicon === 'function') closeLexicon(); open(id); };
      if (pop && pop.classList.contains('visible')) pop.insertBefore(b, pop.firstChild);
    })();
  }, true);

  paintToggle();
  document.addEventListener('DOMContentLoaded', paintToggle);
  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 120); }).observe(main, { childList: true });
    setTimeout(decorateAll, 500);
  }
  window.KodeshPeople = { open, decorateAll };
})();
