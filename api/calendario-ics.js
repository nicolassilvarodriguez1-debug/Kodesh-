// KODESH — Suscripción de calendario (.ics) con el calendario bíblico observado:
// las siete fiestas de Levítico 23 y el comienzo de cada mes (luna nueva vista
// desde Jerusalén). Mismas fechas que la app (api/_calendar.js) y se actualiza
// sola cuando el admin ajusta un mes. Eventos de día completo; cada uno dice
// que comienza al atardecer de la víspera.
//   GET /api/calendario-ics            fiestas + meses
//   GET /api/calendario-ics?meses=0    solo fiestas
// Público, sin datos de usuario.
import { loadCalendar } from './_calendar.js';

const FEASTS = [
  ['pesaj', 'Pésaj', 'Pascua del Señor', 'Levítico 23:5'],
  ['matzot', 'Panes sin levadura', 'Jag HaMatzot', 'Levítico 23:6-8'],
  ['bikurim', 'Primicias', 'Yom HaBikurim', 'Levítico 23:9-14'],
  ['shavuot', 'Shavuot', 'Fiesta de las Semanas · Pentecostés', 'Levítico 23:15-21'],
  ['terua', 'Yom Terúa', 'Día de las Trompetas', 'Levítico 23:23-25'],
  ['kipur', 'Yom Kipur', 'Día de la Expiación', 'Levítico 23:26-32'],
  ['sukot', 'Sukot', 'Fiesta de los Tabernáculos', 'Levítico 23:33-43'],
];

// Inglés (/calendar-en.ics → ?lang=en): mismos eventos, textos en inglés
const FEASTS_EN = {
  pesaj: ['Pesach', "YHWH's Passover", 'Leviticus 23:5'], matzot: ['Unleavened Bread', 'Chag HaMatzot', 'Leviticus 23:6-8'],
  bikurim: ['Firstfruits', 'Yom HaBikkurim', 'Leviticus 23:9-14'], shavuot: ['Shavuot', 'Feast of Weeks · Pentecost', 'Leviticus 23:15-21'],
  terua: ['Yom Teruah', 'Day of Trumpets', 'Leviticus 23:23-25'], kipur: ['Yom Kippur', 'Day of Atonement', 'Leviticus 23:26-32'],
  sukot: ['Sukkot', 'Feast of Tabernacles', 'Leviticus 23:33-43'],
};
const ORD_EN = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth'];
const OLD_EN = { Aviv: 'Aviv', Ziv: 'Ziv', Etanim: 'Ethanim', Bul: 'Bul' };
const longDateEn = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const escTxt = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
// Líneas de máx. 75 octetos (RFC 5545)
function fold(line) {
  const out = []; let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const longDate = d => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function buildIcs(C, { meses = true, from = new Date(), lang = 'es' } = {}) {
  const en = lang === 'en';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  const add = (uid, start, days, summary, desc) => ev.push([
    'BEGIN:VEVENT', `UID:${uid}@kodeshbible.com`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(plus(start, days))}`,
    `SUMMARY:${escTxt(summary)}`, `DESCRIPTION:${escTxt(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT',
  ].map(fold).join('\r\n'));
  const y0 = from.getFullYear() - 1;
  for (let y = y0; y <= y0 + 4; y++) {
    const Y = C.year(y); if (!Y) continue;
    for (const [id, n, alt, ref] of FEASTS) {
      const f = Y[id]; if (!f) continue;
      const eve = plus(f.start, -1);
      if (en) {
        const [ne, ae, re] = FEASTS_EN[id];
        add(`${id}-${y}`, f.start, f.dias, `${ne} · ${ae}`,
          `Begins at sunset on ${longDateEn(eve)} (${re}).\nObserved biblical calendar: new moon seen from Jerusalem.${f.m && f.m.p && !f.m.fixed ? '\nIf the moon is seen one evening earlier, it moves one day earlier.' : ''}\nKodesh Bible · kodeshbible.com`);
        continue;
      }
      add(`${id}-${y}`, f.start, f.dias, `${n} · ${alt}`,
        `Comienza al atardecer del ${longDate(eve)} (${ref}).\nCalendario bíblico observado: luna nueva vista desde Jerusalén.${f.m && f.m.p && !f.m.fixed ? '\nSi la luna se ve una tarde antes, se adelanta un día.' : ''}\nKodesh Bible · kodeshbible.com`);
    }
  }
  if (meses) {
    const ms = C.months(), lo = new Date(y0, 0, 1), hi = new Date(y0 + 5, 0, 1);
    ms.forEach((m, k) => {
      const M = C.monthAt(k); if (!M || M.start < lo || M.start > hi) return;
      const nm = C.monthName(M.num);
      if (en) {
        add(`mes-${m.pred}`, M.start, 1, `🌙 ${ORD_EN[M.num] || M.num + 'th'} month${nm.old ? ` · ${OLD_EN[nm.old] || nm.old}` : ''}`,
          `New moon ${m.fixed ? 'seen' : 'expected'} from Jerusalem on the evening of ${longDateEn(plus(M.start, -1))}. The month begins at sunset.${m.p && !m.fixed ? '\nIt could be seen one evening earlier.' : ''}\nKodesh Bible · kodeshbible.com`);
        return;
      }
      add(`mes-${m.pred}`, M.start, 1, `🌙 ${nm.ord}${nm.old ? ` · ${nm.old}` : ''}`,
        `Luna nueva ${m.fixed ? 'vista' : 'esperada'} desde Jerusalén la tarde del ${longDate(plus(M.start, -1))}. El mes comienza al atardecer.${m.p && !m.fixed ? '\nPodría verse una tarde antes.' : ''}\nKodesh Bible · kodeshbible.com`);
    });
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', en ? 'PRODID:-//Kodesh Bible//Biblical calendar//EN' : 'PRODID:-//Kodesh Bible//Calendario bíblico//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(en ? 'X-WR-CALNAME:Kodesh · Feasts and new moons' : 'X-WR-CALNAME:Kodesh · Fiestas y lunas'), 'X-WR-TIMEZONE:UTC', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
    ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  try {
    const C = await loadCalendar();
    const meses = String((req.query && req.query.meses) ?? '1') !== '0';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="kodesh-calendario.ics"');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    const lang = String((req.query && req.query.lang) || '') === 'en' ? 'en' : 'es';
    return res.status(200).send(buildIcs(C, { meses, lang }));
  } catch (err) {
    console.error('calendario-ics', err);
    return res.status(500).send('Error');
  }
}
