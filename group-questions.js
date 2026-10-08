/* KODESH — Preguntas para el grupo (células, congregación y familias).
   - A · Al terminar la porción: tarjeta al final del último capítulo en el lector.
   - B · Guía del líder: la reunión armada paso a paso, con tiempos.
   - C · Compartir: imagen + mensaje listos para el grupo de WhatsApp.
   - D · Según quién estudia: niños, jóvenes y adultos.
   - E · Pregunta de la semana: en Parashot, con respuesta privada.
   El contenido lo prepara el admin (api/groups-pregen.js) y vive en Storage
   (bible-audio/grupos/): llega sin actualizar la app. Expone window.KodeshGroups. */
(function () {
  'use strict';
  const BASE = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/bible-audio/grupos/';
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let INDEX = rj('kodesh_gq_index', null), LIST = null;
  const cache = {};
  let idxP = null;
  function loadIndex() {
    if (!idxP) idxP = fetch(`${BASE}index.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.ready) { INDEX = j; wj('kodesh_gq_index', j); } return INDEX; }).catch(() => INDEX);
    return idxP;
  }
  function loadList() {
    if (!LIST) LIST = fetch('./parashot-data.json').then(r => r.json()).catch(() => []);
    return LIST;
  }
  async function get(num) {
    await loadIndex();
    const v = INDEX && INDEX.ready && INDEX.ready[num];
    if (!v) return null;
    if (cache[num] && cache[num].v === v) return cache[num];
    const local = rj('kodesh_gq_' + num, null);
    if (local && local.v === v) return (cache[num] = local);
    try {
      const d = await fetch(`${BASE}${num}.json?v=${v}`).then(r => r.ok ? r.json() : null);
      if (d) { cache[num] = d; wj('kodesh_gq_' + num, d); }
      return d;
    } catch (e) { return local; }
  }
  // «GEN 3:9» → «Génesis 3:9»
  function nice(ref) {
    const m = /^([1-3]?[A-Z]{2,3}) (.+)$/.exec(String(ref || ''));
    if (!m) return ref || '';
    const b = (window.KodeshRef && KodeshRef.BOOKS || []).find(x => x[0] === m[1]);
    return `${b ? b[1] : m[1]} ${m[2].replace('-', '–')}`;
  }
  const quoted = q => { q = String(q || '').trim(); return /^«[^«»]*»$/.test(q) ? q : `«${q}»`; };
  function readUrl(ref) {
    const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)/.exec(String(ref || ''));
    return m ? `index.html?book=${m[1]}&chapter=${m[2]}&verse=${m[3]}` : 'index.html';
  }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.kg-card { margin: 34px 0 10px; border: 1px solid var(--gold-dim, #6e5a2a); border-radius: 16px; padding: 18px 18px 14px; background: linear-gradient(180deg, rgba(201,168,76,.08), transparent); font-family: var(--font-body, serif); }
.kg-kick { font-family: 'Cinzel', var(--font-display, serif); font-size: .62rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.kg-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 4px 0 10px; }
.kg-title b { font-family: var(--font-display, serif); font-size: 1.35rem; color: var(--text, #e9e3d3); font-weight: 600; }
.kg-title span { font-family: 'Frank Ruhl Libre', serif; color: var(--gold, #c9a84c); font-size: 1.3rem; }
.kg-q { display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border2, #2a2836); font-size: 1.02rem; line-height: 1.5; color: var(--text, #e9e3d3); }
.kg-q i { font-style: normal; width: 24px; height: 24px; border-radius: 12px; border: 1px solid var(--gold-dim, #6e5a2a); color: var(--gold, #c9a84c); display: flex; align-items: center; justify-content: center; font-size: .78rem; margin-top: 2px; }
.kg-q small { display: block; color: var(--text-dim, #6e6656); font-size: .78rem; margin-top: 2px; }
.kg-q a { color: inherit; }
.kg-btns { display: flex; gap: 8px; margin-top: 12px; }
.kg-btn { flex: 1; min-height: 44px; border-radius: 22px; border: 1px solid var(--gold-dim, #6e5a2a); background: none; color: var(--gold, #c9a84c); font: inherit; font-size: .95rem; cursor: pointer; padding: 0 12px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.kg-btn.pri { background: var(--gold, #c9a84c); color: #15120a; border-color: var(--gold, #c9a84c); }
.kg-ov { position: fixed; inset: 0; z-index: 570; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .25s; }
.kg-ov.open { opacity: 1; pointer-events: auto; }
.kg-sheet { width: min(640px, 100%); max-height: 92vh; display: flex; flex-direction: column; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; border: 1px solid var(--border2, #2a2836); border-bottom: none; transform: translateY(30px); transition: transform .3s cubic-bezier(.2,.8,.2,1); font-family: var(--font-body, serif); }
.kg-ov.open .kg-sheet { transform: none; }
.kg-head { padding: 16px 18px 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.kg-x { width: 38px; height: 38px; border-radius: 19px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); cursor: pointer; flex-shrink: 0; }
.kg-tabs { display: flex; gap: 6px; padding: 0 18px 10px; overflow-x: auto; }
.kg-tab { border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); border-radius: 18px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; }
.kg-tab.on { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }
.kg-body { overflow: auto; padding: 4px 18px 16px; }
.kg-foot { padding: 10px 18px calc(env(safe-area-inset-bottom, 0px) + 14px); border-top: 1px solid var(--border2, #2a2836); display: flex; gap: 8px; }
.kg-step { display: grid; grid-template-columns: 46px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--border2, #2a2836); }
.kg-step:first-child { border-top: none; }
.kg-min { font-family: 'Cinzel', serif; color: var(--gold, #c9a84c); font-size: .95rem; padding-top: 2px; }
.kg-step b { display: block; font-family: var(--font-display, serif); font-size: 1.1rem; font-weight: 600; }
.kg-step p { margin: 3px 0 0; color: var(--text-mid, #b8af9c); line-height: 1.5; }
.kg-note { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: var(--bg2, #12111a); color: var(--text-mid, #b8af9c); font-size: .95rem; line-height: 1.5; }
.kg-act { margin-top: 12px; padding: 12px 14px; border-radius: 12px; border: 1px dashed var(--gold-dim, #6e5a2a); font-size: .98rem; line-height: 1.5; }
.kg-share { display: grid; justify-items: center; gap: 12px; }
.kg-share canvas { width: min(70vw, 320px); height: auto; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.kg-msg { width: 100%; box-sizing: border-box; min-height: 92px; border-radius: 12px; border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); font: inherit; font-size: .98rem; padding: 10px 12px; }
.kg-week { border: 1px solid var(--gold-dim, #6e5a2a); border-radius: 16px; padding: 16px; margin: 14px 0; background: linear-gradient(180deg, rgba(201,168,76,.07), transparent); }
.kg-week h3 { margin: 6px 0 2px; font-family: var(--font-display, serif); font-size: 1.45rem; line-height: 1.3; font-weight: 600; }
.kg-week textarea { width: 100%; box-sizing: border-box; min-height: 80px; margin-top: 10px; border-radius: 12px; border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); font: inherit; font-size: 1rem; padding: 10px 12px; }`;
  document.head.appendChild(css);

  /* ── Hoja: preguntas (D), guía del líder (B), compartir (C) ── */
  let ov = null, cur = null, tab = 'preguntas', who = rj('kodesh_gq_who', 'adultos');
  function qHtml(list, refLinks = true) {
    return list.map((x, i) => `<div class="kg-q"><i>${i + 1}</i><div>${esc(x.q)}${x.ref ? `<small>${refLinks ? `<a href="${readUrl(x.ref)}">${esc(nice(x.ref))}</a>` : esc(nice(x.ref))}</small>` : ''}</div></div>`).join('');
  }
  function render() {
    const { p, d } = cur;
    const tabs = [['preguntas', 'Preguntas'], ['guia', 'Guía del líder'], ['compartir', 'Compartir']];
    let body = '', foot = '';
    if (tab === 'preguntas') {
      const groups = [['ninos', 'Niños'], ['jovenes', 'Jóvenes'], ['adultos', 'Adultos']];
      body = `<div class="kg-tabs" style="padding:0 0 6px">${groups.map(([k, l]) => `<button class="kg-tab${who === k ? ' on' : ''}" data-who="${k}">${l}</button>`).join('')}</div>
        ${qHtml(d[who] || [])}
        ${who === 'ninos' && d.actividad ? `<div class="kg-act"><span class="kg-kick">Actividad</span><br>${esc(d.actividad)}</div>` : ''}`;
      foot = `<button class="kg-btn" data-tab="compartir">Compartir</button><button class="kg-btn pri" data-tab="guia">Guía del líder</button>`;
    } else if (tab === 'guia') {
      const steps = [
        ['5′', 'Bienvenida y rompehielo', esc(d.rompehielo || '¿Qué fue lo mejor de tu semana?')],
        ['10′', 'Lectura en voz alta', d.lectura ? `${esc(nice(d.lectura.ref))}${d.lectura.nota ? ' · ' + esc(d.lectura.nota) : ''} · o escuchar la radionovela` : `${esc(p.torah)}`],
        ['25′', 'Conversación', `Preguntas 1 a ${(d.adultos || []).length}${(d.adultos || []).length ? ':' : ''}`],
        ['10′', 'La conexión con Yeshúa', `${esc(p.mesianica)}${d.conexion ? ' · ' + esc(d.conexion) : ''}`],
        ['10′', 'Oración y bendición', 'Números 6:24–26 · «YHWH te bendiga y te guarde…»'],
      ];
      body = `<div class="kg-kick" style="margin-bottom:4px">60 minutos · ${esc(p.nombre)}</div>
        ${steps.map(([m, t, s], i) => `<div class="kg-step"><div class="kg-min">${m}</div><div><b>${t}</b><p>${s}</p>${i === 2 ? `<div style="margin-top:4px">${qHtml(d.adultos || [], false)}</div>` : ''}</div></div>`).join('')}
        ${(d.preparar || []).length ? `<div class="kg-note"><span class="kg-kick">Para preparar</span><br>${d.preparar.map(esc).join(' · ')}</div>` : ''}`;
      foot = `<a class="kg-btn" href="${readUrl(d.lectura ? d.lectura.ref : `${p.book} ${p.startChapter}:${p.startVerse}`)}">Abrir la lectura</a><button class="kg-btn pri" data-tab="compartir">Enviar al grupo</button>`;
    } else {
      body = `<div class="kg-share"><div data-prev></div>
        <textarea class="kg-msg" data-msg>${esc(shareText())}</textarea></div>`;
      foot = `<button class="kg-btn" data-copy>Copiar mensaje</button><button class="kg-btn pri" data-send>Compartir</button>`;
    }
    ov.querySelector('.kg-sheet').innerHTML = `
      <div class="kg-head"><div><div class="kg-kick">Para el grupo · Porción ${p.num}</div>
        <div class="kg-title" style="margin:2px 0 0"><b>${esc(p.nombre)}</b><span lang="he">${esc(p.heb)}</span></div></div>
        <button class="kg-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="kg-tabs">${tabs.map(([k, l]) => `<button class="kg-tab${tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="kg-body">${body}</div><div class="kg-foot">${foot}</div>`;
    ov.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    ov.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    ov.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { who = b.dataset.who; wj('kodesh_gq_who', who); render(); });
    if (tab === 'compartir') {
      const cv = drawShare(); ov.querySelector('[data-prev]').appendChild(cv);
      const msg = ov.querySelector('[data-msg]');
      ov.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(msg.value); if (typeof showToast === 'function') showToast('Mensaje copiado'); } catch (e) {} };
      ov.querySelector('[data-send]').onclick = () => cv.toBlob(b => share(b, msg.value), 'image/png');
    }
  }
  function shareText() {
    const { p, d } = cur;
    return `Shalom familia. Esta semana leemos ${p.nombre} (${p.torah}).\n\nPregunta para este Shabat:\n${quoted(d.central.q)}\n\nLéela en KODESH: https://kodeshbible.com/parashot.html?p=${p.num}`;
  }
  function share(blob, text) {
    const file = blob && new File([blob], `KODESH ${cur.p.nombre}.png`, { type: 'image/png' });
    const can = file && navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [file], text }); } catch (e) { return false; } })();
    if (can) return navigator.share({ files: [file], text }).catch(() => {});
    if (navigator.share) return navigator.share({ text }).catch(() => {});
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => { if (typeof showToast === 'function') showToast('Mensaje copiado'); }).catch(() => {});
  }
  function wrap(c, text, maxW) {
    const out = []; let line = '';
    for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (line && c.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  }
  function drawShare() {
    const { p, d } = cur;
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16141f'); g.addColorStop(1, '#08080c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W / 2, 330, 10, W / 2, 330, 700); rg.addColorStop(0, 'rgba(201,168,76,.22)'); rg.addColorStop(1, 'rgba(201,168,76,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(201,168,76,.45)'; c.lineWidth = 2; c.strokeRect(46, 46, W - 92, H - 92);
    c.textAlign = 'center';
    c.fillStyle = '#c9a84c'; c.font = "120px 'Frank Ruhl Libre', serif"; c.fillText(p.heb, W / 2, 300);
    c.fillStyle = '#efe8d6'; c.font = "600 64px 'Cormorant Garamond', serif"; c.fillText(p.nombre, W / 2, 400);
    c.fillStyle = '#9b9384'; c.font = "34px 'EB Garamond', serif"; c.fillText(p.torah, W / 2, 455);
    c.fillStyle = '#c9a84c'; c.font = "600 26px Cinzel, serif"; c.fillText('PREGUNTA PARA ESTE SHABAT', W / 2, 600);
    let fs = 70, lines;
    do { c.font = `500 ${fs}px 'Cormorant Garamond', serif`; lines = wrap(c, quoted(d.central.q), W - 220); fs -= 4; } while (lines.length * fs * 1.3 > 420 && fs > 36);
    fs += 4; let y = 700;
    c.fillStyle = '#efe8d6'; for (const l of lines) { c.fillText(l, W / 2, y); y += fs * 1.3; }
    if (d.central.ref) { c.fillStyle = '#9b9384'; c.font = "32px 'EB Garamond', serif"; c.fillText(nice(d.central.ref), W / 2, y + 20); }
    c.fillStyle = '#9b9384'; c.font = "600 26px Cinzel, serif"; c.fillText('KODESH BIBLE · kodeshbible.com', W / 2, H - 110);
    return cv;
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }
  async function open(num, startTab = 'preguntas') {
    const [list, d] = await Promise.all([loadList(), get(num)]);
    const p = list.find(x => x.num === num);
    if (!p || !d) { if (typeof showToast === 'function') showToast('Las preguntas de esta porción aún no están listas'); return; }
    cur = { p, d }; tab = startTab;
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'kg-ov';
      ov.innerHTML = '<section class="kg-sheet" role="dialog" aria-label="Preguntas para el grupo"></section>';
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && ov.classList.contains('open')) close(); });

  /* ── A · Tarjeta al terminar la porción (lector) ── */
  async function cardFor(book, chapter) {
    const list = await loadList();
    const p = list.find(x => x.book === book && x.endChapter === chapter);
    if (!p) return null;
    const d = await get(p.num);
    if (!d) return null;
    const el = document.createElement('div');
    el.className = 'kg-card';
    el.innerHTML = `<div class="kg-kick">Fin de la porción · Para el grupo</div>
      <div class="kg-title"><b>Preguntas de ${esc(p.nombre)}</b><span lang="he">${esc(p.heb)}</span></div>
      ${qHtml(d.adultos || [])}
      <div class="kg-btns"><button class="kg-btn" data-s>Compartir</button><button class="kg-btn pri" data-g>Guía del líder</button></div>`;
    el.querySelector('[data-s]').onclick = () => open(p.num, 'compartir');
    el.querySelector('[data-g]').onclick = () => open(p.num, 'guia');
    return el;
  }
  async function decorate() {
    const blocks = [...document.querySelectorAll('#mainContent .bible-text')];
    for (const bt of blocks) {
      if (bt.dataset.kg) continue;
      bt.dataset.kg = '1';
      const book = bt.dataset.book || (typeof state !== 'undefined' && state.currentBook);
      const ch = Number(bt.dataset.chapter || (typeof state !== 'undefined' && state.currentChapter));
      if (!book || !ch) continue;
      const card = await cardFor(book, ch);
      if (card && bt.isConnected) bt.after(card);
    }
  }
  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorate, 120); }).observe(main, { childList: true });
    setTimeout(decorate, 400);
  }

  /* ── E · Pregunta de la semana (Parashot) ── */
  async function weekly(container, p) {
    if (!container || !p) return;
    const d = await get(p.num);
    if (!d) { container.hidden = true; return; }
    const key = 'kodesh_gq_answer_' + p.num;
    const ans = rj(key, '');
    const r = d.central.ref ? /^([1-3]?[A-Z]{2,3}) (\d+)/.exec(d.central.ref) : null;
    container.hidden = false;
    container.innerHTML = `<div class="kg-week">
      <div class="kg-kick">Pregunta de la semana · ${esc(p.nombre)}</div>
      <h3>${esc(quoted(d.central.q))}</h3>
      ${d.central.ref ? `<div style="color:var(--text-dim,#6e6656);font-size:.9rem">${esc(nice(d.central.ref))}</div>` : ''}
      <textarea placeholder="Tu respuesta (solo la ves tú)">${esc(ans)}</textarea>
      <div class="kg-btns">
        ${r ? `<a class="kg-btn" href="index.html?book=${r[1]}&chapter=${r[2]}">Leer ${esc(nice(r[1] + ' ' + r[2]))}</a>` : ''}
        <button class="kg-btn pri" data-g>Preguntas para el grupo</button>
      </div></div>`;
    const ta = container.querySelector('textarea');
    ta.oninput = () => wj(key, ta.value.slice(0, 3000));
    container.querySelector('[data-g]').onclick = () => open(p.num);
  }

  loadIndex();
  window.KodeshGroups = { open, get, weekly, loadIndex };
})();
