/* KODESH — Imagen de la parashá arriba de cada capítulo de la Torá.
   Se muestra la porción a la que pertenece el versículo 1 del capítulo
   (Génesis 6 → Bereshit, Génesis 7 → Nóaj). La imagen sale de
   insignias/inicio.json (p1…p54, generadas desde el admin) y se ve
   difuminada, fundida con la página. Tocarla abre el Ciclo de estudio. */
(function () {
  'use strict';
  const IMG_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/inicio.json';
  const TORAH = new Set(['GEN', 'EXO', 'LEV', 'NUM', 'DEU']);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let IMG = (() => { try { return JSON.parse(localStorage.getItem('kodesh_home_img') || '{}') || {}; } catch (e) { return {}; } })();
  let PS = null, P = null;
  function load() {
    if (!P) P = Promise.all([
      fetch('./parashot-data.json').then(r => r.json()).then(j => { PS = j; }).catch(() => {}),
      fetch(IMG_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j) { IMG = j; try { localStorage.setItem('kodesh_home_img', JSON.stringify(j)); } catch (e) {} } }).catch(() => {}),
    ]);
    return P;
  }
  const pos = (c, v) => c * 1000 + v;
  const portionOf = (book, c) => (PS || []).find(p => p.book === book && pos(p.startChapter, p.startVerse) <= pos(c, 1) && pos(c, 1) <= pos(p.endChapter, p.endVerse));

  const css = document.createElement('style');
  css.textContent = `
.ps-banner { position: relative; display: block; height: clamp(160px, 32vw, 280px); margin: 0 -8px 14px; border-radius: 18px; overflow: hidden; text-decoration: none; color: #fff; }
.ps-banner .ps-img { position: absolute; inset: 0; background-size: cover; background-position: center; -webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%); mask-image: linear-gradient(180deg, #000 55%, transparent 100%); }
.ps-banner .ps-txt { position: absolute; left: 16px; bottom: 14px; right: 16px; display: flex; align-items: baseline; gap: 8px; text-shadow: 0 1px 8px rgba(0,0,0,.7); }
.ps-banner .ps-k { font-family: 'Cinzel', serif; font-size: 0.746rem; letter-spacing: 2.4px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.ps-banner b { font-family: var(--font-display, 'Cormorant Garamond', serif); font-size: 1.35rem; font-weight: 600; color: var(--text, #e9e3d3); }
.ps-banner .he { font-family: 'Frank Ruhl Libre', serif; color: var(--gold, #c9a84c); font-size: 1.1rem; }
html.light .ps-banner .ps-txt { text-shadow: 0 1px 8px rgba(255,255,255,.8); }
.parasha-banner.ps-on { position: relative; overflow: hidden; min-height: clamp(170px, 34vw, 300px); align-items: flex-end; padding-top: 0 !important; isolation: isolate; border-radius: 16px !important; }
.parasha-banner.ps-on > .ps-img { position: absolute; inset: 0; z-index: -1; background-size: cover; background-position: center 45%;
  -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,.6) 0%, #000 18%, #000 82%, rgba(0,0,0,.6) 100%); mask-image: linear-gradient(90deg, rgba(0,0,0,.6) 0%, #000 18%, #000 82%, rgba(0,0,0,.6) 100%); }
.parasha-banner.ps-on::after { content: ''; position: absolute; inset: 0; z-index: -1; display: block !important; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, color-mix(in srgb, var(--bg, #0b0b12) 75%, transparent) 72%, var(--bg, #0b0b12) 100%); }
.parasha-banner.ps-on .parasha-banner-name, .parasha-banner.ps-on .parasha-banner-range { text-shadow: 0 1px 6px var(--bg, #0b0b12); }`;
  document.head.appendChild(css);

  async function decorate(container, book, chapter) {
    if (!container || !TORAH.has(book) || !chapter || container.dataset.ps === `${book}:${chapter}`) return;
    container.dataset.ps = `${book}:${chapter}`;
    await load();
    const p = portionOf(book, Number(chapter));
    const url = p && IMG['p' + p.num];
    if (!url) return;
    // Capítulo normal: la tarjeta de la parashá que ya existe se viste con la imagen
    if (!container.classList.contains('book-cont')) {
      const pb = document.querySelector('#mainContent .parasha-banner');
      if (pb && !pb.querySelector('.ps-img')) {
        const im = document.createElement('span'); im.className = 'ps-img'; im.style.backgroundImage = `url('${url}')`;
        pb.classList.add('ps-on'); pb.prepend(im);
      }
      if (pb) return;
    }
    // arriba de todo lo que va antes del capítulo (personajes, fiestas, mapas)
    let top = container;
    while (top.previousElementSibling && /\b(pp-row|fr-pill|mp-chips|ps-banner)\b/.test(top.previousElementSibling.className || '')) top = top.previousElementSibling;
    if (top.classList.contains('ps-banner') || (top.previousElementSibling && top.previousElementSibling.classList.contains('ps-banner'))) return;
    const a = document.createElement('a');
    a.className = 'ps-banner'; a.href = 'parashot.html'; a.setAttribute('aria-label', `Parashá ${p.nombre}`);
    a.innerHTML = `<span class="ps-img" style="background-image:url('${esc(url)}')"></span><span class="ps-txt"><span class="ps-k">Parashá</span><b>${esc(p.nombre)}</b><span class="he" lang="he">${esc(p.heb)}</span></span>`;
    top.before(a);
  }
  function decorateAll() {
    const main = document.getElementById('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => decorate(b, b.dataset.book, Number(b.dataset.chapter)));
  }
  const main = document.getElementById('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 160); }).observe(main, { childList: true });
    setTimeout(decorateAll, 700);
  }
})();
