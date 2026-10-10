/* KODESH — Moadim: las fiestas y el Shabat con su pintura y cuenta regresiva.
   - Tarjeta de inicio (Ciclo de estudio): la próxima fiesta con su pintura,
     la línea de las siete fiestas (primavera · cumplidas / otoño · su regreso)
     y una tarjeta pequeña del Shabat.
   - Página de cada fiesta (solo si el usuario entra): pintura a pantalla
     completa, nombre, hebreo, lema, cuenta regresiva y la hora del atardecer
     en su ciudad (comienza / termina). «Entrar» abre la ficha de la fiesta.
   Fechas: calendario bíblico observado (calendario.js). Atardecer calculado
   en el teléfono (algoritmo solar, sin internet). Pinturas: insignias/fiestas.json.
   Expone window.KodeshMoedim. */
(function () {
  'use strict';
  const ART_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/fiestas.json';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ── Sol: hora de la puesta (método de SunCalc, dominio público de NOAA) ── */
  const rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009, OB = rad * 23.4397;
  const fromJ = j => new Date((j + 0.5 - J1970) * 864e5);
  function sunset(y, m, d, lat, lng) {
    const noon = new Date(Date.UTC(y, m, d, 12) - lng / 15 * 36e5);
    const lw = rad * -lng, phi = rad * lat, days = noon.valueOf() / 864e5 - 0.5 + J1970 - J2000;
    const n = Math.round(days - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = rad * (357.5291 + 0.98560028 * ds);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(OB) * Math.sin(L));
    const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    return fromJ(J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L));
  }

  /* ── Ciudad para el atardecer ── */
  const CITIES = [
    ['Jerusalén', 31.778, 35.235, 'Asia/Jerusalem'], ['Kissimmee / Orlando', 28.29, -81.41, 'America/New_York'], ['Miami', 25.76, -80.19, 'America/New_York'],
    ['Nueva York', 40.71, -74.01, 'America/New_York'], ['Houston', 29.76, -95.37, 'America/Chicago'], ['Los Ángeles', 34.05, -118.24, 'America/Los_Angeles'],
    ['Ciudad de México', 19.43, -99.13, 'America/Mexico_City'], ['Guatemala', 14.63, -90.51, 'America/Guatemala'], ['San Salvador', 13.69, -89.22, 'America/El_Salvador'],
    ['Tegucigalpa', 14.07, -87.19, 'America/Tegucigalpa'], ['Managua', 12.11, -86.24, 'America/Managua'], ['San José (Costa Rica)', 9.93, -84.08, 'America/Costa_Rica'],
    ['Panamá', 8.98, -79.52, 'America/Panama'], ['Santo Domingo', 18.49, -69.93, 'America/Santo_Domingo'], ['San Juan (Puerto Rico)', 18.47, -66.11, 'America/Puerto_Rico'],
    ['La Habana', 23.11, -82.37, 'America/Havana'], ['Caracas', 10.49, -66.88, 'America/Caracas'], ['Bogotá', 4.71, -74.07, 'America/Bogota'],
    ['Medellín', 6.24, -75.58, 'America/Bogota'], ['Cali', 3.45, -76.53, 'America/Bogota'], ['Quito', -0.18, -78.47, 'America/Guayaquil'],
    ['Guayaquil', -2.19, -79.89, 'America/Guayaquil'], ['Lima', -12.05, -77.04, 'America/Lima'], ['La Paz', -16.5, -68.15, 'America/La_Paz'],
    ['Santa Cruz (Bolivia)', -17.78, -63.18, 'America/La_Paz'], ['Santiago de Chile', -33.45, -70.67, 'America/Santiago'], ['Buenos Aires', -34.6, -58.38, 'America/Argentina/Buenos_Aires'],
    ['Montevideo', -34.9, -56.16, 'America/Montevideo'], ['Asunción', -25.26, -57.58, 'America/Asuncion'], ['Madrid', 40.42, -3.7, 'Europe/Madrid'], ['Barcelona', 41.39, 2.17, 'Europe/Madrid'],
  ];
  const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } };
  function place() {
    const p = rj('kodesh_place', null);
    if (p && typeof p.lat === 'number') return p;
    // Sin elegir: la ciudad de la lista que comparte la zona horaria del teléfono, o Jerusalén
    const tz = deviceTz(), c = CITIES.find(x => x[3] === tz) || CITIES[0];
    return { n: c[0], lat: c[1], lon: c[2], tz: c[3], guess: true };
  }
  function setPlace(p) { wj('kodesh_place', p); }
  function useMyLocation() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Este dispositivo no comparte la ubicación'));
      navigator.geolocation.getCurrentPosition(pos => {
        const p = { n: 'Mi ubicación', lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), tz: deviceTz() };
        setPlace(p); res(p);
      }, () => rej(new Error('No se pudo obtener la ubicación')), { timeout: 12000, maximumAge: 864e5 });
    });
  }
  const fmtT = (d, tz) => d.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  const fmtD = (d, tz, yr) => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', ...(yr ? { year: 'numeric' } : {}), timeZone: tz });
  const fmtShort = (d, tz) => d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  // Fecha local (año, mes, día) de un instante en la zona de la ciudad
  function ymd(date, tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date).map(x => [x.type, x.value]));
    return [+p.year, +p.month - 1, +p.day];
  }
  const addDays = ([y, m, d], n) => { const t = new Date(Date.UTC(y, m, d + n)); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()]; };

  /* ── Datos ── */
  let FEST = null, ART = rj('kodesh_fr_art', {}), P = null;
  const SHABAT = { id: 'shabat', n: 'Shabat', he: 'שַׁבָּת', alt: 'El séptimo día', lema: 'El encuentro apartado del Padre con su pueblo', eco: '«Porque Señor es del sábado el Hijo del hombre» · Mateo 12:8', est: 's' };
  function load() {
    if (!P) P = Promise.all([
      fetch('./data/fiestas.json').then(r => r.json()).then(j => { FEST = j.f; }),
      window.KodeshCal ? KodeshCal.load() : null,
      fetch(`${ART_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === 'object') { ART = j; wj('kodesh_fr_art', j); } }).catch(() => {}),
    ]).catch(() => { P = null; });
    return P;
  }
  const all = () => [SHABAT, ...(FEST || [])];
  const byId = id => all().find(f => f.id === id);
  // Cuándo comienza y termina (atardecer a atardecer) en la ciudad elegida
  function times(id, now = new Date()) {
    const pl = place(), tz = pl.tz || deviceTz();
    if (id === 'shabat') {
      const today = ymd(now, tz);
      for (let i = -1; i < 8; i++) {
        const D = addDays(today, i), wd = new Date(Date.UTC(D[0], D[1], D[2])).getUTCDay();
        if (wd !== 5) continue;
        const start = sunset(D[0], D[1], D[2], pl.lat, pl.lon), E = addDays(D, 1), end = sunset(E[0], E[1], E[2], pl.lat, pl.lon);
        if (end > now) return { start, end, pl, tz };
      }
      return null;
    }
    const n = window.KodeshCal && KodeshCal.next(id, now);
    if (!n) return null;
    const e = [n.eve.getFullYear(), n.eve.getMonth(), n.eve.getDate()], z = [n.end.getFullYear(), n.end.getMonth(), n.end.getDate()];
    const start = sunset(e[0], e[1], e[2], pl.lat, pl.lon), end = sunset(z[0], z[1], z[2], pl.lat, pl.lon);
    if (end < now) return null;
    return { start, end, pl, tz, maybeEarlier: n.maybeEarlier, confirmed: n.confirmed };
  }
  function nextFeast(now = new Date()) {
    return (FEST || []).map(f => [f, times(f.id, now)]).filter(x => x[1]).sort((a, b) => a[1].start - b[1].start)[0] || null;
  }
  const daysTo = (d, now = new Date()) => Math.max(0, Math.ceil((d - now) / 864e5));

  /* ── Estilos ── */
  const css = document.createElement('style');
  css.textContent = `
.md-card { position: relative; display: block; width: 100%; border: none; padding: 0; margin: 0; text-align: left; border-radius: 22px; overflow: hidden; background: #1a140c; color: #f6efdf; font: inherit; cursor: pointer; box-shadow: 0 14px 34px rgba(0,0,0,.28); }
.md-card .md-img { position: absolute; inset: 0; background-size: cover; background-position: center 40%; }
.md-card .md-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,8,5,0) 20%, rgba(10,8,5,.55) 55%, rgba(14,10,6,.96) 100%); }
.md-card .md-in { position: relative; padding: 170px 20px 18px; }
.md-kick { font-family: 'Cinzel', 'Cormorant Garamond', serif; font-size: .62rem; letter-spacing: 2.5px; text-transform: uppercase; color: #e1a35a; }
.md-name { font-family: 'Cormorant Garamond', 'EB Garamond', serif; font-size: 2.3rem; font-weight: 600; line-height: 1.05; margin-top: 4px; }
.md-name .he { font-family: 'Frank Ruhl Libre', serif; font-size: 1.35rem; color: #e1a35a; margin-left: 8px; }
.md-lema { font-family: 'EB Garamond', serif; font-style: italic; color: #e9dfca; margin-top: 4px; font-size: 1.02rem; }
.md-line { display: flex; align-items: center; justify-content: space-between; margin: 18px 4px 6px; position: relative; }
.md-line:before { content: ''; position: absolute; left: 6px; right: 6px; top: 50%; height: 1px; background: rgba(225,163,90,.35); }
.md-line i { position: relative; width: 9px; height: 9px; border-radius: 5px; background: #8c6a3c; }
.md-line i.on { width: 16px; height: 16px; border-radius: 8px; background: #e07b39; box-shadow: 0 0 0 4px rgba(224,123,57,.25); }
.md-seasons { display: flex; justify-content: space-between; font-family: 'Cinzel', serif; font-size: .55rem; letter-spacing: 1.8px; color: #d58a47; text-transform: uppercase; }
.md-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(225,163,90,.18); }
.md-foot b { font-family: 'Cormorant Garamond', serif; font-size: 1.35rem; font-weight: 600; color: #e1a35a; }
.md-foot small { display: block; font-style: italic; color: #bfb29a; font-size: .9rem; }
.md-sh { display: flex; align-items: center; gap: 14px; width: 100%; margin-top: 12px; padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border2, #2a2836); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); font: inherit; text-align: left; cursor: pointer; }
.md-sh .md-sh-he { font-family: 'Frank Ruhl Libre', serif; font-size: 1.7rem; color: var(--gold, #c9a84c); width: 52px; height: 52px; border-radius: 26px; background: rgba(201,168,76,.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.md-sh b { display: block; font-family: 'Cormorant Garamond', serif; font-size: 1.25rem; font-weight: 600; }
.md-sh small { color: var(--text-mid, #b8af9c); font-size: .92rem; }
.md-ov { position: fixed; inset: 0; z-index: 590; background: #0d0a07; color: #f6efdf; opacity: 0; pointer-events: none; transition: opacity .3s; overflow: hidden; }
.md-ov.open { opacity: 1; pointer-events: auto; }
.md-ov { overscroll-behavior: contain; touch-action: none; }
.md-ov .md-body, .md-ov .md-more { touch-action: pan-y; overscroll-behavior: contain; }
html.md-lock, html.md-lock body, html.md-lock #homeView { overflow: hidden !important; overscroll-behavior: none; }
.md-ov .md-bg { position: absolute; left: 0; right: 0; top: 0; height: 100%; background-size: cover; background-position: center; transition: background-image .3s; }
@media (orientation: portrait) { .md-ov .md-bg:not(.none) { height: min(56vh, 92vw); } .md-ov .md-bg:not(.none)::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 45%; background: linear-gradient(180deg, rgba(13,10,7,0), #0d0a07); } }
.md-ov .md-bg.none { background: radial-gradient(ellipse at 50% 25%, #5a3a1a 0%, #24170c 45%, #0d0a07 80%); }
.md-ov .md-wm { position: absolute; top: 16%; left: 0; right: 0; text-align: center; font-family: 'Frank Ruhl Libre', serif; font-size: 9rem; color: rgba(225,163,90,.16); }
.md-ov .md-fade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,8,5,.35) 0%, rgba(10,8,5,0) 16%, rgba(10,8,5,0) 100%); }
@media (orientation: landscape) { .md-ov .md-fade { background: linear-gradient(180deg, rgba(10,8,5,.3) 0%, rgba(10,8,5,0) 25%, rgba(12,9,6,.7) 60%, #0d0a07 95%); } }
.md-top { position: absolute; left: 0; right: 0; top: 0; padding: calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 10px) 14px 0; display: flex; justify-content: space-between; z-index: 4; pointer-events: none; }
.md-ov.open .md-top > * { pointer-events: auto; }   /* solo con la hoja abierta: cerrada, sus botones invisibles tapaban el perfil */
.md-top button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(225,163,90,.35); background: rgba(13,10,7,.55); color: #e1a35a; font-size: 17px; cursor: pointer; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.md-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 0 18px calc(env(safe-area-inset-bottom, 0px) + 18px); text-align: center; z-index: 2; max-height: 72%; overflow-y: auto; }
.md-body .md-name { font-size: 2.7rem; }
.md-body .md-he { font-family: 'Frank Ruhl Libre', serif; font-size: 1.7rem; color: #e1a35a; margin-top: 2px; }
.md-body .md-lema { font-size: 1.15rem; }
.md-body .md-eco { color: #e0805a; font-style: italic; font-size: .95rem; margin-top: 6px; }
.md-when { font-family: 'Cinzel', serif; font-size: .6rem; letter-spacing: 2px; text-transform: uppercase; color: #d58a47; margin-top: 10px; }
.md-cd { margin: 14px auto 0; max-width: 420px; border: 1px solid rgba(225,163,90,.35); border-radius: 6px; padding: 10px 8px 12px; background: rgba(13,10,7,.6); position: relative; }
.md-cd .md-kick { text-align: center; margin-bottom: 4px; }
.md-cd .md-n { display: flex; justify-content: center; align-items: baseline; gap: 6px; font-family: 'Cormorant Garamond', serif; color: #e8b36c; }
.md-cd .md-n div { min-width: 58px; }
.md-cd .md-n b { display: block; font-size: 2.3rem; font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; }
.md-cd .md-n small { font-family: 'Cinzel', serif; font-size: .5rem; letter-spacing: 1.8px; color: #b98a52; }
.md-cd .md-n i { font-style: normal; font-size: 1.6rem; color: #8c6a3c; }
.md-be { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-width: 420px; margin: 8px auto 0; }
.md-be div { border: 1px solid rgba(225,163,90,.25); border-radius: 6px; padding: 8px 10px; text-align: left; background: rgba(13,10,7,.5); }
.md-be small { display: block; font-family: 'Cinzel', serif; font-size: .5rem; letter-spacing: 1.8px; color: #b98a52; }
.md-be b { font-weight: 500; font-size: .98rem; }
.md-place { display: inline-flex; gap: 6px; margin-top: 10px; border: none; background: none; color: #bfb29a; font: inherit; font-size: .88rem; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.md-go { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; padding: 11px 26px; border-radius: 10px; border: 1px solid rgba(224,123,57,.6); background: rgba(90,40,18,.55); color: #f6efdf; font: inherit; font-size: 1.02rem; cursor: pointer; }
.md-dots { display: flex; justify-content: center; align-items: center; gap: 7px; margin: 0 0 12px; }
.md-dots i { cursor: pointer; width: 7px; height: 7px; border-radius: 4px; background: rgba(225,163,90,.35); transition: width .25s; }
.md-dots i.on { background: #e1a35a; width: 20px; }
.md-up { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 14px auto 0; border: none; background: none; color: #d9b98a; font: inherit; font-size: .9rem; cursor: pointer; }
.md-up span { font-size: 1.3rem; line-height: .8; color: #e1a35a; animation: mdUp 1.8s ease-in-out infinite; }
@keyframes mdUp { 0%, 100% { transform: translateY(0); opacity: .6; } 50% { transform: translateY(-6px); opacity: 1; } }
.md-ov .md-bg, .md-ov .md-wm { transition: transform .7s cubic-bezier(.2,.8,.2,1), filter .7s; }
.md-ov.info .md-bg, .md-ov.info .md-wm { transform: scale(1.08); filter: blur(3px) brightness(.55); }
.md-ov .md-body, .md-ov .md-dots { transition: opacity .35s, transform .45s cubic-bezier(.2,.8,.2,1); }
.md-ov.info .md-body { opacity: 0; transform: translateY(-40px); pointer-events: none; }
.md-more { position: absolute; inset: 0; z-index: 3; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 66px) 22px calc(env(safe-area-inset-bottom, 0px) + 30px); background: linear-gradient(180deg, rgba(13,10,7,.25) 0%, rgba(13,10,7,.6) 30%, rgba(13,10,7,.82) 100%); opacity: 0; pointer-events: none; transition: opacity .4s; color: #f6efdf; -webkit-mask-image: linear-gradient(180deg, transparent 0, transparent calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 54px), #000 calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 96px)); mask-image: linear-gradient(180deg, transparent 0, transparent calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 54px), #000 calc(max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--ios-top-min, 0px)) + 96px)); }
.md-ov.info .md-more { opacity: 1; pointer-events: auto; }
.md-more .rv { opacity: 0; transform: translateY(22px); transition: opacity .6s, transform .6s cubic-bezier(.2,.8,.2,1); }
.md-ov.info .md-more .rv { opacity: 1; transform: none; }
.md-more .md-name { font-size: 2.4rem; text-align: center; }
.md-more .md-he { font-family: 'Frank Ruhl Libre', serif; font-size: 1.5rem; color: #e1a35a; text-align: center; }
.md-more .md-sub { text-align: center; color: #d9cdb4; font-style: italic; margin-top: 2px; }
.md-more h4 { margin: 22px 0 8px; font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2.4px; text-transform: uppercase; color: #e1a35a; font-weight: 500; }
.md-more ul { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 1.06rem; }
.md-more li { margin: 6px 0; }
.md-more li::marker { color: #e1a35a; }
.md-more a.r { color: #e8b36c; font-size: .86rem; text-underline-offset: 3px; }
.md-more h4 a.r { font-family: 'EB Garamond', serif; text-transform: none; letter-spacing: 0; font-size: .95rem; margin-left: 6px; }
.md-more .refs { display: flex; flex-wrap: wrap; gap: 6px; }
.md-more .refs a { border: 1px solid rgba(225,163,90,.4); border-radius: 12px; padding: 4px 10px; font-size: .88rem; color: #f0dcb8; text-decoration: none; background: rgba(13,10,7,.35); }
.md-more .hilo { position: relative; padding-left: 22px; }
.md-more .hilo:before { content: ''; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 2px; background: rgba(225,163,90,.45); }
.md-more .hilo a { position: relative; display: block; padding: 6px 0 10px; color: inherit; text-decoration: none; }
.md-more .hilo a:before { content: ''; position: absolute; left: -21px; top: 12px; width: 10px; height: 10px; border-radius: 5px; background: #e1a35a; }
.md-more .hilo b { display: block; font-family: 'Cinzel', serif; font-size: .58rem; letter-spacing: 2px; text-transform: uppercase; color: #e1a35a; font-weight: 500; }
.md-more .hilo small { color: #bfb29a; font-size: .82rem; }
.md-more .when { border: 1px solid rgba(225,163,90,.35); border-radius: 8px; padding: 10px 12px; background: rgba(13,10,7,.45); }
.md-more .btns { display: grid; gap: 8px; margin-top: 22px; }
.md-more .btns button { padding: 12px; border-radius: 10px; border: 1px solid rgba(225,163,90,.5); background: rgba(90,40,18,.45); color: #f6efdf; font: inherit; font-size: 1rem; cursor: pointer; }
.md-down { display: block; margin: 0 auto 6px; border: none; background: none; color: #e1a35a; font-size: 1.4rem; cursor: pointer; }
.md-pick { position: fixed; inset: 0; z-index: 600; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.md-pick > div { width: min(520px, 100%); max-height: 80vh; overflow: auto; background: var(--bg, #0b0b12); color: var(--text, #e9e3d3); border-radius: 20px 20px 0 0; padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px); }
.md-pick h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; }
.md-pick button { display: block; width: 100%; text-align: left; padding: 11px 12px; border: none; border-bottom: 1px solid var(--border2, #2a2836); background: none; color: inherit; font: inherit; font-size: 1rem; cursor: pointer; }
.md-pick button.me { color: var(--gold, #c9a84c); font-weight: 600; }`;
  document.head.appendChild(css);

  // Idioma (i18n.js)
  const TX = (s, v) => { if (window.KodeshI18n) return KodeshI18n.t(s, v); let r = s; for (const k in v || {}) r = r.split('{' + k + '}').join(v[k]); return r; };
  const artOf = id => ART && ART[id];
  const kickOf = f => TX(f.est === 'p' ? 'Moadim de primavera · cumplidas' : f.est === 'o' ? 'Moadim de otoño · su regreso' : 'Tiempo señalado · cada semana');

  /* ── Tarjetas de inicio ── */
  async function renderHome(el) {
    if (!el) return;
    await load();
    const nx = nextFeast(); const sh = times('shabat');
    if (!nx && !sh) { el.hidden = true; return; }
    const ids = (FEST || []).map(f => f.id);
    let html = '';
    if (nx) {
      const [f, t] = nx, dd = daysTo(t.start);
      html += `<button type="button" class="md-card" data-moed="${f.id}">
        <span class="md-img" style="${artOf(f.id) ? `background-image:url('${esc(artOf(f.id))}')` : 'background:radial-gradient(ellipse at 50% 20%,#6a4520 0%,#2a1a0c 55%,#140e08 100%)'}"></span><span class="md-shade"></span>
        <span class="md-in" style="display:block">
          <span class="md-kick" style="display:block">${t.start <= new Date() ? TX('Ahora') : `${TX('Próxima')} · ${dd === 0 ? TX('hoy al atardecer') : dd === 1 ? TX('mañana') : TX('en {n} días', { n: dd })}`}</span>
          <span class="md-name" style="display:block">${esc(f.n)}<span class="he" lang="he">${esc(f.he)}</span></span>
          <span class="md-lema" style="display:block">${esc(f.lema)}</span>
          <span class="md-line" style="display:flex">${ids.map(id => `<i class="${id === f.id ? 'on' : ''}"></i>`).join('')}</span>
          <span class="md-seasons" style="display:flex"><span>Primavera · cumplidas</span><span>Otoño · su regreso</span></span>
          <span class="md-foot" style="display:flex"><span><b style="display:block">Sus tiempos señalados</b><small>siete encuentros que el Padre fijó</small></span><span style="color:#e1a35a;font-size:1.4rem">→</span></span>
        </span></button>`;
    }
    if (sh) {
      const now = new Date(), on = sh.start <= now;
      const left = on ? sh.end - now : sh.start - now, h = Math.floor(left / 36e5), d = Math.floor(h / 24);
      html += `<button type="button" class="md-sh" data-moed="shabat"><span class="md-sh-he" lang="he">ש</span><span style="flex:1"><b>${on ? 'Shabat shalom' : 'Shabat'}</b><small>${on ? TX('Termina en {t}', { t: `${h} h ${Math.floor(left / 6e4) % 60} min` }) : `${TX('Comienza en {t}', { t: `${d ? d + ' d ' : ''}${h % 24} h` })} · <span style="white-space:nowrap">${esc(fmtShort(sh.start, sh.tz))} ${esc(fmtT(sh.start, sh.tz))}</span>`}</small></span><span style="color:var(--gold,#c9a84c)">→</span></button>`;
    }
    if (window.KodeshLuna) html += KodeshLuna.cardHtml();
    el.innerHTML = html; el.hidden = false;
    const lb = el.querySelector('[data-luna]'); if (lb) { lb.onclick = () => KodeshLuna.open(); KodeshLuna.paint(el); }
    const old = document.getElementById('shabbatLine'); if (old && sh) old.style.display = 'none';
    el.querySelectorAll('[data-moed]').forEach(b => b.onclick = () => open(b.dataset.moed));
  }

  /* ── Página de la fiesta ── */
  let ov = null, cur = null, timer = null;
  function shell() {
    if (ov) return ov;
    ov = document.createElement('div'); ov.className = 'md-ov'; ov.setAttribute('role', 'dialog');
    ov.innerHTML = `<div class="md-bg"></div><div class="md-wm" lang="he"></div><div class="md-fade"></div>
      <div class="md-top"><button data-x aria-label="Cerrar">✕</button><span style="display:flex;gap:8px"><button data-cal aria-label="Calendario del mes">☾</button><button data-share aria-label="Compartir">⇪</button></span></div>
      <div class="md-body"></div><div class="md-more"></div>`;
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').onclick = close;
    document.addEventListener('keydown', e => { if (!ov.classList.contains('open')) return; if (ov.classList.contains('info')) { if (e.key === 'ArrowDown' || e.key === 'Escape') infoOff(); return; } if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowUp') info(); else if (e.key === 'Escape') close(); });
    ov.querySelector('[data-share]').onclick = share;
    ov.querySelector('[data-cal]').onclick = () => { if (window.KodeshLuna) KodeshLuna.open(); };
    let x0 = null, y0 = null;
    // Que el dedo nunca arrastre la página de atrás (inicio): solo se desplaza el texto que tiene para dónde
    ov.addEventListener('touchmove', e => {
      const sc = e.target.closest && e.target.closest(ov.classList.contains('info') ? '.md-more' : '.md-body');
      if (sc && sc.scrollHeight > sc.clientHeight + 1) return;
      e.preventDefault();
    }, { passive: false });
    let st0 = 0;
    ov.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; st0 = ov.querySelector('.md-more').scrollTop; }, { passive: true });
    ov.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (ov.classList.contains('info')) { if (dy > 70 && Math.abs(dy) > Math.abs(dx) * 1.4 && st0 <= 0) infoOff(); return; }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
      else if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        const b = ov.querySelector('.md-body');      // si el texto aún tiene para dónde subir, es scroll
        if (b.contains(e.target) && b.scrollTop + b.clientHeight < b.scrollHeight - 4) return;
        info();
      }
    }, { passive: true });
    return ov;
  }
  function step(k) { const list = all(), i = list.findIndex(f => f.id === cur); show(list[(i + k + list.length) % list.length].id); }
  function show(id) {
    if (ov) ov.classList.remove('info');
    cur = id;
    const f = byId(id), t = times(id), o = shell();
    const bg = o.querySelector('.md-bg'), art = artOf(id);
    bg.className = 'md-bg' + (art ? '' : ' none'); bg.style.backgroundImage = art ? `url('${art}')` : '';
    o.querySelector('.md-wm').textContent = art ? '' : f.he;
    const yr = t && t.start.getFullYear() !== new Date().getFullYear();
    o.querySelector('.md-body').innerHTML = `
      <div class="md-dots">${all().map(x => `<i class="${x.id === id ? 'on' : ''}" data-dot="${x.id}" role="button" aria-label="${esc(x.n)}"></i>`).join('')}</div>
      <div class="md-kick">${esc(kickOf(f))}</div>
      <div class="md-name">${esc(f.n)}</div><div class="md-he" lang="he">${esc(f.he)}</div>
      <div class="md-lema">${esc(f.lema)}</div>${f.eco ? `<div class="md-eco">${esc(f.eco)}</div>` : ''}
      ${t ? `<div class="md-when">${TX('Comienza al atardecer')} · ${esc(fmtD(t.start, t.tz, yr))}</div>
      <div class="md-cd"><div class="md-kick" data-cdk></div><div class="md-n" data-cd></div></div>
      <div class="md-be"><div><small>☀︎ Comienza</small><b>${esc(fmtShort(t.start, t.tz))} · ${esc(fmtT(t.start, t.tz))}</b></div><div><small>☾ Termina</small><b>${esc(fmtShort(t.end, t.tz))} · ${esc(fmtT(t.end, t.tz))}</b></div></div>
      <button class="md-place" data-place>📍 ${esc(TX(t.pl.n))}${t.pl.guess ? ' · ' + TX('elegir mi ciudad') : ''}</button>
      ${t.maybeEarlier ? '<div style="color:#bfb29a;font-size:.82rem;margin-top:4px">Si la luna nueva se ve una tarde antes, se adelanta un día.</div>' : ''}` : ''}
      <button class="md-up" data-up aria-label="${esc(TX('Ver más sobre {n}', { n: TX(f.n) }))}"><span>︿</span>${TX('Desliza hacia arriba')}</button>`;
    o.querySelector('[data-up]').onclick = info;
    o.querySelectorAll('[data-dot]').forEach(d => d.onclick = () => show(d.dataset.dot));
    const pb = o.querySelector('[data-place]'); if (pb) pb.onclick = () => pickPlace();
    tick();
  }
  /* ── Panel deslizante con la información (sustituye al botón «Entrar») ── */
  const readUrl = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](\d+)(?::(\d+))?/.exec(r); return m ? `index.html?book=${m[1]}&chapter=${m[2]}${m[3] ? '&verse=' + m[3] : ''}` : 'index.html'; };
  const SHABAT_INFO = {
    mando: [['Dios reposó el séptimo día, lo bendijo y lo santificó.', 'GEN 2:2-3', 'Génesis 2:2–3'], ['«Acuérdate del día de reposo para santificarlo. Seis días trabajarás…»', 'EXO 20:8-11', 'Éxodo 20:8–11'],
      ['Es una señal perpetua entre Dios y su pueblo.', 'EXO 31:13-17', 'Éxodo 31:13–17'], ['Abre la lista de las fiestas de YHWH: día de reposo y santa convocación.', 'LEV 23:3', 'Levítico 23:3']],
    yeshua: [['Iba a la sinagoga en Shabat, «conforme a su costumbre».', 'LUK 4:16', 'Lucas 4:16'], ['«El día de reposo fue hecho por causa del hombre, y no el hombre por causa del día de reposo».', 'MRK 2:27-28', 'Marcos 2:27–28'],
      ['Sanó en Shabat: «es lícito hacer el bien en los días de reposo».', 'MAT 12:12', 'Mateo 12:12']],
    leer: [['GEN 2:1-3', 'Génesis 2:1–3'], ['EXO 20:8-11', 'Éxodo 20:8–11'], ['DEU 5:12-15', 'Deuteronomio 5:12–15'], ['ISA 58:13-14', 'Isaías 58:13–14'], ['MRK 2:23-28', 'Marcos 2:23–28'], ['HEB 4:9-11', 'Hebreos 4:9–11']],
  };
  // Modo información: la misma pintura se oscurece y los textos aparecen encima
  function info() {
    const f = byId(cur), t = times(cur), m = ov.querySelector('.md-more'), I = SHABAT_INFO;
    const ref = (r, n) => `<a class="r" href="${readUrl(r)}">${esc(n || niceRef(r))}</a>`;
    let html = `<button class="md-down rv" data-down aria-label="Volver">﹀</button>
      <div class="rv"><div class="md-name">${esc(f.n)}</div><div class="md-he" lang="he">${esc(f.he)}</div><div class="md-sub">${esc(cur === 'shabat' ? TX(f.lema) : `${TX(f.alt)} · ${TX(f.sig)}`)}</div></div>`;
    if (t) html += `<h4 class="rv">${TX(cur === 'shabat' ? 'Esta semana' : 'Próxima fecha')} · ${esc(TX(t.pl.n))}</h4><div class="when rv">${TX('Comienza')} ${esc(fmtShort(t.start, t.tz))} · ${esc(fmtT(t.start, t.tz))}<br>${TX('Termina')} ${esc(fmtShort(t.end, t.tz))} · ${esc(fmtT(t.end, t.tz))}${f.fecha ? `<div style="color:#bfb29a;font-size:.88rem;margin-top:4px">${esc(f.fecha)}</div>` : ''}</div>`;
    if (cur === 'shabat') {
      html += `<h4 class="rv">Qué mandó YHWH</h4><ul class="rv">${I.mando.map(([x, r, n]) => `<li>${esc(x)} ${ref(r, n)}</li>`).join('')}</ul>
        <h4 class="rv">En tiempos de Yeshúa</h4><ul class="rv">${I.yeshua.map(([x, r, n]) => `<li>${esc(x)} ${ref(r, n)}</li>`).join('')}</ul>
        <h4 class="rv">Para leer</h4><div class="refs rv">${I.leer.map(([r, n]) => `<a href="${readUrl(r)}">${esc(n)}</a>`).join('')}</div>
        <div class="btns rv"><button data-parasha>📖 Porción de la semana</button><button data-luna>☾ Luna y calendario</button></div>`;
    } else {
      html += `<h4 class="rv">Qué mandó YHWH ${ref(f.mand)}</h4><ul class="rv">${(f.que || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <h4 class="rv">En tiempos de Yeshúa</h4><ul class="rv">${(f.siglo || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${f.hilo ? `<h4 class="rv">De punta a punta</h4><div class="hilo rv">${f.hilo.map(([k, r, x]) => `<a href="${readUrl(r)}"><b>${esc(k)}</b>${esc(x)}<br><small>${esc(niceRef(r))}</small></a>`).join('')}</div>` : ''}
        <h4 class="rv">Para leer</h4><div class="refs rv">${[f.mand, ...(f.lee || [])].filter((x, i, a) => a.indexOf(x) === i).map(r => `<a href="${readUrl(r)}">${esc(niceRef(r))}</a>`).join('')}</div>
        <div class="btns rv"><button data-luna>☾ Luna y calendario del mes</button></div>`;
    }
    m.innerHTML = html; m.scrollTop = 0;
    m.querySelectorAll('.rv').forEach((el, i) => { el.style.transitionDelay = `${120 + i * 70}ms`; });
    m.querySelector('[data-down]').onclick = infoOff;
    const pa = m.querySelector('[data-parasha]'); if (pa) pa.onclick = () => { location.href = 'parashot.html'; };
    const lu = m.querySelector('[data-luna]'); if (lu) lu.onclick = () => { if (window.KodeshLuna) KodeshLuna.open(); };
    requestAnimationFrame(() => ov.classList.add('info'));
  }
  function infoOff() {
    if (!ov) return;
    ov.querySelectorAll('.md-more .rv').forEach(el => { el.style.transitionDelay = '0ms'; });
    ov.classList.remove('info');
  }
  const bookName = id => ((window.KodeshRef && KodeshRef.BOOKS) || []).find(b => b[0] === id)?.[1] || id;
  const niceRef = r => { const m = /^([1-3]?[A-Z]{2,3})[ :](.+)$/.exec(r); return m ? `${bookName(m[1])} ${m[2].replace('-', '–')}` : r; };
  function tick() {
    clearInterval(timer);
    const run = () => {
      if (!ov || !ov.classList.contains('open') && timer) return;
      const t = times(cur); const el = ov && ov.querySelector('[data-cd]'); if (!t || !el) return;
      const now = new Date(), on = t.start <= now, left = Math.max(0, (on ? t.end : t.start) - now);
      const s = Math.floor(left / 1000), p = n => String(n).padStart(2, '0');
      ov.querySelector('[data-cdk]').textContent = TX(on ? (cur === 'shabat' ? 'Shabat shalom · termina en' : 'Se celebra ahora · termina en') : 'Comienza en');
      el.innerHTML = `<div><b>${Math.floor(s / 86400)}</b><small>${TX('DÍAS')}</small></div><i>:</i><div><b>${p(Math.floor(s / 3600) % 24)}</b><small>${TX('HORAS')}</small></div><i>:</i><div><b>${p(Math.floor(s / 60) % 60)}</b><small>MIN</small></div><i>:</i><div><b>${p(s % 60)}</b><small>${TX('SEG')}</small></div>`;
    };
    run(); timer = setInterval(run, 1000);
  }
  async function open(id) {
    await load();
    if (!id || !byId(id)) { const nx = nextFeast(); id = nx ? nx[0].id : 'shabat'; }
    show(id);
    requestAnimationFrame(() => ov.classList.add('open'));
    document.body.style.overflow = 'hidden'; document.documentElement.classList.add('md-lock');
  }
  function close() { if (ov) ov.classList.remove('open', 'info'); if (!(document.querySelector('.ln-ov.open'))) document.documentElement.classList.remove('md-lock'); clearInterval(timer); timer = null; document.body.style.overflow = ''; }
  async function share() {
    const f = byId(cur), t = times(cur);
    const text = `${f.n} (${f.he}) · ${f.lema}${t ? `\nComienza al atardecer del ${fmtD(t.start, t.tz, true)}` : ''}\n— Kodesh Bible`;
    try { if (navigator.share) await navigator.share({ title: f.n, text, url: 'https://kodeshbible.com' }); else { await navigator.clipboard.writeText(text); if (typeof showToast === 'function') showToast('Copiado'); } } catch (e) {}
  }
  function pickPlace(done) {
    const after = () => { if (typeof done === 'function') done(); else show(cur); };
    const box = document.createElement('div'); box.className = 'md-pick';
    const cur0 = rj('kodesh_place', null);
    box.innerHTML = `<div><h3>Ciudad para el atardecer</h3><button data-me class="me">📍 Usar mi ubicación</button>${CITIES.map((c, i) => `<button data-c="${i}" data-noi18n${cur0 && cur0.n === c[0] ? ' style="color:var(--gold,#c9a84c)"' : ''}>${esc(TX(c[0]))}</button>`).join('')}</div>`;
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
    box.querySelector('[data-me]').onclick = async () => {
      try { await useMyLocation(); box.remove(); after(); } catch (e) { if (typeof showToast === 'function') showToast(e.message); else alert(e.message); }
    };
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = CITIES[+b.dataset.c]; setPlace({ n: c[0], lat: c[1], lon: c[2], tz: c[3] }); box.remove(); after(); document.querySelectorAll('[data-moedim-home]').forEach(renderHome); });
    document.body.appendChild(box);
  }

  window.KodeshMoedim = { open, close, renderHome, times, sunset, place, setPlace, pickPlace, nextFeast, load };
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-moedim-home]').forEach(renderHome));
  if (document.readyState !== 'loading') document.querySelectorAll('[data-moedim-home]').forEach(renderHome);
})();
