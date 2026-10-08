/* KODESH — «Leer como libro»: la Biblia sin números de capítulo ni de versículo.
   Se activa en Ajustes. El texto corre en párrafos (los títulos de sección
   hacen de pausas) y, al llegar al final, el siguiente capítulo se añade
   debajo sin cortes, como en un libro. Al pasar de un capítulo a otro se
   marca como leído el anterior y la barra superior muestra dónde vas. */
(function () {
  'use strict';
  const KEY = 'kodesh_book_mode';
  const MAX_APPENDED = 40;
  const on = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const root = document.documentElement;
  root.classList.toggle('book-mode', on());

  const css = document.createElement('style');
  css.textContent = `
html.book-mode .bible-text .verse { display: inline; padding: 0; margin: 0; position: static; border-radius: 3px; }
html.book-mode .bible-text .verse-num, html.book-mode .bible-text .bookmark-dot { display: none; }
html.book-mode .bible-text { text-align: justify; -webkit-hyphens: auto; hyphens: auto; line-height: 1.8; }
html.book-mode .bible-text .section-heading { text-align: left; }
html.book-mode .chapter-title, html.book-mode .chapter-badge { display: none; }
html.book-mode .book-flow .chapter-nav, html.book-mode .book-flow .chapter-end-actions { display: none; }
html.book-mode .book-cont { margin-top: 0; }
.book-orn { text-align: center; color: var(--gold); opacity: .7; font-size: 1.1rem; letter-spacing: 10px; margin: 1.6em 0 1.2em; user-select: none; }
.book-newbook { text-align: center; font-family: var(--font-display); color: var(--gold); font-size: 1.5rem; letter-spacing: 2px; margin: 2.2em 0 1em; }
.book-more { display: block; margin: 2em auto; padding: 12px 22px; border-radius: 22px; border: 1px solid var(--gold-line, var(--border2)); background: transparent; color: var(--gold); font: inherit; cursor: pointer; }
.book-loading { text-align: center; color: var(--text-dim); font-size: .85rem; margin: 2em 0; }`;
  document.head.appendChild(css);

  // ── Ajustes ──
  function paintToggle() {
    const t = document.getElementById('bookToggle');
    if (t) { t.classList.toggle('on', on()); t.setAttribute('aria-checked', on()); }
  }
  window.toggleBookMode = function () {
    const v = !on();
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
    root.classList.toggle('book-mode', v);
    paintToggle();
    if (typeof showToast === 'function') showToast(v ? '📖 Leyendo como libro' : 'Capítulos y versículos visibles');
    if (state && state.currentBook && typeof loadChapter === 'function') loadChapter(state.currentBook, state.currentChapter);
  };
  document.addEventListener('DOMContentLoaded', paintToggle);
  setTimeout(paintToggle, 0);

  // ── Lectura continua ──
  let cursor = null;        // último capítulo añadido { book, chapter }
  let appended = 0, loading = false, io = null, sentinel = null, seen = null;

  const books = () => (typeof getAllBooks === 'function' ? getAllBooks() : []);
  function nextOf(book, chapter) {
    const list = books(); const i = list.findIndex(b => b.id === book);
    if (i < 0) return null;
    if (chapter < list[i].chapters) return { book, chapter: chapter + 1 };
    const nb = list[i + 1];
    return nb ? { book: nb.id, chapter: 1, newBook: nb.name } : null;
  }
  const canAppend = () => on() && !(typeof textualActive !== 'undefined' && textualActive) && !(typeof interlinearActive !== 'undefined' && interlinearActive);

  function markReadQuiet(book, ch) {
    try {
      const key = getReadKey(book, ch);
      if (state.readChapters[key]) return;
      state.readChapters[key] = true;
      localStorage.setItem('kodesh_read', JSON.stringify(state.readChapters));
      if (typeof saveChapterToCloud === 'function') saveChapterToCloud(book, ch);
      const name = (books().find(b => b.id === book) || {}).name || book;
      if (typeof recordTodayChapter === 'function') recordTodayChapter(book, name, ch);
      if (typeof updateProgress === 'function') updateProgress();
    } catch (e) {}
  }

  function wjFor(container, book, ch) {
    try {
      if (typeof wjEnabled !== 'function' || !wjEnabled() || !WJ_BOOKS.has(book) || !WJ) return;
      const map = WJ[book] && WJ[book][String(ch)]; if (!map) return;
      container.querySelectorAll('.verse[data-verse]').forEach(vEl => {
        const segs = map[vEl.dataset.verse]; if (!segs) return;
        const words = [...vEl.querySelectorAll('.word')];
        let text = ''; const starts = [];
        words.forEach(w => { if (text) text += ' '; starts.push(text.length); text += w.textContent; });
        const ranges = wjRanges(text, segs);
        words.forEach((w, i) => { if (ranges.some(([a, b]) => starts[i] >= a && starts[i] < b)) w.classList.add('wj'); });
      });
    } catch (e) {}
  }

  async function headingsFor(container, book, ch) {
    try {
      const map = await loadBookHeadings(book);
      const list = map && map[ch]; if (!Array.isArray(list)) return;
      list.forEach(h => {
        const v = container.querySelector(`.verse[data-verse="${Number(h.v)}"]`);
        if (!v || !h.t) return;
        const el = document.createElement('div');
        el.className = 'section-heading'; el.setAttribute('role', 'heading'); el.setAttribute('aria-level', '3');
        el.textContent = h.t;
        v.parentNode.insertBefore(el, v);
      });
    } catch (e) {}
  }

  async function appendNext() {
    if (loading || !cursor || !canAppend() || appended >= MAX_APPENDED) return;
    const nx = nextOf(cursor.book, cursor.chapter);
    const main = document.getElementById('mainContent');
    if (!nx || !main) { if (sentinel) sentinel.remove(); return; }
    loading = true;
    const startBook = state.currentBook, startCh = state.currentChapter;
    try {
      const verses = parseLocalChapter(await fetchChapter(nx.book, nx.chapter));
      // si el lector cambió de capítulo mientras cargaba, no se añade nada
      if (state.currentBook !== startBook || state.currentChapter !== startCh || !canAppend()) return;
      const box = document.createElement('div');
      box.className = 'bible-text book-cont';
      box.dataset.book = nx.book; box.dataset.chapter = nx.chapter;
      box.innerHTML = (nx.newBook ? `<div class="book-newbook">${nx.newBook}</div>` : '<div class="book-orn" aria-hidden="true">❦</div>') +
        verses.map(v => `<span class="verse" data-verse="${v.num}" data-chapter="${nx.chapter}">${makeClickableWords(v.text)} </span>`).join('');
      (sentinel && sentinel.parentNode === main) ? main.insertBefore(box, sentinel) : main.appendChild(box);
      cursor = { book: nx.book, chapter: nx.chapter };
      appended++;
      seen.observe(box);
      wjFor(box, nx.book, nx.chapter);
      headingsFor(box, nx.book, nx.chapter);
    } catch (e) {
      if (sentinel) sentinel.innerHTML = '<button class="book-more">Seguir leyendo →</button>';
    } finally { loading = false; }
  }

  function setup() {
    const main = document.getElementById('mainContent');
    const first = main && main.querySelector('.bible-text:not(.book-cont)');
    if (io) io.disconnect(); if (seen) seen.disconnect();
    cursor = null; appended = 0;
    if (main) main.classList.toggle('book-flow', !!(first && canAppend()));
    if (!first || !on()) return;
    if (!canAppend()) return;   // Kodesh / interlineal: se usa la navegación normal
    cursor = { book: state.currentBook, chapter: state.currentChapter };
    sentinel = document.createElement('div');
    sentinel.className = 'book-loading';
    sentinel.textContent = '…';
    main.appendChild(sentinel);
    sentinel.addEventListener('click', e => { if (e.target.closest('.book-more')) { sentinel.textContent = '…'; appendNext(); } });
    io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) appendNext(); }, { rootMargin: '0px 0px 1200px 0px' });
    io.observe(sentinel);
    // Qué capítulo se está leyendo: barra superior y marcar leído el anterior
    seen = new IntersectionObserver(es => {
      for (const x of es) {
        if (!x.isIntersecting) continue;
        const b = x.target.dataset.book, c = Number(x.target.dataset.chapter);
        const name = (books().find(k => k.id === b) || {}).name || b;
        try { updateTopbarChapter(name, c, null); } catch (e) {}
        const prev = x.target.previousElementSibling && x.target.previousElementSibling.closest('.bible-text');
        if (prev) markReadQuiet(prev.dataset.book || state.currentBook, Number(prev.dataset.chapter || state.currentChapter));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
  }

  // Cada vez que el lector pinta un capítulo nuevo, se prepara la lectura continua
  const main = document.getElementById('mainContent');
  if (main) {
    let last = null;
    new MutationObserver(() => {
      const first = main.querySelector('.bible-text:not(.book-cont)');
      if (first && first !== last) { last = first; setTimeout(setup, 0); }
    }).observe(main, { childList: true });
  }
})();
