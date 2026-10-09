/* KODESH — La luna de esta noche y el calendario del mes.
   - Fase de la luna calculada en el teléfono (fórmulas de SunCalc/Meeus, sin internet).
   - Página «Calendario» (solo si el usuario entra): la luna de hoy, el día y el
     mes bíblicos, la próxima luna nueva esperada (o confirmada por el admin),
     la cuadrícula del mes con Shabat y fiestas, aviso de luna nueva (tema push
     «luna-nueva», solo en la app) y suscripción .ics al calendario del teléfono.
   - Tarjeta pequeña para el inicio (dentro de la sección opcional de Shabat y fiestas).
   Fechas: calendario.js (observado, Jerusalén). Expone window.KodeshLuna. */
(function () {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const ICS = 'www.kodeshbible.com/calendario.ics';

  /* ── Fase de la luna ── */
  const rad = Math.PI / 180, E = rad * 23.4397;
  const toDays = d => d.valueOf() / 864e5 - 0.5 + 2440588 - 2451545;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
  function sunC(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonC(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  // fraction: parte iluminada (0..1); phase: 0 nueva · .25 cuarto creciente · .5 llena · .75 cuarto menguante
  function illum(date = new Date()) {
    const d = toDays(date), s = sunC(d), m = moonC(d), sd = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
  }
  function phaseName(p) {
    if (p < 0.03 || p > 0.97) return 'Luna nueva';
    if (p < 0.22) return 'Creciente';
    if (p < 0.28) return 'Cuarto creciente';
    if (p < 0.47) return 'Gibosa creciente';
    if (p < 0.53) return 'Luna llena';
    if (p < 0.72) return 'Gibosa menguante';
    if (p < 0.78) return 'Cuarto menguante';
    return 'Menguante';
  }
  // Dibujo: disco oscuro + parte iluminada (terminador elíptico). Hemisferio sur: espejo.
  let gid = 0;
  function moonSvg(p, size = 120, south = false) {
    const r = 50, k = Math.abs(Math.cos(2 * Math.PI * p)) * r, id = 'lnG' + (++gid);
    const wax = p < 0.5, gib = (p > 0.25 && p < 0.75);
    // borde: de arriba a abajo por el lado iluminado; terminador: de abajo a arriba
    const outer = `M0,-${r} A${r},${r} 0 0 ${wax ? 1 : 0} 0,${r}`;
    const term = `A${k.toFixed(2)},${r} 0 0 ${wax ? (gib ? 1 : 0) : (gib ? 0 : 1)} 0,-${r}`;
    const lit = (p < 0.015 || p > 0.985) ? '' : `<path d="${outer} ${term} Z" fill="url(#${id})"/>`;
    return `<svg viewBox="-56 -56 112 112" width="${size}" height="${size}" aria-hidden="true" style="${south ? 'transform:scaleX(-1)' : ''}">
      <defs><radialGradient id="${id}" cx="35%" cy="35%" r="80%"><stop offset="0" stop-color="#fbf4e0"/><stop offset=".7" stop-color="#e9dcb8"/><stop offset="1" stop-color="#c9b88e"/></radialGradient></defs>
      <circle r="${r + 4}" fill="rgba(240,220,170,.06)"/><circle r="${r}" fill="#2b2620"/>${lit}
      <circle r="${r}" fill="none" stroke="rgba(240,220,170,.18)" stroke-width=".8"/></svg>`;
  }

  /* ── Fechas ── */
  const C = () => window.KodeshCal;
  const M = () => window.KodeshMoedim;
  const iso = d => C().iso(d);
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtL = d => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtS = d => d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
  const nameOf = num => { const n = C().monthName(num); return n.ord + (n.old ? ` · ${n.old}` : ''); };
  const nameIn = num => { const n = C().monthName(num); return n.ord.toLowerCase() + (n.old ? ` (${n.old})` : ''); };
  async function load() { await Promise.all([C() && C().load(), M() && M().load()]); }
  // ¿Ya se puso el sol hoy en la ciudad elegida? (el día bíblico empieza al atardecer)
  function afterSunset(now = new Date()) {
    try {
      const pl = M().place(); const s = M().sunset(now.getFullYear(), now.getMonth(), now.getDate(), pl.lat, pl.lon);
      return now > s ? s : null;
    } catch (e) { return null; }
  }
  const south = () => { try { return M().place().lat < 0; } catch (e) { return false; } };
  // Próxima luna nueva: el primer mes cuya tarde de avistamiento es hoy o después
  function nextMoon(now = new Date()) {
    const ms = C().months(), t = iso(now);
    const k = ms.findIndex(m => m.e >= t); if (k < 0) return null;
    const m = ms[k], eve = new Date(m.e + 'T12:00:00');
    return { k, m, eve, num: C().monthNum(k), days: Math.round((eve - new Date(t + 'T12:00:00')) / 864e5) };
  }
  // Fiestas por fecha (de día) → [{id, n, first}]
  const FN = { pesaj: 'Pésaj', matzot: 'Panes sin levadura', bikurim: 'Primicias', shavuot: 'Shavuot', terua: 'Yom Terúa', kipur: 'Yom Kipur', sukot: 'Sukot' };
  function feastMap(y) {
    const map = {};
    for (const yy of [y - 1, y, y + 1]) {
      const Y = C().year(yy); if (!Y) continue;
      for (const id of Object.keys(FN)) {
        const f = Y[id]; if (!f) continue;
        for (let i = 0; i < f.dias; i++) (map[iso(plus(f.start, i))] = map[iso(plus(f.start, i))] || []).push({ id, n: FN[id], first: i === 0, i, dias: f.dias });
      }
    }
    return map;
  }

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.ln-ov { position: fixed; inset: 0; z-index: 595; background: radial-gradient(ellipse at 50% 0%, #1d1a26 0%, #0d0b10 55%, #09080b 100%); color: #f1ead8; opacity: 0; pointer-events: none; transition: opacity .3s; overflow-y: auto; -webkit-overflow-scrolling: touch; font-family: 'EB Garamond', serif; }
.ln-ov.open { opacity: 1; pointer-events: auto; }
.ln-wrap { max-width: 560px; margin: 0 auto; padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 10px) 16px calc(env(safe-area-inset-bottom, 0px) + 28px); }
.ln-top { display: flex; justify-content: space-between; align-items: center; }
.ln-top button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(225,190,120,.3); background: rgba(20,18,26,.6); color: #e6c27a; font-size: 17px; cursor: pointer; }
.ln-top span { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2.6px; text-transform: uppercase; color: #c9a86a; }
.ln-hero { text-align: center; padding: 10px 0 6px; }
.ln-hero svg { filter: drop-shadow(0 0 28px rgba(240,220,170,.18)); }
.ln-kick { font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 2.4px; text-transform: uppercase; color: #c9a86a; }
.ln-ph { font-family: 'Cormorant Garamond', serif; font-size: 2.1rem; font-weight: 600; line-height: 1.1; margin-top: 6px; }
.ln-sub { color: #bdb4a2; font-size: 1rem; margin-top: 2px; }
.ln-day { margin-top: 10px; font-size: 1.12rem; }
.ln-day b { color: #e6c27a; font-weight: 600; }
.ln-day small { display: block; color: #9f97a8; font-size: .86rem; font-style: italic; }
.ln-box { margin-top: 16px; border: 1px solid rgba(225,190,120,.22); border-radius: 16px; padding: 14px 16px; background: rgba(255,255,255,.025); }
.ln-box h4 { margin: 0; font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 2.2px; text-transform: uppercase; color: #c9a86a; font-weight: 500; }
.ln-nm { display: flex; gap: 14px; align-items: center; margin-top: 8px; }
.ln-nm b { display: block; font-family: 'Cormorant Garamond', serif; font-size: 1.35rem; font-weight: 600; }
.ln-nm small { color: #bdb4a2; font-size: .92rem; }
.ln-chip { display: inline-block; margin-top: 6px; padding: 2px 9px; border-radius: 10px; font-size: .78rem; border: 1px solid rgba(225,190,120,.35); color: #e6c27a; }
.ln-chip.ok { border-color: rgba(120,200,140,.5); color: #9fd8a9; }
.ln-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(225,190,120,.14); }
.ln-row span { font-size: .98rem; }
.ln-row small { display: block; color: #9f97a8; font-size: .82rem; }
.ln-sw { width: 46px; height: 28px; border-radius: 14px; border: none; background: #3a3644; position: relative; cursor: pointer; flex-shrink: 0; }
.ln-sw:after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 11px; background: #d9d2c4; transition: left .2s; }
.ln-sw.on { background: #b98a3e; } .ln-sw.on:after { left: 21px; background: #fff7e6; }
.ln-mh { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; }
.ln-mh button { width: 38px; height: 38px; border-radius: 19px; border: 1px solid rgba(225,190,120,.3); background: none; color: #e6c27a; font-size: 1.2rem; cursor: pointer; }
.ln-mh button:disabled { opacity: .3; }
.ln-mh div { text-align: center; }
.ln-mh b { display: block; font-family: 'Cormorant Garamond', serif; font-size: 1.45rem; font-weight: 600; }
.ln-mh small { color: #9f97a8; font-size: .85rem; }
.ln-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 10px; }
.ln-wd { text-align: center; font-family: 'Cinzel', serif; font-size: .52rem; letter-spacing: 1.2px; color: #8f879a; padding-bottom: 4px; }
.ln-wd.sh { color: #e6c27a; }
.ln-c { position: relative; min-height: 58px; border-radius: 10px; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.025); padding: 4px 5px; text-align: left; color: inherit; font: inherit; display: flex; flex-direction: column; overflow: hidden; }
.ln-c.sh { background: rgba(201,168,76,.08); border-color: rgba(201,168,76,.2); }
.ln-c b { font-family: 'Cormorant Garamond', serif; font-size: 1.25rem; font-weight: 600; line-height: 1; }
.ln-c small { color: #8f879a; font-size: .66rem; }
.ln-c .ln-f { margin-top: auto; font-size: .6rem; line-height: 1.1; color: #f0b46a; }
.ln-c.fe { background: rgba(224,123,57,.12); border-color: rgba(224,123,57,.35); cursor: pointer; }
.ln-c.today { box-shadow: 0 0 0 2px #e6c27a inset; }
.ln-c .ln-mo { position: absolute; top: 4px; right: 4px; }
.ln-c.empty { visibility: hidden; }
.ln-leg { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; color: #9f97a8; font-size: .8rem; }
.ln-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.ln-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 10px; padding: 12px; border-radius: 12px; border: 1px solid rgba(225,190,120,.35); background: rgba(185,138,62,.14); color: #f1ead8; font: inherit; font-size: 1rem; cursor: pointer; }
.ln-btn.min { background: none; border: none; color: #bdb4a2; text-decoration: underline; text-underline-offset: 3px; font-size: .92rem; padding: 6px; }
.ln-note { color: #8f879a; font-size: .82rem; text-align: center; margin-top: 14px; line-height: 1.4; }`;
  document.head.appendChild(css);

  /* ── Aviso de luna nueva (tema push) ── */
  const native = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const pushOn = () => lsGet('kodesh_moon_push') === '1';
  async function setPush(on) {
    const Ms = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.FirebaseMessaging;
    if (!Ms) throw new Error('Disponible en la app de Kodesh');
    if (on) {
      const p = await Ms.requestPermissions();
      if (p && p.receive !== 'granted') throw new Error('Activa las notificaciones de Kodesh en Ajustes del teléfono');
      await Ms.subscribeToTopic({ topic: 'luna-nueva' });
    } else await Ms.unsubscribeFromTopic({ topic: 'luna-nueva' });
    lsSet('kodesh_moon_push', on ? '1' : '0');
  }

  /* ── Tarjeta de inicio ── */
  function cardHtml(now = new Date()) {
    if (!C() || !C().data) return '';
    const il = illum(now), t = C().today(now), nx = nextMoon(now);
    const line = nx ? (nx.days === 0 ? 'Luna nueva esperada esta tarde' : nx.days === 1 ? 'Luna nueva esperada mañana al atardecer' : `Luna nueva en ${nx.days} días`) : '';
    return `<button type="button" class="md-sh" data-luna><span class="md-sh-he" style="background:none">${moonSvg(il.phase, 46, south())}</span><span style="flex:1"><b>${esc(phaseName(il.phase))}${t ? ` · día ${t.day}` : ''}</b><small>${esc(line)}</small></span><span style="color:var(--gold,#c9a84c)">→</span></button>`;
  }

  /* ── Página ── */
  let ov = null, view = -1;
  function shell() {
    if (ov) return ov;
    ov = document.createElement('div'); ov.className = 'ln-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Calendario bíblico');
    document.body.appendChild(ov);
    return ov;
  }
  function render() {
    const now = new Date(), il = illum(now), t = C().today(now), ss = afterSunset(now);
    const k0 = C().indexOf(now), M0 = C().monthAt(k0), nx = nextMoon(now);
    if (view < 0) view = k0;
    const Mv = C().monthAt(view);
    // día bíblico
    let dayLine = '';
    if (t && M0) {
      const tonightNew = nx && nx.days === 0 && ss;
      dayLine = `<div class="ln-day">Día <b>${t.day}</b> del ${esc(nameIn(t.month))}
        ${ss ? `<small>${tonightNew ? 'Al atardecer, si se ve la luna, comienza el mes nuevo' : `Desde el atardecer (${esc(ss.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }))}) ya es el día ${t.day + 1}`}</small>` : ''}</div>`;
    }
    // próxima luna nueva
    let nm = '';
    if (nx) {
      const st = nx.m.fixed ? '<span class="ln-chip ok">✓ Vista y confirmada</span>' : nx.m.p ? '<span class="ln-chip">Podría verse una tarde antes</span>' : '<span class="ln-chip">Calculada · se confirma al verse</span>';
      nm = `<div class="ln-box"><h4>Próxima luna nueva</h4>
        <div class="ln-nm">${moonSvg(0.09, 54, south())}<div><b>${nx.days === 0 ? 'Esta tarde' : nx.days === 1 ? 'Mañana al atardecer' : `En ${nx.days} días`}</b>
        <small>Se espera ver desde Jerusalén la tarde del ${esc(fmtL(nx.eve))}. Comienza el ${esc(nameIn(nx.num))}.</small><br>${st}</div></div>
        <div class="ln-row"><span>Avisarme de la luna nueva<small>${native() ? 'Una notificación cuando se espera y cuando se confirma' : 'Disponible en la app de Kodesh'}</small></span>
        <button class="ln-sw${pushOn() ? ' on' : ''}" data-push role="switch" aria-checked="${pushOn()}" aria-label="Avisarme de la luna nueva"${native() ? '' : ' disabled'}></button></div></div>`;
    }
    // cuadrícula
    let grid = '';
    if (Mv) {
      const fm = feastMap(Mv.start.getFullYear()), todayIso = iso(now), off = Mv.start.getDay();
      const end = plus(Mv.start, Mv.len - 1);
      const range = Mv.start.getMonth() === end.getMonth() ? `${Mv.start.toLocaleDateString('es', { month: 'long', year: 'numeric' })}` : `${Mv.start.toLocaleDateString('es', { month: 'short' }).replace('.', '')} – ${end.toLocaleDateString('es', { month: 'short', year: 'numeric' }).replace('.', '')}`;
      const cells = [];
      for (let i = 0; i < off; i++) cells.push('<div class="ln-c empty"></div>');
      for (let n = 1; n <= Mv.len; n++) {
        const d = plus(Mv.start, n - 1), di = iso(d), fs = fm[di] || [], sh = d.getDay() === 6;
        const f = fs[0];
        const lab = f ? (f.first ? f.n : f.id === 'sukot' && f.i === 7 ? 'Último gran día' : `${f.n.split(' ')[0]} · ${f.i + 1}`) : '';
        cells.push(`<${f ? 'button type="button"' : 'div'} class="ln-c${sh ? ' sh' : ''}${f ? ' fe' : ''}${di === todayIso ? ' today' : ''}"${f ? ` data-f="${f.id}"` : ''}>
          ${n === 1 ? `<span class="ln-mo">${moonSvg(0.1, 16, south())}</span>` : ''}<b>${n}</b><small>${esc(fmtS(d))}</small>${lab ? `<span class="ln-f">${esc(lab)}</span>` : ''}</${f ? 'button' : 'div'}>`);
      }
      grid = `<div class="ln-mh"><button data-mv="-1" aria-label="Mes anterior"${C().monthAt(view - 1) ? '' : ' disabled'}>‹</button>
        <div><b>${esc(nameOf(Mv.num))}</b><small>${esc(range)} · ${Mv.len} días</small></div>
        <button data-mv="1" aria-label="Mes siguiente"${C().monthAt(view + 1) ? '' : ' disabled'}>›</button></div>
        <div class="ln-grid">${['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SHABAT'].map((w, i) => `<div class="ln-wd${i === 6 ? ' sh' : ''}">${w}</div>`).join('')}${cells.join('')}</div>
        <div class="ln-leg"><span><i style="background:rgba(201,168,76,.35)"></i>Shabat</span><span><i style="background:rgba(224,123,57,.55)"></i>Fiesta</span><span>${moonSvg(0.1, 12)} Luna nueva</span></div>
        ${view !== k0 ? '<button class="ln-btn min" data-today>Volver a este mes</button>' : ''}`;
    }
    shell().innerHTML = `<div class="ln-wrap">
      <div class="ln-top"><button data-x aria-label="Cerrar">✕</button><span>Calendario</span><button data-share aria-label="Compartir">⇪</button></div>
      <div class="ln-hero">${moonSvg(il.phase, 150, south())}
        <div class="ln-kick" style="margin-top:8px">La luna de esta noche</div>
        <div class="ln-ph">${esc(phaseName(il.phase))}</div>
        <div class="ln-sub">Iluminada ${Math.round(il.fraction * 100)}%</div>${dayLine}</div>
      ${nm}${grid}
      <button class="ln-btn" data-ics>📅 Añadir las fiestas y lunas a mi calendario</button>
      <button class="ln-btn min" data-copy>Copiar enlace del calendario</button>
      <div class="ln-note">Cada mes comienza con la primera luna nueva visible desde Jerusalén y cada día, al atardecer.<br><a href="calendario-biblico.html" style="color:#e6c27a">¿Por qué este calendario?</a></div>
    </div>`;
    const o = ov;
    o.querySelector('[data-x]').onclick = close;
    o.querySelector('[data-share]').onclick = share;
    o.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { view += +b.dataset.mv; render(); });
    const td = o.querySelector('[data-today]'); if (td) td.onclick = () => { view = k0; render(); };
    o.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (M()) M().open(b.dataset.f); });
    const sw = o.querySelector('[data-push]');
    if (sw) sw.onclick = async () => {
      const want = !pushOn();
      try { await setPush(want); toast(want ? 'Te avisaremos de la luna nueva' : 'Aviso de luna nueva apagado'); } catch (e) { toast(e.message); }
      render();
    };
    o.querySelector('[data-ics]').onclick = () => { location.href = 'webcal://' + ICS; };
    o.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText('https://' + ICS); toast('Enlace copiado · pégalo en tu calendario como suscripción'); } catch (e) { toast('https://' + ICS); } };
  }
  const toast = m => { if (typeof showToast === 'function') showToast(m); };
  async function share() {
    const now = new Date(), il = illum(now), t = C().today(now), nx = nextMoon(now);
    const text = `${phaseName(il.phase)} esta noche${t ? ` · día ${t.day} del ${nameIn(t.month)}` : ''}${nx ? `\nPróxima luna nueva: tarde del ${fmtL(nx.eve)}` : ''}\n— Kodesh Bible`;
    try { if (navigator.share) await navigator.share({ title: 'La luna de esta noche', text, url: 'https://kodeshbible.com' }); else { await navigator.clipboard.writeText(text); toast('Copiado'); } } catch (e) {}
  }
  async function open() {
    await load();
    if (!C() || !C().data) { toast('No se pudo cargar el calendario'); return; }
    view = -1; render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function close() { if (ov) ov.classList.remove('open'); document.body.style.overflow = ''; }

  window.KodeshLuna = { open, close, illum, phaseName, moonSvg, cardHtml, nextMoon, load };
})();
