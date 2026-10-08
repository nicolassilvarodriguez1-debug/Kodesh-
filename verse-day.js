/* KODESH — Versículo del día con audio.
   - B · Escuchar: el versículo grande, su audio (narrador + música) y la
     palabra que suena resaltada.
   - D · Compartir: historia vertical (imagen o video con el audio).
   - E · Rutina de la mañana: escuchar, contexto, reflexionar, orar y llevarlo.
   - A · La notificación de la mañana abre esto (index.html?vdd=1).
   El contenido vive en Storage (bible-audio/verso-dia/index.json): se graba
   desde el admin y llega sin actualizar la app. Misma fórmula del día que
   api/_verseDay.js (dayIndex). Expone window.KodeshVerseDay. */
(function () {
  'use strict';
  const SB_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co';
  const BASE = `${SB_URL}/storage/v1/object/public/bible-audio/`;
  const INDEX = BASE + 'verso-dia/index.json';
  const STEP = 37;
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayNumber = s => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const dayIndex = (s, n) => ((dayNumber(s) * STEP) % n + n) % n;
  const fmt = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  let IDX = rj('kodesh_vdd_index', null);
  let loading = null;
  function load() {
    if (!loading) loading = fetch(`${INDEX}?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && Array.isArray(j.items)) { IDX = j; wj('kodesh_vdd_index', j); } return IDX; })
      .catch(() => IDX);
    return loading;
  }
  function today(date = localDate()) {
    if (!IDX || !IDX.items || !IDX.count) return null;
    const it = IDX.items[dayIndex(date, IDX.count)];
    return it && it.text ? it : null;
  }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.vdd { position: fixed; inset: 0; z-index: 560; background: radial-gradient(120% 70% at 50% 0%, rgba(201,168,76,.16), transparent 60%), var(--bg, #0b0b12); color: var(--text, #e9e3d3); display: flex; flex-direction: column; opacity: 0; transform: translateY(24px); transition: opacity .3s, transform .35s cubic-bezier(.2,.8,.2,1); pointer-events: none; }
.vdd.open { opacity: 1; transform: none; pointer-events: auto; }
.vdd-top { display: flex; align-items: center; justify-content: space-between; padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px 6px; }
.vdd-kick { font-family: 'Cinzel', var(--font-display, serif); font-size: .68rem; letter-spacing: 3px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.vdd-date { font-size: .8rem; color: var(--text-dim, #6e6656); margin-top: 2px; }
.vdd-x { width: 40px; height: 40px; border-radius: 20px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); font-size: 18px; cursor: pointer; }
.vdd-body { flex: 1; overflow: auto; padding: 10px 26px 20px; display: flex; flex-direction: column; justify-content: center; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.vdd-heb { text-align: center; margin-bottom: 18px; }
.vdd-heb b { display: block; font-family: 'Frank Ruhl Libre', serif; font-weight: 400; font-size: 2.1rem; color: var(--gold, #c9a84c); direction: rtl; line-height: 1.2; }
.vdd-heb span { font-size: .85rem; color: var(--text-dim, #6e6656); font-style: italic; }
.vdd-text { font-family: var(--font-display, serif); font-size: clamp(1.55rem, 5.6vw, 2.2rem); line-height: 1.38; text-align: center; font-weight: 500; }
.vdd-text .w { color: var(--text-mid, #b8af9c); transition: color .25s; }
.vdd.has-audio .vdd-text .w { color: color-mix(in srgb, var(--text, #e9e3d3) 42%, transparent); }
.vdd.has-audio .vdd-text .w.said { color: var(--text, #e9e3d3); }
.vdd.has-audio .vdd-text .w.cur { color: var(--gold, #c9a84c); }
.vdd-ref { text-align: center; margin-top: 18px; font-family: 'Cinzel', var(--font-display, serif); letter-spacing: 2px; font-size: .8rem; text-transform: uppercase; color: var(--gold, #c9a84c); }
.vdd-player { padding: 4px 26px 6px; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.vdd-bar { height: 4px; border-radius: 2px; background: var(--border2, #2a2836); position: relative; cursor: pointer; }
.vdd-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--gold, #c9a84c); width: 0; }
.vdd-times { display: flex; justify-content: space-between; font-size: .75rem; color: var(--text-dim, #6e6656); margin-top: 6px; font-variant-numeric: tabular-nums; }
.vdd-ctrl { display: flex; align-items: center; justify-content: center; gap: 26px; margin-top: 8px; }
.vdd-play { width: 68px; height: 68px; border-radius: 34px; border: none; background: var(--gold, #c9a84c); color: #15120a; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 24px rgba(201,168,76,.3); }
.vdd-ic { width: 46px; height: 46px; border-radius: 23px; border: 1px solid var(--border2, #2a2836); background: none; color: var(--text-mid, #b8af9c); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.vdd-acts { display: flex; gap: 10px; padding: 14px 18px calc(env(safe-area-inset-bottom, 0px) + 16px); max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.vdd-btn { flex: 1; min-height: 48px; border-radius: 24px; border: 1px solid var(--gold-dim, #6e5a2a); background: none; color: var(--gold, #c9a84c); font: inherit; font-size: .95rem; cursor: pointer; padding: 0 12px; }
.vdd-btn.pri { background: var(--gold, #c9a84c); color: #15120a; border-color: var(--gold, #c9a84c); }
.vdd-btn:disabled { opacity: .55; }
.vdd-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.vdd-step { border: 1px solid var(--border2, #2a2836); border-radius: 14px; padding: 14px 16px; display: grid; grid-template-columns: 30px 1fr; gap: 4px 12px; align-items: start; }
.vdd-step.on { border-color: var(--gold-dim, #6e5a2a); background: rgba(201,168,76,.06); }
.vdd-num { width: 28px; height: 28px; border-radius: 14px; border: 1px solid var(--gold-dim, #6e5a2a); color: var(--gold, #c9a84c); display: flex; align-items: center; justify-content: center; font-size: .85rem; }
.vdd-step.done .vdd-num { background: var(--gold, #c9a84c); color: #15120a; border-color: var(--gold, #c9a84c); }
.vdd-step h4 { margin: 3px 0 0; font-family: var(--font-display, serif); font-size: 1.15rem; font-weight: 600; }
.vdd-step p { grid-column: 2; margin: 0; color: var(--text-mid, #b8af9c); font-size: .98rem; line-height: 1.5; }
.vdd-step .more { grid-column: 2; margin-top: 8px; display: none; }
.vdd-step.on .more { display: block; }
.vdd-step textarea { width: 100%; box-sizing: border-box; min-height: 84px; border-radius: 10px; border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); font: inherit; font-size: 1rem; padding: 10px 12px; }
.vdd-pray { font-family: var(--font-display, serif); font-size: 1.12rem; line-height: 1.55; font-style: italic; color: var(--text, #e9e3d3); }
.vdd-small { font-size: .78rem; color: var(--text-dim, #6e6656); text-align: center; margin-top: 10px; }
.vdd-share { display: grid; gap: 12px; justify-items: center; }
.vdd-share canvas { width: min(62vw, 300px); height: auto; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.45); }`;
  document.head.appendChild(css);

  /* ── Estado ── */
  let el = null, item = null, audio = null, raf = 0, words = [], view = 'listen', prayAudio = null;
  const ICON = {
    play: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg>',
    book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16"/></svg>',
  };
  const dateLabel = () => new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const rutinaKey = () => 'kodesh_vdd_rutina_' + localDate();

  function mount() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'vdd'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Versículo del día');
    document.body.appendChild(el);
  }
  function stopAudio() {
    cancelAnimationFrame(raf);
    if (audio) { audio.pause(); audio = null; }
    if (prayAudio) { prayAudio.pause(); prayAudio = null; }
  }
  function close() {
    stopAudio();
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
    wj('kodesh_vdd_seen', localDate());
  }

  /* ── B · Escuchar ── */
  function textHtml(it) {
    return String(it.text).split(/\s+/).filter(Boolean).map((w, i) => `<span class="w" data-i="${i}">${esc(w)}</span>`).join(' ');
  }
  function hebHtml(it) {
    return it.word ? `<div class="vdd-heb"><b lang="${it.word.strong[0] === 'H' ? 'he' : 'el'}">${esc(it.word.lemma)}</b><span>${esc(it.word.xlit ? it.word.xlit + ' · ' : '')}«${esc(it.word.es)}»</span></div>` : '';
  }
  function renderListen() {
    view = 'listen';
    const has = !!item.audio;
    el.classList.toggle('has-audio', has);
    el.innerHTML = `
      <div class="vdd-top"><div><div class="vdd-kick">Versículo del día</div><div class="vdd-date">${esc(dateLabel())}</div></div>
        <button class="vdd-x" data-close aria-label="Cerrar">✕</button></div>
      <div class="vdd-body">${hebHtml(item)}<div class="vdd-text">${textHtml(item)}</div><div class="vdd-ref">${esc(item.refText || item.ref)}</div></div>
      ${has ? `<div class="vdd-player">
        <div class="vdd-bar" data-seek><i></i></div>
        <div class="vdd-times"><span data-cur>0:00</span><span>${fmt(item.dur)}</span></div>
        <div class="vdd-ctrl">
          <button class="vdd-ic" data-share aria-label="Compartir">${ICON.share}</button>
          <button class="vdd-play" data-play aria-label="Escuchar">${ICON.play}</button>
          <button class="vdd-ic" data-read aria-label="Leer el capítulo">${ICON.book}</button>
        </div></div>` : ''}
      <div class="vdd-acts">
        ${has ? '' : `<button class="vdd-btn" data-share>Compartir</button><button class="vdd-btn" data-read>Leer el capítulo</button>`}
        <button class="vdd-btn pri" data-rutina>Rutina de 5 minutos</button>
      </div>`;
    words = [...el.querySelectorAll('.vdd-text .w')];
    wire();
    if (audio) { playBtn(!audio.paused); paint(); }
  }
  function paint() {
    if (!audio || !el) return;
    const t = audio.currentTime || 0;
    const bar = el.querySelector('.vdd-bar i'); if (bar) bar.style.width = `${Math.min(100, (t / (item.dur || audio.duration || 1)) * 100)}%`;
    const cur = el.querySelector('[data-cur]'); if (cur) cur.textContent = fmt(t);
    const ws = item.words || [];
    let k = -1;
    for (let i = 0; i < ws.length; i++) if (ws[i] <= t) k = i; else break;
    if (t >= (item.voiceEnd || Infinity)) k = words.length;
    words.forEach((w, i) => { w.classList.toggle('said', i <= k); w.classList.toggle('cur', i === k); });
    if (!audio.paused) raf = requestAnimationFrame(paint);
  }
  function playBtn(on) { const b = el && el.querySelector('[data-play]'); if (b) { b.innerHTML = on ? ICON.pause : ICON.play; b.setAttribute('aria-label', on ? 'Pausa' : 'Escuchar'); } }
  function toggle() {
    if (!item.audio) return;
    if (!audio) {
      audio = new Audio(item.audio);
      audio.crossOrigin = 'anonymous';
      audio.addEventListener('play', () => { playBtn(true); paint(); });
      audio.addEventListener('pause', () => playBtn(false));
      audio.addEventListener('ended', () => { playBtn(false); paint(); markStep(0); });
    }
    if (audio.paused) audio.play().catch(() => playBtn(false)); else audio.pause();
  }
  function seek(e) {
    if (!audio) toggle();
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    audio.currentTime = f * (item.dur || audio.duration || 0);
    paint();
  }
  function goRead() {
    const it = item; close();
    const url = `index.html?book=${it.book}&chapter=${it.chapter}&verse=${it.v1}`;
    if (typeof selectBook === 'function' && typeof loadChapter === 'function' && /index\.html$|\/$/.test(location.pathname)) {
      selectBook(it.book); loadChapter(it.book, it.chapter);
      setTimeout(() => { const v = document.querySelector(`[data-verse="${it.v1}"], #v${it.v1}`); if (v) v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 700);
    } else location.href = url;
  }
  function wire() {
    el.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    el.querySelectorAll('[data-play]').forEach(b => b.onclick = toggle);
    el.querySelectorAll('[data-seek]').forEach(b => b.onclick = seek);
    el.querySelectorAll('[data-read]').forEach(b => b.onclick = goRead);
    el.querySelectorAll('[data-share]').forEach(b => b.onclick = renderShare);
    el.querySelectorAll('[data-rutina]').forEach(b => b.onclick = renderRutina);
    el.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { if (prayAudio) { prayAudio.pause(); prayAudio = null; } renderListen(); });
  }

  /* ── E · Rutina de la mañana ── */
  function rutina() { return rj(rutinaKey(), { done: [], note: '' }); }
  function markStep(i) {
    const r = rutina(); if (!r.done.includes(i)) { r.done.push(i); wj(rutinaKey(), r); }
    if (view === 'rutina') renderRutina(true);
  }
  function renderRutina(keepScroll) {
    const prev = keepScroll && el.querySelector('.vdd-body') ? el.querySelector('.vdd-body').scrollTop : 0;
    view = 'rutina';
    if (audio && !audio.paused && !keepScroll) { /* sigue sonando */ }
    const r = rutina();
    const open = [0, 1, 2, 3, 4].find(i => !r.done.includes(i));
    const steps = [
      { t: 'Escuchar el versículo', p: `${esc(item.refText)}${item.dur ? ' · ' + fmt(item.dur) : ''}`,
        more: item.audio ? `<button class="vdd-btn pri" data-play style="width:100%">${audio && !audio.paused ? 'Pausa' : 'Escuchar ahora'}</button>` : `<button class="vdd-btn" data-mark="0" style="width:100%">Ya lo leí</button>` },
      { t: 'Leer el contexto', p: esc(item.contexto || ''),
        more: `<div style="display:flex;gap:8px"><button class="vdd-btn" data-read>Leer ${esc(item.refText ? item.refText.split(':')[0] : '')}</button><button class="vdd-btn pri" data-mark="1">Listo</button></div>` },
      { t: 'Reflexionar', p: esc(item.pregunta || ''),
        more: `<textarea data-note placeholder="Escribe lo que YHWH te habla (solo lo ves tú)">${esc(r.note || '')}</textarea><button class="vdd-btn pri" data-mark="2" style="width:100%;margin-top:8px">Listo</button>` },
      { t: 'Orar', p: 'Una oración guiada de un minuto, con música suave',
        more: `<div class="vdd-pray">${esc(item.oracion || '')}</div><div style="display:flex;gap:8px;margin-top:10px"><button class="vdd-btn" data-music>${prayAudio && !prayAudio.paused ? 'Pausar música' : 'Música suave'}</button><button class="vdd-btn pri" data-mark="3">Amén</button></div>` },
      { t: 'Llevarlo contigo', p: 'Guarda el versículo como fondo de pantalla',
        more: `<div style="display:flex;gap:8px"><button class="vdd-btn" data-wall>Fondo de pantalla</button><button class="vdd-btn pri" data-mark="4">Terminar</button></div>` },
    ];
    const allDone = r.done.length >= 5;
    el.classList.toggle('has-audio', !!item.audio);
    el.innerHTML = `
      <div class="vdd-top"><div><div class="vdd-kick">Buenos días · 5 minutos</div><div class="vdd-date">Tu tiempo con YHWH</div></div>
        <button class="vdd-x" data-back aria-label="Volver">‹</button></div>
      <div class="vdd-body" style="justify-content:flex-start">
        <ol class="vdd-steps">${steps.map((s, i) => `
          <li class="vdd-step${r.done.includes(i) ? ' done' : ''}${i === open ? ' on' : ''}" data-step="${i}">
            <span class="vdd-num">${r.done.includes(i) ? '✓' : i + 1}</span><h4>${s.t}</h4><p>${s.p}</p><div class="more">${s.more}</div>
          </li>`).join('')}</ol>
        ${allDone ? `<div class="vdd-small" style="font-size:1rem;color:var(--gold,#c9a84c);margin-top:18px">✦ Completaste tu tiempo de hoy. Shalom.</div>` : ''}
      </div>
      <div class="vdd-acts"><button class="vdd-btn" data-back>Volver al versículo</button><button class="vdd-btn" data-close>Cerrar</button></div>`;
    words = [];
    wire();
    el.querySelectorAll('[data-step]').forEach(li => li.querySelector('h4').onclick = () => {
      el.querySelectorAll('.vdd-step').forEach(x => x.classList.toggle('on', x === li && !x.classList.contains('on')));
    });
    el.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => markStep(+b.dataset.mark));
    const note = el.querySelector('[data-note]');
    if (note) note.oninput = () => { const x = rutina(); x.note = note.value.slice(0, 2000); wj(rutinaKey(), x); };
    const mus = el.querySelector('[data-music]');
    if (mus) mus.onclick = () => {
      if (!prayAudio) { prayAudio = new Audio(`${BASE}library/${item.bed || 'm_paz'}.mp3`); prayAudio.volume = 0.5; prayAudio.loop = true; }
      if (prayAudio.paused) { prayAudio.play().catch(() => {}); mus.textContent = 'Pausar música'; } else { prayAudio.pause(); mus.textContent = 'Música suave'; }
    };
    const wall = el.querySelector('[data-wall]');
    if (wall) wall.onclick = async () => { const cv = drawCard(1179, 2556, { wallpaper: true }); shareBlob(await toBlob(cv), `KODESH ${item.refText}.png`, 'image/png'); };
    const playIn = el.querySelector('.vdd-step [data-play]');
    if (playIn) playIn.onclick = () => { toggle(); setTimeout(() => { if (view === 'rutina') playIn.textContent = audio && !audio.paused ? 'Pausa' : 'Escuchar ahora'; }, 120); };
    if (keepScroll) el.querySelector('.vdd-body').scrollTop = prev;
  }

  /* ── D · Historia para compartir (imagen o video con su audio) ── */
  function wrap(ctx, ws, maxW) {
    const lines = []; let line = [];
    for (let i = 0; i < ws.length; i++) {
      const test = [...line, ws[i]].map(x => x.w).join(' ');
      if (line.length && ctx.measureText(test).width > maxW) { lines.push(line); line = [ws[i]]; } else line.push(ws[i]);
    }
    if (line.length) lines.push(line);
    return lines;
  }
  function drawCard(W, H, { t = null, cv = null, wallpaper = false } = {}) {
    cv = cv || document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), u = W / 1080;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#15131f'); g.addColorStop(1, '#07070b');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.3, W * 0.9); rg.addColorStop(0, 'rgba(201,168,76,0.22)'); rg.addColorStop(1, 'rgba(201,168,76,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(201,168,76,0.45)'; c.lineWidth = 2 * u; c.strokeRect(48 * u, 48 * u, W - 96 * u, H - 96 * u);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const top = wallpaper ? H * 0.36 : H * 0.2;
    c.fillStyle = '#c9a84c'; c.font = `600 ${30 * u}px Cinzel, serif`;
    if (!wallpaper) c.fillText('VERSÍCULO DEL DÍA', W / 2, H * 0.11);
    let y = top;
    if (item.word) {
      c.font = `${110 * u}px 'Frank Ruhl Libre', serif`; c.fillText(item.word.lemma, W / 2, y);
      c.fillStyle = '#9b9384'; c.font = `italic ${34 * u}px 'EB Garamond', serif`;
      c.fillText(`${item.word.xlit ? item.word.xlit + ' · ' : ''}«${item.word.es}»`, W / 2, y + 60 * u);
      y += 150 * u;
    }
    const ws = String(item.text).split(/\s+/).filter(Boolean).map((w, i) => ({ w, i }));
    const avail = (wallpaper ? H * 0.34 : H * 0.48);
    let fs = 78, lines;
    do { c.font = `500 ${fs * u}px 'Cormorant Garamond', serif`; lines = wrap(c, ws, W - 220 * u); fs -= 3; } while (lines.length * fs * 1.36 * u > avail && fs > 36);
    fs += 3; const lh = fs * 1.36 * u;
    y += Math.max(0, (avail - lines.length * lh) / 2) + fs * u;
    const tw = item.words || [];
    let k = -1;
    if (t != null) { for (let i = 0; i < tw.length; i++) if (tw[i] <= t) k = i; else break; if (t >= (item.voiceEnd || Infinity)) k = ws.length; }
    for (const line of lines) {
      const full = line.map(x => x.w).join(' ');
      let x = W / 2 - c.measureText(full).width / 2;
      c.textAlign = 'left';
      for (const wd of line) {
        c.fillStyle = t == null ? '#efe8d6' : wd.i === k ? '#e3c26a' : wd.i < k ? '#efe8d6' : 'rgba(239,232,214,0.38)';
        c.fillText(wd.w, x, y); x += c.measureText(wd.w + ' ').width;
      }
      c.textAlign = 'center'; y += lh;
    }
    c.fillStyle = '#c9a84c'; c.font = `600 ${32 * u}px Cinzel, serif`;
    c.fillText(String(item.refText || '').toUpperCase(), W / 2, y + 30 * u);
    if (!wallpaper) {
      c.fillStyle = '#efe8d6'; c.font = `${36 * u}px 'EB Garamond', serif`;
      c.fillText(item.audio ? '▸  Escúchalo en Kodesh' : 'Léelo en Kodesh', W / 2, H * 0.86);
      c.fillStyle = '#9b9384'; c.font = `600 ${24 * u}px Cinzel, serif`;
      c.fillText('KODESH BIBLE · kodeshbible.com', W / 2, H * 0.9);
      if (t != null && item.dur) {
        c.fillStyle = 'rgba(201,168,76,0.25)'; c.fillRect(160 * u, H * 0.82, W - 320 * u, 5 * u);
        c.fillStyle = '#c9a84c'; c.fillRect(160 * u, H * 0.82, (W - 320 * u) * Math.min(1, t / item.dur), 5 * u);
      }
    } else {
      c.fillStyle = 'rgba(155,147,132,0.8)'; c.font = `600 ${22 * u}px Cinzel, serif`; c.fillText('KODESH', W / 2, H * 0.93);
    }
    return cv;
  }
  const toBlob = (cv, type = 'image/png') => new Promise(r => cv.toBlob(r, type));
  function shareBlob(blob, name, type) {
    if (!blob) return;
    const file = new File([blob], name, { type });
    const can = navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })();
    if (can) navigator.share({ files: [file], title: item.refText }).catch(err => { if (err && err.name !== 'AbortError') dl(); });
    else dl();
    function dl() {
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (typeof showToast === 'function') showToast('Guardado en descargas');
    }
  }
  const videoMime = () => {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    return ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || null;
  };
  async function makeVideo(cv, onT) {
    const mime = videoMime();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = item.audio; a.preload = 'auto';
    const src = ctx.createMediaElementSource(a); const dest = ctx.createMediaStreamDestination(); src.connect(dest);
    const stream = cv.captureStream(30); dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    drawCard(1080, 1920, { t: 0, cv });
    rec.start(250); await ctx.resume(); await a.play();
    await new Promise(res => {
      const loop = () => { drawCard(1080, 1920, { t: a.currentTime, cv }); onT(a.currentTime); if (a.ended) return res(); requestAnimationFrame(loop); };
      a.onended = () => { drawCard(1080, 1920, { t: item.dur, cv }); setTimeout(res, 300); };
      loop();
    });
    rec.stop(); await done; ctx.close();
    return new Blob(chunks, { type: mime.split(';')[0] });
  }
  function renderShare() {
    stopAudio(); playBtn(false);
    view = 'share';
    const canVideo = !!(item.audio && videoMime());
    el.innerHTML = `
      <div class="vdd-top"><div><div class="vdd-kick">Para compartir</div><div class="vdd-date">Historia para Instagram o WhatsApp</div></div>
        <button class="vdd-x" data-back aria-label="Volver">‹</button></div>
      <div class="vdd-body"><div class="vdd-share"><div data-prev></div>
        <div class="vdd-small" data-vstat>${canVideo ? 'El video lleva el audio del versículo con la palabra que suena resaltada.' : ''}</div></div></div>
      <div class="vdd-acts">
        <button class="vdd-btn" data-img>Imagen</button>
        ${canVideo ? '<button class="vdd-btn pri" data-vid>Video con audio</button>' : ''}
        ${!canVideo && item.audio ? '<button class="vdd-btn pri" data-mp3>Audio</button>' : ''}
      </div>`;
    const cv = drawCard(1080, 1920);
    el.querySelector('[data-prev]').appendChild(cv);
    wire();
    el.querySelector('[data-img]').onclick = async () => shareBlob(await toBlob(cv), `KODESH ${item.refText}.png`, 'image/png');
    const mp3 = el.querySelector('[data-mp3]');
    if (mp3) mp3.onclick = async () => { const b = await fetch(item.audio).then(r => r.blob()).catch(() => null); shareBlob(b, `KODESH ${item.refText}.mp3`, 'audio/mpeg'); };
    const vid = el.querySelector('[data-vid]');
    if (vid) vid.onclick = async () => {
      const stat = el.querySelector('[data-vstat]');
      vid.disabled = true; el.querySelector('[data-img]').disabled = true;
      try {
        const blob = await makeVideo(cv, t => { stat.textContent = `Preparando el video… ${fmt(t)} de ${fmt(item.dur)}`; vid.textContent = `Grabando ${fmt(t)}`; });
        stat.textContent = 'Video listo.'; vid.textContent = 'Compartir video'; vid.disabled = false;
        vid.onclick = () => shareBlob(blob, `KODESH ${item.refText}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, blob.type);
        shareBlob(blob, `KODESH ${item.refText}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, blob.type);
      } catch (e) {
        stat.textContent = 'No se pudo preparar el video en este dispositivo. Comparte la imagen.'; vid.remove();
      }
      const ib = el.querySelector('[data-img]'); if (ib) ib.disabled = false;
    };
  }

  /* ── Abrir ── */
  async function open({ autoplay = false, date } = {}) {
    await load();
    const it = today(date);
    if (!it) { if (typeof showToast === 'function') showToast('El versículo del día no está disponible ahora'); return false; }
    item = it; mount(); stopAudio();
    renderListen();
    requestAnimationFrame(() => el.classList.add('open'));
    document.body.style.overflow = 'hidden';
    if (autoplay && item.audio) toggle();
    if (typeof trackEvent === 'function') trackEvent('verse_day_open', { ref: item.ref });
    return true;
  }
  // Una vez al día, al abrir la app (reemplaza a la «Promesa del día» cuando hay versículo)
  async function maybeShowDaily() {
    if (rj('kodesh_vdd_seen', '') === localDate()) return true;
    await load();
    if (!today()) return false;
    setTimeout(() => { if (!document.querySelector('.vdd.open')) open(); }, 1200);
    return true;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && el.classList.contains('open')) close(); });
  if (/[?&]vdd=1/.test(location.search)) document.addEventListener('DOMContentLoaded', () => open({ autoplay: true }));
  load();

  window.KodeshVerseDay = { load, today, open, close, maybeShowDaily, dayIndex };
})();
