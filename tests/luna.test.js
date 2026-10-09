import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadCalendar } from '../api/_calendar.js';
import { buildIcs } from '../api/calendario-ics.js';
import { cleanCalendarAdj } from '../api/admin.js';

function luna() {
  const ctx = { window: {}, document: { createElement: () => ({ set textContent(v) {} }), head: { appendChild() {} } }, localStorage: { getItem: () => null, setItem() {} }, Date, Math, JSON, String };
  vm.runInNewContext(fs.readFileSync(new URL('../luna.js', import.meta.url), 'utf8'), ctx);
  return ctx.window.KodeshLuna;
}

test('luna: fase en lunas nuevas y llenas conocidas', () => {
  const L = luna();
  for (const t of ['2026-10-10T15:50Z', '2026-03-19T01:23Z', '2027-01-07T20:24Z']) {
    const i = L.illum(new Date(t)); assert.ok(i.fraction < 0.01, `${t}: ${i.fraction}`); assert.equal(L.phaseName(i.phase), 'Luna nueva');
  }
  for (const t of ['2026-10-26T04:12Z', '2026-05-01T17:23Z']) {
    const i = L.illum(new Date(t)); assert.ok(i.fraction > 0.99, `${t}: ${i.fraction}`); assert.equal(L.phaseName(i.phase), 'Luna llena');
  }
  const w = L.illum(new Date('2026-10-14T12:00Z')); assert.ok(w.phase > 0.03 && w.phase < 0.25, 'creciente después de la nueva');
});

test('calendario: meses numerados, duración y confirmación del admin', async () => {
  const C = await loadCalendar({ m: {}, n: {} });
  const k = C.indexOf(new Date('2026-10-08T12:00:00')), M = C.monthAt(k);
  assert.equal(M.num, 7); assert.equal(C.iso(M.start), '2026-09-14'); assert.ok(M.len === 29 || M.len === 30);
  assert.deepEqual({ ...C.monthName(1) }, { ord: 'Primer mes', old: 'Aviv' });
  const nisan = C.months().findIndex(m => m.pred === C.data.nisan['2027']);
  assert.equal(C.monthNum(nisan), 1); assert.equal(C.monthNum(nisan - 1) >= 12, true);
  // confirmar sin mover la fecha
  const pred = C.months()[k + 1].pred;
  const C2 = await loadCalendar(cleanCalendarAdj({ m: {}, n: {}, c: { [pred]: true, malo: true } }));
  assert.equal(C2.months()[k + 1].fixed, true); assert.equal(C2.months()[k + 1].e, pred);
  assert.deepEqual(Object.keys(cleanCalendarAdj({ c: { [pred]: true, x: 1 } }).c), [pred]);
});

test('ics: fiestas y lunas, formato válido', async () => {
  const C = await loadCalendar({ m: {}, n: {} });
  const s = buildIcs(C, { from: new Date('2026-10-08T12:00:00') });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n') && s.endsWith('END:VCALENDAR\r\n'));
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, (s.match(/END:VEVENT/g) || []).length);
  assert.ok(s.includes('UID:sukot-2026@kodeshbible.com'));
  assert.ok(/DTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20261006/.test(s), 'Sukot 2026, 8 días');
  for (const line of s.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const solo = buildIcs(C, { meses: false, from: new Date('2026-10-08T12:00:00') });
  assert.ok(!solo.includes('UID:mes-'));
});
