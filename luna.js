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
  const ICS = window.KodeshI18n && KodeshI18n.isEn ? 'www.kodeshbible.com/calendar-en.ics' : 'www.kodeshbible.com/calendario.ics';

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
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI, chi: ang };
  }
  // Altura de la luna sobre el horizonte (grados) en un lugar (SunCalc)
  function moonAlt(date, lat, lng) {
    const d = toDays(date), c = moonC(d), lw = rad * -lng, phi = rad * lat;
    const H = rad * (280.16 + 360.9856235 * d) - lw - c.ra;
    let h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
    h += rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10));   // refracción
    return h / rad;
  }
  // Ángulo paraláctico: cuánto está girado el norte de la luna respecto al cenit del lugar
  function parallactic(date, lat, lng) {
    const d = toDays(date), c = moonC(d), phi = rad * lat;
    const H = rad * (280.16 + 360.9856235 * d) - rad * -lng - c.ra;
    return Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
  }
  // Giro de toda la luna según su fase (no según la hora, para que no baile al arrastrar):
  // va girando unos 2–3° por día a lo largo del ciclo — creciente fina con la luz abajo a la
  // derecha, enderezándose hacia la llena, y menguante final con la luz abajo a la izquierda.
  // La inclinación máxima depende de la latitud (más «barquita» cerca del ecuador).
  // Hemisferio sur: girada 180° (creciente iluminada a la izquierda).
  function orient(date, P) {
    const il = illum(date), lat = P && typeof P.lat === 'number' ? P.lat : 31.8;
    const max = (90 - Math.min(Math.abs(lat), 60)) * 0.6 * rad;
    let rot = max * Math.cos(Math.PI * il.phase);                      // +max (nueva, creciendo) → −max (nueva, menguando)
    if (lat < 0) rot = Math.PI - rot;
    return { il, rot, waning: il.phase >= 0.5 };
  }
  // Elongación continua 0..1 (0 = nueva, .5 = llena) para buscar el instante exacto
  function findPhase(from, target, dir = 1) {
    const f = t => { const p = illum(new Date(t)).phase; let x = p - target; x -= Math.round(x); return x; };
    let a = from.valueOf(), fa = f(a), step = 6 * 36e5 * dir;
    for (let i = 0; i < 140; i++) {
      const b = a + step, fb = f(b);
      if (Math.sign(fa) !== Math.sign(fb) && Math.abs(fa - fb) < 0.5) {
        let lo = a, hi = b, flo = fa;
        for (let j = 0; j < 30; j++) { const mid = (lo + hi) / 2, fm = f(mid); if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid; }
        return new Date((lo + hi) / 2);
      }
      a = b; fa = fb;
    }
    return null;
  }
  // Salida y puesta de la luna en el día local (zona del lugar) que contiene t
  const riseCache = {};
  function riseSet(t, pl) {
    const day0 = localMidnight(t, pl.tz), key = day0.valueOf() + '|' + pl.lat + ',' + pl.lon;
    if (riseCache[key]) return riseCache[key];
    let rise = null, set = null, prev = moonAlt(day0, pl.lat, pl.lon) - 0.133;
    for (let m = 10; m <= 2160; m += 10) {
      const tt = new Date(day0.valueOf() + m * 6e4), h = moonAlt(tt, pl.lat, pl.lon) - 0.133;
      if (prev < 0 && h >= 0 && !rise) rise = new Date(tt.valueOf() - 6e5 * h / (h - prev));
      if (prev >= 0 && h < 0 && !set) set = new Date(tt.valueOf() - 6e5 * h / (h - prev));
      prev = h;
    }
    return (riseCache[key] = { rise, set });
  }
  // Partes de una fecha en una zona horaria
  const DTF = {};
  function parts(t, tz) {
    const f = DTF[tz] || (DTF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
    const o = {}; for (const x of f.formatToParts(t)) o[x.type] = +x.value || x.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
  }
  function localMidnight(t, tz) { const p = parts(t, tz); return new Date(t.valueOf() - (p.h * 60 + p.mi) * 6e4 - (t.getSeconds() * 1000 + t.getMilliseconds())); }

  /* ── Luna realista: textura de luna llena (admin · inicio.json «luna») + sombra de la fase ── */
  const IMG_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/inicio.json';
  let TEX = null, texP = null;
  function texture() {
    if (texP) return texP;
    texP = new Promise(res => {
      const go = url => {
        if (!url) return res(null);
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          // recorta el disco (por si la foto tiene márgenes negros)
          let box = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
          try {
            const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
            const x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
            const d = x.getImageData(0, 0, n, n).data; let x0 = n, y0 = n, x1 = -1, y1 = -1;
            for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { const i = (yy * n + xx) * 4; if (d[i] + d[i + 1] + d[i + 2] > 75) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
            if (x1 > x0 && y1 > y0) { const sx = img.naturalWidth / n, sy = img.naturalHeight / n, side = Math.max(x1 - x0 + 1, y1 - y0 + 1), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2; box = { x: (cx - side / 2) * sx, y: (cy - side / 2) * sy, w: side * sx, h: side * sy }; }
          } catch (e) {}
          TEX = { img, box }; res(TEX);
        };
        img.onerror = () => res(null);
        img.src = url;
      };
      let cached = null; try { cached = (JSON.parse(localStorage.getItem('kodesh_home_img') || '{}') || {}).luna; } catch (e) {}
      if (cached) go(cached);
      else fetch(`${IMG_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => go(j && j.luna)).catch(() => res(null));
    });
    return texP;
  }
  // Camino de la parte oscura en coordenadas del disco (radio r)
  function darkPath(ctx, p, r) {
    const k = Math.abs(Math.cos(2 * Math.PI * p)) * r, wax = p < 0.5, gib = p > 0.25 && p < 0.75;
    ctx.beginPath(); ctx.moveTo(0, -r);
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, wax);           // borde por el lado oscuro
    ctx.ellipse(0, 0, Math.max(k, 0.01), r, 0, Math.PI / 2, -Math.PI / 2, wax ? !gib : gib);   // terminador
    ctx.closePath();
  }
  // Pinta la luna en un canvas (tamaño CSS size): textura, sombra suave y luz cenicienta.
  // o = { rot: giro de toda la luna en radianes (positivo = horario) }
  // Sin o: vista de manual (norte arriba, iluminada a la derecha al crecer).
  function drawMoon(cv, p, size, o) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), W = Math.round(size * dpr);
    if (cv.width !== W) { cv.width = cv.height = W; cv.style.width = cv.style.height = size + 'px'; }
    const ctx = cv.getContext('2d'), r = W / 2 - 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    if (o) ctx.rotate(o.rot);                          // giro de toda la luna (foto y sombra)
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    if (TEX) { const b = TEX.box; ctx.drawImage(TEX.img, b.x, b.y, b.w, b.h, -r, -r, 2 * r, 2 * r); }
    else {
      const g = ctx.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r); g.addColorStop(0, '#e9e6de'); g.addColorStop(1, '#a9a49a');
      ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.fillStyle = 'rgba(90,88,84,.35)';
      for (const [x, y, s] of [[-.35, -.3, .28], [.2, -.35, .2], [.35, .05, .22], [-.5, .15, .3], [.05, .1, .14], [.55, -.2, .1]]) { ctx.beginPath(); ctx.ellipse(x * r, y * r, s * r, s * r * .8, .4, 0, Math.PI * 2); ctx.fill(); }
    }
    // oscurecimiento del borde
    const lg = ctx.createRadialGradient(0, 0, r * .55, 0, 0, r); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = lg; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    // sombra: geometría «creciente» (iluminada a la derecha) girada hacia el limbo iluminado
    const pw = p < 0.5 ? p : 1 - p;                    // 0..0.5
    const turn = p < 0.5 ? 0 : Math.PI;
    ctx.rotate(turn);
    const L = 8, a = 1 - Math.pow(1 - 0.80, 1 / L), spread = 0.022;   // ~20% de luz cenicienta, terminador suave
    ctx.fillStyle = `rgba(8,10,18,${a})`;
    for (let i = 0; i < L; i++) {
      const pp = pw + (i - (L - 1) / 2) * spread / (L - 1);
      if (pp <= 0.003) { ctx.fillRect(-r, -r, 2 * r, 2 * r); continue; }
      if (pp >= 0.5) continue;
      darkPath(ctx, pp, r * 1.002); ctx.fill();
    }
    ctx.restore();
  }

  // Idioma (i18n.js): TX traduce frases con {huecos}; en inglés las fechas ya salen en inglés
  const TX = (s, v) => { if (window.KodeshI18n) return KodeshI18n.t(s, v); let r = s; for (const k in v || {}) r = r.split('{' + k + '}').join(v[k]); return r; };
  const EN = () => !!(window.KodeshI18n && KodeshI18n.isEn);
  function phaseName(p) { return TX(phaseNameEs(p)); }
  function phaseNameEs(p) {
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
  const nameOf = num => { const n = C().monthName(num); return TX(n.ord) + (n.old ? ` · ${TX(n.old)}` : ''); };
  const nameIn = num => { const n = C().monthName(num); return (EN() ? 'the ' : '') + TX(n.ord).toLowerCase() + (n.old ? ` (${TX(n.old)})` : ''); };
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
.ln-ov { overscroll-behavior: contain; }
.ln-wrap { max-width: 560px; margin: 0 auto; padding: calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 10px) 16px calc(env(safe-area-inset-bottom, 0px) + 28px); }
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
.ln-ov { background: radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,.5), transparent), radial-gradient(1px 1px at 72% 9%, rgba(255,255,255,.4), transparent), radial-gradient(1.5px 1.5px at 88% 31%, rgba(255,255,255,.35), transparent), radial-gradient(1px 1px at 33% 41%, rgba(255,255,255,.3), transparent), radial-gradient(1px 1px at 58% 27%, rgba(255,255,255,.35), transparent), radial-gradient(1px 1px at 6% 52%, rgba(255,255,255,.3), transparent), radial-gradient(ellipse at 50% 18%, #1b1d2a 0%, #0b0b12 55%, #08080c 100%); }
.ln-place { flex: 1; margin: 0 10px; height: 40px; border: none; background: none; color: #f1ead8; font: inherit; font-size: 1.15rem; font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ln-pn { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.ln-pn b { font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 500; }
.ln-pn button { width: 44px; height: 44px; border: none; background: none; color: #e6c27a; font-size: 1.6rem; cursor: pointer; }
.ln-stage { position: relative; display: flex; align-items: center; justify-content: center; margin: 10px auto 6px; touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: grab; }
.ln-stage canvas { filter: drop-shadow(0 0 34px rgba(220,225,240,.10)); }
.ln-ovl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.9), 0 0 18px rgba(0,0,0,.65); pointer-events: none; font-family: -apple-system, 'SF Pro Display', system-ui, sans-serif; }
.ln-ovl small { font-size: .82rem; opacity: .92; }
.ln-ovl span { font-size: 1.35rem; font-weight: 600; }
.ln-ovl b { font-size: 3.6rem; font-weight: 700; line-height: 1.05; margin: 6px 0 8px; }
.ln-ruler { position: relative; height: 74px; margin: 6px -16px 0; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; }
.ln-ruler canvas { display: block; }
.ln-ruler i { position: absolute; left: 50%; top: -2px; width: 0; height: 0; margin-left: -7px; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 12px solid #e0603c; }
.ln-nowrow { text-align: center; min-height: 8px; }
.ln-now { margin-top: 8px; padding: 6px 14px; border-radius: 16px; border: 1px solid rgba(225,190,120,.4); background: rgba(185,138,62,.15); color: #e6c27a; font: inherit; font-size: .92rem; cursor: pointer; }
.ln-data { margin-top: 12px; border-top: 1px solid rgba(255,255,255,.12); }
.ln-data div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 2px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 1.02rem; }
.ln-data span { color: #f1ead8; font-weight: 600; white-space: nowrap; }
.ln-data b { font-weight: 400; text-align: right; color: #e9e3d3; }
.ln-data i { color: #8f879a; font-style: normal; font-size: .9rem; }
.ln-note { color: #8f879a; font-size: .82rem; text-align: center; margin-top: 14px; line-height: 1.4; }`;
  document.head.appendChild(css);

  /* ── Aviso de luna nueva (tema push) ── */
  const native = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const pushOn = () => lsGet('kodesh_moon_push') === '1';
  // Tema de avisos según el idioma de la app (luna-nueva / luna-nueva-en); other = el del otro idioma
  const TOPIC = other => ((window.KodeshI18n && KodeshI18n.isEn) !== !!other ? 'luna-nueva-en' : 'luna-nueva');
  // Al abrir la app: si el aviso está activo y cambió el idioma, se pasa al tema correcto
  if (typeof setTimeout === 'function') setTimeout(() => { try { const Ms = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.FirebaseMessaging; if (Ms && pushOn()) { Ms.subscribeToTopic({ topic: TOPIC() }).catch(() => {}); Ms.unsubscribeFromTopic({ topic: TOPIC(true) }).catch(() => {}); } } catch (e) {} }, 4000);
  async function setPush(on) {
    const Ms = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.FirebaseMessaging;
    if (!Ms) throw new Error('Disponible en la app de Kodesh');
    if (on) {
      const p = await Ms.requestPermissions();
      if (p && p.receive !== 'granted') throw new Error('Activa las notificaciones de Kodesh en Ajustes del teléfono');
      await Ms.subscribeToTopic({ topic: TOPIC() });
      await Ms.unsubscribeFromTopic({ topic: TOPIC(true) }).catch(() => {});
    } else { await Ms.unsubscribeFromTopic({ topic: 'luna-nueva' }).catch(() => {}); await Ms.unsubscribeFromTopic({ topic: 'luna-nueva-en' }).catch(() => {}); }
    lsSet('kodesh_moon_push', on ? '1' : '0');
  }

  /* ── Tarjeta de inicio ── */
  function cardHtml(now = new Date()) {
    if (!C() || !C().data) return '';
    const il = illum(now), t = C().today(now), nx = nextMoon(now);
    const line = nx ? (nx.days === 0 ? TX('Luna nueva esperada esta tarde') : nx.days === 1 ? TX('Luna nueva esperada mañana al atardecer') : TX('Luna nueva en {n} días', { n: nx.days })) : '';
    return `<button type="button" class="md-sh" data-luna><span class="md-sh-he" style="background:none"><canvas data-lmoon="${il.phase.toFixed(4)}" width="46" height="46"></canvas></span><span style="flex:1"><b>${esc(phaseName(il.phase))}${t ? ` · ${TX('día {n}', { n: t.day })}` : ''}</b><small>${esc(line)}</small></span><span style="color:var(--gold,#c9a84c)">→</span></button>`;
  }

  // Pinta las lunitas de las tarjetas (textura si ya está, si no se repinta al llegar)
  function paint(root = document) {
    const go = () => root.querySelectorAll('canvas[data-lmoon]').forEach(c => drawMoon(c, +c.dataset.lmoon, 46, (() => { try { const P = M().place(); return orient(new Date(), P); } catch (e) { return null; } })()));
    go(); if (!TEX) texture().then(x => { if (x) go(); });
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
    const now = new Date();
    const k0 = C().indexOf(now), M0 = C().monthAt(k0), nx = nextMoon(now);
    if (view < 0) view = k0;
    const Mv = C().monthAt(view);
    // próxima luna nueva
    let nm = '';
    if (nx) {
      const st = nx.m.fixed ? '<span class="ln-chip ok">✓ Vista y confirmada</span>' : nx.m.p ? '<span class="ln-chip">Podría verse una tarde antes</span>' : '<span class="ln-chip">Calculada · se confirma al verse</span>';
      nm = `<div class="ln-box"><h4>Próxima luna nueva</h4>
        <div class="ln-nm">${moonSvg(0.09, 54, south())}<div><b>${nx.days === 0 ? TX('Esta tarde') : nx.days === 1 ? TX('Mañana al atardecer') : TX('En {n} días', { n: nx.days })}</b>
        <small>${TX('Se espera ver desde Jerusalén la tarde del {d}. Comienza el {m}.', { d: esc(fmtL(nx.eve)), m: esc(nameIn(nx.num)) })}</small><br>${st}</div></div>
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
        const fn = TX(f ? f.n : '');
        const lab = f ? (f.first ? fn : f.id === 'sukot' && f.i === 7 ? TX('Último gran día') : `${fn.split(' ')[0]} · ${f.i + 1}`) : '';
        cells.push(`<${f ? 'button type="button"' : 'div'} class="ln-c${sh ? ' sh' : ''}${f ? ' fe' : ''}${di === todayIso ? ' today' : ''}"${f ? ` data-f="${f.id}"` : ''}>
          ${n === 1 ? `<span class="ln-mo">${moonSvg(0.1, 16, south())}</span>` : ''}<b>${n}</b><small>${esc(fmtS(d))}</small>${lab ? `<span class="ln-f">${esc(lab)}</span>` : ''}</${f ? 'button' : 'div'}>`);
      }
      grid = `<div class="ln-mh"><button data-mv="-1" aria-label="Mes anterior"${C().monthAt(view - 1) ? '' : ' disabled'}>‹</button>
        <div><b>${esc(nameOf(Mv.num))}</b><small>${esc(range)} · ${TX('{n} días', { n: Mv.len })}</small></div>
        <button data-mv="1" aria-label="Mes siguiente"${C().monthAt(view + 1) ? '' : ' disabled'}>›</button></div>
        <div class="ln-grid">${(EN() ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SHABBAT'] : ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SHABAT']).map((w, i) => `<div class="ln-wd${i === 6 ? ' sh' : ''}">${w}</div>`).join('')}${cells.join('')}</div>
        <div class="ln-leg"><span><i style="background:rgba(201,168,76,.35)"></i>Shabat</span><span><i style="background:rgba(224,123,57,.55)"></i>Fiesta</span><span>${moonSvg(0.1, 12)} Luna nueva</span></div>
        ${view !== k0 ? '<button class="ln-btn min" data-today>Volver a este mes</button>' : ''}`;
    }
    shell().innerHTML = `<div class="ln-wrap">
      <div class="ln-top"><button data-x aria-label="Cerrar">✕</button><button class="ln-place" data-place></button><button data-share aria-label="Compartir">⇪</button></div>
      <div class="ln-pn"><button data-step="-1" aria-label="Día anterior">←</button><b data-ph></b><button data-step="1" aria-label="Día siguiente">→</button></div>
      <div class="ln-stage" data-stage><canvas data-moon></canvas>
        <div class="ln-ovl"><small data-wd></small><span data-date></span><b data-pct></b><small data-tl></small><span data-time></span></div></div>
      <div class="ln-ruler" data-ruler><canvas></canvas><i></i></div>
      <div class="ln-nowrow"><button class="ln-now" data-now hidden>↺ Volver a ahora</button></div>
      <div class="ln-data" data-rows></div>
      ${nm}${grid}
      <button class="ln-btn" data-ics>📅 Añadir las fiestas y lunas a mi calendario</button>
      <button class="ln-btn min" data-copy>Copiar enlace del calendario</button>
      <div class="ln-note">Cada mes comienza con la primera luna nueva visible desde Jerusalén y cada día, al atardecer.<br><a href="calendario-biblico.html" style="color:#e6c27a">¿Por qué este calendario?</a></div>
    </div>`;
    const o = ov;
    hero(o);
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

  /* ── La luna que se arrastra: escenario + regla de tiempo + datos ── */
  let T = null, follow = true, clock = null, raf = 0, vel = 0;
  const PPH = 13;                     // píxeles por hora en la regla
  const pl = () => { try { const p = M().place(); return { ...p, tz: p.tz || Intl.DateTimeFormat().resolvedOptions().timeZone }; } catch (e) { return { n: 'Jerusalén', lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem' }; } };
  const tfmt = (d, tz) => d.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  function dur(ms) {
    const m = Math.round(Math.abs(ms) / 6e4), d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, mi = m % 60;
    return (d ? `${d} d ` : '') + (d || h ? `${h} h ` : '') + `${mi} min`;
  }
  function hero(o) {
    if (T == null || follow) T = Date.now();
    const stage = o.querySelector('[data-stage]'), cv = o.querySelector('[data-moon]'), ruler = o.querySelector('[data-ruler]'), rc = ruler.querySelector('canvas');
    const size = () => Math.min(300, Math.round(Math.min(window.innerWidth, 560) * 0.74));
    o.querySelector('[data-place]').onclick = () => { if (M() && M().pickPlace) M().pickPlace(() => { Object.keys(riseCache).forEach(k => delete riseCache[k]); update(); }); };
    o.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { follow = false; T += +b.dataset.step * 864e5; update(); });
    o.querySelector('[data-now]').onclick = () => { follow = true; T = Date.now(); vel = 0; update(); };
    // arrastre (regla y luna): izquierda = adelante en el tiempo
    const drag = (el, k) => {
      let x0 = null, last = 0, lt = 0;
      el.addEventListener('pointerdown', e => { x0 = e.clientX; last = e.clientX; lt = performance.now(); vel = 0; cancelAnimationFrame(raf); try { el.setPointerCapture(e.pointerId); } catch (_) {} });
      el.addEventListener('pointermove', e => {
        if (x0 == null) return;
        const dx = e.clientX - last, now = performance.now(); last = e.clientX;
        if (!dx) return;
        follow = false; T -= dx / PPH * 36e5 * k; vel = -dx / Math.max(8, now - lt) * k; lt = now; schedule();
      });
      const up = () => {
        if (x0 == null) return; x0 = null;
        if (Math.abs(vel) > 0.05) { let v = vel; const step = () => { T += v * 16 / PPH * 36e5; v *= 0.93; update(); if (Math.abs(v) > 0.01) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); }
      };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    drag(ruler, 1); drag(stage, 1.6);
    let pend = false; const schedule = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; update(); }); };
    function update() {
      const t = new Date(T), P = pl(), il = illum(t), sz = size();
      drawMoon(cv, il.phase, sz, orient(t, P));
      stage.style.height = sz + 'px';
      o.querySelector('[data-place]').textContent = `📍 ${TX(P.n)}${P.guess ? ' · ' + TX('elegir') : ''} ✎`;
      o.querySelector('[data-ph]').textContent = phaseName(il.phase);
      o.querySelector('[data-wd]').textContent = t.toLocaleDateString('es', { weekday: 'long', timeZone: P.tz });
      o.querySelector('[data-date]').textContent = t.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: P.tz }).replace('.', '');
      o.querySelector('[data-pct]').textContent = Math.round(il.fraction * 100) + '%';
      o.querySelector('[data-tl]').textContent = TX('Hora en {p}', { p: TX(P.n) });
      o.querySelector('[data-time]').textContent = tfmt(t, P.tz);
      o.querySelector('[data-now]').hidden = follow && Math.abs(T - Date.now()) < 6e4;
      // datos
      const rs = riseSet(t, P), full = findPhase(t, 0.5, 1), nwN = findPhase(t, 0, 1), nwP = findPhase(t, 0, -1);
      const tomorrow = d => parts(d, P.tz).d !== parts(t, P.tz).d;
      const rel = d => d ? `${tomorrow(d) ? TX('mañana') + ' ' : ''}${tfmt(d, P.tz)} <i>(${TX(d < t ? 'hace {x}' : 'en {x}', { x: dur(d - t) })})</i>` : '—';
      // día bíblico (empieza al atardecer en la ciudad elegida)
      let bib = '';
      try {
        const td = C().today(t), p0 = parts(t, P.tz), s0 = M().sunset(p0.y, p0.mo - 1, p0.d, P.lat, P.lon);
        if (td) { const after = t > s0, nx = after ? C().today(new Date(t.valueOf() + 864e5)) : null, dd = after && nx ? nx : td; bib = `${TX('Día {n}', { n: dd.day })} · ${nameIn(dd.month).replace(/^the /, '')}${after ? ` <i>(${TX('desde el atardecer')})</i>` : ''}`; }
      } catch (e) {}
      const km = Math.round(moonC(toDays(t)).dist);
      o.querySelector('[data-rows]').innerHTML = [
        bib && ['Día bíblico', bib],
        ['Salida', rel(rs.rise)], ['Puesta', rel(rs.set)],
        ['Próxima luna llena', full ? `${esc(fmtS(full))} · <i>${TX('en {x}', { x: dur(full - t) })}</i>` : '—'],
        ['Edad lunar', nwP ? dur(t - nwP) : '—'],
        ['Conjunción (luna nueva)', nwN ? `${esc(fmtS(nwN))} · <i>${TX('en {x}', { x: dur(nwN - t) })}</i>` : '—'],
        ['Distancia', `${km.toLocaleString('es')} km`],
      ].filter(Boolean).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
      drawRuler(rc, ruler.clientWidth || 360, t, P);
    }
    if (!TEX) texture().then(x => { if (x) update(); });
    update();
    clearInterval(clock); clock = setInterval(() => { if (!ov || !ov.classList.contains('open')) return; if (follow) { T = Date.now(); update(); } }, 30000);
    o.__upd = update;
  }
  // Regla: horas, medianoches, día de hoy resaltado, barras doradas = luna sobre el horizonte
  function drawRuler(cv, w, t, P) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), H = 74;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = H * dpr; cv.style.width = w + 'px'; cv.style.height = H + 'px'; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, H);
    const c = w / 2, t0 = t.valueOf() - c / PPH * 36e5, t1 = t.valueOf() + c / PPH * 36e5, X = ms => c + (ms - t.valueOf()) / 36e5 * PPH;
    const todayKey = (() => { const p = parts(new Date(), P.tz); return `${p.y}-${p.mo}-${p.d}`; })();
    // medianoches visibles
    const mids = []; let h0 = Math.floor(t0 / 36e5) * 36e5 - 36e5 * 26;
    for (let h = h0; h <= t1 + 36e5 * 26; h += 36e5) { const p = parts(new Date(h), P.tz); if (p.h === 0) mids.push(h - p.mi * 6e4); }
    for (let i = 0; i + 1 < mids.length; i++) {
      const a = mids[i], b = mids[i + 1], p = parts(new Date(a + 12 * 36e5), P.tz), isToday = `${p.y}-${p.mo}-${p.d}` === todayKey;
      if (isToday) { x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(X(a), 22, X(b) - X(a), H - 22); }
      const xm = X((a + b) / 2);
      if (xm < -80 || xm > w + 80) continue;
      const dd = new Date(a + 12 * 36e5);
      x.textAlign = 'center'; x.fillStyle = '#e8e2d4'; x.font = '500 14px "EB Garamond", Georgia, serif';
      x.fillText(dd.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: P.tz }).replace('.', ''), xm, 52);
      x.fillStyle = isToday ? '#e6c27a' : '#9f97a8'; x.font = '600 12px "EB Garamond", Georgia, serif';
      x.fillText(isToday ? TX('hoy') : dd.toLocaleDateString('es', { weekday: 'long', timeZone: P.tz }), xm, 68);
    }
    // luna sobre el horizonte
    x.fillStyle = 'rgba(230,194,122,.55)';
    const st = 20 * 6e4; let runA = null;
    for (let m = t0 - st; m <= t1 + st; m += st) {
      const up = moonAlt(new Date(m), P.lat, P.lon) > 0;
      if (up && runA == null) runA = m;
      if ((!up || m + st > t1 + st) && runA != null) { x.fillRect(X(runA), 4, X(m) - X(runA), 5); runA = null; }
    }
    // marcas de hora
    for (let h = Math.floor(t0 / 36e5) * 36e5; h <= t1 + 36e5; h += 36e5) {
      const p = parts(new Date(h), P.tz), xx = Math.round(X(h - p.mi * 6e4)) + .5;
      const len = p.h === 0 ? 30 : p.h % 6 === 0 ? 16 : 9;
      x.strokeStyle = p.h === 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.4)'; x.lineWidth = p.h === 0 ? 1.6 : 1;
      x.beginPath(); x.moveTo(xx, 10); x.lineTo(xx, 10 + len); x.stroke();
    }
  }
  const toast = m => { if (typeof showToast === 'function') showToast(m); };
  async function share() {
    const now = new Date(), il = illum(now), t = C().today(now), nx = nextMoon(now);
    const text = `${TX('{p} esta noche', { p: phaseName(il.phase) })}${t ? ` · ${TX('día {n} del {m}', { n: t.day, m: nameIn(t.month) })}` : ''}${nx ? `\n${TX('Próxima luna nueva: tarde del {d}', { d: fmtL(nx.eve) })}` : ''}\n— Kodesh Bible`;
    try { if (navigator.share) await navigator.share({ title: TX('La luna de esta noche'), text, url: 'https://kodeshbible.com' }); else { await navigator.clipboard.writeText(text); toast('Copiado'); } } catch (e) {}
  }
  async function open() {
    await load();
    if (!C() || !C().data) { toast('No se pudo cargar el calendario'); return; }
    view = -1; render();
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden'; document.documentElement.classList.add('md-lock');
  }
  function close() { if (ov) ov.classList.remove('open'); if (!document.querySelector('.md-ov.open')) { document.body.style.overflow = ''; document.documentElement.classList.remove('md-lock'); } clearInterval(clock); cancelAnimationFrame(raf); follow = true; }

  window.KodeshLuna = { orient, parallactic, open, close, illum, phaseName, moonSvg, drawMoon, paint, cardHtml, nextMoon, findPhase, moonAlt, load };
})();
