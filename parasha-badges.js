/* KODESH — Rachas por porción: insignias de las 54 porciones de la Torá.
   - Una porción se gana al marcar leídos todos sus capítulos en el lector
     (o al marcar la lectura de Torá en Parashot).
   - La insignia usa el arte de /insignias/{num}.webp (o .png) si existe; si no,
     una medalla dorada con el nombre en hebreo.
   - Semanas seguidas: una semana cuenta si la porción de esa semana se ganó
     entre el domingo anterior (con una semana de margen para leer adelantado)
     y el Shabat. Usa las fechas de reading_days (servidor) y las locales.
   Expone window.KodeshBadges. */
(function () {
  'use strict';
  const SB_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a25icWRzZ3FkbXdpcnJnY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzU2NjYsImV4cCI6MjA5NjExMTY2Nn0.RqiuH5fafECN1yW5MjBP3zzHAdXLH4QD3gBL_WZ-hB0';
  const EARNED = 'kodesh_badges';          // { num: 'YYYY-MM-DD' }
  const SEEN = 'kodesh_badges_seen';       // celebraciones ya mostradas
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  let DATA = null;
  function load() {
    if (!DATA) DATA = Promise.all([
      fetch('./parashot-data.json').then(r => r.json()),
      fetch('./parashot-calendar.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([list, cal]) => ({ list, cal })).catch(() => { DATA = null; return { list: [], cal: {} }; });
    return DATA;
  }
  const chaptersOf = p => { const out = []; for (let c = p.startChapter; c <= p.endChapter; c++) out.push(`${p.book}:${c}`); return out; };
  const readMap = () => rj('kodesh_read', {});
  function progress(p, map = readMap()) { const ch = chaptersOf(p); return { done: ch.filter(k => map[k]).length, total: ch.length }; }
  function isEarned(p, map = readMap()) {
    const earned = rj(EARNED, {});
    if (earned[p.num]) return true;
    const pr = progress(p, map);
    const checks = rj('kodesh_parashot_readings', {})[p.num] || {};
    return pr.done === pr.total || !!checks.torah;
  }
  function earn(num, day) { const e = rj(EARNED, {}); if (!e[num]) { e[num] = day || today(); wj(EARNED, e); } }

  // ── Medalla ──
  const css = document.createElement('style');
  css.textContent = `
.kb-badge { position: relative; flex-shrink: 0; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
.kb-badge.on { background: radial-gradient(circle at 35% 30%, #f3dd98, #c9a84c 45%, #8a6a1e 85%); color: #15120a; box-shadow: 0 0 0 3px #3a3220, 0 6px 18px rgba(0,0,0,.35); }
.kb-badge.off { border: 1.5px dashed var(--border2, #2a2836); color: var(--text-dim, #6e6656); background: transparent; }
.kb-badge .kb-he { font-family: 'Frank Ruhl Libre', serif; line-height: 1.1; padding: 0 8%; }
.kb-badge img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.kb-badge.off img { filter: grayscale(1) brightness(.45); opacity: .5; }
.kb-cele { position: fixed; inset: 0; z-index: 600; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 38%, rgba(60,46,14,.96), rgba(8,8,12,.97) 62%); opacity: 0; transition: opacity .3s; padding: 24px; }
.kb-cele.open { opacity: 1; }
.kb-cele-in { width: min(420px, 100%); text-align: center; color: #e9e3d3; }
.kb-cele .kb-badge { margin: 22px auto 0; animation: kbPop .7s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes kbPop { from { transform: scale(.3) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
.kb-glow { box-shadow: 0 0 0 6px #3a3220, 0 0 80px rgba(201,168,76,.5) !important; }
.kb-btn { display: block; width: 100%; margin-top: 10px; height: 48px; border-radius: 24px; border: 1px solid #6e5a2a; background: transparent; color: #c9a84c; font: inherit; font-size: 1rem; cursor: pointer; text-decoration: none; line-height: 48px; }
.kb-btn.pri { background: #c9a84c; color: #15120a; border-color: #c9a84c; }`;
  document.head.appendChild(css);

  function badgeHtml(p, { size = 64, earned = true } = {}) {
    const fs = Math.max(11, Math.round(size * (p.heb.length > 8 ? 0.17 : 0.24)));
    return `<div class="kb-badge ${earned ? 'on' : 'off'}" style="width:${size}px;height:${size}px">
      <span class="kb-he" style="font-size:${fs}px" lang="he">${esc(p.heb)}</span>
      <img src="/insignias/${p.num}.webp" alt="" loading="lazy" onerror="if(!this.dataset.png){this.dataset.png=1;this.src='/insignias/${p.num}.png'}else{this.remove()}">
    </div>`;
  }

  // ── Celebración (al completar la porción en el lector) ──
  function celebrate(p, next) {
    const el = document.createElement('div');
    el.className = 'kb-cele'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Porción completada');
    const firstVerse = n => n.startVerse > 1 ? `&verse=${n.startVerse}` : '';
    el.innerHTML = `<div class="kb-cele-in">
      <div style="font-family:var(--font-display,serif);font-size:.8rem;letter-spacing:3px;text-transform:uppercase;color:#c9a84c">Porción completada</div>
      ${badgeHtml(p, { size: 180 }).replace('kb-badge on', 'kb-badge on kb-glow')}
      <div style="font-family:var(--font-display,serif);font-size:2.2rem;font-weight:700;margin-top:22px">¡${esc(p.nombre)}!</div>
      <div style="font-size:1.05rem;color:#b8af9c;margin-top:6px;line-height:1.5">Leíste ${esc(p.torah)} completo.<br><i>${esc(p.sig)}</i></div>
      <div style="font-size:.85rem;color:#8e8676;margin-top:8px">Insignia ${p.num} de 54</div>
      <div style="margin-top:26px">
        <button type="button" class="kb-btn pri" data-share>Compartir mi insignia</button>
        ${next ? `<a class="kb-btn" href="index.html?book=${next.book}&chapter=${next.startChapter}${firstVerse(next)}">Siguiente: ${esc(next.nombre)} →</a>` : ''}
        <button type="button" class="kb-btn" data-close style="border:none;color:#8e8676">Seguir leyendo</button>
      </div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 300); };
    el.querySelector('[data-close]').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('[data-share]').onclick = async () => {
      const text = `Completé la porción ${p.nombre} (${p.heb}) — ${p.torah}. Leyendo la Torá semana a semana con KODESH Bible.`;
      try { if (navigator.share) await navigator.share({ title: `Insignia ${p.nombre}`, text, url: 'https://kodeshbible.com' }); else { await navigator.clipboard.writeText(text + ' https://kodeshbible.com'); if (typeof showToast === 'function') showToast('Copiado para compartir'); } } catch (e) {}
    };
    if (navigator.vibrate) try { navigator.vibrate([12, 60, 18]); } catch (e) {}
  }

  // Llamar después de marcar un capítulo como leído
  async function check(book, chapter, { quiet = false } = {}) {
    const { list } = await load();
    const map = readMap();
    const seen = rj(SEEN, {});
    for (const p of list.filter(x => x.book === book && chapter >= x.startChapter && chapter <= x.endChapter)) {
      const pr = progress(p, map);
      if (pr.done !== pr.total) continue;
      earn(p.num);
      if (seen[p.num]) continue;
      seen[p.num] = today(); wj(SEEN, seen);
      const next = list.find(x => x.num === p.num + 1);
      if (quiet) { if (typeof showToast === 'function') showToast(`✦ Insignia ganada: ${p.nombre} (${p.num} de 54)`); }
      else celebrate(p, next);
    }
  }

  // Desde Parashot: casilla «Torá» marcada → insignia
  async function checkPortion(num) {
    const { list } = await load();
    const p = list.find(x => x.num === num);
    if (!p || !isEarned(p)) return;
    earn(p.num);
    const seen = rj(SEEN, {});
    if (seen[p.num]) return;
    seen[p.num] = today(); wj(SEEN, seen);
    celebrate(p, list.find(x => x.num === p.num + 1));
  }

  // ── Fechas del servidor (reading_days) para las semanas seguidas ──
  function session() {
    try { const s = JSON.parse(localStorage.getItem('sb-fvknbqdsgqdmwirrgcvb-auth-token') || 'null'); return s && s.access_token ? s : null; } catch (e) { return null; }
  }
  async function readingDays() {
    const s = session(); if (!s) return null;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/reading_days?select=day,chapters&order=day.asc&limit=5000`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${s.access_token}` } });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  // Día en que se completó cada porción (el último capítulo que faltaba)
  async function earnedDates() {
    const { list } = await load();
    const days = await readingDays();
    const local = rj(EARNED, {});
    const out = { ...local };
    if (days) {
      const firstDay = {};
      for (const d of days) for (const c of d.chapters || []) if (!firstDay[c]) firstDay[c] = d.day;
      for (const p of list) {
        const ds = chaptersOf(p).map(c => firstDay[c]);
        if (ds.every(Boolean)) out[p.num] = ds.sort().pop();   // el día en que se marcó el último capítulo
      }
    }
    return out;
  }
  // Semanas seguidas (las semanas aún abiertas no rompen la racha)
  async function weekStreak() {
    const { cal } = await load();
    const dates = await earnedDates();
    const t = today();
    const sabbaths = Object.keys(cal).sort();
    const weeks = [];
    for (const sh of sabbaths) {
      if (sh > addDays(t, 6)) break;
      const nums = cal[sh];
      const from = addDays(sh, -13);
      const ok = nums.every(n => dates[n] && dates[n] >= from && dates[n] <= sh);
      weeks.push({ shabbat: sh, nums, ok, open: sh >= t });
    }
    let streak = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const w = weeks[i];
      if (w.open && !w.ok) continue;
      if (w.ok) streak++; else break;
    }
    return { streak, weeks: weeks.slice(-14), loggedIn: !!session() };
  }
  // Lectores de la comunidad Kodesh que completaron la porción esta semana (anónimo)
  async function community(p, since) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/parasha_readers`, {
        method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_chapters: chaptersOf(p), p_since: since }),
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  window.KodeshBadges = { load, badgeHtml, progress, isEarned, earn, check, checkPortion, celebrate, weekStreak, earnedDates, community, chaptersOf };
})();
