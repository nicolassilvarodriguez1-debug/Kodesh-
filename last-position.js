/* KODESH — Recordar dónde se quedó leyendo (libro, capítulo y versículo) para
   volver ahí al abrir la app de nuevo. Funciona también en «Leer como libro». */
(function () {
  'use strict';
  const KEY = 'kodesh_last_position';
  window.readLastPosition = function () {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!p || !/^[A-Z0-9]{3}$/.test(p.book) || !(p.chapter >= 1)) return null;
      return p;
    } catch (e) { return null; }
  };
  function current() {
    if (typeof state === 'undefined' || !state.currentBook) return null;
    const main = document.getElementById('mainContent');
    if (!main) return null;
    // El versículo que está arriba de la pantalla, justo debajo de la barra
    const y = 120, xs = [window.innerWidth * 0.5, window.innerWidth * 0.3, window.innerWidth * 0.7];
    let v = null;
    for (let dy = 0; dy < 220 && !v; dy += 22) {
      for (const x of xs) { const el = document.elementFromPoint(x, y + dy); v = el && el.closest && el.closest('.verse[data-verse]'); if (v) break; }
    }
    if (!v) return { book: state.currentBook, chapter: state.currentChapter, verse: 0 };
    const box = v.closest('.book-cont');
    return {
      book: (box && box.dataset.book) || state.currentBook,
      chapter: Number((box && box.dataset.chapter) || state.currentChapter),
      verse: box ? 0 : Number(v.dataset.verse) || 0,
    };
  }
  let timer = null;
  function save() {
    const p = current(); if (!p) return;
    try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch (e) {}
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(save, 700); };
  window.addEventListener('scroll', soon, { passive: true });
  document.addEventListener('scroll', soon, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  // al cambiar de capítulo también se guarda (aunque no se haga scroll)
  const main = document.getElementById('mainContent');
  if (main) new MutationObserver(soon).observe(main, { childList: true });
})();
