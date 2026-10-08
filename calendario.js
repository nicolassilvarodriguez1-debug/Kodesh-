/* KODESH — Calendario bíblico observado (estilo caraíta).
   Los meses comienzan con la primera luna nueva visible a simple vista desde
   Jerusalén; el año comienza con el mes de Aviv (cebada madura en Israel).
   No usamos el calendario calculado de Hilel II.
   - data/calendario-biblico.json: predicciones (scripts/calendario/lunas.py,
     criterio de Odeh) y el Aviv estimado de cada año.
   - insignias/calendario.json (Storage): ajustes del admin cuando la luna se
     vio otro día o la cebada no estaba aviv.
   Primicias: el domingo dentro de los Panes sin levadura (Lv 23:11). Shavuot:
   50 días después, siempre en domingo (Lv 23:15-16).
   Expone window.KodeshCal. */
(function () {
  'use strict';
  const ADJ_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/calendario.json';
  const rj = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || '') || f; } catch (e) { return f; } };
  let T = null, ADJ = rj('kodesh_cal_adj', { m: {}, n: {} }), P = null;
  function load() {
    if (!P) P = Promise.all([
      fetch('./data/calendario-biblico.json').then(r => r.json()).then(j => (T = j)),
      fetch(`${ADJ_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
        .then(j => { if (j && j.m) { ADJ = j; try { localStorage.setItem('kodesh_cal_adj', JSON.stringify(j)); } catch (e) {} } }).catch(() => {}),
    ]).then(() => api).catch(() => { P = null; return null; });
    return P;
  }
  const at = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Meses: tarde del avistamiento (e), la predicha (pred) y si pudo verse una tarde antes (p)
  function months(adj = ADJ) { return (T ? T.months : []).map(([e, p]) => ({ pred: e, e: (adj && adj.m && adj.m[e]) || e, p, fixed: !!(adj && adj.m && adj.m[e]) })); }
  function nisanIndex(y, ms, adj = ADJ) {
    const key = (adj && adj.n && adj.n[y]) || (T && T.nisan[y]);
    return ms.findIndex(m => m.pred === key);
  }
  // Día n del mes (de día): el mes empieza la tarde del avistamiento, así que el día n es e + n
  const day = (m, n) => at(m.e, n);
  function year(y, adj = ADJ) {
    if (!T) return null;
    const ms = months(adj), i = nisanIndex(String(y), ms, adj);
    if (i < 1 || i + 9 >= ms.length) return null;
    const N = ms[i], S7 = ms[i + 6], K9 = ms[i + 8], A = ms[i - 1];
    let bik = null;
    for (let n = 15; n <= 21; n++) { const d = day(N, n); if (d.getDay() === 0) { bik = d; break; } }
    const shav = new Date(bik); shav.setDate(bik.getDate() + 49);
    const f = (start, dias, m) => ({ start, dias, m });
    return {
      year: y, nisan: N, tishri: S7,
      pesaj: f(day(N, 14), 1, N), matzot: f(day(N, 15), 7, N), bikurim: f(bik, 1, N), shavuot: f(shav, 1, N),
      terua: f(day(S7, 1), 1, S7), kipur: f(day(S7, 10), 1, S7), sukot: f(day(S7, 15), 8, S7),
      januca: f(day(K9, 25), 8, K9), purim: f(day(A, 14), 1, A),
    };
  }
  // Próxima fecha de una fiesta (o la actual si está en curso)
  function next(id, from = new Date()) {
    const today = new Date(from); today.setHours(0, 0, 0, 0);
    for (let y = today.getFullYear() - 1; y <= today.getFullYear() + 2; y++) {
      const Y = year(y); if (!Y || !Y[id]) continue;
      const { start, dias, m } = Y[id];
      const end = new Date(start); end.setDate(end.getDate() + dias - 1);
      if (end >= today) return { start, end, eve: new Date(start.getTime() - 864e5), now: start <= from, maybeEarlier: !!m.p && !m.fixed, confirmed: m.fixed };
    }
    return null;
  }
  // Fecha bíblica de hoy: mes (1 = Aviv) y día
  function today(from = new Date()) {
    if (!T) return null;
    const ms = months(); const d = new Date(from); d.setHours(12, 0, 0, 0);
    let k = -1; for (let i = 0; i < ms.length; i++) if (at(ms[i].e, 1) <= d) k = i; else break;
    if (k < 0) return null;
    const dayN = Math.round((d - at(ms[k].e, 1)) / 864e5) + 1;
    const y = d.getFullYear(); let ni = nisanIndex(String(y), ms); if (ni > k) ni = nisanIndex(String(y - 1), ms);
    return { month: k - ni + 1, day: dayN };
  }
  const api = { load, year, next, today, months, iso, get data() { return T; }, get adj() { return ADJ; } };
  window.KodeshCal = api;
})();
