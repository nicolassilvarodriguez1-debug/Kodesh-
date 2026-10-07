/* KODESH — Escuchar el capítulo (audio de ElevenLabs, Traducción Kodesh).
   Si el capítulo tiene audio grabado (tabla bible_audio), aparece «▶ Escuchar»
   junto a RVR60 / Kodesh. El reproductor queda abajo, resalta el versículo que
   suena y, al terminar, sigue con el capítulo siguiente si también tiene audio. */
(function () {
  'use strict';
  const VERSION = 'kodesh';
  const SPEEDS = [1, 1.25, 1.5, 0.8];
  const byBook = {};          // book → Promise<{ chapter: row }>
  const $ = id => document.getElementById(id);
  const st = { book: null, chapter: null, row: null, verse: null, userScrollAt: 0, speedIdx: 0, cine: true, until: null };
  // Desde Parashot: ?play=1&until=GEN.6.8 abre el reproductor y para al final de la porción.
  const qs = new URLSearchParams(location.search);
  let pending = qs.get('play') === '1' ? { book: qs.get('book'), chapter: parseInt(qs.get('chapter')) || 1, verse: parseInt(qs.get('verse')) || 0 } : null;
  const untilQ = (qs.get('until') || '').match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/);
  const untilParam = untilQ ? { book: untilQ[1], chapter: +untilQ[2], verse: +untilQ[3] } : null;
  try { st.cine = localStorage.getItem('kodesh_audio_cine') !== '0'; } catch (e) {}
  try { st.speedIdx = Math.max(0, SPEEDS.indexOf(Number(localStorage.getItem('kodesh_audio_speed')) || 1)); } catch (e) {}
  let audio = null;

  function sb() { try { return typeof getSupabase === 'function' ? getSupabase() : null; } catch (e) { return null; } }
  function rowsFor(book) {
    if (!byBook[book]) {
      byBook[book] = (async () => {
        const c = sb(); if (!c) throw new Error('sin conexión');
        const { data, error } = await c.from('bible_audio').select('chapter,path,path_cine,cine_updated_at,duration_s,timings,text_hash').eq('version', VERSION).eq('book', book);
        if (error) throw error;
        const map = {}; (data || []).forEach(r => { map[r.chapter] = r; }); return map;
      })().catch(e => { delete byBook[book]; return {}; });
    }
    return byBook[book];
  }
  const bookName = id => (typeof getAllBooks === 'function' && (getAllBooks().find(b => b.id === id) || {}).name) || id;
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function injectUI() {
    if ($('kaPlayer')) return;
    const css = document.createElement('style');
    css.textContent = `
.audio-chip { gap: 6px; }
.audio-chip.playing { border-color: var(--gold); color: var(--gold); }
.verse.audio-now { background: var(--gold-glow, rgba(201,168,76,.14)); box-shadow: 0 0 0 6px var(--gold-glow, rgba(201,168,76,.14)); border-radius: 6px; transition: background .3s; }
.ka-player { position: fixed; left: 50%; transform: translate(-50%, 140%); bottom: 16px; width: min(560px, calc(100% - 20px)); z-index: 320;
  background: var(--bg2, #12111A); border: 1px solid var(--gold-dim, #3a3220); border-radius: 20px; box-shadow: 0 16px 40px rgba(0,0,0,.45);
  padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; transition: transform .28s cubic-bezier(.2,.8,.2,1); color: var(--text, #E9E3D3); }
.ka-player.open { transform: translate(-50%, 0); }
@media (max-width: 900px) { .ka-player { bottom: calc(72px + var(--safe-area-inset-bottom, 0px)); } }
.ka-row { display: flex; align-items: center; gap: 8px; }
.ka-title { flex: 1; min-width: 0; }
.ka-name { font-family: var(--font-display, 'Cormorant Garamond', serif); font-size: 1.05rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ka-sub { font-size: .72rem; color: var(--text-dim, #8E8676); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ka-btn { width: 40px; height: 40px; border-radius: 20px; border: 1px solid var(--border, #2A2836); background: transparent; color: var(--text-mid, #B8AF9C); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; font: inherit; font-size: .78rem; padding: 0; }
.ka-play { width: 48px; height: 48px; border-radius: 24px; border: none; background: var(--gold, #C9A84C); color: #15120A; }
.ka-speed { width: auto; padding: 0 10px; min-width: 48px; }
.ka-cine { font-size: 1rem; }
.ka-cine.on { border-color: var(--gold, #C9A84C); background: var(--gold-glow, rgba(201,168,76,.14)); }
.ka-bar { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--border, #2A2836); outline: none; margin: 4px 0 0; }
.ka-bar::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 8px; background: var(--gold, #C9A84C); cursor: pointer; }
.ka-bar::-moz-range-thumb { width: 16px; height: 16px; border-radius: 8px; background: var(--gold, #C9A84C); border: none; }`;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.className = 'ka-player'; el.id = 'kaPlayer';
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Reproductor del capítulo');
    const ico = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    el.innerHTML = `
      <div class="ka-row">
        <button class="ka-btn ka-play" id="kaPlay" aria-label="Reproducir">${ico('<path d="M8 5v14l11-7z" fill="currentColor"/>')}</button>
        <div class="ka-title"><div class="ka-name" id="kaName">—</div><div class="ka-sub" id="kaSub">Traducción Kodesh</div></div>
        <button class="ka-btn" id="kaBack" aria-label="Retroceder 15 segundos">${ico('<path d="M11 5L6 9l5 4"/><path d="M6 9h8a5 5 0 010 10h-3"/>')}</button>
        <button class="ka-btn" id="kaFwd" aria-label="Adelantar 15 segundos">${ico('<path d="M13 5l5 4-5 4"/><path d="M18 9h-8a5 5 0 000 10h3"/>')}</button>
        <button class="ka-btn ka-cine" id="kaCine" aria-label="Película: música y efectos" title="Película: música y efectos" hidden>🎬</button>
        <button class="ka-btn ka-speed" id="kaSpeed" aria-label="Velocidad">1×</button>
        <button class="ka-btn" id="kaClose" aria-label="Cerrar reproductor">✕</button>
      </div>
      <input type="range" class="ka-bar" id="kaBar" min="0" max="1000" value="0" aria-label="Posición">`;
    document.body.appendChild(el);
    audio = new Audio(); audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', syncButtons); audio.addEventListener('pause', syncButtons);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('error', () => { if (typeof showToast === 'function') showToast('No se pudo cargar el audio'); syncButtons(); });
    $('kaPlay').onclick = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
    $('kaBack').onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); };
    $('kaFwd').onclick = () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); };
    $('kaSpeed').onclick = () => { st.speedIdx = (st.speedIdx + 1) % SPEEDS.length; applySpeed(); };
    $('kaClose').onclick = close;
    $('kaCine').onclick = () => {
      st.cine = !st.cine;
      try { localStorage.setItem('kodesh_audio_cine', st.cine ? '1' : '0'); } catch (e) {}
      const t = audio.currentTime, playing = !audio.paused;
      setSource();
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = t; if (playing) audio.play().catch(() => {}); }, { once: true });
      if (typeof showToast === 'function') showToast(st.cine ? '🎬 Película: con música y efectos' : 'Solo voces');
    };
    $('kaBar').addEventListener('input', e => { if (audio.duration) audio.currentTime = audio.duration * e.target.value / 1000; });
    applySpeed();
    ['wheel', 'touchmove'].forEach(ev => window.addEventListener(ev, () => { st.userScrollAt = Date.now(); }, { passive: true }));
  }
  function applySpeed() {
    const s = SPEEDS[st.speedIdx];
    if (audio) audio.playbackRate = s;
    const b = $('kaSpeed'); if (b) b.textContent = (s === 1 ? '1' : String(s).replace('.', ',')) + '×';
    try { localStorage.setItem('kodesh_audio_speed', s); } catch (e) {}
  }
  function syncButtons() {
    const playing = audio && !audio.paused;
    const p = $('kaPlay');
    if (p) {
      p.innerHTML = playing
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      p.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    }
    document.querySelectorAll('.audio-chip').forEach(c => {
      const mine = st.book === state.currentBook && st.chapter === state.currentChapter;
      c.classList.toggle('playing', !!(mine && playing));
      c.querySelector('.lbl').textContent = mine && playing ? 'Escuchando' : 'Escuchar';
    });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
  function verseAt(t) {
    const tm = st.row?.timings || [];
    let v = null;
    for (const [n, s] of tm) { if (s <= t + 0.05) v = n; else break; }
    return v;
  }
  function onTime() {
    if (!audio) return;
    const d = audio.duration || Number(st.row?.duration_s) || 0;
    $('kaBar').value = d ? Math.round(audio.currentTime / d * 1000) : 0;
    $('kaSub').textContent = `Kodesh · ${fmt(audio.currentTime)} / ${fmt(d)}`;
    const v = verseAt(audio.currentTime);
    const u = st.until;
    if (u && st.book === u.book && st.chapter === u.chapter && v > u.verse && !audio.paused) {
      audio.pause(); st.until = null;   // fin de la porción
      if (typeof showToast === 'function') showToast('Fin de la porción ✦ Shabat shalom');
      return;
    }
    if (v !== st.verse) { st.verse = v; highlight(); }
  }
  function highlight() {
    document.querySelectorAll('.verse.audio-now').forEach(e => e.classList.remove('audio-now'));
    if (st.book !== state.currentBook || st.chapter !== state.currentChapter || !st.verse) return;
    const el = document.querySelector(`#mainContent .verse[data-verse="${st.verse}"]`);
    if (!el) return;
    el.classList.add('audio-now');
    if (audio && !audio.paused && Date.now() - st.userScrollAt > 5000) {
      const r = el.getBoundingClientRect();
      const bottomLimit = window.innerHeight - 220;
      if (r.top < 90 || r.bottom > bottomLimit) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  async function onEnded() {
    syncButtons();
    const u = st.until;
    if (u && st.book === u.book && st.chapter >= u.chapter) { st.until = null; if (typeof showToast === 'function') showToast('Fin de la porción ✦ Shabat shalom'); return; }
    const next = st.chapter + 1;
    const rows = await rowsFor(st.book);
    if (rows[next] && typeof loadChapter === 'function') {
      await loadChapter(st.book, next);
      start(st.book, next, rows[next]);
    }
  }
  function close() {
    if (audio) audio.pause();
    $('kaPlayer')?.classList.remove('open');
    st.book = st.chapter = st.verse = null; st.until = null;
    document.querySelectorAll('.verse.audio-now').forEach(e => e.classList.remove('audio-now'));
    syncButtons();
  }
  function setSource() {
    const row = st.row; if (!row) return;
    const useCine = !!(st.cine && row.path_cine);
    const p = useCine ? row.path_cine : row.path;
    const v = (row.text_hash || '') + (useCine ? '-' + (row.cine_updated_at || '') : '');
    const url = sb().storage.from('bible-audio').getPublicUrl(p).data.publicUrl + `?v=${encodeURIComponent(v)}`;
    if (audio.src !== url) audio.src = url;
    const b = $('kaCine');
    if (b) { b.hidden = !row.path_cine; b.classList.toggle('on', useCine); b.setAttribute('aria-pressed', useCine); }
  }
  function start(book, chapter, row, fromVerse) {
    injectUI();
    st.book = book; st.chapter = chapter; st.row = row; st.verse = null;
    setSource();
    applySpeed();
    $('kaName').textContent = `${bookName(book)} ${chapter}`;
    $('kaPlayer').classList.add('open');
    if (fromVerse > 1) {
      const t = (row.timings || []).find(x => x[0] === fromVerse);
      if (t) audio.addEventListener('loadedmetadata', () => { audio.currentTime = Math.max(0, t[1] - 0.3); }, { once: true });
    }
    // Sin un toque previo el navegador puede no dejar sonar: queda listo con ▶.
    audio.play().catch(() => { if (typeof showToast === 'function') showToast('Toca ▶ para escuchar'); });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: `${bookName(book)} ${chapter}`, artist: 'KODESH Bible', album: 'Traducción Kodesh', artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
      } catch (e) {}
    }
  }

  window.KodeshAudio = { get audio() { return audio; }, close };

  // Botón «Escuchar» en el encabezado del capítulo (lo llama renderBibleText)
  window.onChapterAudio = async function () {
    const book = state.currentBook, chapter = state.currentChapter;
    const rows = await rowsFor(book);
    if (book !== state.currentBook || chapter !== state.currentChapter) return;
    const row = rows[chapter];
    if (pending && pending.book === book && pending.chapter === chapter) {
      const from = pending.verse; pending = null;
      if (row) { start(book, chapter, row, from); st.until = untilParam; }
      else if (typeof showToast === 'function') showToast('Este capítulo aún no tiene audio');
    }
    const meta = document.querySelector('#mainContent .chapter-meta');
    if (!row || !meta || meta.querySelector('.audio-chip')) { highlight(); return; }
    const b = document.createElement('button');
    b.className = 'version-chip audio-chip';
    b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span class="lbl">Escuchar</span>';
    b.setAttribute('aria-label', 'Escuchar este capítulo');
    b.onclick = () => {
      if (st.book === book && st.chapter === chapter && audio) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
      start(book, chapter, row);
    };
    const notes = meta.querySelector('.btn-notes-chapter');
    meta.insertBefore(b, notes || null);
    syncButtons(); highlight();
  };
})();
