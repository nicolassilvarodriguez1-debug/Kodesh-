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
#mainContent.swipe-anim { transition: transform .22s ease, opacity .22s ease; }
#mainContent.page-turn { transition: transform .42s cubic-bezier(.45,.05,.35,1), filter .42s ease; }
#mainContent.page-in { transition: transform .5s cubic-bezier(.2,.75,.25,1), filter .5s ease; }
.page-shade { position: fixed; pointer-events: none; z-index: 2; opacity: 0;
  background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.18) 55%, rgba(0,0,0,.45) 100%); }
.page-shade.from-left { background: linear-gradient(270deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.18) 55%, rgba(0,0,0,.45) 100%); }`;
  document.head.appendChild(css);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shade = document.createElement('div');
  shade.className = 'page-shade';
  document.body.appendChild(shade);
  function placeShade(fromLeft) {
    const r = main.getBoundingClientRect();
    Object.assign(shade.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    shade.classList.toggle('from-left', !!fromLeft);
  }
  // Pasar página: la hoja gira sobre su lomo (borde izquierdo) con perspectiva
  // El eje se pone a la altura de lo que se ve en pantalla (el contenido puede ser más alto que la pantalla)
  const turn = (deg, origin) => {
    const r = main.getBoundingClientRect();
    const cy = Math.round(Math.min(window.innerHeight, r.bottom) / 2 + Math.max(0, r.top) / 2 - r.top);
    main.style.transformOrigin = `${origin.split(' ')[0]} ${cy}px`;
    main.style.transform = `perspective(1600px) rotateY(${deg}deg)`;
  };
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
    main.style.transform = ''; main.style.opacity = ''; main.style.filter = '';
    setTimeout(() => { if (!t) main.style.transformOrigin = ''; }, 260);
    hint.style.opacity = '0'; shade.style.opacity = '0';
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
    const w = main.clientWidth || window.innerWidth;
    if (!t.dest) {
      main.style.transform = `translateX(${t.dx * 0.1}px)`;   // sin destino: rebote corto
    } else if (reduce) {
      main.style.transform = `translateX(${t.dx * 0.35}px)`;
    } else if (dir > 0) {
      // siguiente: la hoja actual se levanta desde el borde derecho y gira hacia la izquierda
      const k = Math.min(1, -t.dx / w);
      turn(-k * 75, 'left center');
      placeShade(false); shade.style.opacity = String(k * 0.9);
    } else {
      // anterior: la hoja se inclina un poco para dejar ver la que vuelve
      const k = Math.min(1, t.dx / w);
      turn(k * 18, 'right center');
      placeShade(true); shade.style.opacity = String(k * 0.6);
    }
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
    hint.style.opacity = '0';
    const go = async () => {
      try {
        if (s.dest.book !== state.currentBook && typeof selectBook === 'function') selectBook(s.dest.book);
        await loadChapter(s.dest.book, s.dest.chapter);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    };
    if (reduce) {
      main.classList.add('swipe-anim');
      main.style.transform = `translateX(${dir > 0 ? -60 : 60}px)`; main.style.opacity = '0';
      setTimeout(async () => { await go(); main.style.transform = ''; main.style.opacity = ''; setTimeout(() => main.classList.remove('swipe-anim'), 240); }, 180);
      return;
    }
    if (dir > 0) {
      // Siguiente: la hoja termina de girar y aparece la nueva debajo
      main.classList.add('page-turn');
      turn(-90, 'left center'); main.style.filter = 'brightness(.75)';
      shade.style.transition = 'opacity .42s'; shade.style.opacity = '1';
      setTimeout(async () => {
        main.classList.remove('page-turn');
        main.style.transition = 'none'; main.style.transform = ''; main.style.filter = '';
        shade.style.transition = ''; shade.style.opacity = '0';
        await go();
        main.style.opacity = '0'; main.style.transform = 'scale(.985)';
        requestAnimationFrame(() => { main.style.transition = 'opacity .25s ease, transform .25s ease'; main.style.opacity = ''; main.style.transform = '';
          setTimeout(() => { main.style.transition = ''; }, 260); });
      }, 420);
    } else {
      // Anterior: la hoja de antes vuelve girando desde la izquierda
      main.classList.add('swipe-anim');
      main.style.opacity = '0';
      setTimeout(async () => {
        main.classList.remove('swipe-anim');
        main.style.transition = 'none'; shade.style.opacity = '0';
        await go();
        turn(-90, 'left center'); main.style.filter = 'brightness(.75)'; main.style.opacity = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          main.style.transition = ''; main.classList.add('page-in');
          turn(0, 'left center'); main.style.filter = '';
          setTimeout(() => { main.classList.remove('page-in'); main.style.transform = ''; main.style.transformOrigin = ''; }, 520);
        }));
      }, 200);
    }
  }
  main.addEventListener('touchend', end, { passive: true });
  main.addEventListener('touchcancel', () => { t = null; reset(true); }, { passive: true });
})();
