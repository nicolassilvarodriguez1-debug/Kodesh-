/* KODESH — Deslizar para cambiar de capítulo (teléfono y iPad).
   Deslizar hacia la izquierda → capítulo siguiente; hacia la derecha → anterior.
   Al final de un libro sigue con el siguiente libro (y al revés).
   No interfiere con el desplazamiento vertical, la selección de versículos,
   el zoom ni con elementos que se desplazan de lado. */
(function () {
  'use strict';
  const main = document.getElementById('mainContent');
  if (!main || !('ontouchstart' in window)) return;

  const MIN_DX = 70;        // distancia mínima para cambiar
  const RATIO = 1.8;        // tiene que ser claramente horizontal
  let t = null;

  const css = document.createElement('style');
  css.textContent = `
.swipe-hint { position: fixed; top: 50%; z-index: 330; transform: translateY(-50%); pointer-events: none;
  display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-radius: 22px;
  background: var(--bg2, #12111A); border: 1px solid var(--gold-dim, #3a3220); color: var(--gold, #C9A84C);
  font-family: var(--font-display, serif); font-size: 0.95rem; box-shadow: 0 10px 30px rgba(0,0,0,.35);
  opacity: 0; transition: opacity .15s; }
.swipe-hint.left { left: 12px; } .swipe-hint.right { right: 12px; }
.swipe-hint.ready { background: var(--gold, #C9A84C); color: #15120A; }
#mainContent.swipe-anim { transition: transform .22s ease, opacity .22s ease; }`;
  document.head.appendChild(css);
  const hint = document.createElement('div');
  hint.className = 'swipe-hint';
  document.body.appendChild(hint);

  function target(dir) {
    const books = typeof getAllBooks === 'function' ? getAllBooks() : [];
    const i = books.findIndex(b => b.id === state.currentBook);
    if (i < 0) return null;
    const ch = state.currentChapter + dir;
    if (ch >= 1 && ch <= books[i].chapters) return { book: books[i].id, chapter: ch, name: `Capítulo ${ch}` };
    const nb = books[i + dir];
    if (!nb) return null;
    const c = dir > 0 ? 1 : nb.chapters;
    return { book: nb.id, chapter: c, name: `${nb.name} ${c}` };
  }

  // ¿El dedo empezó sobre algo que se desplaza de lado o es un control?
  function blocked(el) {
    for (let n = el; n && n !== main; n = n.parentElement) {
      if (n.matches && n.matches('input, textarea, select, [contenteditable="true"], .no-swipe')) return true;
      const st = getComputedStyle(n);
      if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
    }
    return false;
  }
  function busy() {
    if (document.body.classList.contains('verse-select-mode')) return true;
    if (window.visualViewport && window.visualViewport.scale > 1.05) return true;   // con zoom, deslizar es mover la página
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return true;
    return false;
  }

  function reset(animate) {
    if (animate) main.classList.add('swipe-anim');
    main.style.transform = ''; main.style.opacity = '';
    hint.style.opacity = '0';
    if (animate) setTimeout(() => main.classList.remove('swipe-anim'), 240);
  }

  main.addEventListener('touchstart', e => {
    t = null;
    if (e.touches.length !== 1 || busy() || blocked(e.target)) return;
    const p = e.touches[0];
    // No robar el gesto del borde (volver atrás / abrir el menú)
    if (p.clientX < 18 || p.clientX > window.innerWidth - 18) return;
    t = { x: p.clientX, y: p.clientY, at: Date.now(), dx: 0, dy: 0, lock: null };
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (!t || e.touches.length !== 1) { t = null; return; }
    const p = e.touches[0];
    t.dx = p.clientX - t.x; t.dy = p.clientY - t.y;
    if (!t.lock && (Math.abs(t.dx) > 12 || Math.abs(t.dy) > 12)) {
      t.lock = Math.abs(t.dx) > Math.abs(t.dy) * RATIO ? 'h' : 'v';
      if (t.lock === 'h') { t.dest = target(t.dx < 0 ? 1 : -1); }
    }
    if (t.lock !== 'h') return;
    const dir = t.dx < 0 ? 1 : -1;
    if (!t.dest || (dir > 0) !== (t.dx < 0)) t.dest = target(dir);
    const pull = t.dest ? t.dx * 0.35 : t.dx * 0.1;   // sin destino: rebote corto
    main.style.transform = `translateX(${pull}px)`;
    if (t.dest) {
      hint.textContent = dir > 0 ? `${t.dest.name} →` : `← ${t.dest.name}`;
      hint.className = `swipe-hint ${dir > 0 ? 'right' : 'left'}${Math.abs(t.dx) >= MIN_DX ? ' ready' : ''}`;
      hint.style.opacity = String(Math.min(1, Math.abs(t.dx) / MIN_DX));
    }
  }, { passive: true });

  function end() {
    if (!t) return;
    const s = t; t = null;
    if (s.lock !== 'h') { reset(false); return; }
    const ok = s.dest && Math.abs(s.dx) >= MIN_DX && Math.abs(s.dx) > Math.abs(s.dy) * RATIO;
    if (!ok) { reset(true); return; }
    const dir = s.dx < 0 ? 1 : -1;
    main.classList.add('swipe-anim');
    main.style.transform = `translateX(${dir > 0 ? -60 : 60}px)`; main.style.opacity = '0';
    hint.style.opacity = '0';
    setTimeout(async () => {
      try {
        if (s.dest.book !== state.currentBook && typeof selectBook === 'function') selectBook(s.dest.book);
        await loadChapter(s.dest.book, s.dest.chapter);
      } catch (e) {}
      main.classList.remove('swipe-anim');
      main.style.transform = `translateX(${dir > 0 ? 60 : -60}px)`;
      requestAnimationFrame(() => { main.classList.add('swipe-anim'); main.style.transform = ''; main.style.opacity = ''; setTimeout(() => main.classList.remove('swipe-anim'), 240); });
      if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    }, 180);
  }
  main.addEventListener('touchend', end, { passive: true });
  main.addEventListener('touchcancel', () => { t = null; reset(true); }, { passive: true });
})();
