import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const DATA = JSON.parse(fs.readFileSync(new URL('../data/calendario-biblico.json', import.meta.url), 'utf8'));
async function cal(adj) {
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} }, Date, Promise, JSON, String, Math,
    fetch: async u => ({ ok: true, json: async () => (String(u).includes('calendario-biblico') ? DATA : adj || { m: {}, n: {} }) }) };
  vm.runInNewContext(fs.readFileSync(new URL('../calendario.js', import.meta.url), 'utf8'), ctx);
  await ctx.window.KodeshCal.load();
  return ctx.window.KodeshCal;
}
const iso = d => d.toISOString().slice(0, 10);

test('calendario bíblico: tabla de lunas visibles y Aviv por año', () => {
  assert.ok(DATA.months.length > 250);
  for (let y = 2025; y <= 2045; y++) assert.ok(DATA.nisan[y], `Aviv ${y}`);
  // los meses duran 29 o 30 días
  for (let i = 1; i < DATA.months.length; i++) {
    const d = (Date.parse(DATA.months[i][0]) - Date.parse(DATA.months[i - 1][0])) / 864e5;
    assert.ok(d === 29 || d === 30, `${DATA.months[i][0]}: ${d}`);
  }
});

test('calendario bíblico: fiestas del año', async () => {
  const C = await cal();
  for (let y = 2026; y <= 2040; y++) {
    const Y = C.year(y);
    assert.equal(Y.bikurim.start.getDay(), 0, `Primicias ${y} en domingo`);
    assert.equal(Y.shavuot.start.getDay(), 0, `Shavuot ${y} en domingo`);
    assert.equal((Y.shavuot.start - Y.bikurim.start) / 864e5, 49);
    const d = (Y.bikurim.start - Y.pesaj.start) / 864e5; assert.ok(d >= 1 && d <= 7);
    assert.equal((Y.kipur.start - Y.terua.start) / 864e5, 9);
    assert.equal((Y.sukot.start - Y.terua.start) / 864e5, 14);
    assert.ok(Y.purim.start < Y.pesaj.start && (Y.pesaj.start - Y.purim.start) / 864e5 < 32);
    assert.equal(Y.pesaj.start.getMonth() >= 2 && Y.pesaj.start.getMonth() <= 3, true, `Pésaj ${y} en marzo/abril`);
  }
  assert.equal(iso(C.year(2026).pesaj.start), '2026-04-03');
});

test('calendario bíblico: ajustes del admin (luna vista otro día y cebada no aviv)', async () => {
  const base = await cal();
  const k = DATA.nisan['2027'];
  const plus = new Date(k + 'T12:00:00'); plus.setDate(plus.getDate() + 1);
  const C = await cal({ m: { [k]: iso(plus) }, n: {} });
  assert.equal((C.year(2027).pesaj.start - base.year(2027).pesaj.start) / 864e5, 1);
  const i = DATA.months.findIndex(m => m[0] === k);
  const L = await cal({ m: {}, n: { 2027: DATA.months[i + 1][0] } });
  const gap = (L.year(2027).pesaj.start - base.year(2027).pesaj.start) / 864e5;
  assert.ok(gap === 29 || gap === 30);
});
