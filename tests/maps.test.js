import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const BIBLE = read('../biblia-rvr.json');
const PL = read('../data/lugares.json');
const TRIPS = read('../data/viajes.json');
const BASE = read('../data/mapa-base.json');

test('mapas: cada lugar marcado está de verdad en su versículo', () => {
  let n = 0;
  for (const [k, list] of Object.entries(PL.v)) {
    const [b, c] = k.split(':');
    for (const [v, id, form] of list) {
      assert.ok(PL.p[id], `lugar ${id}`);
      assert.ok(BIBLE[b][c][String(v)].includes(form), `${k}:${v} ${form}`);
      n++;
    }
  }
  assert.ok(n > 5000);
  const jer = Object.values(PL.p).find(p => p[0] === 'Jerusalem');
  assert.ok(Math.abs(jer[1] - 35.23) < 0.05 && Math.abs(jer[2] - 31.78) < 0.05, 'Jerusalén en su lugar');
});

test('mapas: rutas con referencias reales y dentro del mapa base', () => {
  for (const j of TRIPS.j) {
    assert.ok(j.stops.length >= 2, j.id);
    for (const s of j.stops) {
      const m = /^(\w+) (\d+):(\d+)$/.exec(s.r);
      assert.ok(m && BIBLE[m[1]][m[2]][m[3]], `${j.id} ${s.r}`);
      if (j.id !== 'jonas') assert.ok(s.ll[0] > 8 && s.ll[0] < 52 && s.ll[1] > 21 && s.ll[1] < 45, `${j.id} ${s.n} fuera del mapa`);
    }
  }
  assert.ok(BASE.land.length > 50 && BASE.lakes.some(l => l.n === 'Mar de Galilea'));
});
