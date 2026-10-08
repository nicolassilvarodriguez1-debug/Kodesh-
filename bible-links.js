/* KODESH — Red bíblica.
   En el Nuevo Testamento se subrayan las palabras (o el versículo) que citan,
   cumplen o aluden al Tanaj; en el Tanaj, los versículos que el NT cita.
   Al tocarlos se abre un panel con la red de conexiones: el texto del otro
   lado, una nota breve y los demás lugares que citan el mismo pasaje. */
(function () {
  'use strict';
  const NT = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);
  const KIND = { cita: 'Cita', cumplimiento: 'Cumplimiento', alusion: 'Alusión' };
  const byBook = {};   // book → Promise<rows[]>
  const $ = id => document.getElementById(id);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Lectura pública por REST (no depende de que cargue el cliente de Supabase)
  async function rest(query) {
    const url = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://fvknbqdsgqdmwirrgcvb.supabase.co') + '/rest/v1/' + query;
    const key = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error('red bíblica ' + r.status);
    return r.json();
  }
  const bookName = id => ((typeof getAllBooks === 'function' ? getAllBooks() : []).find(b => b.id === id) || {}).name || id;
  const refLabel = (b, c, v, e) => `${bookName(b)} ${c}:${v}${e ? '–' + e : ''}`;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

  const css = document.createElement('style');
  css.textContent = `
.word.xlink { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: var(--gold); text-decoration-thickness: 2px; text-underline-offset: 4px; cursor: pointer; }
.verse.xlink-verse .word { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: color-mix(in srgb, var(--gold) 55%, transparent); text-decoration-thickness: 1.5px; text-underline-offset: 4px; cursor: pointer; }
.xl-overlay { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,.45); opacity: 0; pointer-events: none; transition: opacity .2s; }
.xl-overlay.open { opacity: 1; pointer-events: auto; }
.xl-sheet { position: fixed; left: 50%; bottom: 0; z-index: 401; width: min(640px, 100%); max-height: 78vh; overflow-y: auto; transform: translate(-50%, 105%);
  background: var(--bg2, #12111A); border: 1px solid var(--border2, #2A2836); border-bottom: none; border-radius: 22px 22px 0 0; padding: 10px 18px calc(22px + var(--safe-area-inset-bottom, 0px));
  transition: transform .28s cubic-bezier(.2,.8,.2,1); color: var(--text); box-shadow: 0 -12px 40px rgba(0,0,0,.4); overscroll-behavior: contain; }
.xl-sheet.open { transform: translate(-50%, 0); }
.xl-grab { width: 40px; height: 5px; border-radius: 3px; background: var(--border2, #2A2836); margin: 2px auto 10px; }
.xl-kicker { font-family: var(--font-display); font-size: .72rem; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); }
.xl-title { font-family: var(--font-display); font-size: 1.35rem; margin: 2px 0 10px; }
.xl-graph { display: block; width: 100%; max-width: 460px; height: auto; margin: 0 auto 6px; }
.xl-graph text { font-family: var(--font-display); font-size: 12px; fill: var(--text-mid, #B8AF9C); }
.xl-graph .n-me { fill: var(--gold); }
.xl-graph .n-ot { fill: color-mix(in srgb, var(--gold) 35%, var(--bg3, #1C1B26)); stroke: var(--gold); }
.xl-graph .n-nt { fill: var(--bg3, #1C1B26); stroke: var(--text-dim, #8E8676); }
.xl-graph line { stroke: var(--gold-dim, #3a3220); stroke-width: 1.5; }
.xl-graph g.nd { cursor: pointer; }
.xl-card { border: 1px solid var(--border, #2A2836); border-radius: 14px; padding: 12px 14px; margin: 10px 0; background: var(--bg, transparent); }
.xl-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.xl-ref { font-family: var(--font-display); font-size: 1.05rem; color: var(--gold); }
.xl-kind { font-size: .66rem; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 10px; border: 1px solid var(--gold-dim, #3a3220); color: var(--text-mid); }
.xl-text { font-size: 1rem; line-height: 1.6; margin: 6px 0; }
.xl-note { font-size: .86rem; color: var(--text-mid, #B8AF9C); font-style: italic; }
.xl-also { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: .78rem; color: var(--text-dim); }
.xl-chip { border: 1px solid var(--border2, #2A2836); border-radius: 14px; padding: 4px 10px; background: transparent; color: var(--text); font: inherit; font-size: .8rem; cursor: pointer; }
.xl-go { border: 1px solid var(--gold-dim, #3a3220); border-radius: 14px; padding: 5px 12px; background: transparent; color: var(--gold); font: inherit; font-size: .8rem; cursor: pointer; white-space: nowrap; }`;
  document.head.appendChild(css);

  function rowsFor(book) {
    if (!byBook[book]) {
      byBook[book] = (async () => {
        const col = NT.has(book) ? 'nt_book' : 'ot_book';
        return await rest(`bible_links?select=*&${col}=eq.${encodeURIComponent(book)}&limit=3000`);
      })().catch(() => { delete byBook[book]; return []; });
    }
    return byBook[book];
  }

  // ── Subrayar ──
  function markPhrase(vEl, phrase) {
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
      if (j >= target.length) { for (let m = i; m < k; m++) words[m].classList.add('xlink'); return true; }
    }
    return false;
  }
  async function decorate(container, book, chapter) {
    if (!container || !book || !chapter) return;
    const rows = (await rowsFor(book)).filter(r => NT.has(book) ? r.nt_chapter === chapter : r.ot_chapter === chapter);
    if (!rows.length) return;
    const isNT = NT.has(book);
    for (const r of rows) {
      const vs = isNT ? [r.nt_verse] : Array.from({ length: (r.ot_verse_end || r.ot_verse) - r.ot_verse + 1 }, (_, i) => r.ot_verse + i);
      for (const v of vs) {
        const vEl = container.querySelector(`.verse[data-verse="${v}"]`);
        if (!vEl) continue;
        vEl.dataset.xlink = '1';
        if (!(isNT && r.phrase && markPhrase(vEl, r.phrase))) vEl.classList.add('xlink-verse');
      }
    }
  }
  function decorateAll() {
    const main = $('mainContent'); if (!main || typeof state === 'undefined') return;
    const first = main.querySelector('.bible-text:not(.book-cont)');
    if (first) decorate(first, state.currentBook, state.currentChapter);
    main.querySelectorAll('.book-cont[data-book]').forEach(b => { if (!b.dataset.xl) { b.dataset.xl = '1'; decorate(b, b.dataset.book, Number(b.dataset.chapter)); } });
  }

  // ── Tocar: abre el panel en vez del lexicón ──
  document.addEventListener('click', ev => {
    const w = ev.target.closest && ev.target.closest('#mainContent .word');
    if (!w) return;
    const v = w.closest('.verse[data-xlink]');
    if (!v || !(w.classList.contains('xlink') || v.classList.contains('xlink-verse'))) return;
    if (document.body.classList.contains('verse-select-mode')) return;
    ev.preventDefault(); ev.stopPropagation();
    const box = v.closest('.book-cont');
    const book = (box && box.dataset.book) || state.currentBook;
    const chapter = Number((box && box.dataset.chapter) || state.currentChapter);
    open(book, chapter, Number(v.dataset.verse));
  }, true);

  // ── Panel ──
  let overlay = null, sheet = null;
  function ensureSheet() {
    if (sheet) return;
    overlay = document.createElement('div'); overlay.className = 'xl-overlay'; overlay.onclick = close;
    sheet = document.createElement('div'); sheet.className = 'xl-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Conexiones bíblicas');
    document.body.append(overlay, sheet);
  }
  function close() { if (sheet) { sheet.classList.remove('open'); overlay.classList.remove('open'); } }
  async function verseText(book, ch, v, end) {
    try {
      const verses = parseLocalChapter(await fetchChapter(book, ch));
      return verses.filter(x => x.num >= v && x.num <= (end || v)).map(x => x.text).join(' ');
    } catch (e) { return ''; }
  }
  async function also(otBook, otCh, otV) {
    try { return await rest(`bible_links?select=nt_book,nt_chapter,nt_verse,kind&ot_book=eq.${encodeURIComponent(otBook)}&ot_chapter=eq.${otCh}&ot_verse=eq.${otV}&limit=30`); }
    catch (e) { return []; }
  }
  function goTo(book, ch, v) {
    close();
    const after = () => setTimeout(() => {
      const el = document.getElementById('v-' + v);
      if (el) { const top = el.getBoundingClientRect().top + window.scrollY - 110; window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); el.classList.add('audio-now'); setTimeout(() => el.classList.remove('audio-now'), 2200); }
    }, 350);
    if (typeof selectBook === 'function' && book !== state.currentBook) selectBook(book);
    Promise.resolve(loadChapter(book, ch)).then(after);
  }
  window.KodeshLinksGo = goTo;

  // Mini red: el versículo en el centro, los pasajes del otro Testamento
  // alrededor y, más afuera, los demás versículos que citan ese mismo pasaje.
  function graph(center, nodes) {
    const hubs = nodes.filter(n => !n.parent).slice(0, 6);
    const W = 360, H = 240, cx = W / 2 + (hubs.length === 1 ? 60 : 0), cy = H / 2;
    const fit = p => { p.x = Math.max(40, Math.min(W - 40, p.x)); p.y = Math.max(24, Math.min(H - 30, p.y)); };
    const lines = [], dots = [];
    hubs.forEach((h, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / hubs.length) + (hubs.length === 1 ? Math.PI / 2 : 0);
      h.x = cx + Math.cos(a) * 92; h.y = cy + Math.sin(a) * 56; fit(h);
      lines.push(`<line x1="${cx}" y1="${cy}" x2="${h.x}" y2="${h.y}"/>`);
      const kids = nodes.filter(n => n.parent === h.key).slice(0, 4);
      kids.forEach((k, j) => {
        const b = a + (j - (kids.length - 1) / 2) * 0.7;
        k.x = h.x + Math.cos(b) * 78; k.y = h.y + Math.sin(b) * 62; fit(k); k.up = k.y < h.y - 4;
        lines.push(`<line x1="${h.x}" y1="${h.y}" x2="${k.x}" y2="${k.y}" style="opacity:.6"/>`);
        dots.push(k);
      });
      dots.push(h);
    });
    const lbl = p => `<text x="${p.x}" y="${p.y + (p.parent ? (p.up ? -11 : 19) : -14)}" text-anchor="middle"${p.parent ? ' style="font-size:10.5px"' : ''}>${esc(p.label)}</text>`;
    return `<svg class="xl-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Red de conexiones">
      ${lines.join('')}
      <circle class="n-me" cx="${cx}" cy="${cy}" r="12"/><text x="${cx}" y="${cy + 28}" text-anchor="middle" style="fill:var(--gold);font-size:13px">${esc(center)}</text>
      ${dots.map(p => `<g class="nd" data-b="${p.b}" data-c="${p.c}" data-v="${p.v}"><circle class="${p.ot ? 'n-ot' : 'n-nt'}" cx="${p.x}" cy="${p.y}" r="${p.parent ? 6 : 9}"/>${lbl(p)}</g>`).join('')}
    </svg>`;
  }

  async function open(book, chapter, verse) {
    ensureSheet();
    sheet.innerHTML = '<div class="xl-grab"></div><div class="xl-kicker">Red bíblica</div><div class="xl-title">Cargando…</div>';
    overlay.classList.add('open'); requestAnimationFrame(() => sheet.classList.add('open'));
    const isNT = NT.has(book);
    const rows = (await rowsFor(book)).filter(r => isNT ? (r.nt_chapter === chapter && r.nt_verse === verse)
      : (r.ot_chapter === chapter && verse >= r.ot_verse && verse <= (r.ot_verse_end || r.ot_verse)));
    const me = refLabel(book, chapter, verse);
    let cards = '', nodes = [];
    if (isNT) {
      const parts = await Promise.all(rows.map(async r => {
        const [text, others] = await Promise.all([verseText(r.ot_book, r.ot_chapter, r.ot_verse, r.ot_verse_end), also(r.ot_book, r.ot_chapter, r.ot_verse)]);
        const rest = others.filter(o => !(o.nt_book === book && o.nt_chapter === chapter && o.nt_verse === verse));
        const hk = `${r.ot_book}.${r.ot_chapter}.${r.ot_verse}`;
        nodes.push({ key: hk, b: r.ot_book, c: r.ot_chapter, v: r.ot_verse, ot: true, label: refLabel(r.ot_book, r.ot_chapter, r.ot_verse) });
        rest.slice(0, 4).forEach(o => nodes.push({ parent: hk, b: o.nt_book, c: o.nt_chapter, v: o.nt_verse, label: refLabel(o.nt_book, o.nt_chapter, o.nt_verse) }));
        return `<div class="xl-card">
          <div class="xl-row"><span class="xl-ref">${esc(refLabel(r.ot_book, r.ot_chapter, r.ot_verse, r.ot_verse_end))}</span><span class="xl-kind">${KIND[r.kind] || 'Conexión'}</span></div>
          ${text ? `<div class="xl-text">${esc(text)}</div>` : ''}
          ${r.note ? `<div class="xl-note">${esc(r.note)}</div>` : ''}
          <div class="xl-also"><button class="xl-go" data-go="${r.ot_book}|${r.ot_chapter}|${r.ot_verse}">Leer en contexto →</button>
          ${rest.length ? `<span>También lo cita:</span>${rest.slice(0, 8).map(o => `<button class="xl-chip" data-go="${o.nt_book}|${o.nt_chapter}|${o.nt_verse}">${esc(refLabel(o.nt_book, o.nt_chapter, o.nt_verse))}</button>`).join('')}` : ''}</div>
        </div>`;
      }));
      cards = parts.join('');
    } else {
      const parts = await Promise.all(rows.map(async r => {
        const text = await verseText(r.nt_book, r.nt_chapter, r.nt_verse);
        nodes.push({ b: r.nt_book, c: r.nt_chapter, v: r.nt_verse, label: refLabel(r.nt_book, r.nt_chapter, r.nt_verse) });
        return `<div class="xl-card">
          <div class="xl-row"><span class="xl-ref">${esc(refLabel(r.nt_book, r.nt_chapter, r.nt_verse))}</span><span class="xl-kind">${KIND[r.kind] || 'Conexión'}</span></div>
          ${text ? `<div class="xl-text">${esc(text)}</div>` : ''}
          ${r.note ? `<div class="xl-note">${esc(r.note)}</div>` : ''}
          <div class="xl-also"><button class="xl-go" data-go="${r.nt_book}|${r.nt_chapter}|${r.nt_verse}">Leer en contexto →</button></div>
        </div>`;
      }));
      cards = parts.join('');
    }
    const seen = new Set(); nodes = nodes.filter(nd => { const k = `${nd.parent || ''}>${nd.b}.${nd.c}.${nd.v}`; if (seen.has(k)) return false; seen.add(k); return true; });
    sheet.innerHTML = `<div class="xl-grab"></div>
      <div class="xl-kicker">${isNT ? 'Red bíblica · el Tanaj en este versículo' : 'Red bíblica · cumplido en el Nuevo Testamento'}</div>
      <div class="xl-title">${esc(me)}</div>
      ${nodes.length ? graph(me, nodes) : ''}
      ${cards || '<div class="xl-note">No hay conexiones registradas.</div>'}`;
    sheet.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const [bb, c, v] = b.dataset.go.split('|'); goTo(bb, Number(c), Number(v)); });
    sheet.querySelectorAll('g.nd').forEach(g => g.onclick = () => goTo(g.dataset.b, Number(g.dataset.c), Number(g.dataset.v)));
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Cada vez que se pinta un capítulo (o se añade uno en «Leer como libro»)
  const main = $('mainContent');
  if (main) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(decorateAll, 60); }).observe(main, { childList: true });
  }
})();
