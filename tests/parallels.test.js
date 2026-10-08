import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { passage, comparable, cleanParallels } from '../api/_parallels.js';

const DATA = JSON.parse(fs.readFileSync(new URL('../data/paralelos.json', import.meta.url), 'utf8'));
const BIBLE = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8'));

test('paralelos: todas las referencias existen y los títulos están', () => {
  assert.ok(DATA.events.length > 300);
  for (const e of DATA.events) {
    assert.ok(e.t && !/Jesus|Jesús/.test(e.t), `título ${e.id}`);
    for (const [g, refs] of Object.entries(e.r)) for (const r of refs) assert.ok(passage(BIBLE, g, r).length > 0, `${e.id} ${g} ${r}`);
  }
  const five = DATA.events.find(e => e.id === 146);
  assert.deepEqual(Object.keys(five.r).sort(), ['JHN', 'LUK', 'MAT', 'MRK']);
  assert.ok(comparable(five));
  assert.ok(!comparable(DATA.events.find(e => e.id === 22)), 'Caná: solo Juan');
});

test('paralelos: solo se guardan frases que están en el versículo', () => {
  const lines = passage(BIBLE, 'JHN', [6, 1, 6, 15]);
  const v9 = lines.find(([c, v]) => c === 6 && v === 9)[2];
  const real = v9.split(' ').slice(3, 8).join(' ');
  const items = [{ id: 146, texts: [['JHN', lines], ['MAT', passage(BIBLE, 'MAT', [14, 13, 14, 21])]] }];
  const out = cleanParallels({ d: [{ id: 146, coinciden: 'Cinco panes y dos peces', u: {
    JHN: [{ ref: '6:9', frase: real, nota: 'El muchacho' }, { ref: '6:9', frase: 'panes de trigo dorado', nota: 'inventado' }, { ref: '7:1', frase: real, nota: 'fuera del pasaje' }],
    MAT: [{ ref: '14:21', frase: 'sin', nota: 'muy corta' }],
  } }] }, items);
  assert.equal(out[146].u.JHN.length, 1);
  assert.equal(out[146].u.JHN[0].v, 9);
  assert.equal(out[146].u.MAT, undefined);
  assert.equal(out[146].c, 'Cinco panes y dos peces');
});
