/* ════════════════════════════════════════════════════════════════
   KODESH · Lienzo de estudio
   Un estudio = { id, title, format: 'notebook'|'free', template, pages, chat, ref }
   página   = { id, template, tpl: {...datos de la plantilla}, els: [...] }
   elemento = stroke | text | verse | word | ai   (coordenadas de página)
   Se guarda primero en el dispositivo y luego en la nube (study_canvases).
════════════════════════════════════════════════════════════════ */
'use strict';

/* ── Conexión ── */
const SUPABASE_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co';
const SB_STORAGE_KEY = 'sb-fvknbqdsgqdmwirrgcvb-auth-token';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a25icWRzZ3FkbXdpcnJnY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzU2NjYsImV4cCI6MjA5NjExMTY2Nn0.RqiuH5fafECN1yW5MjBP3zzHAdXLH4QD3gBL_WZ-hB0';
let sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: SB_STORAGE_KEY } }); } catch (e) { sb = null; }

const KAPI_BASE = 'https://www.kodeshbible.com';
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
// Mismo patrón que la Biblia: en la app nativa se usa HTTP nativo y el token
// viaja también en el cuerpo (el encabezado Authorization a veces se pierde).
async function kapiFetch(url, options = {}) {
  const fullUrl = (url.startsWith('/') && isNative()) ? KAPI_BASE + url : url;
  const hdrs = options.headers || {};
  const auth = hdrs.Authorization || hdrs.authorization || '';
  let opts = options;
  if (isNative() && auth.startsWith('Bearer ')) {
    try { const b = options.body ? JSON.parse(options.body) : {}; b.__authToken = auth.slice(7); opts = { ...options, body: JSON.stringify(b) }; } catch (e) {}
  }
  if (isNative()) {
    try {
      const http = window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      if (http) {
        const r = await http.request({ method: opts.method || 'GET', url: fullUrl, headers: opts.headers || { 'Content-Type': 'application/json' }, data: opts.body ? JSON.parse(opts.body) : undefined });
        if (!(r.status === 401 && auth)) return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.data };
      }
    } catch (e) {}
  }
  return fetch(fullUrl, opts);
}
async function getSession() {
  if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); return data.session || null; } catch (e) { return null; }
}

/* ── Utilidades ── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function readLS(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
const ICON = d => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const bookName = id => (window.KodeshRef?.BOOKS.find(b => b[0] === id) || [])[1] || id;
const bookChapters = id => (window.KodeshRef?.BOOKS.find(b => b[0] === id) || [])[2] || 1;
function fmtDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const today = new Date(); const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return 'Hoy, ' + d.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

/* ── Tema ── */
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';
const SUN = 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
function paintThemeBtn() { const b = $('themeBtn'); if (b) b.innerHTML = ICON(document.documentElement.classList.contains('light') ? SUN : MOON); }
function toggleTheme() {
  const light = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('kodesh_theme', light ? 'light' : 'dark'); } catch (e) {}
  paintThemeBtn();
}

/* ════════════════════════════════════
   PLANTILLAS (coordenadas de una hoja carta: 816 × 1056)
════════════════════════════════════ */
const PAGE = { notebook: { w: 816, h: 1056 }, free: { w: 2400, h: 1600 } };
const TEMPLATES = [
  { id: 'blank', name: 'En blanco', desc: 'Hoja libre para escribir y dibujar', boxes: [] },
  { id: 'lined', name: 'Renglones', desc: 'Como un cuaderno de notas', boxes: [{ x: 56, y: 140, w: 704, h: 860, lined: true, plain: true }] },
  { id: 'parasha', name: 'Parashá de la semana', desc: 'Torah, Haftarah y Nuevo Pacto, con la porción actual', kicker: 'Parashá de la semana',
    boxes: [
      { x: 56, y: 140, w: 224, h: 170, label: 'Torah', sub: 'torah', cls: 'c-gold' },
      { x: 296, y: 140, w: 224, h: 170, label: 'Haftarah', sub: 'haftarah', cls: 'c-blue' },
      { x: 536, y: 140, w: 224, h: 170, label: 'Nuevo Pacto', sub: 'mesianica', cls: 'c-purple' },
      { x: 56, y: 330, w: 440, h: 150, label: 'Versículo clave', dashed: true },
      { x: 512, y: 330, w: 248, h: 150, label: 'Palabra clave', dashed: true },
      { x: 56, y: 500, w: 704, h: 330, label: 'Lo que aprendí', lined: true },
      { x: 56, y: 850, w: 704, h: 150, label: 'Oración', lined: true },
    ] },
  { id: 'inductivo', name: 'Estudio inductivo', desc: 'Observa, interpreta, aplica', kicker: 'Estudio inductivo',
    boxes: [
      { x: 56, y: 140, w: 704, h: 130, label: 'Pasaje', dashed: true },
      { x: 56, y: 290, w: 704, h: 230, label: 'Observa · ¿qué dice?', lined: true, cls: 'c-gold' },
      { x: 56, y: 540, w: 704, h: 230, label: 'Interpreta · ¿qué significa?', lined: true, cls: 'c-blue' },
      { x: 56, y: 790, w: 704, h: 210, label: 'Aplica · ¿qué hago con esto?', lined: true, cls: 'c-purple' },
    ] },
  { id: 'palabra', name: 'Estudio de palabra', desc: 'Hebreo o griego, definición y usos', kicker: 'Estudio de palabra',
    boxes: [
      { x: 56, y: 140, w: 340, h: 200, label: 'Palabra', dashed: true, cls: 'c-gold' },
      { x: 412, y: 140, w: 348, h: 200, label: 'Definición' },
      { x: 56, y: 360, w: 704, h: 300, label: 'Usos en la Escritura', lined: true },
      { x: 56, y: 680, w: 704, h: 320, label: 'Lo que me enseña', lined: true },
    ] },
  { id: 'personaje', name: 'Mapa de personaje', desc: 'Quién fue, decisiones, lecciones', kicker: 'Mapa de personaje',
    boxes: [
      { x: 56, y: 140, w: 340, h: 250, label: 'Quién fue', lined: true },
      { x: 420, y: 140, w: 340, h: 250, label: 'Decisiones', lined: true },
      { x: 238, y: 415, w: 340, h: 200, label: 'Personaje', dashed: true, cls: 'c-gold' },
      { x: 56, y: 640, w: 340, h: 250, label: 'Fortalezas y caídas', lined: true },
      { x: 420, y: 640, w: 340, h: 250, label: 'Lecciones para mí', lined: true },
      { x: 56, y: 910, w: 704, h: 90, label: 'Citas', dashed: true },
    ] },
  { id: 'linea', name: 'Línea de tiempo', desc: 'Eventos en orden, con sus citas', kicker: 'Línea de tiempo',
    boxes: [
      { x: 56, y: 140, w: 704, h: 190, label: 'Período o tema', lined: true },
      ...[0, 1, 2, 3, 4].map(i => ({ x: 56 + i * 144, y: i % 2 ? 590 : 370, w: 132, h: 170, label: 'Evento ' + (i + 1) })),
      { x: 56, y: 820, w: 704, h: 180, label: 'Notas', lined: true },
    ],
    lines: [{ x: 56, y: 572, w: 704 }], dots: [0, 1, 2, 3, 4].map(i => ({ x: 56 + i * 144 + 59, y: 566 })) },
  { id: 'devocional', name: 'Diario devocional', desc: 'Escritura, observación, aplicación y oración', kicker: 'Diario devocional',
    boxes: [
      { x: 56, y: 140, w: 704, h: 190, label: 'Escritura', dashed: true, cls: 'c-gold' },
      { x: 56, y: 350, w: 704, h: 210, label: 'Observación', lined: true },
      { x: 56, y: 580, w: 704, h: 210, label: 'Aplicación', lined: true },
      { x: 56, y: 810, w: 704, h: 190, label: 'Oración', lined: true },
    ] },
  { id: 'bosquejo', name: 'Bosquejo de enseñanza', desc: 'Para preparar una clase o mensaje', kicker: 'Bosquejo de enseñanza',
    boxes: [
      { x: 56, y: 140, w: 704, h: 90, label: 'Tema' },
      { x: 56, y: 250, w: 704, h: 110, label: 'Texto base', dashed: true, cls: 'c-gold' },
      { x: 56, y: 375, w: 704, h: 150, label: 'I.', lined: true },
      { x: 56, y: 540, w: 704, h: 150, label: 'II.', lined: true },
      { x: 56, y: 705, w: 704, h: 150, label: 'III.', lined: true },
      { x: 56, y: 870, w: 704, h: 135, label: 'Conclusión', lined: true },
    ] },
];
const tplById = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

function renderTemplate(page, study) {
  if (study.format === 'free') return '';
  const t = tplById(page.template);
  const d = page.tpl || {};
  let html = '';
  if (t.id !== 'blank') {
    const title = t.id === 'parasha' && d.nombre ? d.nombre : (study.title || t.name);
    const heb = t.id === 'parasha' ? (d.heb || '') : '';
    html += `<div class="tpl-head"><div><div class="tpl-kicker">${esc(t.kicker || t.name)}</div><div class="tpl-title">${esc(title)}</div></div>${heb ? `<span class="tpl-heb" lang="he">${esc(heb)}</span>` : ''}</div>`;
  }
  for (const b of t.boxes) {
    const sub = b.sub && d[b.sub] ? `<span class="tpl-sub">${esc(d[b.sub])}</span>` : '';
    const cls = ['tpl-box', b.lined ? 'lined' : '', b.dashed ? 'dashed' : ''].join(' ');
    const style = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;${b.plain ? 'border-color:transparent;' : ''}`;
    html += `<div class="${cls}" style="${style}">${b.label ? `<span class="tpl-label ${b.cls || ''}">${esc(b.label)}</span>` : ''}${sub}</div>`;
  }
  for (const l of t.lines || []) html += `<div class="tpl-line" style="left:${l.x}px;top:${l.y}px;width:${l.w}px"></div>`;
  for (const p of t.dots || []) html += `<div class="tpl-dot" style="left:${p.x}px;top:${p.y}px"></div>`;
  return html;
}
const PREFERRED = { verse: ['Versículo clave', 'Pasaje', 'Escritura', 'Texto base'], word: ['Palabra clave', 'Palabra'],
  ai: ['Lo que aprendí', 'Interpreta · ¿qué significa?', 'Observación', 'Usos en la Escritura', 'Lecciones para mí', 'Notas', 'I.'] };
PREFERRED.inter = ['Pasaje', 'Escritura', 'Texto base', 'Lo que aprendí', 'Usos en la Escritura', 'Observa · ¿qué dice?', 'Observación', 'Notas', 'Período o tema'];
const FILLABLE = new Set(['ai', 'inter']);   // estas cajas admiten varios elementos (se apilan)
function preferredBox(page, type) {
  const names = PREFERRED[type];
  if (!names) return null;
  const t = tplById(page.template);
  for (const name of names) {
    const b = t.boxes.find(x => x.label === name);
    if (!b) continue;
    const used = page.els.some(e => e.type !== 'stroke' && e.x >= b.x - 4 && e.x < b.x + b.w && e.y >= b.y && e.y < b.y + b.h);
    if (!used || FILLABLE.has(type)) return b;
  }
  return null;
}
/* Texto sobre los renglones: las cajas con renglones tienen una línea cada 36 px
   (la primera a 70.5 px del borde superior de la caja). La base de la letra en
   una línea de alto L queda a ≈ L/2 + 0,34·tamaño del borde superior. */
const TEXT_SIZES = [14, 16, 20, 24, 28, 32, 40, 48, 64];
const RULE = 36, RULE_FIRST = 70.5, TEXT_PAD = 4;
const DEFAULT_FS = font => font === 'hand' ? 32 : 24;
function linedBoxFor(page, el) {
  if (!study || study.format === 'free') return null;
  const b = boxAt(page, el.x + 10, el.y + 20);
  return b && b.lined ? b : null;
}
function textMetrics(page, el) {
  const fs = el.fs || DEFAULT_FS(el.font);
  const box = linedBoxFor(page, el);
  const lh = box ? (fs <= 28 ? RULE : fs <= 56 ? RULE * 2 : RULE * 3) : Math.round(fs * 1.45);
  return { fs, lh, box };
}
function snapText(page, el, down = false) {
  const { fs, lh, box } = textMetrics(page, el);
  if (!box) return;
  const base = lh / 2 + 0.34 * fs;                           // de la parte de arriba del texto a la base
  const firstLine = box.y + RULE_FIRST;
  const k = Math.max(0, (down ? Math.ceil : Math.round)((el.y + TEXT_PAD + base + 3 - firstLine) / RULE - (down ? 0.01 : 0)));
  el.y = Math.round(firstLine + k * RULE - 3 - TEXT_PAD - base);
  if (el.x < box.x + 8 || el.x > box.x + box.w - 60) el.x = box.x + 12;
}
function boxAt(page, x, y) {
  const t = tplById(page.template);
  return t.boxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
}

/* Porción de esta semana (para la plantilla de parashá) */
let parashaCache = null;
async function currentParasha(num) {
  if (!parashaCache) {
    try {
      const [d, c] = await Promise.all([fetch('./parashot-data.json').then(r => r.json()), fetch('./parashot-calendar.json').then(r => r.ok ? r.json() : {})]);
      parashaCache = { data: d, cal: c };
    } catch (e) { parashaCache = { data: [], cal: {} }; }
  }
  const { data, cal } = parashaCache;
  if (!num) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const k = Object.keys(cal).sort().find(ds => { const [y, m, dd] = ds.split('-').map(Number); return new Date(y, m - 1, dd) >= today; });
    num = k ? cal[k][0] : 1;
  }
  const p = data.find(x => x.num === Number(num));
  return p ? { num: p.num, nombre: p.nombre, heb: p.heb, sig: p.sig, torah: p.torah, haftarah: p.haftarah, mesianica: p.mesianica, book: p.book, startChapter: p.startChapter } : null;
}

/* ════════════════════════════════════
   GUARDADO: dispositivo + nube
════════════════════════════════════ */
const IDX_KEY = 'kodesh_studies_v1';
const studyKey = id => 'kodesh_study_' + id;
let studiesIndex = readLS(IDX_KEY, []);   // [{ id, title, format, template, heb, updatedAt }]

function metaOf(s) {
  const p0 = s.pages[0] || {};
  return { id: s.id, title: s.title, format: s.format, template: s.template, heb: (p0.tpl && p0.tpl.heb) || '', updatedAt: s.updatedAt };
}
function saveLocal(s) {
  const ok = writeLS(studyKey(s.id), s);
  studiesIndex = [metaOf(s), ...studiesIndex.filter(x => x.id !== s.id)];
  writeLS(IDX_KEY, studiesIndex);
  return ok;
}
async function saveCloud(s) {
  const session = await getSession();
  if (!session) return 'local';
  const { error } = await sb.from('study_canvases').upsert({
    id: s.id, user_id: session.user.id, title: s.title.slice(0, 120), format: s.format, template: s.template,
    data: { v: 1, pages: s.pages, chat: (s.chat || []).slice(-30), ref: s.ref || null, meta: { heb: metaOf(s).heb } },
    updated_at: s.updatedAt,
  });
  if (error) throw error;
  return 'cloud';
}
async function loadCloudIndex() {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await sb.from('study_canvases').select('id,title,format,template,updated_at,meta:data->meta').order('updated_at', { ascending: false }).limit(200);
  if (error || !data) return false;
  const byId = new Map(studiesIndex.map(x => [x.id, x]));
  for (const r of data) {
    const local = byId.get(r.id);
    if (!local || new Date(r.updated_at) > new Date(local.updatedAt)) {
      byId.set(r.id, { id: r.id, title: r.title, format: r.format, template: r.template, heb: (r.meta && r.meta.heb) || '', updatedAt: r.updated_at, cloudNewer: true });
    }
  }
  studiesIndex = [...byId.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  writeLS(IDX_KEY, studiesIndex);
  return true;
}
async function loadStudy(id) {
  let s = readLS(studyKey(id), null);
  const meta = studiesIndex.find(x => x.id === id);
  const session = await getSession();
  if (session && (!s || (meta && meta.cloudNewer))) {
    const { data } = await sb.from('study_canvases').select('*').eq('id', id).maybeSingle();
    if (data && (!s || new Date(data.updated_at) >= new Date(s.updatedAt))) {
      s = { id: data.id, title: data.title, format: data.format, template: data.template, pages: (data.data && data.data.pages) || [], chat: (data.data && data.data.chat) || [], ref: data.data && data.data.ref, createdAt: data.created_at, updatedAt: data.updated_at };
      saveLocal(s);
    }
  }
  return s;
}

let saveTimer = null, cloudTimer = null;
function markDirty() {
  if (!study) return;
  study.updatedAt = new Date().toISOString();
  setSaveState('Guardando…');
  clearTimeout(saveTimer); clearTimeout(cloudTimer);
  saveTimer = setTimeout(() => {
    if (!saveLocal(study)) toast('No hay espacio en el dispositivo; se guardará en la nube');
    cloudTimer = setTimeout(syncNow, 1800);
  }, 500);
}
async function syncNow() {
  if (!study) return;
  try {
    const where = await saveCloud(study);
    setSaveState(where === 'cloud' ? 'Guardado' : 'Guardado en este dispositivo');
  } catch (e) {
    setSaveState('Guardado en este dispositivo · sin conexión');
  }
}
function setSaveState(t) { const el = $('saveState'); if (el) el.textContent = t; }
window.addEventListener('pagehide', () => { if (study) { saveLocal(study); } });

/* ════════════════════════════════════
   INICIO: MIS ESTUDIOS
════════════════════════════════════ */
async function showHome() {
  study = null;
  $('editorView').hidden = true;
  $('homeView').hidden = false;
  history.replaceState({}, '', 'estudio.html');
  renderHome();
  const session = await getSession();
  $('cloudNote').innerHTML = session ? 'Tus estudios se guardan en la nube y los ves en todos tus dispositivos.'
    : 'Tus estudios se guardan en este dispositivo. <a href="login.html">Inicia sesión</a> para tenerlos en la nube y usar el asistente.';
  if (await loadCloudIndex()) renderHome();
}
function renderHome() {
  const grid = $('studyGrid');
  const cards = studiesIndex.map(s => {
    const t = tplById(s.template);
    return `<button class="study-card" onclick="openStudy('${esc(s.id)}')">
      <span class="study-thumb">
        <span class="tpl-name label">${s.format === 'free' ? 'Lienzo libre' : esc(t.name)}</span>
        ${s.heb ? `<span class="heb" lang="he">${esc(s.heb)}</span>` : ''}
      </span>
      <span class="study-meta"><span class="study-title">${esc(s.title || 'Estudio')}</span><span class="study-date">${esc(fmtDate(s.updatedAt))}</span></span>
    </button>`;
  }).join('');
  grid.innerHTML = `<button class="study-card new" onclick="openTemplatePicker('new')">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      Nuevo estudio</button>` + cards;
}

/* ── Selector de plantilla ── */
let pickerMode = 'new', pickedFormat = 'notebook', pickedTpl = 'parasha';
function openTemplatePicker(mode) {
  hideMenu();
  pickerMode = mode;
  pickedFormat = mode === 'page' ? 'notebook' : 'notebook';
  pickedTpl = mode === 'page' ? 'lined' : 'parasha';
  $('tplTitle').textContent = mode === 'page' ? 'Nueva página' : 'Nuevo estudio';
  $('fmtGroup').hidden = mode === 'page';
  $('tplConfirm').textContent = mode === 'page' ? 'Agregar página' : 'Crear estudio';
  renderPicker();
  $('tplModal').hidden = false;
}
function closeTemplatePicker() { $('tplModal').hidden = true; }
function pickFormat(f) { pickedFormat = f; renderPicker(); }
function pickTemplate(id) { pickedTpl = id; renderPicker(); }
function renderPicker() {
  document.querySelectorAll('.fmt').forEach(b => { const on = b.dataset.fmt === pickedFormat; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const grid = $('tplGrid');
  if (pickedFormat === 'free') {
    grid.innerHTML = '<div class="hint" style="grid-column:1/-1">El lienzo libre es una hoja grande, sin plantilla, para mapas de ideas: inserta versículos y palabras, escribe, dibuja y conecta con flechas.</div>';
    $('tplChosen').textContent = 'Lienzo libre';
    return;
  }
  const fake = { format: 'notebook', title: '' };
  grid.innerHTML = TEMPLATES.map(t => {
    const page = { template: t.id, tpl: t.id === 'parasha' ? { nombre: 'Parashá', heb: 'פָּרָשָׁה' } : {} };
    return `<button class="tcard ${pickedTpl === t.id ? 'on' : ''}" onclick="pickTemplate('${t.id}')" aria-pressed="${pickedTpl === t.id}">
      <span class="tprev" style="position:relative;overflow:hidden;background:var(--bg-sunk)">
        <span class="page" style="width:816px;height:1056px;left:50%;top:6px;transform:scale(0.098) translateX(-50%);transform-origin:0 0;box-shadow:none;pointer-events:none">
          <span class="tpl">${renderTemplate(page, { ...fake, title: t.name })}</span>
        </span>
      </span>
      <span class="tn">${esc(t.name)}</span><span class="td">${esc(t.desc)}</span>
    </button>`;
  }).join('');
  $('tplChosen').textContent = tplById(pickedTpl).name + (pickedTpl === 'parasha' ? ' · se llena con la porción de esta semana' : '');
}
async function confirmTemplate() {
  closeTemplatePicker();
  if (pickerMode === 'page') { await addPage(pickedTpl); return; }
  await createStudy(pickedFormat, pickedFormat === 'free' ? 'blank' : pickedTpl);
}
async function makePage(template) {
  const page = { id: uid(), template, tpl: {}, els: [] };
  if (template === 'parasha') page.tpl = (await currentParasha()) || {};
  return page;
}
async function createStudy(format, template, opts = {}) {
  const page = await makePage(template);
  if (template === 'parasha' && opts.parasha) page.tpl = (await currentParasha(opts.parasha)) || page.tpl;
  const now = new Date().toISOString();
  const title = template === 'parasha' && page.tpl.nombre ? `${page.tpl.nombre} · ${page.tpl.sig || 'estudio'}`.slice(0, 120)
    : format === 'free' ? 'Mapa de estudio' : tplById(template).name;
  const s = { id: uid(), title, format, template, pages: [page], chat: [], ref: null, createdAt: now, updatedAt: now };
  if (template === 'parasha' && page.tpl.book) s.ref = { bookId: page.tpl.book, chapter: page.tpl.startChapter || 1 };
  saveLocal(s);
  await openStudy(s.id, s);
  markDirty();
}

/* ════════════════════════════════════
   EDITOR
════════════════════════════════════ */
let study = null;
let tool = 'pen', color = 'ink', sizeIdx = 1, zoom = 1, fitScale = 1;
let selectedId = null, editingId = null;
let undoStack = [], redoStack = [];
let penSeen = false;
let fingerPref = readLS('kodesh_finger_draw', null);   // null = automático

const COLORS = [
  { id: 'ink', label: 'Tinta', css: 'var(--ink)' }, { id: 'gold', label: 'Dorado', css: 'var(--gold)' },
  { id: 'blue', label: 'Azul', css: 'var(--blue)' }, { id: 'red', label: 'Rojo', css: 'var(--red)' },
  { id: 'green', label: 'Verde', css: 'var(--green)' }, { id: 'purple', label: 'Morado', css: 'var(--purple)' },
];
const colorCss = id => (COLORS.find(c => c.id === id) || COLORS[0]).css;
const SIZES = { pen: [2.5, 4.5, 8], hl: [16, 24, 34], eraser: [10, 20, 34] };
const TOOLS = [
  { id: 'select', label: 'Seleccionar y mover (V)', d: 'M5 3l14 8-6 2-2 6z' },
  { id: 'pen', label: 'Pluma (P)', d: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3' },
  { id: 'hl', label: 'Resaltador (H)', d: 'M9 15l-4 4h6l1-1M8 14l6-10 5 3-6 10z' },
  { id: 'eraser', label: 'Borrador (E)', d: 'M8 20h12M5 15l8-8 6 6-5 5H9z' },
  { id: 'text', label: 'Texto (T)', d: 'M5 6h14M12 6v13M9 19h6' },
];

async function openStudy(id, preloaded) {
  const s = preloaded || await loadStudy(id);
  if (!s) { toast('No se encontró ese estudio'); showHome(); return; }
  study = s;
  study.chat = study.chat || [];
  undoStack = []; redoStack = []; selectedId = null; editingId = null;
  $('homeView').hidden = true;
  $('editorView').hidden = false;
  $('titleInput').value = study.title;
  history.replaceState({}, '', 'estudio.html?id=' + encodeURIComponent(study.id));
  setSaveState('Guardado');
  buildToolbar();
  setHdr();
  window.scrollTo(0, 0);
  if (window.innerWidth > 1080) {
    if (readLS('kodesh_study_panel_left', true)) openPanel('left', true);
    if (readLS('kodesh_study_panel_right', false)) openPanel('right', true);
  }
  updateStagePad();
  computeFit();
  renderPages();
  renderChat();
  updateFmtBar();
  updateUndoButtons();
}
function closeEditor() {
  commitEditing();
  if (study) { saveLocal(study); syncNow(); }
  closePanels();
  showHome();
}
function renameStudy(v) {
  snapshot();
  study.title = (v || '').trim().slice(0, 120) || 'Estudio';
  $('titleInput').value = study.title;
  renderPages();
  markDirty();
}
async function deleteStudy() {
  hideMenu();
  if (!study || !window.confirm(`¿Borrar «${study.title}»? No se puede deshacer.`)) return;
  const id = study.id;
  try { localStorage.removeItem(studyKey(id)); } catch (e) {}
  studiesIndex = studiesIndex.filter(x => x.id !== id);
  writeLS(IDX_KEY, studiesIndex);
  if (await getSession()) { try { await sb.from('study_canvases').delete().eq('id', id); } catch (e) {} }
  study = null;
  toast('Estudio borrado');
  showHome();
}

/* ── Barra de herramientas ── */
function buildToolbar() {
  $('toolGroup').innerHTML = TOOLS.map(t => `<button class="ibtn ${tool === t.id ? 'on' : ''}" data-tool="${t.id}" onclick="setTool('${t.id}')" aria-label="${t.label}" aria-pressed="${tool === t.id}" title="${t.label}">${ICON(t.d)}</button>`).join('');
  $('colorGroup').innerHTML = COLORS.map(c => `<button class="swatch ${color === c.id ? 'on' : ''}" style="background:${c.css}" onclick="setColor('${c.id}')" aria-label="Color ${c.label}" aria-pressed="${color === c.id}"></button>`).join('');
  const sz = tool === 'hl' ? SIZES.hl : tool === 'eraser' ? SIZES.eraser : SIZES.pen;
  $('sizeGroup').innerHTML = [0, 1, 2].map(i => {
    const px = tool === 'eraser' ? [8, 12, 17][i] : tool === 'hl' ? [8, 12, 17][i] : [5, 8, 12][i];
    return `<button class="size-dot ${sizeIdx === i ? 'on' : ''}" onclick="setSize(${i})" aria-label="Grosor ${i + 1}" aria-pressed="${sizeIdx === i}"><span style="width:${px}px;height:${px}px"></span></button>`;
  }).join('');
  $('colorGroup').style.opacity = (tool === 'eraser' || tool === 'select') ? 0.4 : 1;
  const pages = $('pages');
  pages.classList.remove('mode-ink', 'mode-select', 'mode-text');
  pages.classList.add(tool === 'select' ? 'mode-select' : tool === 'text' ? 'mode-text' : 'mode-ink');
  applyFingerMode();
}
function setTool(t) { commitEditing(); tool = t; if (t !== 'select' && t !== 'text') deselect(); buildToolbar(); updateFmtBar(); }
function setColor(c) {
  color = c;
  if (selectedId) {   // cambiar el color de un texto seleccionado
    const el = findEl(selectedId);
    if (el && el.el.type === 'text') { snapshot(); el.el.color = c; renderPage(el.page); markDirty(); }
  }
  if (tool === 'select' || tool === 'eraser') tool = 'pen';
  buildToolbar();
}
function setSize(i) { sizeIdx = i; buildToolbar(); }
function fingerDraws() { return fingerPref === true || (fingerPref === null && !penSeen); }
function setFingerDraw(v) { fingerPref = v; writeLS('kodesh_finger_draw', v); applyFingerMode(); }
function applyFingerMode() {
  const on = fingerDraws() && ['pen', 'hl', 'eraser'].includes(tool);
  document.querySelectorAll('#pages .page').forEach(p => p.classList.toggle('finger-draw', on));
  const cb = $('fingerDraw'); if (cb) cb.checked = fingerDraws();
}

/* ── Zoom ── */
function setHdr() {
  const h = $('edHead') ? $('edHead').offsetHeight : 120;
  document.documentElement.style.setProperty('--hdr', h + 'px');
}
// En pantallas anchas los paneles fijos ocupan su lado: el lienzo se corre.
function updateStagePad() {
  const wide = window.innerWidth > 1080;
  const st = $('stage');
  st.style.setProperty('--pl', wide && !$('panelLeft').hidden ? '320px' : '0px');
  st.style.setProperty('--pr', wide && !$('panelRight').hidden ? '320px' : '0px');
}
const stagePads = () => { const cs = getComputedStyle($('stage')); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 }; };
function computeFit() {
  const stage = $('stage');
  const pg = PAGE[study.format];
  const pads = stagePads();
  const avail = Math.max(280, stage.clientWidth - pads.l - pads.r - 44);
  fitScale = study.format === 'free' ? Math.min(1, avail / 1200) : Math.min(1.25, avail / pg.w);
}
function setZoom(z) {
  const se = document.scrollingElement, st = $('stage');
  const oldScale = fitScale * zoom;
  const cx = st.scrollLeft + st.clientWidth / 2, cy = se.scrollTop + window.innerHeight / 2;
  zoom = clamp(z, 0.4, 4);
  renderPages();
  const k = (fitScale * zoom) / oldScale;
  st.scrollLeft = cx * k - st.clientWidth / 2;
  se.scrollTop = cy * k - window.innerHeight / 2;
}
const scale = () => fitScale * zoom;
window.addEventListener('resize', () => { if (!study) return; setHdr(); updateStagePad(); const s = scale(); computeFit(); if (Math.abs(scale() - s) > 0.01) renderPages(); });

/* ── Historial ── */
function snapshot() {
  undoStack.push(JSON.stringify({ pages: study.pages, title: study.title }));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}
function undo() {
  commitEditing();
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ pages: study.pages, title: study.title }));
  Object.assign(study, JSON.parse(undoStack.pop()));
  $('titleInput').value = study.title;
  deselect(); renderPages(); markDirty(); updateUndoButtons();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ pages: study.pages, title: study.title }));
  Object.assign(study, JSON.parse(redoStack.pop()));
  $('titleInput').value = study.title;
  deselect(); renderPages(); markDirty(); updateUndoButtons();
}
function updateUndoButtons() { $('undoBtn').disabled = !undoStack.length; $('redoBtn').disabled = !redoStack.length; }

/* ════════════════════════════════════
   PÁGINAS Y ELEMENTOS
════════════════════════════════════ */
function findEl(id) {
  for (const page of study.pages) { const el = page.els.find(e => e.id === id); if (el) return { page, el }; }
  return null;
}
function pageById(id) { return study.pages.find(p => p.id === id); }

function renderPages() {
  const s = scale();
  const pg = PAGE[study.format];
  $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  const free = study.format === 'free';
  $('pages').innerHTML = study.pages.map((p, i) => `
    <div class="page-wrap" style="width:${pg.w * s}px;height:${pg.h * s}px" data-wrap="${p.id}">
      <div class="page ${free ? 'free' : ''}" id="page-${p.id}" data-page="${p.id}" style="width:${pg.w}px;height:${pg.h}px;transform:scale(${s})"></div>
      ${free ? '' : `<span class="page-num">Página ${i + 1} de ${study.pages.length}</span>`}
    </div>`).join('') + (free ? '' : `
    <div class="add-page">
      <button class="pill" onclick="addPage('lined')">+ Página</button>
      <button class="pill" onclick="openTemplatePicker('page')">+ Página con plantilla</button>
    </div>`);
  study.pages.forEach(renderPage);
  bindPages();
  applyFingerMode();
}

function renderPage(page) {
  const node = $('page-' + page.id);
  if (!node) return;
  node.innerHTML = `<div class="tpl">${renderTemplate(page, study)}</div><div class="els">${page.els.filter(e => e.type !== 'stroke').map(elHtml).join('')}</div>${inkSvg(page)}${selBarHtml(page)}`;
  if (editingId) {
    const e = node.querySelector(`[data-el="${editingId}"]`);
    if (e) startEditingNode(e);
  }
}

function elHtml(e) {
  const sel = e.id === selectedId ? ' selected' : '';
  const sc = e.s && e.s !== 1 ? e.s : 1;
  const base = `class="el el-${e.type}${sel}" data-el="${e.id}" style="left:${e.x}px;top:${e.y}px;width:${e.w}px;${sc !== 1 ? `transform:scale(${sc});` : ''}--inv:${1 / sc}"`;
  const handle = e.id === selectedId ? '<span class="el-handle" data-handle="w" aria-hidden="true" title="Ancho"></span><span class="el-corner" data-handle="s" aria-hidden="true" title="Tamaño"></span>' : '';
  if (e.type === 'text') {
    const pg = study.pages.find(p => p.els.includes(e));
    const m = pg ? textMetrics(pg, e) : { fs: DEFAULT_FS(e.font), lh: 36 };
    const st = `font-size:${m.fs}px;line-height:${m.lh}px;${e.bold ? 'font-weight:600;' : ''}${e.italic ? 'font-style:italic;' : ''}${e.align ? `text-align:${e.align};` : ''}`;
    const textHandle = e.id === selectedId ? '<span class="el-handle" data-handle="w" aria-hidden="true" title="Ancho"></span>' : '';
    return `<div ${base.replace('class="el el-text', `class="el el-text${e.font === 'hand' ? ' hand' : ''}`).replace('style="', `style="${st}`)}><span class="txt" style="color:${e.color ? colorCss(e.color) : ''}">${esc(e.text)}</span>${textHandle}</div>`;
  }
  if (e.type === 'verse') {
    return `<div ${base.replace('el-verse', 'el-card el-verse')}><div class="el-kicker">${esc(e.ref)}${e.version ? ' · ' + esc(e.version) : ''}</div><div class="el-body">${e.parts ? e.parts.map(p => `<sup>${p.n}</sup>${esc(p.t)}`).join(' ') : esc(e.text)}</div>${handle}</div>`;
  }
  if (e.type === 'word') {
    return `<div ${base.replace('el-word', 'el-card el-word')}><div class="w-top"><span class="w-orig" lang="${e.lang === 'griego' ? 'grc' : 'he'}">${esc(e.lemma)}</span><span class="w-code">${esc(e.strongs || '')}</span></div><div class="w-translit">${esc(e.translit || '')}${e.word ? ' · «' + esc(e.word) + '»' : ''}</div><div class="el-body" style="font-size:17px">${esc(e.def || '')}</div>${handle}</div>`;
  }
  if (e.type === 'ai') {
    return `<div ${base.replace('el-ai', 'el-card el-ai')}><div class="el-kicker">Del asistente</div><div class="el-body">${esc(e.text)}</div>${handle}</div>`;
  }
  if (e.type === 'inter') {
    const verses = (e.verses || []).map(v => `<div class="il-v" dir="${e.rtl ? 'rtl' : 'ltr'}"><span class="il-n">${v.n}</span><div class="il-words" dir="${e.rtl ? 'rtl' : 'ltr'}">${(v.words || []).map(w =>
      `<span class="il-w"><span class="il-s">${esc(w.s || '')}</span><span class="il-o" lang="${e.rtl ? 'he' : 'grc'}">${esc(w.o)}</span><span class="il-t">${esc(w.t || '')}</span><span class="il-g">${esc(w.g || '')}</span></span>`).join('')}</div></div>`).join('');
    return `<div ${base.replace('el-inter', 'el-card el-inter')}><div class="el-kicker">${esc(e.ref)} · Interlineal</div>${verses}${handle}</div>`;
  }
  return '';
}
function selBarHtml(page) {
  const f = selectedId && page.els.find(e => e.id === selectedId);
  if (!f || editingId) return '';
  const inv = 1 / scale();
  const isText = f.type === 'text';
  return `<div class="sel-bar" style="left:${f.x}px;top:${Math.max(4, f.y - 54 * inv)}px;transform:scale(${inv})">
    ${isText ? `<button class="ibtn" onclick="editSelected()" aria-label="Editar texto">${ICON('M4 20l4-1 11-11-3-3L5 16z')}</button>
    <button class="ibtn" onclick="toggleHand()" aria-label="Cambiar letra" title="Letra manuscrita / de libro"><span style="font-family:var(--font-hand);font-size:20px">Aa</span></button>` : ''}
    <button class="ibtn" onclick="resizeSelected(1 / 1.15)" aria-label="Más pequeño" title="Más pequeño"><span style="font-size:13px">A−</span></button>
    <button class="ibtn" onclick="resizeSelected(1.15)" aria-label="Más grande" title="Más grande"><span style="font-size:17px">A+</span></button>
    <button class="ibtn" onclick="duplicateSelected()" aria-label="Duplicar">${ICON('M8 8h11v12H8zM5 16V4h11')}</button>
    <button class="ibtn" onclick="deleteSelected()" aria-label="Borrar" style="color:var(--red)">${ICON('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13')}</button>
  </div>`;
}

/* Tinta (SVG) */
function strokePath(e) {
  const pf = window.PerfectFreehand;
  if (!pf || !e.pts || !e.pts.length) return '';
  const hl = e.tool === 'hl';
  const outline = pf.getStroke(e.pts, {
    size: e.size, thinning: hl ? 0 : 0.55, smoothing: 0.5, streamline: hl ? 0.5 : 0.4,
    simulatePressure: !hl && !e.pressure, last: true,
    start: { cap: true, taper: 0 }, end: { cap: true, taper: 0 },
  });
  return outlineToPath(outline);
}
function outlineToPath(points) {
  const len = points.length;
  if (len < 4) return '';
  const avg = (a, b) => (a + b) / 2;
  let a = points[0], b = points[1];
  const c = points[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i]; b = points[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return d + 'Z';
}
function strokeEl(e) {
  const p = strokePath(e);
  if (!p) return '';
  const hl = e.tool === 'hl';
  return `<path data-stroke="${e.id}" d="${p}" style="fill:${colorCss(e.color)};${hl ? 'opacity:0.32;' : ''}"></path>`;
}
function inkSvg(page) {
  const pg = PAGE[study.format];
  const strokes = page.els.filter(e => e.type === 'stroke');
  // Resaltador debajo de la pluma
  const ordered = [...strokes.filter(s => s.tool === 'hl'), ...strokes.filter(s => s.tool !== 'hl')];
  return `<svg class="ink" viewBox="0 0 ${pg.w} ${pg.h}" width="${pg.w}" height="${pg.h}">${ordered.map(strokeEl).join('')}<path class="live" d=""></path></svg>`;
}

/* ════════════════════════════════════
   ENTRADA: lápiz, dedo y ratón
════════════════════════════════════ */
function pagePoint(pageNode, ev) {
  const r = pageNode.getBoundingClientRect();
  const s = scale();
  return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s };
}
let live = null;      // trazo en curso
let drag = null;      // mover / redimensionar
let erasing = null;

function bindPages() {
  document.querySelectorAll('.page').forEach(node => {
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('application/x-kodesh')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    node.addEventListener('drop', onDrop);
  });
}
// El Apple Pencil no debe desplazar la página: se bloquea el scroll solo para el lápiz.
document.addEventListener('touchstart', e => {
  if (!study || !e.target.closest || !e.target.closest('.page')) return;
  const stylus = [...e.touches].some(t => t.touchType === 'stylus');
  if (stylus) { penSeen = true; if (['pen', 'hl', 'eraser'].includes(tool)) e.preventDefault(); }
}, { passive: false });

function canDraw(ev) {
  if (ev.pointerType === 'pen') { if (!penSeen) { penSeen = true; applyFingerMode(); } return true; }
  if (ev.pointerType === 'touch') return fingerDraws();
  return ev.button === 0;
}

function onPointerDown(ev) {
  const node = ev.currentTarget;
  const page = pageById(node.dataset.page);
  if (!page) return;
  const pt = pagePoint(node, ev);

  if (['pen', 'hl', 'eraser'].includes(tool)) {
    if (!canDraw(ev)) return;
    ev.preventDefault();
    node.setPointerCapture(ev.pointerId);
    if (tool === 'eraser') { erasing = { page, node, removed: false, snap: JSON.stringify({ pages: study.pages, title: study.title }) }; eraseAt(page, pt); return; }
    const hasPressure = ev.pointerType === 'pen' && ev.pressure > 0;
    live = { page, node, pointerId: ev.pointerId, el: { id: uid(), type: 'stroke', tool: tool === 'hl' ? 'hl' : 'pen', color, size: (tool === 'hl' ? SIZES.hl : SIZES.pen)[sizeIdx], pressure: hasPressure, pts: [[r2(pt.x), r2(pt.y), hasPressure ? r2(ev.pressure) : 0.5]] } };
    drawLive();
    return;
  }

  const elNode = ev.target.closest('.el');
  const handle = ev.target.closest('[data-handle]');
  if (ev.target.closest('.sel-bar')) return;
  if (editingId && elNode && elNode.dataset.el === editingId) return;   // escribiendo dentro del texto
  commitEditing();

  if (elNode) {
    const f = findEl(elNode.dataset.el);
    if (!f) return;
    if (tool === 'text' && f.el.type === 'text') { select(f.el.id); editSelected(); return; }
    const wasSelected = selectedId === f.el.id;
    if (!wasSelected) select(f.el.id, false);
    ev.preventDefault();
    node.setPointerCapture(ev.pointerId);
    drag = { page: f.page, node, el: f.el, start: pt, orig: { x: f.el.x, y: f.el.y, w: f.el.w, s: f.el.s || 1 }, mode: handle ? (handle.dataset.handle === 's' ? 'scale' : 'resize') : 'move', moved: false, wasSelected,
      elNode: node.querySelector(`[data-el="${f.el.id}"]`) || elNode };
    return;
  }

  if (tool === 'text') {
    pendingText = { page, pt, cx: ev.clientX, cy: ev.clientY, pointerId: ev.pointerId };
    return;
  }
  if (selectedId) deselect();
}
let pendingText = null;

function onPointerMove(ev) {
  if (live && ev.pointerId === live.pointerId) {
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    for (const e2 of evs) {
      const pt = pagePoint(live.node, e2);
      live.el.pts.push([r2(pt.x), r2(pt.y), live.el.pressure ? r2(e2.pressure || 0.5) : 0.5]);
    }
    drawLive();
    return;
  }
  if (erasing) { eraseAt(erasing.page, pagePoint(erasing.node, ev)); return; }
  if (drag) {
    const pt = pagePoint(drag.node, ev);
    const dx = pt.x - drag.start.x, dy = pt.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { snapshot(); drag.moved = true; }
    const pg = PAGE[study.format];
    if (drag.mode === 'resize') {
      drag.el.w = clamp(Math.round(drag.orig.w + dx / drag.orig.s), 120, (pg.w - drag.el.x) / drag.orig.s);
      drag.elNode.style.width = drag.el.w + 'px';
    } else if (drag.mode === 'scale') {
      const visual = drag.orig.w * drag.orig.s + dx;
      drag.el.s = Math.round(clamp(visual / drag.orig.w, 0.35, 3) * 100) / 100;
      drag.elNode.style.transform = `scale(${drag.el.s})`;
      drag.elNode.style.setProperty('--inv', 1 / drag.el.s);
    } else {
      drag.el.x = Math.round(clamp(drag.orig.x + dx, -drag.el.w + 40, pg.w - 40));
      drag.el.y = Math.round(clamp(drag.orig.y + dy, 0, pg.h - 30));
      drag.elNode.style.left = drag.el.x + 'px';
      drag.elNode.style.top = drag.el.y + 'px';
      const bar = drag.node.querySelector('.sel-bar'); if (bar) bar.style.display = 'none';
    }
  }
}

function onPointerUp(ev) {
  if (pendingText && ev.pointerId === pendingText.pointerId) {
    const p = pendingText; pendingText = null;
    if (ev.type === 'pointerup' && Math.hypot(ev.clientX - p.cx, ev.clientY - p.cy) < 8) createTextAt(p.page, p.pt);
    return;
  }
  if (live && ev.pointerId === live.pointerId) {
    const { page, el } = live;
    live = null;
    if (el.pts.length === 1) el.pts.push([el.pts[0][0] + 0.5, el.pts[0][1] + 0.5, el.pts[0][2]]);   // un punto
    snapshot();
    page.els.push(el);
    renderPage(page);
    markDirty();
    return;
  }
  if (erasing) {
    if (erasing.removed) { undoStack.push(erasing.snap); redoStack = []; updateUndoButtons(); markDirty(); }
    erasing = null;
    return;
  }
  if (drag) {
    const d = drag; drag = null;
    if (d.moved && d.el.type === 'text') snapText(d.page, d.el);
    if (d.moved) { renderPage(d.page); markDirty(); }
    else if (d.wasSelected && d.el.type === 'text') { editSelected(); }
    else renderPage(d.page);
  }
}
const r2 = n => Math.round(n * 100) / 100;

function drawLive() {
  const path = live.node.querySelector('path.live');
  if (!path) return;
  path.setAttribute('d', strokePath(live.el));
  path.style.fill = colorCss(live.el.color);
  path.style.opacity = live.el.tool === 'hl' ? 0.32 : 1;
}

function eraseAt(page, pt) {
  const r = SIZES.eraser[sizeIdx];
  const before = page.els.length;
  page.els = page.els.filter(e => {
    if (e.type !== 'stroke') return true;
    const tol = r + e.size / 2;
    for (const p of e.pts) if (Math.abs(p[0] - pt.x) < tol && Math.abs(p[1] - pt.y) < tol && Math.hypot(p[0] - pt.x, p[1] - pt.y) < tol) return false;
    return true;
  });
  if (page.els.length !== before) { erasing.removed = true; renderPage(page); }
}

/* ── Selección y texto ── */
function select(id) {
  selectedId = id;
  const f = findEl(id);
  if (f) renderPage(f.page);
  updateFmtBar();
}
function deselect() {
  if (!selectedId) return;
  const f = findEl(selectedId);
  selectedId = null;
  if (f) renderPage(f.page);
  updateFmtBar();
}
function deleteSelected() {
  const f = selectedId && findEl(selectedId);
  if (!f) return;
  snapshot();
  f.page.els = f.page.els.filter(e => e.id !== f.el.id);
  selectedId = null; editingId = null;
  renderPage(f.page); markDirty();
}
function resizeSelected(k) {
  const f = selectedId && findEl(selectedId);
  if (!f) return;
  if (f.el.type === 'text') { stepFontSize(k > 1 ? 1 : -1); return; }
  snapshot();
  f.el.s = Math.round(clamp((f.el.s || 1) * k, 0.35, 3) * 100) / 100;
  renderPage(f.page); markDirty();
}
function duplicateSelected() {
  const f = selectedId && findEl(selectedId);
  if (!f) return;
  snapshot();
  const copy = { ...JSON.parse(JSON.stringify(f.el)), id: uid(), x: f.el.x + 24, y: f.el.y + 24 };
  f.page.els.push(copy);
  selectedId = copy.id;
  renderPage(f.page); markDirty();
}
function toggleHand() {
  const f = selectedId && findEl(selectedId);
  if (!f || f.el.type !== 'text') return;
  setFont(f.el.font === 'hand' ? 'book' : 'hand');
}

/* ── Formato de texto (barra superior, como en Word) ──
   Se aplica al texto que estás escribiendo o al seleccionado, y queda como
   formato para el próximo texto. */
function textFmt() { return { font: 'book', fs: 24, bold: false, italic: false, align: 'left', ...readLS('kodesh_study_textfmt', {}) }; }
function saveTextFmt(patch) { writeLS('kodesh_study_textfmt', { ...textFmt(), ...patch }); }
function fmtTarget() {
  const id = editingId || selectedId;
  const f = id && findEl(id);
  return f && f.el.type === 'text' ? f : null;
}
function applyTextFmt(patch) {
  saveTextFmt(patch);
  const f = fmtTarget();
  if (f) {
    if (!editingId) snapshot();
    Object.assign(f.el, patch);
    if (patch.font && !patch.fs) f.el.fs = f.el.fs || DEFAULT_FS(patch.font);
    snapText(f.page, f.el);
    if (editingId === f.el.id) {
      // Sin volver a dibujar la página: así no se pierde el cursor.
      const node = document.querySelector(`[data-el="${f.el.id}"]`);
      if (node) {
        const m = textMetrics(f.page, f.el);
        node.classList.toggle('hand', f.el.font === 'hand');
        Object.assign(node.style, { fontSize: m.fs + 'px', lineHeight: m.lh + 'px', fontWeight: f.el.bold ? '600' : '', fontStyle: f.el.italic ? 'italic' : '', textAlign: f.el.align || '', top: f.el.y + 'px', left: f.el.x + 'px' });
      }
    } else renderPage(f.page);
    markDirty();
  }
  updateFmtBar();
}
function setFont(font) { const f = fmtTarget(); applyTextFmt({ font, fs: (f && f.el.fs && f.el.font === font) ? f.el.fs : DEFAULT_FS(font) }); }
function stepFontSize(dir) {
  const f = fmtTarget();
  const cur = f ? (f.el.fs || DEFAULT_FS(f.el.font)) : textFmt().fs;
  let i = TEXT_SIZES.findIndex(x => x >= cur); if (i < 0) i = TEXT_SIZES.length - 1;
  if (TEXT_SIZES[i] !== cur && dir < 0) i++;
  applyTextFmt({ fs: TEXT_SIZES[clamp(i + dir, 0, TEXT_SIZES.length - 1)] });
}
function toggleFmt(key) { const f = fmtTarget(); applyTextFmt({ [key]: !(f ? f.el[key] : textFmt()[key]) }); }
function setAlign(a) { applyTextFmt({ align: a }); }
function updateFmtBar() {
  const g = $('textFmtGroup'); if (!g || !study) return;
  const f = fmtTarget();
  const cur = f ? { font: f.el.font || 'book', fs: f.el.fs || DEFAULT_FS(f.el.font), bold: !!f.el.bold, italic: !!f.el.italic, align: f.el.align || 'left' } : textFmt();
  g.classList.toggle('active', !!f || tool === 'text');
  g.querySelectorAll('[data-font]').forEach(b => { const on = b.dataset.font === cur.font; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('fsLabel').textContent = Math.round(cur.fs * 0.75) + ' pt';
  $('boldBtn').classList.toggle('on', cur.bold); $('boldBtn').setAttribute('aria-pressed', cur.bold);
  $('italicBtn').classList.toggle('on', cur.italic); $('italicBtn').setAttribute('aria-pressed', cur.italic);
  g.querySelectorAll('[data-align]').forEach(b => { const on = b.dataset.align === cur.align; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
function createTextAt(page, pt) {
  const box = boxAt(page, pt.x, pt.y);
  const pg = PAGE[study.format];
  let x = pt.x - 8, y = pt.y - 22, w = Math.min(420, pg.w - x - 20);
  if (box) {
    x = box.x + 12; w = box.w - 24; y = Math.max(box.y + 34, pt.y - 22);
  }
  snapshot();
  const f = textFmt();
  const el = { id: uid(), type: 'text', x: Math.round(clamp(x, 8, pg.w - 140)), y: Math.round(clamp(y, 8, pg.h - 40)), w: Math.round(Math.max(140, w)), text: '',
    font: f.font, fs: f.fs, bold: f.bold || undefined, italic: f.italic || undefined, align: f.align && f.align !== 'left' ? f.align : undefined, color: color !== 'ink' ? color : undefined };
  page.els.push(el);
  snapText(page, el);
  selectedId = el.id; editingId = el.id;
  renderPage(page);
  // Si cae sobre otro texto o tarjeta, baja al siguiente renglón libre.
  let moved = false;
  for (let i = 0; i < 12; i++) {
    const h = elHeight(el.id);
    const hit = page.els.find(o => o !== el && o.type !== 'stroke' &&
      el.x < o.x + o.w * (o.s || 1) && el.x + el.w > o.x && el.y < o.y + elHeight(o.id) - 2 && el.y + h > o.y + 2);
    if (!hit) break;
    el.y = Math.round(hit.y + elHeight(hit.id));
    snapText(page, el, true);
    moved = true;
  }
  if (moved) renderPage(page);
  updateFmtBar();
}
function editSelected() {
  const f = selectedId && findEl(selectedId);
  if (!f || f.el.type !== 'text') return;
  editingId = f.el.id;
  renderPage(f.page);
  updateFmtBar();
}
function startEditingNode(node) {
  node.classList.add('editing');
  const span = node.querySelector('.txt');
  try { span.contentEditable = 'plaintext-only'; } catch (e) { span.contentEditable = 'true'; }
  if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
  span.style.outline = 'none';
  span.style.display = 'block';
  span.style.minHeight = '1.4em';
  setTimeout(() => {
    span.focus();
    const r = document.createRange(); r.selectNodeContents(span); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, 0);
  span.addEventListener('blur', () => setTimeout(commitEditing, 0), { once: true });
  span.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); span.blur(); } });
}
function commitEditing() {
  if (!editingId) return;
  const id = editingId; editingId = null;
  const f = findEl(id);
  if (!f) return;
  const node = document.querySelector(`[data-el="${id}"] .txt`);
  const text = node ? node.innerText.replace(/ /g, ' ').replace(/\n$/, '') : f.el.text;
  if (!text.trim()) {
    f.page.els = f.page.els.filter(e => e.id !== id);
    if (selectedId === id) selectedId = null;
  } else if (text !== f.el.text) {
    if (f.el.text) snapshot();
    f.el.text = text.slice(0, 5000);
  }
  renderPage(f.page);
  markDirty();
  updateFmtBar();
}

/* ── Insertar elementos (Biblia, palabras, asistente) ── */
function visiblePageAndPoint() {
  const sr = $('stage').getBoundingClientRect();
  const pads = stagePads();
  const top = Math.max(sr.top, $('edHead').getBoundingClientRect().bottom);
  const cy = top + Math.min((window.innerHeight - top) * 0.4, 320);
  const cx = sr.left + pads.l + (sr.width - pads.l - pads.r) / 2;
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.page').forEach(n => {
    const r = n.getBoundingClientRect();
    const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
    if (d < bestDist) { bestDist = d; best = n; }
  });
  if (!best) return null;
  const page = pageById(best.dataset.page);
  const r = best.getBoundingClientRect();
  const s = scale();
  return { page, x: clamp((cx - r.left) / s, 0, PAGE[study.format].w), y: clamp((cy - r.top) / s, 20, PAGE[study.format].h - 80) };
}
function insertElement(el, at) {
  if (!study) return;
  const target = at || visiblePageAndPoint();
  if (!target) return;
  const pg = PAGE[study.format];
  el.id = uid();
  el.w = Math.min(el.w, pg.w - 40);
  el.x = Math.round(clamp(target.x - el.w / 2, 16, pg.w - el.w - 16));
  el.y = Math.round(clamp(target.y - 30, 16, pg.h - 120));
  // Sin posición exacta (no se arrastró): un versículo va a «Versículo clave»
  // (o Pasaje / Escritura / Texto base) y una palabra a «Palabra clave» si
  // están vacías. Si cae sobre otra caja ancha, se acomoda dentro de ella.
  if (study.format !== 'free') {
    const pref = !at && preferredBox(target.page, el._kind || el.type);
    const under = boxAt(target.page, target.x, target.y);
    const box = pref || (under && !under.plain && under.w >= 300 ? under : null);
    if (box) {
      el.x = box.x + 12; el.w = Math.max(160, box.w - 24);
      el.y = pref ? box.y + 34 : Math.max(box.y + 34, el.y);
    }
  }
  delete el._kind;
  if (el.type === 'text') snapText(target.page, el);
  snapshot();
  target.page.els.push(el);
  if (tool !== 'select') { tool = 'select'; buildToolbar(); }
  selectedId = el.id;
  renderPage(target.page);
  avoidOverlap(target.page, el);
  if (el.type === 'text') { snapText(target.page, el, true); renderPage(target.page); }
  markDirty();
  if (window.innerWidth <= 1080) closePanels();
  toast('Insertado en la página');
}
// Empuja hacia abajo el elemento recién insertado mientras se encime con otro.
function elHeight(id) { const n = document.querySelector(`[data-el="${id}"]`); const f = findEl(id); return n ? n.offsetHeight * ((f && f.el.s) || 1) : 80; }
function avoidOverlap(page, el) {
  const pg = PAGE[study.format];
  const h = elHeight(el.id);
  let moved = false;
  for (let i = 0; i < 20; i++) {
    const hit = page.els.find(o => o !== el && o.type !== 'stroke' &&
      el.x < o.x + o.w * (o.s || 1) && el.x + el.w * (el.s || 1) > o.x && el.y < o.y + elHeight(o.id) && el.y + h > o.y);
    if (!hit) break;
    el.y = Math.round(hit.y + elHeight(hit.id) + 12);
    moved = true;
  }
  if (moved) { el.y = Math.min(el.y, pg.h - Math.min(h, pg.h - 20) - 10); renderPage(page); }
}
function onDrop(ev) {
  const raw = ev.dataTransfer && ev.dataTransfer.getData('application/x-kodesh');
  if (!raw) return;
  ev.preventDefault();
  const node = ev.currentTarget;
  const pt = pagePoint(node, ev);
  try { insertElement(JSON.parse(raw), { page: pageById(node.dataset.page), x: pt.x, y: pt.y }); } catch (e) {}
}

async function addPage(template) {
  snapshot();
  const p = await makePage(template);
  study.pages.push(p);
  renderPages();
  markDirty();
  const wrap = document.querySelector(`[data-wrap="${p.id}"]`);
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ════════════════════════════════════
   PANELES
════════════════════════════════════ */
function openPanel(side, initial) {
  const panel = side === 'left' ? $('panelLeft') : $('panelRight');
  if (window.innerWidth <= 1080) closePanels(side === 'left' ? 'right' : 'left');
  panel.hidden = false;
  const btn = side === 'left' ? $('bibleToggle') : $('aiToggle');
  btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
  if (window.innerWidth > 1080) writeLS('kodesh_study_panel_' + side, true);
  if (side === 'left') initBible();
  if (side === 'right') renderChips();
  if (!initial) { updateStagePad(); setTimeout(() => { const s = scale(); computeFit(); if (Math.abs(scale() - s) > 0.01) renderPages(); }, 0); }
}
function closePanels(only) {
  for (const side of ['left', 'right']) {
    if (only && only !== side) continue;
    const panel = side === 'left' ? $('panelLeft') : $('panelRight');
    if (panel.hidden) continue;
    panel.hidden = true;
    const btn = side === 'left' ? $('bibleToggle') : $('aiToggle');
    btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false');
  }
}
function togglePanel(side) {
  const panel = side === 'left' ? $('panelLeft') : $('panelRight');
  if (panel.hidden) openPanel(side);
  else {
    closePanels(side);
    if (window.innerWidth > 1080) writeLS('kodesh_study_panel_' + side, false);
    updateStagePad();
    setTimeout(() => { const s = scale(); computeFit(); if (Math.abs(scale() - s) > 0.01) renderPages(); }, 0);
  }
}

/* ── Biblia ── */
let BIBLE = null, bibleBook = 'GEN', bibleChapter = 1, verseSel = new Set();
async function initBible() {
  const bookSel = $('bookSel');
  if (!bookSel.options.length && window.KodeshRef) {
    bookSel.innerHTML = KodeshRef.BOOKS.map(b => `<option value="${b[0]}">${esc(b[1])}</option>`).join('');
  }
  if (study && study.ref && study.ref.bookId) { bibleBook = study.ref.bookId; bibleChapter = study.ref.chapter || 1; }
  bookSel.value = bibleBook;
  fillChapters();
  initVerseTouchDrag();
  setVerseStyle(verseStyle());
  if (!BIBLE) {
    try { BIBLE = await (await fetch('./biblia-rvr.json')).json(); }
    catch (e) { $('bibleList').innerHTML = '<div class="hint">No se pudo cargar la Biblia.</div>'; return; }
  }
  loadBibleChapter();
}
function fillChapters() {
  const n = bookChapters(bibleBook);
  $('chapSel').innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  $('chapSel').value = String(bibleChapter);
}
function onBookChange() { bibleBook = $('bookSel').value; bibleChapter = 1; fillChapters(); loadBibleChapter(); }
function loadBibleChapter() {
  bibleChapter = parseInt($('chapSel').value) || 1;
  verseSel.clear(); updateInsertBar();
  if (study) { study.ref = { bookId: bibleBook, chapter: bibleChapter }; }
  const ch = BIBLE && BIBLE[bibleBook] && BIBLE[bibleBook][String(bibleChapter)];
  if (!ch) { $('bibleList').innerHTML = '<div class="hint">Capítulo no disponible.</div>'; return; }
  const nums = Object.keys(ch).map(Number).sort((a, b) => a - b);
  const words = t => esc(t).replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g, '<span class="w">$1</span>');
  $('bibleList').innerHTML = `<div class="bheading">${esc(bookName(bibleBook))} ${bibleChapter}</div>` + nums.map(n =>
    `<div class="bverse" data-v="${n}" ${FINE_POINTER ? 'draggable="true"' : ''} onclick="onVerseTap(event, ${n})" ondragstart="dragVerse(event, ${n})"><span class="n">${n}</span><span>${words(ch[String(n)])}</span></div>`).join('');
  closeWordPop();
  $('bibleList').scrollTop = 0;
}
function goToRefInput() {
  const r = window.KodeshRef && KodeshRef.parseRef($('refInput').value);
  if (!r || r.error || !r.bookId) { toast('No encontré esa cita'); return; }
  bibleBook = r.bookId; bibleChapter = r.chapter || 1;
  $('bookSel').value = bibleBook; fillChapters(); loadBibleChapter();
  if (r.verse) {
    const to = r.verseEnd || r.verse;
    for (let v = r.verse; v <= to; v++) verseSel.add(v);
    paintVerseSel();
    document.querySelector(`.bverse[data-v="${r.verse}"]`)?.scrollIntoView({ block: 'center' });
  }
}
// Tocar una palabra la busca en el original (hebreo/griego). Tocar el número
// del versículo —o cualquier parte si ya hay versículos seleccionados— lo
// selecciona para insertarlo o verlo en interlineal.
function onVerseTap(ev, n) {
  const w = ev.target.closest('.w');
  if (w && !verseSel.size) { lookupBibleWord(n, w); return; }
  closeWordPop();
  toggleVerse(n);
}
let wordPopReq = 0, wordPopData = null;
function closeWordPop() {
  $('wordPop').hidden = true;
  document.querySelectorAll('.bverse .w.on').forEach(x => x.classList.remove('on'));
  wordPopData = null;
}
async function lookupBibleWord(n, span) {
  document.querySelectorAll('.bverse .w.on').forEach(x => x.classList.remove('on'));
  span.classList.add('on');
  const word = span.textContent;
  const pop = $('wordPop');
  pop.hidden = false;
  pop.innerHTML = `<div class="wp-head"><span>«${esc(word)}» · ${esc(bookName(bibleBook))} ${bibleChapter}:${n}</span><button class="ibtn" onclick="closeWordPop()" aria-label="Cerrar">✕</button></div><div class="hint" style="padding:8px">Buscando en el original…</div>`;
  const req = ++wordPopReq;
  const session = await getSession();
  if (!session) { pop.querySelector('.hint').textContent = 'Inicia sesión para buscar palabras en el original.'; return; }
  try {
    const verseText = BIBLE[bibleBook][String(bibleChapter)][String(n)];
    const res = await kapiFetch('/api/lexicon', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ word: word.toLowerCase(), bookId: bibleBook, chapter: bibleChapter, verse: n, verseContext: verseText }),
    });
    const d = await res.json();
    if (req !== wordPopReq) return;
    if (res.status === 429) throw new Error(d.message || 'Alcanzaste tu límite de consultas al lexicón este mes.');
    if (!res.ok || !d || d.found === false || !d.lemma) throw new Error(`«${word}» no tiene una palabra propia en el original (suele pasar con artículos y conectores).`);
    const nt = window.KodeshRef && ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'].includes(bibleBook);
    wordPopData = { type: 'word', w: 360, lemma: d.lemma, translit: d.transliteration || '', strongs: d.strongs || '', def: String(d.definition || '').slice(0, 400), lang: d.language || (nt ? 'griego' : 'hebreo'), word: word.toLowerCase() };
    pop.innerHTML = `<div class="wp-head"><span>«${esc(word)}» · ${esc(bookName(bibleBook))} ${bibleChapter}:${n}</span><button class="ibtn" onclick="closeWordPop()" aria-label="Cerrar">✕</button></div>
      <div class="w-top"><span class="w-orig" lang="${wordPopData.lang === 'griego' ? 'grc' : 'he'}">${esc(d.lemma)}</span><span class="w-code">${esc(d.strongs || '')} · ${esc(wordPopData.lang)}</span></div>
      <div class="w-tr">${esc(d.transliteration || '')}</div>
      <p>${esc(String(d.definition || '').slice(0, 200))}${String(d.definition || '').length > 200 ? '…' : ''}</p>
      <div style="display:flex;gap:6px"><button class="btn-gold" style="height:38px;flex:1;padding:0 12px" onclick="insertPopWord()">+ Insertar</button><button class="btn-line" style="height:38px;flex:1;padding:0 12px;white-space:nowrap" onclick="closeWordPop(); toggleVerse(${n})">Elegir versículo</button></div>`;
  } catch (e) {
    if (req !== wordPopReq) return;
    pop.innerHTML = `<div class="wp-head"><span>«${esc(word)}»</span><button class="ibtn" onclick="closeWordPop()" aria-label="Cerrar">✕</button></div><div class="hint" style="padding:6px 4px">${esc(e.message || 'No se pudo buscar.')}</div>
      <button class="btn-line" style="height:38px;width:100%" onclick="closeWordPop(); toggleVerse(${n})">Seleccionar el versículo ${n}</button>`;
  }
}
function insertPopWord() { if (wordPopData) { insertElement({ ...wordPopData }); closeWordPop(); } }

/* Interlineal de los versículos seleccionados */
const interCache = new Map();
async function insertInterlinear() {
  if (!verseSel.size) return;
  const session = await getSession();
  if (!session) { toast('Inicia sesión para usar el interlineal'); return; }
  const key = bibleBook + ':' + bibleChapter;
  const btn = $('interBtn'); btn.disabled = true; btn.textContent = 'Cargando…';
  try {
    let data = interCache.get(key);
    if (!data) {
      const res = await kapiFetch('/api/interlinear', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ book: bibleBook, chapter: bibleChapter }) });
      const d = await res.json();
      if (res.status === 403) throw new Error(d.message || 'El interlineal es una función Premium.');
      if (!res.ok) throw new Error(d.message || 'El interlineal no está disponible para este capítulo.');
      data = d; interCache.set(key, d);
    }
    const nums = [...verseSel].sort((a, b) => a - b);
    const verses = nums.map(n => ({ n, words: (data.verses[n] || data.verses[String(n)] || []).map(w => ({ o: String(w.text || '').replace(/\//g, ''), t: w.translit || '', g: w.gloss || '', s: w.strongs || '' })) })).filter(v => v.words.length);
    if (!verses.length) throw new Error('No hay interlineal para esos versículos.');
    const nt = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'].includes(bibleBook);
    insertElement({ type: 'inter', w: 700, ref: refLabel(nums), rtl: !nt, verses });
    clearVerseSel();
  } catch (e) {
    toast(e.message || 'No se pudo cargar el interlineal');
  } finally {
    btn.disabled = false; btn.textContent = 'Interlineal';
  }
}

function toggleVerse(n) { verseSel.has(n) ? verseSel.delete(n) : verseSel.add(n); paintVerseSel(); }
function paintVerseSel() {
  document.querySelectorAll('.bverse').forEach(el => el.classList.toggle('sel', verseSel.has(Number(el.dataset.v))));
  updateInsertBar();
}
function clearVerseSel() { verseSel.clear(); paintVerseSel(); }
function updateInsertBar() {
  $('insertBar').hidden = !verseSel.size;
  $('insertBtn').textContent = verseSel.size > 1 ? `Insertar ${verseSel.size}` : 'Insertar';
}
function refLabel(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const parts = []; let start = sorted[0], prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  return `${bookName(bibleBook)} ${bibleChapter}:${parts.join(', ')}`;
}
// «Insertar como»: tarjeta (recuadro) o solo el texto con la cita al final.
function verseStyle() { return readLS('kodesh_verse_style', 'card'); }
function setVerseStyle(v) {
  writeLS('kodesh_verse_style', v);
  document.querySelectorAll('[data-vstyle]').forEach(b => { const on = b.dataset.vstyle === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
function verseElement(nums) {
  const ch = BIBLE[bibleBook][String(bibleChapter)];
  const sorted = [...nums].sort((a, b) => a - b);
  if (verseStyle() === 'text') {
    const body = sorted.length > 1 ? sorted.map(n => `${n} ${ch[String(n)]}`).join(' ') : ch[String(sorted[0])];
    const f = textFmt();
    return { type: 'text', _kind: 'verse', w: study && study.format === 'free' ? 520 : 460, text: `«${body}» — ${refLabel(sorted)}`,
      font: f.font, fs: f.fs, bold: f.bold || undefined, italic: f.italic || undefined, align: f.align && f.align !== 'left' ? f.align : undefined };
  }
  return { type: 'verse', w: study && study.format === 'free' ? 520 : 460, ref: refLabel(sorted), version: 'RVR60', book: bibleBook, chapter: bibleChapter, verses: sorted,
    parts: sorted.length > 1 ? sorted.map(n => ({ n, t: ch[String(n)] })) : null, text: sorted.length === 1 ? ch[String(sorted[0])] : '' };
}
function insertSelectedVerses() {
  if (!verseSel.size) return;
  insertElement(verseElement(verseSel));
  clearVerseSel();
}
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Arrastrar con el dedo o el lápiz (iPad, celular): mantener presionado un
   versículo ~0,35 s y arrastrarlo a la página. Si el dedo se mueve antes, es
   un desplazamiento normal de la lista. */
let vdrag = null;
function initVerseTouchDrag() {
  const list = $('bibleList');
  if (!list || list.dataset.touchDrag) return;
  list.dataset.touchDrag = '1';
  list.addEventListener('touchstart', e => {
    const row = e.target.closest('.bverse');
    if (!row || e.touches.length !== 1) return;
    const t = e.touches[0];
    const n = Number(row.dataset.v);
    vdrag = { n, x0: t.clientX, y0: t.clientY, active: false, timer: setTimeout(() => startVerseDrag(n, t.clientX, t.clientY), 350) };
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!vdrag) return;
    const t = e.touches[0];
    if (!vdrag.active) {
      if (Math.hypot(t.clientX - vdrag.x0, t.clientY - vdrag.y0) > 8) { clearTimeout(vdrag.timer); vdrag = null; }
      return;
    }
    e.preventDefault();
    moveVerseDrag(t.clientX, t.clientY);
  }, { passive: false });
  const end = e => {
    if (!vdrag) return;
    clearTimeout(vdrag.timer);
    if (vdrag.active) {
      e.preventDefault();
      const t = e.changedTouches[0];
      dropVerseDrag(t.clientX, t.clientY);
    }
    vdrag = null;
  };
  list.addEventListener('touchend', end, { passive: false });
  list.addEventListener('touchcancel', () => { if (vdrag) { clearTimeout(vdrag.timer); cleanupVerseDrag(); vdrag = null; } });
}
function startVerseDrag(n, x, y) {
  if (!vdrag) return;
  vdrag.active = true;
  vdrag.nums = verseSel.has(n) ? new Set(verseSel) : new Set([n]);
  closeWordPop();
  const g = document.createElement('div');
  g.className = 'drag-ghost'; g.id = 'dragGhost';
  g.innerHTML = `<span class="label">${verseStyle() === 'text' ? 'Texto' : 'Tarjeta'}</span><b>${esc(refLabel(vdrag.nums))}</b>`;
  document.body.appendChild(g);
  document.body.classList.add('verse-dragging');
  if (navigator.vibrate) navigator.vibrate(10);
  moveVerseDrag(x, y);
}
function moveVerseDrag(x, y) {
  const g = $('dragGhost'); if (!g) return;
  g.style.transform = `translate(${x - 20}px, ${y - 56}px)`;
  document.querySelectorAll('.page.drop-target').forEach(p => p.classList.remove('drop-target'));
  const under = document.elementFromPoint(x, y);
  const pg = under && under.closest && under.closest('#pages .page');
  if (pg) pg.classList.add('drop-target');
  // Desplazar el documento al acercarse a los bordes
  const edge = 70;
  if (y > window.innerHeight - edge) window.scrollBy(0, 14);
  else if (y < $('edHead').getBoundingClientRect().bottom + edge) window.scrollBy(0, -14);
}
function cleanupVerseDrag() {
  $('dragGhost')?.remove();
  document.body.classList.remove('verse-dragging');
  document.querySelectorAll('.page.drop-target').forEach(p => p.classList.remove('drop-target'));
}
function dropVerseDrag(x, y) {
  const nums = vdrag.nums;
  // Buscar la página ANTES de limpiar: al quitar .verse-dragging el panel
  // vuelve a recibir toques y taparía la página en pantallas angostas.
  const under = document.elementFromPoint(x, y);
  const node = under && under.closest && under.closest('#pages .page');
  cleanupVerseDrag();
  if (!node) { toast('Suelta el versículo sobre la página'); return; }
  const pt = pagePoint(node, { clientX: x, clientY: y });
  insertElement(verseElement(nums), { page: pageById(node.dataset.page), x: pt.x, y: pt.y });
  clearVerseSel();
}

function dragVerse(ev, n) {
  const nums = verseSel.has(n) ? verseSel : new Set([n]);
  ev.dataTransfer.setData('application/x-kodesh', JSON.stringify(verseElement(nums)));
  ev.dataTransfer.setData('text/plain', refLabel(nums));
  ev.dataTransfer.effectAllowed = 'copy';
}

/* ── Palabras (lexicón) ── */
function setLeftTab(t) {
  $('tabBible').classList.toggle('on', t === 'bible'); $('tabBible').setAttribute('aria-selected', t === 'bible');
  $('tabWords').classList.toggle('on', t === 'words'); $('tabWords').setAttribute('aria-selected', t === 'words');
  $('bibleTab').style.display = t === 'bible' ? 'flex' : 'none';
  $('wordsTab').style.display = t === 'words' ? 'flex' : 'none';
  if (t === 'words') setTimeout(() => $('wordInput').focus(), 50);
}
let wordTimer = null, wordReq = 0, wordRows = [];
function searchWordsSoon() { clearTimeout(wordTimer); wordTimer = setTimeout(searchWords, 300); }
// Orden de resultados: 1) la palabra en español exacta, 2) palabras que empiezan
// igual, 3) lema o transliteración (hebreo/griego), 4) definiciones que la
// mencionan. Antes se mezclaban y salían primero coincidencias de la definición.
const cleanWordKey = w => String(w || '').startsWith('strongs_') ? '' : String(w || '').replace(/_[0-9A-Z]{3}_\d+_\d+$/, '').replace(/_/g, ' ');
const LEX_SEL = 'word, testament, strongs, lemma, transliteration, definition, language';
async function searchWords() {
  const raw = $('wordInput').value.trim();
  const list = $('wordList');
  if (raw.length < 2) { list.innerHTML = '<div class="hint">Busca una palabra en español, hebreo o griego, o un número Strong (H1285, G26).</div>'; return; }
  if (!sb) { list.innerHTML = '<div class="hint">Sin conexión con el lexicón.</div>'; return; }
  const req = ++wordReq;
  list.innerHTML = '<div class="hint">Buscando…</div>';
  const code = raw.match(/^([hg])0*(\d+)$/i);
  const term = raw.replace(/[%,()*\\.:_]/g, ' ').trim().toLowerCase();
  const strip = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  try {
    let groups;
    if (code) {
      const { data } = await sb.from('lexicon_cache').select(LEX_SEL).eq('strongs', code[1].toUpperCase() + code[2]).limit(5);
      groups = [data || []];
    } else {
      const base = () => sb.from('lexicon_cache').select(LEX_SEL).not('lemma', 'is', null);
      const [w, l, d] = await Promise.all([
        base().ilike('word', term + '%').limit(40),
        base().like('word', 'strongs\\_%').or(`lemma.ilike.*${term}*,transliteration.ilike.*${strip(term)}*`).limit(12),
        base().like('word', 'strongs\\_%').filter('definition', 'imatch', `\\m${term.replace(/[^a-záéíóúüñ ]/gi, '') || 'zzzz'}\\M`).limit(8),
      ]);
      const words = (w.data || []).map(r => ({ r, k: cleanWordKey(r.word).toLowerCase() }));
      const exact = words.filter(x => x.k === term).map(x => x.r);
      const prefix = words.filter(x => x.k !== term && x.k.startsWith(term)).sort((a, b) => a.k.length - b.k.length).map(x => x.r);
      groups = [exact, prefix, l.data || [], (d.data || []).map(r => ({ ...r, _def: true }))];
    }
    if (req !== wordReq) return;
    const seen = new Set();
    wordRows = groups.flat().filter(r => { const k = r.strongs || r.lemma; if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
    let shownDefLabel = false;
    list.innerHTML = wordRows.length ? wordRows.map((r, i) => {
      const es = cleanWordKey(r.word);
      const label = r._def && !shownDefLabel && i > 0 ? (shownDefLabel = true, `<div class="label" style="padding:8px 2px 0">También aparece en estas definiciones</div>`) : '';
      if (r._def) shownDefLabel = true;
      return `${label}<div class="wcard">
        <div class="w-top"><span class="w-orig" lang="${r.testament === 'NT' ? 'grc' : 'he'}">${esc(r.lemma)}</span><span class="w-code">${esc(r.strongs || '')} · ${r.testament === 'NT' ? 'griego' : 'hebreo'}</span></div>
        <div class="w-tr">${esc(r.transliteration || '')}${es ? ' · «' + esc(es) + '»' : ''}</div>
        <p>${esc(String(r.definition || '').slice(0, 220))}${String(r.definition || '').length > 220 ? '…' : ''}</p>
        <button class="small-btn" onclick="insertWord(${i})">+ Insertar en la página</button>
      </div>`;
    }).join('') : '<div class="hint">Sin resultados. Prueba con otra forma de la palabra (singular, sin conjugar) o con un número Strong.</div>';
  } catch (e) {
    if (req === wordReq) list.innerHTML = '<div class="hint">No se pudo buscar. Intenta de nuevo.</div>';
  }
}
function insertWord(i) {
  const r = wordRows[i]; if (!r) return;
  insertElement({ type: 'word', w: 360, lemma: r.lemma, translit: r.transliteration || '', strongs: r.strongs || '', def: String(r.definition || '').slice(0, 400),
    lang: r.testament === 'NT' ? 'griego' : 'hebreo', word: cleanWordKey(r.word) });
}

/* ── Asistente ── */
const CHIPS = ['Resume mi página', 'Hazme 5 preguntas para mi grupo', 'Conecta esto con el Nuevo Pacto', 'Sugiere un bosquejo para enseñarlo'];
function renderChips() { $('chips').innerHTML = CHIPS.map(c => `<button class="chip" onclick="askAI(${esc(JSON.stringify(c))})">${esc(c)}</button>`).join(''); }
function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; }
function fmtMsg(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function renderChat() {
  const chat = $('chat');
  if (!study.chat.length) {
    chat.innerHTML = '<div class="hint">Pregúntale sobre tu página: resumir, hacer preguntas para tu grupo, explicar una palabra o conectar con el Nuevo Pacto. Lo que te responda lo puedes insertar en el estudio.</div>';
    return;
  }
  chat.innerHTML = study.chat.map((m, i) => m.role === 'user'
    ? `<div class="msg-u">${esc(m.content)}</div>`
    : `<div class="msg-a">${fmtMsg(m.content)}<div class="acts"><button class="small-btn" onclick="insertAI(${i})">+ Insertar en la página</button></div></div>`).join('');
  chat.scrollTop = chat.scrollHeight;
}
function pageText(page) {
  const lines = [];
  const t = tplById(page.template);
  if (study.format !== 'free') {
    lines.push(`Plantilla: ${t.name}`);
    if (page.template === 'parasha' && page.tpl && page.tpl.nombre) lines.push(`Parashá ${page.tpl.nombre} (${page.tpl.sig}). Torah: ${page.tpl.torah}. Haftarah: ${page.tpl.haftarah}. Nuevo Pacto: ${page.tpl.mesianica}.`);
  }
  const els = page.els.filter(e => e.type !== 'stroke').sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const e of els) {
    const box = study.format !== 'free' ? boxAt(page, e.x + 10, e.y + 10) : null;
    const where = box && box.label ? `[${box.label}] ` : '';
    if (e.type === 'text') lines.push(`${where}Nota: ${e.text}`);
    if (e.type === 'verse') lines.push(`${where}Versículo ${e.ref}: ${e.parts ? e.parts.map(p => p.t).join(' ') : e.text}`);
    if (e.type === 'word') lines.push(`${where}Palabra ${e.lemma} (${e.translit}, ${e.strongs}): ${e.def}`);
    if (e.type === 'ai') lines.push(`${where}Del asistente: ${e.text}`);
    if (e.type === 'inter') lines.push(`${where}Interlineal ${e.ref}: ${(e.verses || []).map(v => v.words.map(w => `${w.o} (${w.t}, ${w.g})`).join(' ')).join(' / ')}`);
  }
  const strokes = page.els.filter(e => e.type === 'stroke').length;
  if (strokes) lines.push(`(Además hay ${strokes} trazos escritos o dibujados a mano que no se pueden leer como texto.)`);
  return lines.join('\n').slice(0, 3800);
}
let asking = false;
async function askAI(preset) {
  const input = $('askInput');
  const msg = (typeof preset === 'string' ? preset : input.value).trim();
  if (!msg || asking || !study) return;
  const session = await getSession();
  if (!session) { toast('Inicia sesión para usar el asistente'); return; }
  asking = true;
  input.value = ''; autoGrow(input);
  study.chat.push({ role: 'user', content: msg.slice(0, 2000) });
  renderChat();
  $('chat').insertAdjacentHTML('beforeend', '<div class="msg-a typing" id="typing">Pensando…</div>');
  $('chat').scrollTop = $('chat').scrollHeight;
  const vp = visiblePageAndPoint();
  const ref = study.ref || {};
  try {
    const res = await kapiFetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        message: msg.slice(0, 2000),
        history: study.chat.slice(0, -1).slice(-10),
        bookId: ref.bookId || undefined, chapter: ref.chapter || undefined,
        studyContext: vp ? pageText(vp.page) : '',
      }),
    });
    const data = await res.json();
    if (res.status === 429) throw new Error(data.message || 'Alcanzaste tu límite de consultas este mes.');
    if (!res.ok) throw new Error('No se pudo responder. Intenta de nuevo.');
    study.chat.push({ role: 'assistant', content: String(data.reply || '').slice(0, 6000) });
    markDirty();
  } catch (e) {
    study.chat.push({ role: 'assistant', content: e.message || 'No se pudo responder.' });
  } finally {
    asking = false;
    renderChat();
  }
}
function insertAI(i) {
  const m = study.chat[i]; if (!m) return;
  const text = m.content.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s+/gm, '').trim();
  insertElement({ type: 'ai', w: study.format === 'free' ? 560 : 680, text });
}

/* ── Menú ── */
function toggleMenu(ev) { ev.stopPropagation(); const m = $('menuPop'); m.hidden = !m.hidden; applyFingerMode(); }
function hideMenu() { $('menuPop').hidden = true; }
document.addEventListener('click', e => { if (!e.target.closest('#menuPop')) hideMenu(); });
function exportPDF() {
  hideMenu(); commitEditing(); deselect();
  const z = zoom; zoom = 1;
  setTimeout(() => { window.print(); zoom = z; }, 50);
}

/* ── Teclado (computadora) ── */
document.addEventListener('keydown', e => {
  if (!study || $('editorView').hidden) return;
  const typing = editingId || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i') && fmtTarget()) { e.preventDefault(); toggleFmt(e.key.toLowerCase() === 'b' ? 'bold' : 'italic'); return; }
  if (typing) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteSelected(); return; }
  const map = { v: 'select', p: 'pen', h: 'hl', e: 'eraser', t: 'text' };
  if (!mod && map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  if (e.key === 'Escape') deselect();
});
// Zoom con Ctrl/⌘ + rueda (trackpad)
document.addEventListener('wheel', e => {
  if (!study || !(e.ctrlKey || e.metaKey) || !e.target.closest('#stage')) return;
  e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
}, { passive: false });

/* ── Inicio ── */
(async function init() {
  paintThemeBtn();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const nueva = params.get('new');
  if (nueva === 'parasha') { await createStudy('notebook', 'parasha', { parasha: parseInt(params.get('p')) || null }); return; }
  if (id) { await openStudy(id); return; }
  showHome();
})();
