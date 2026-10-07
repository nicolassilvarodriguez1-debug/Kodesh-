/* KODESH — Versículo como imagen
   Se abre desde «Compartir» en la hoja del versículo (verseSheetAction llama
   a openVerseImage). Dibuja la tarjeta en un canvas a tamaño de publicación
   (1080 px de ancho), así lo que se ve es exactamente lo que se comparte.
   Cinco estilos: Pergamino, Noche de Shabat, La palabra hebrea, Moderno y
   Amanecer. El logo de KODESH va siempre (es la publicidad de la app). */
(function () {
  'use strict';

  const STYLES = [
    { id: 'pergamino', name: 'Pergamino' },
    { id: 'shabat', name: 'Shabat' },
    { id: 'hebreo', name: 'Hebreo' },
    { id: 'moderno', name: 'Moderno' },
    { id: 'amanecer', name: 'Amanecer' },
  ];
  const FORMATS = { post: { w: 1080, h: 1350, label: '4:5 Publicación' }, story: { w: 1080, h: 1920, label: '9:16 Historia' }, square: { w: 1080, h: 1080, label: '1:1 Cuadrado' } };
  const MODERN = [
    { bg: '#0F3B3A', fg: '#F2EDE3', accent: '#E8C766', soft: '#CFE3DD', kicker: '#9FD3C7' },
    { bg: '#1F2A5A', fg: '#F1EEE6', accent: '#F2C46D', soft: '#D3D8EE', kicker: '#A9B6E8' },
    { bg: '#5A1F2B', fg: '#F6EDE3', accent: '#F0C987', soft: '#EBD3D3', kicker: '#E3A9A9' },
    { bg: '#C9A84C', fg: '#1B1408', accent: '#FFF6DC', soft: '#2E2410', kicker: '#3A2C10' },
    { bg: '#F2EDE3', fg: '#1F1A12', accent: '#8A6A1E', soft: '#3B3326', kicker: '#8A6A1E' },
  ];
  const SERIF = "'Cormorant Garamond', 'EB Garamond', Georgia, serif";
  const BODY = "'EB Garamond', Georgia, serif";
  const HEB = "'Frank Ruhl Libre', 'SBL Hebrew', 'Times New Roman', serif";
  const SANS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
  // Palabras muy comunes que no sirven como «palabra protagonista»
  const STOP = new Set(['H853', 'H3808', 'H413', 'H5921', 'H834', 'H3588', 'H854', 'H3605', 'H1931', 'H589', 'H595', 'H859', 'H408', 'H4480', 'H5973', 'H3068', 'H1961', 'H559', 'H2088', 'H3651', 'H1571', 'H518', 'H369', 'H3426', 'H6440', 'H5704',
    'G3588', 'G2532', 'G1161', 'G846', 'G1722', 'G1519', 'G3754', 'G3756', 'G1063', 'G3739', 'G1537', 'G4314', 'G1510', 'G3361', 'G5100', 'G3778', 'G1473', 'G4771', 'G2228', 'G5613', 'G3767', 'G235', 'G1909', 'G1223', 'G2443', 'G3004', 'G1096', 'G3956', 'G2192']);

  // Palabras de los títulos de los Salmos («Salmo de David», «Al Músico principal»…)
  const PSALM_TITLE = new Set(['H4210', 'H1732', 'H5329', 'H7892', 'H4905', 'H4387', 'H8605', 'H7141', 'H623', 'H1121', 'H5921', 'H7692', 'H8085']);
  const st = {
    open: false, book: '', chapter: 0, verses: [], text: '', ref: '', version: 'RVR60',
    style: readLS('kodesh_vi_style', 'pergamino'), format: readLS('kodesh_vi_format', 'post'),
    modern: Number(readLS('kodesh_vi_modern', 0)) || 0, original: readLS('kodesh_vi_orig', '1') === '1',
    words: null, lang: null, pick: -1, lex: {}, blob: null, blobFor: '', renderSeq: 0,
  };
  function readLS(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function writeLS(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── Interfaz ── */
  function injectUI() {
    if ($('viOverlay')) return;
    const css = document.createElement('style');
    css.textContent = `
.vi-overlay { position: fixed; inset: 0; z-index: 900; background: #0B0B12; color: #E9E3D3; display: none; flex-direction: column; font-family: ${BODY}; }
.vi-overlay.open { display: flex; }
.vi-head { display: flex; align-items: center; justify-content: space-between; padding: calc(10px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px))) 14px 6px; }
.vi-x { width: 40px; height: 40px; border-radius: 20px; border: 1px solid #2A2836; background: transparent; color: #B8AF9C; font-size: 17px; cursor: pointer; }
.vi-title { font-family: ${SERIF}; font-size: 21px; font-weight: 600; }
.vi-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 6px 16px 12px; background: radial-gradient(60% 50% at 50% 50%, rgba(201,168,76,0.08), transparent 70%); }
.vi-stage canvas { max-width: 100%; max-height: 100%; width: auto; height: auto; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.55); display: block; }
.vi-panel { background: #12111A; border-top: 1px solid #22212E; border-radius: 22px 22px 0 0; padding: 14px 0 calc(16px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); display: flex; flex-direction: column; gap: 11px; }
.vi-row { display: flex; gap: 7px; overflow-x: auto; padding: 0 14px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.vi-row::-webkit-scrollbar { display: none; }
.vi-chip { flex-shrink: 0; height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid #2A2836; background: transparent; color: #B8AF9C; font: inherit; font-size: 15px; cursor: pointer; white-space: nowrap; }
.vi-chip.on { background: #C9A84C; border-color: #C9A84C; color: #15120A; font-weight: 500; }
.vi-chip.word { font-family: ${HEB}; font-size: 18px; }
.vi-seg { display: flex; gap: 4px; margin: 0 14px; padding: 3px; border-radius: 12px; background: #0B0B12; border: 1px solid #22212E; }
.vi-seg button { flex: 1; height: 34px; border: none; border-radius: 9px; background: transparent; color: #8E8676; font: inherit; font-size: 14px; cursor: pointer; }
.vi-seg button.on { background: #26242F; color: #E9E3D3; }
.vi-opts { display: flex; align-items: center; gap: 14px; padding: 0 16px; min-height: 30px; font-size: 15px; color: #CFC7B5; flex-wrap: wrap; }
.vi-toggle { display: inline-flex; align-items: center; gap: 9px; background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 0; }
.vi-toggle .sw { width: 40px; height: 24px; border-radius: 12px; background: #2A2836; position: relative; transition: background .15s; flex-shrink: 0; }
.vi-toggle .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 9px; background: #8E8676; transition: transform .15s, background .15s; }
.vi-toggle[aria-checked="true"] .sw { background: #C9A84C; }
.vi-toggle[aria-checked="true"] .sw::after { transform: translateX(16px); background: #15120A; }
.vi-toggle:disabled { opacity: .45; }
.vi-swatch { width: 28px; height: 28px; border-radius: 14px; border: 2px solid #12111A; cursor: pointer; padding: 0; flex-shrink: 0; }
.vi-swatch.on { box-shadow: 0 0 0 2px #C9A84C; }
.vi-label { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #8E8676; padding: 0 16px; margin-bottom: -4px; }
.vi-actions { display: flex; gap: 8px; padding: 0 14px; }
.vi-share { flex: 1; height: 50px; border-radius: 25px; border: none; background: #C9A84C; color: #15120A; font: inherit; font-size: 17px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.vi-share:disabled { opacity: .6; }
.vi-text { height: 50px; padding: 0 18px; border-radius: 25px; border: 1px solid #2A2836; background: transparent; color: #E9E3D3; font: inherit; font-size: 15px; cursor: pointer; }
.vi-note { font-size: 13px; color: #8E8676; padding: 0 16px; }
@media (min-width: 900px) {
  .vi-overlay { flex-direction: row; }
  .vi-overlay .vi-head { position: absolute; top: 0; left: 0; right: 380px; }
  .vi-stage { padding: 70px 30px 30px; }
  .vi-panel { width: 380px; border-radius: 0; border-top: none; border-left: 1px solid #22212E; justify-content: center; }
}`;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.className = 'vi-overlay'; el.id = 'viOverlay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Versículo como imagen');
    el.innerHTML = `
      <div class="vi-head"><button class="vi-x" onclick="closeVerseImage()" aria-label="Cerrar">✕</button><span class="vi-title">Versículo como imagen</span><span style="width:40px"></span></div>
      <div class="vi-stage"><canvas id="viCanvas" aria-label="Vista previa de la imagen"></canvas></div>
      <div class="vi-panel">
        <div class="vi-row" id="viStyles" role="radiogroup" aria-label="Estilo"></div>
        <div class="vi-seg" id="viFormats" role="radiogroup" aria-label="Formato"></div>
        <div class="vi-opts" id="viOpts"></div>
        <div id="viWordsWrap" hidden><div class="vi-label">Palabra protagonista</div><div class="vi-row" id="viWords" style="margin-top:8px"></div></div>
        <div class="vi-actions">
          <button class="vi-share" id="viShare" onclick="shareVerseImage()"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg><span id="viShareLbl">Compartir</span></button>
          <button class="vi-text" onclick="shareVerseText()">Solo texto</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    // En iOS evita que se desplace la Biblia de atrás
    el.addEventListener('touchmove', e => {
      for (let n = e.target; n && n !== el; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX === 'auto') return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  function renderControls() {
    $('viStyles').innerHTML = STYLES.map(s => `<button class="vi-chip ${st.style === s.id ? 'on' : ''}" role="radio" aria-checked="${st.style === s.id}" onclick="viSet('style','${s.id}')">${s.name}</button>`).join('');
    $('viFormats').innerHTML = Object.entries(FORMATS).map(([k, f]) => `<button class="${st.format === k ? 'on' : ''}" role="radio" aria-checked="${st.format === k}" onclick="viSet('format','${k}')">${f.label}</button>`).join('');
    const hasOrig = !!(st.words && st.words.length);
    const langName = st.lang === 'griego' ? 'griego' : 'hebreo';
    let opts = '';
    if (st.style !== 'hebreo') {
      opts += `<button class="vi-toggle" role="switch" aria-checked="${hasOrig && st.original}" ${hasOrig ? '' : 'disabled'} onclick="viSet('original', ${!st.original})"><span class="sw"></span>${st.words === null ? 'Buscando el original…' : hasOrig ? 'Texto en ' + langName : 'Sin texto original'}</button>`;
    }
    if (st.style === 'moderno') {
      opts += `<span style="display:flex;gap:8px;margin-left:auto">${MODERN.map((m, i) => `<button class="vi-swatch ${st.modern === i ? 'on' : ''}" style="background:${m.bg}" aria-label="Color ${i + 1}" aria-pressed="${st.modern === i}" onclick="viSet('modern',${i})"></button>`).join('')}</span>`;
    }
    if (st.style === 'hebreo' && !hasOrig) opts += `<span class="vi-note">${st.words === null ? 'Buscando el texto original…' : 'Este pasaje no tiene texto original disponible.'}</span>`;
    $('viOpts').innerHTML = opts;
    const showWords = st.style === 'hebreo' && hasOrig;
    $('viWordsWrap').hidden = !showWords;
    if (showWords) {
      $('viWords').innerHTML = st.words.map((w, i) => `<button class="vi-chip word ${st.pick === i ? 'on' : ''}" ${st.lang === 'hebreo' ? 'dir="rtl" lang="he"' : 'lang="grc"'} onclick="viSet('pick',${i})">${esc(w.text)}</button>`).join('');
    }
  }

  window.viSet = function (k, v) {
    st[k] = v;
    if (k === 'style') writeLS('kodesh_vi_style', v);
    if (k === 'format') writeLS('kodesh_vi_format', v);
    if (k === 'modern') writeLS('kodesh_vi_modern', v);
    if (k === 'original') writeLS('kodesh_vi_orig', v ? '1' : '0');
    if (k === 'pick') loadLex(st.words[v]);
    renderControls();
    draw();
  };

  /* ── Abrir / cerrar ── */
  window.openVerseImage = function ({ book, chapter, verse, verses }) {
    injectUI();
    const list = (verses && verses.length ? verses : [verse]).map(Number).sort((a, b) => a - b);
    const bookName = (typeof getAllBooks === 'function' && (getAllBooks().find(b => b.id === book) || {}).name) || book;
    st.book = book; st.chapter = Number(chapter); st.verses = list;
    st.text = list.map(v => (typeof verseTextFor === 'function' ? verseTextFor(v) : '')).join(' ').trim();
    st.ref = typeof formatVerseRange === 'function' ? formatVerseRange(bookName, chapter, list) : `${bookName} ${chapter}:${list.join(',')}`;
    st.version = (typeof textualActive !== 'undefined' && textualActive) ? 'Kodesh' : 'RVR60';
    st.words = null; st.lang = null; st.pick = -1; st.blob = null; st.blobFor = '';
    if (!STYLES.some(s => s.id === st.style)) st.style = 'pergamino';
    if (!FORMATS[st.format]) st.format = 'post';
    $('viOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    $('viShareLbl').textContent = navigator.canShare ? 'Compartir' : 'Descargar imagen';
    renderControls();
    draw();
    loadOriginal();
  };
  window.closeVerseImage = function () {
    const o = $('viOverlay'); if (o) o.classList.remove('open');
    if (!document.querySelector('.verse-sheet-overlay.open, .notes-overlay.open, .assistant-overlay.open')) document.body.style.overflow = '';
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('viOverlay')?.classList.contains('open')) closeVerseImage(); });

  /* ── Texto original (hebreo/griego) y léxico ── */
  const stripMarks = s => String(s || '').replace(/[֑-ֽ֯׀׃׆]/g, '').replace(/־/g, '-').trim();
  async function loadOriginal() {
    const key = `${st.book}.${st.chapter}.${st.verses.join(',')}`;
    try {
      const sb = typeof getSupabase === 'function' ? getSupabase() : null;
      if (!sb) throw new Error('sin conexión');
      const { data, error } = await sb.from('bible_source_words').select('verse,word_order,original_text,strongs,language')
        .eq('book', st.book).eq('chapter', st.chapter).order('verse').order('word_order').limit(2000);
      if (error) throw error;
      if (key !== `${st.book}.${st.chapter}.${st.verses.join(',')}`) return;
      let offset = 0;
      // En los Salmos el hebreo cuenta el título como versículo 1 (p. ej. Salmo 51)
      if (st.book === 'PSA' && data && data.length) {
        const hebMax = Math.max(...data.map(r => r.verse));
        const espCount = document.querySelectorAll('#mainContent .verse[data-verse]').length;
        if (espCount && hebMax - espCount > 0 && hebMax - espCount <= 2) offset = hebMax - espCount;
      }
      const want = new Set(st.verses.map(v => v + offset));
      const words = (data || []).filter(r => want.has(r.verse)).map(r => ({ text: stripMarks(r.original_text), strongs: (String(r.strongs || '').match(/^[HG]\d+/i) || [''])[0].toUpperCase(), lang: r.language }))
        .filter(w => w.text);
      // El título del salmo no forma parte del versículo en español
      if (st.book === 'PSA' && offset === 0 && st.verses[0] === 1) {
        while (words.length > 2 && PSALM_TITLE.has(words[0].strongs) && words[0].strongs !== 'H8085') words.shift();
      }
      st.words = words;
      st.lang = words[0] ? words[0].lang : null;
      st.pick = words.findIndex(w => w.strongs && !STOP.has(w.strongs) && w.text.replace(/[֐-׏]/g, (c) => /[א-ת]/.test(c) ? c : '').length >= 3);
      if (st.pick < 0) st.pick = words.length ? 0 : -1;
      if (st.pick >= 0) await loadLex(words[st.pick]);
    } catch (e) {
      st.words = [];
    }
    renderControls();
    draw();
  }
  async function loadLex(w) {
    if (!w || !w.strongs || st.lex[w.strongs]) { draw(); return; }
    st.lex[w.strongs] = { pending: true };
    try {
      const { data } = await getSupabase().from('lexicon_cache').select('lemma,transliteration,definition').eq('word', 'strongs_' + w.strongs.toLowerCase()).maybeSingle();
      st.lex[w.strongs] = data || {};
    } catch (e) { st.lex[w.strongs] = {}; }
    draw();
  }
  function shortDef(def) {
    let d = String(def || '').replace(/\s+/g, ' ').trim();
    if (!d) return '';
    d = d.split(/[.;:]/)[0].trim();
    const parts = d.split(/,\s*/);
    let out = parts[0];
    for (let i = 1; i < parts.length && (out + ', ' + parts[i]).length <= 60; i++) out += ', ' + parts[i];
    if (out.length > 70) out = out.slice(0, 68).replace(/\s+\S*$/, '') + '…';
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  const origLine = () => (st.words || []).map(w => w.text).join(' ');

  /* ── Dibujo ── */
  function setFont(ctx, weight, style, size, family) { ctx.font = `${style || 'normal'} ${weight} ${Math.round(size)}px ${family}`; }
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }
  // Ajusta el tamaño de letra para que el texto quepa en el alto disponible
  function fit(ctx, text, o) {
    let size = o.max;
    for (; size >= o.min; size -= 2) {
      setFont(ctx, o.weight, o.style, size, o.family);
      const lines = wrap(ctx, text, o.maxW);
      if (lines.length * size * o.lh <= o.maxH) return { size, lines, h: lines.length * size * o.lh, o };
    }
    setFont(ctx, o.weight, o.style, o.min, o.family);
    let lines = wrap(ctx, text, o.maxW);
    const maxLines = Math.max(1, Math.floor(o.maxH / (o.min * o.lh)));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return { size: o.min, lines, h: lines.length * o.min * o.lh, o };
  }
  function drawBlock(ctx, b, cx, top, color, align = 'center', x0 = 0) {
    setFont(ctx, b.o.weight, b.o.style, b.size, b.o.family);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.direction = b.o.rtl ? 'rtl' : 'ltr';
    const lh = b.size * b.o.lh;
    b.lines.forEach((ln, i) => ctx.fillText(ln, align === 'left' ? x0 : cx, top + lh * i + lh / 2));
    ctx.direction = 'ltr';
    return top + b.h;
  }
  function spaced(ctx, text, x, y, spacing, align = 'center') {
    const chars = [...text];
    const w = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
    return w;
  }
  function logo(ctx, W, y, color, u, align = 'center', x = W / 2) {
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    setFont(ctx, 500, 'normal', 30 * u, HEB);
    const heb = 'קֹדֶשׁ';
    const hw = ctx.measureText(heb).width;
    setFont(ctx, 500, 'normal', 21 * u, BODY);
    const label = 'KODESH BIBLE';
    const lw = [...label].reduce((s, c) => s + ctx.measureText(c).width, 0) + 5 * u * (label.length - 1);
    const total = hw + 14 * u + lw;
    let sx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    setFont(ctx, 500, 'normal', 30 * u, HEB);
    ctx.textAlign = 'left'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(heb, sx + hw, y);
    ctx.direction = 'ltr';
    setFont(ctx, 500, 'normal', 21 * u, BODY);
    spaced(ctx, label, sx + hw + 14 * u, y + 1 * u, 5 * u, 'left');
    setFont(ctx, 400, 'italic', 19 * u, BODY);
    ctx.globalAlpha = 0.8;
    ctx.textAlign = align === 'center' ? 'center' : align;
    ctx.fillText('kodeshbible.com', align === 'center' ? x : align === 'right' ? x : x, y + 34 * u);
    ctx.globalAlpha = 1;
  }
  function seeded(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  const verseText = () => `«${st.text}»`;
  const refUpper = () => st.ref.toUpperCase();

  function drawPergamino(ctx, W, H, u) {
    const g = ctx.createRadialGradient(W / 2, 0, 50 * u, W / 2, H * 0.2, H);
    g.addColorStop(0, '#FBF4E2'); g.addColorStop(0.65, '#EEDFBD'); g.addColorStop(1, '#E0C995');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(138,106,30,.6)'; ctx.lineWidth = 3 * u; ctx.strokeRect(36 * u, 36 * u, W - 72 * u, H - 72 * u);
    ctx.strokeStyle = 'rgba(138,106,30,.35)'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(50 * u, 50 * u, W - 100 * u, H - 100 * u);
    ctx.fillStyle = '#8A6A1E'; ctx.textBaseline = 'middle';
    setFont(ctx, 600, 'normal', 30 * u, BODY); spaced(ctx, refUpper(), W / 2, 130 * u, 8 * u);
    setFont(ctx, 400, 'normal', 34 * u, BODY); ctx.textAlign = 'center'; ctx.fillText('✦', W / 2, 180 * u);
    const showO = st.original && st.words && st.words.length;
    const top = 230 * u, bottom = H - 190 * u;
    const ob = showO ? fit(ctx, origLine(), { weight: 500, family: HEB, max: 60 * u, min: 34 * u, maxW: W - 220 * u, maxH: Math.min(220 * u, (bottom - top) * 0.3), lh: 1.45, rtl: st.lang !== 'griego' }) : null;
    const gap = showO ? 70 * u : 0;
    const vb = fit(ctx, verseText(), { weight: 600, style: 'italic', family: SERIF, max: 96 * u, min: 38 * u, maxW: W - 220 * u, maxH: bottom - top - (ob ? ob.h + gap : 0), lh: 1.18 });
    let y = top + (bottom - top - vb.h - (ob ? ob.h + gap : 0)) / 2;
    y = drawBlock(ctx, vb, W / 2, y, '#3A2C14');
    if (ob) {
      ctx.fillStyle = 'rgba(138,106,30,.5)'; ctx.fillRect(W / 2 - 40 * u, y + gap / 2 - 1 * u, 80 * u, 2 * u);
      drawBlock(ctx, ob, W / 2, y + gap, '#8A6A1E');
    }
    logo(ctx, W, H - 130 * u, '#8A6A1E', u);
  }

  function drawShabat(ctx, W, H, u) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#161230'); g.addColorStop(0.7, '#0A0914'); g.addColorStop(1, '#07060C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 230 * u, 10 * u, W / 2, 230 * u, 520 * u);
    glow.addColorStop(0, 'rgba(240,175,80,.38)'); glow.addColorStop(1, 'rgba(240,175,80,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const rnd = seeded(st.ref);
    for (let i = 0; i < 46; i++) { ctx.globalAlpha = 0.25 + rnd() * 0.6; ctx.fillStyle = '#F3DFA0'; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * 0.85, (0.8 + rnd() * 2.2) * u, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const cx of [W / 2 - 75 * u, W / 2 + 75 * u]) {
      const cg = ctx.createLinearGradient(0, 260 * u, 0, 400 * u); cg.addColorStop(0, '#F6EEDC'); cg.addColorStop(1, '#C9BC9E');
      ctx.fillStyle = cg; roundRect(ctx, cx - 16 * u, 262 * u, 32 * u, 150 * u, 4 * u); ctx.fill();
      const fl = ctx.createRadialGradient(cx, 228 * u, 2 * u, cx, 222 * u, 46 * u);
      fl.addColorStop(0, 'rgba(255,248,210,1)'); fl.addColorStop(0.35, 'rgba(248,190,90,.95)'); fl.addColorStop(1, 'rgba(245,150,60,0)');
      ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(cx, 222 * u, 22 * u, 40 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3A2A1A'; ctx.fillRect(cx - 1.5 * u, 250 * u, 3 * u, 13 * u);
    }
    const showO = st.original && st.words && st.words.length;
    const top = 470 * u, bottom = H - 300 * u;
    const ob = showO ? fit(ctx, origLine(), { weight: 500, family: HEB, max: 44 * u, min: 28 * u, maxW: W - 200 * u, maxH: 150 * u, lh: 1.45, rtl: st.lang !== 'griego' }) : null;
    const vb = fit(ctx, st.text, { weight: 500, family: SERIF, max: 80 * u, min: 36 * u, maxW: W - 180 * u, maxH: bottom - top - (ob ? ob.h + 40 * u : 0), lh: 1.25 });
    let y = top + (bottom - top - vb.h - (ob ? ob.h + 40 * u : 0)) / 2;
    y = drawBlock(ctx, vb, W / 2, y, '#F1EADB');
    if (ob) drawBlock(ctx, ob, W / 2, y + 40 * u, 'rgba(230,197,103,.85)');
    ctx.fillStyle = '#E6C567'; setFont(ctx, 600, 'normal', 28 * u, BODY); ctx.textBaseline = 'middle';
    spaced(ctx, refUpper(), W / 2, H - 230 * u, 7 * u);
    logo(ctx, W, H - 130 * u, 'rgba(230,197,103,.8)', u);
  }

  function drawHebreo(ctx, W, H, u) {
    const g = ctx.createRadialGradient(W / 2, H * 0.3, 40 * u, W / 2, H * 0.4, H * 0.85);
    g.addColorStop(0, '#4A1A24'); g.addColorStop(0.6, '#2A0E15'); g.addColorStop(1, '#1A070C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const gold = '#E3C27A';
    ctx.fillStyle = gold; ctx.textBaseline = 'middle';
    setFont(ctx, 600, 'normal', 26 * u, BODY); spaced(ctx, 'LA PALABRA', W / 2, 110 * u, 8 * u);
    const w = st.words && st.pick >= 0 ? st.words[st.pick] : null;
    const lex = w ? st.lex[w.strongs] || {} : {};
    let y = 150 * u;
    if (w) {
      const wb = fit(ctx, w.text, { weight: 500, family: HEB, max: 250 * u, min: 110 * u, maxW: W - 200 * u, maxH: 330 * u, lh: 1.25, rtl: w.lang !== 'griego' });
      ctx.shadowColor = 'rgba(227,194,122,.3)'; ctx.shadowBlur = 40 * u;
      y = drawBlock(ctx, wb, W / 2, y, gold);
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      const tr = String(lex.transliteration || '').normalize('NFD').replace(/[\u0302\u0306\u0304\u0331\u0323]/g, '').replace(/[ʻʼ]/g, '’').normalize('NFC');
      if (tr) { setFont(ctx, 500, 'italic', 50 * u, SERIF); ctx.fillStyle = '#F4EADB'; ctx.textAlign = 'center'; ctx.fillText(tr, W / 2, y + 10 * u); y += 60 * u; }
      const def = shortDef(lex.definition);
      const line = [def, w.strongs].filter(Boolean).join(' · ');
      if (line) { const db = fit(ctx, line, { weight: 400, family: BODY, max: 32 * u, min: 26 * u, maxW: W - 260 * u, maxH: 90 * u, lh: 1.3 }); y = drawBlock(ctx, db, W / 2, y + 6 * u, '#C9B9A4'); }
    }
    ctx.fillStyle = 'rgba(227,194,122,.5)'; ctx.fillRect(W / 2 - 34 * u, y + 34 * u, 68 * u, 2 * u);
    const top = y + 70 * u, bottom = H - 250 * u;
    const vb = fit(ctx, verseText(), { weight: 500, family: SERIF, max: 66 * u, min: 32 * u, maxW: W - 200 * u, maxH: Math.max(80 * u, bottom - top), lh: 1.24 });
    drawBlock(ctx, vb, W / 2, top + Math.max(0, (bottom - top - vb.h) / 2), '#F4EADB');
    ctx.fillStyle = gold; setFont(ctx, 600, 'normal', 28 * u, BODY); ctx.textBaseline = 'middle';
    spaced(ctx, refUpper(), W / 2, H - 200 * u, 7 * u);
    logo(ctx, W, H - 120 * u, 'rgba(227,194,122,.75)', u);
  }

  function headlineOf(text) {
    const words = text.split(/\s+/);
    if (words.length <= 12) return { head: text, rest: '' };
    const m = text.match(/^(.{12,70}?)[,:;.!?](\s|$)/);
    let head = m ? m[1] : words.slice(0, 7).join(' ') + '…';
    return { head, rest: text };
  }
  function drawModerno(ctx, W, H, u) {
    const c = MODERN[st.modern] || MODERN[0];
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
    const L = 96 * u, maxW = W - 2 * L;
    ctx.textBaseline = 'middle'; ctx.fillStyle = c.kicker;
    setFont(ctx, 700, 'normal', 26 * u, SANS); spaced(ctx, refUpper(), L, 130 * u, 6 * u, 'left');
    const { head, rest } = headlineOf(st.text);
    const showO = st.original && st.words && st.words.length;
    const top = 200 * u, bottom = H - 220 * u;
    const avail = bottom - top;
    const hb = fit(ctx, head, { weight: 800, family: SANS, max: (st.format === 'story' ? 150 : 120) * u, min: 54 * u, maxW, maxH: rest ? avail * 0.48 : avail * (showO ? 0.78 : 1), lh: 1.02 });
    let y = top;
    if (!rest) {   // versículo corto: centrar el bloque en vez de dejarlo arriba
      setFont(ctx, 500, 'normal', 40 * u, HEB);
      const oh = showO ? wrap(ctx, origLine(), maxW).length * 40 * u * 1.4 + 50 * u : 0;
      y = top + Math.max(0, (avail - hb.h - oh) * 0.42);
    }
    // Última palabra del titular en color de acento
    setFont(ctx, 800, 'normal', hb.size, SANS); ctx.textAlign = 'left';
    const lh = hb.size * 1.02;
    hb.lines.forEach((ln, i) => {
      const yy = y + lh * i + lh / 2;
      if (i === hb.lines.length - 1) {
        const parts = ln.split(' '); const last = parts.pop(); const first = parts.join(' ');
        ctx.fillStyle = c.fg; ctx.fillText(first ? first + ' ' : '', L, yy);
        ctx.fillStyle = c.accent; ctx.fillText(last, L + (first ? ctx.measureText(first + ' ').width : 0), yy);
      } else { ctx.fillStyle = c.fg; ctx.fillText(ln, L, yy); }
    });
    y += hb.h + 50 * u;
    if (rest) {
      const rb = fit(ctx, rest, { weight: 400, family: BODY, max: 44 * u, min: 28 * u, maxW, maxH: bottom - y - (showO ? 130 * u : 0), lh: 1.38 });
      y = drawBlock(ctx, rb, 0, y, c.soft, 'left', L) + 30 * u;
    }
    if (showO) {
      const ob = fit(ctx, origLine(), { weight: 500, family: HEB, max: 40 * u, min: 26 * u, maxW, maxH: 120 * u, lh: 1.4, rtl: st.lang !== 'griego' });
      drawBlock(ctx, ob, W - L, y, c.kicker, st.lang !== 'griego' ? 'right' : 'left', L);
    }
    ctx.fillStyle = c.kicker; setFont(ctx, 700, 'normal', 22 * u, SANS); ctx.textBaseline = 'middle';
    spaced(ctx, st.version.toUpperCase(), L, H - 110 * u, 5 * u, 'left');
    logo(ctx, W, H - 125 * u, c.kicker, u, 'right', W - L);
  }

  function drawAmanecer(ctx, W, H, u) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2B2F6B'); g.addColorStop(0.32, '#6C4C8F'); g.addColorStop(0.6, '#D9837A'); g.addColorStop(0.74, '#F6C38B'); g.addColorStop(0.84, '#F9E2B4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sy = H * 0.76;
    const sun = ctx.createRadialGradient(W / 2, sy, 10 * u, W / 2, sy, 260 * u);
    sun.addColorStop(0, '#FFF6D8'); sun.addColorStop(0.45, 'rgba(255,213,138,.95)'); sun.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, sy - 300 * u, W, 600 * u);
    const hill = (y0, amp, color, alpha) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
      ctx.lineTo(0, y0);
      ctx.bezierCurveTo(W * 0.2, y0 - amp, W * 0.35, y0 + amp * 0.6, W * 0.5, y0);
      ctx.bezierCurveTo(W * 0.68, y0 - amp * 0.9, W * 0.82, y0 + amp * 0.4, W, y0 - amp * 0.3);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    };
    hill(H * 0.80, 60 * u, '#5B3C6E', 0.85); hill(H * 0.86, 45 * u, '#3B2A55', 1); hill(H * 0.92, 35 * u, '#231A3A', 1);
    ctx.shadowColor = 'rgba(40,20,60,.45)'; ctx.shadowBlur = 24 * u;
    ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle'; setFont(ctx, 600, 'normal', 28 * u, SERIF);
    spaced(ctx, refUpper(), W / 2, 120 * u, 8 * u);
    const showO = st.original && st.words && st.words.length;
    const top = 180 * u, bottom = H * 0.64;
    const ob = showO ? fit(ctx, origLine(), { weight: 500, family: HEB, max: 42 * u, min: 26 * u, maxW: W - 200 * u, maxH: 130 * u, lh: 1.4, rtl: st.lang !== 'griego' }) : null;
    const vb = fit(ctx, st.text, { weight: 600, family: SERIF, max: 84 * u, min: 36 * u, maxW: W - 170 * u, maxH: bottom - top - (ob ? ob.h + 34 * u : 0), lh: 1.2 });
    let y = top + (bottom - top - vb.h - (ob ? ob.h + 34 * u : 0)) / 2;
    y = drawBlock(ctx, vb, W / 2, y, '#FFFFFF');
    if (ob) drawBlock(ctx, ob, W / 2, y + 34 * u, '#FFF3D6');
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    logo(ctx, W, H - 110 * u, 'rgba(255,240,215,.85)', u);
  }

  const DRAW = { pergamino: drawPergamino, shabat: drawShabat, hebreo: drawHebreo, moderno: drawModerno, amanecer: drawAmanecer };
  let drawTimer = null;
  function draw() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(drawNow, 16);
  }
  async function drawNow() {
    const cv = $('viCanvas'); if (!cv || !$('viOverlay').classList.contains('open')) return;
    const seq = ++st.renderSeq;
    try {
      if (document.fonts) await Promise.all([
        document.fonts.load(`600 40px 'Cormorant Garamond'`), document.fonts.load(`italic 600 40px 'Cormorant Garamond'`),
        document.fonts.load(`400 40px 'EB Garamond'`), document.fonts.load(`500 40px 'Frank Ruhl Libre'`, 'אב'),
      ]);
    } catch (e) {}
    if (seq !== st.renderSeq) return;
    const f = FORMATS[st.format];
    cv.width = f.w; cv.height = f.h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, f.w, f.h);
    (DRAW[st.style] || drawPergamino)(ctx, f.w, f.h, f.w / 1080);
    st.blob = null; st.blobFor = '';
    const sig = `${st.style}|${st.format}|${st.modern}|${st.original}|${st.pick}|${seq}`;
    $('viShare').disabled = true;
    cv.toBlob(b => { if (seq === st.renderSeq) { st.blob = b; st.blobFor = sig; $('viShare').disabled = false; } }, 'image/png');
  }

  /* ── Compartir ── */
  function fileName() { return 'KODESH ' + st.ref.replace(/[\\/:*?"<>|]+/g, '-') + '.png'; }
  window.shareVerseImage = function () {
    if (!st.blob) return;
    const file = new File([st.blob], fileName(), { type: 'image/png' });
    const can = navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })();
    if (can) {
      navigator.share({ files: [file], title: st.ref }).catch(err => { if (err && err.name !== 'AbortError') download(); });
    } else download();
  };
  function download() {
    const url = URL.createObjectURL(st.blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (typeof showToast === 'function') showToast('Imagen descargada');
  }
  window.shareVerseText = function () {
    const text = `«${st.text}»\n— ${st.ref}\n\nEstudiado en KODESH · kodeshbible.com`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => { if (typeof showToast === 'function') showToast('✓ Versículo copiado'); });
  };
})();
