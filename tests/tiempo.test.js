import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const D = JSON.parse(fs.readFileSync(new URL('../data/linea-tiempo.json', import.meta.url), 'utf8'));
const BIB = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8'));
function tiempo() {
  const ctx = { window: {}, document: { createElement: () => ({ set textContent(v) {} }), head: { appendChild() {} }, documentElement: { classList: { toggle() {} } }, getElementById: () => null, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, fetch: async () => ({ json: async () => D }), setTimeout, Promise, JSON, String, Math, Number };
  vm.runInNewContext(fs.readFileSync(new URL('../tiempo.js', import.meta.url), 'utf8'), ctx);
  return ctx.window.KodeshTiempo;
}

test('línea de tiempo: cada capítulo de la Biblia tiene época o nota', async () => {
  const T = tiempo(); await T.load();
  for (const b of Object.keys(BIB)) for (const c of Object.keys(BIB[b])) {
    const w = T.where(b, +c);
    assert.ok(w && (w.era || w.note), `${b} ${c}`);
  }
  assert.equal(T.where('GEN', 12).id, 'patriarcas');
  assert.equal(T.where('1KI', 12).id, 'dividido');
  assert.equal(T.where('PSA', 51).id, 'reino');
  assert.equal(T.where('PSA', 1).id, null);
  assert.equal(T.where('JER', 52).id, 'exilio');
});

test('línea de tiempo: profetas, salmos con historia y edades', () => {
  for (const p of D.prophets) for (const k of p[3]) assert.ok(D.reigns.includes(k), k);
  assert.equal(D.pshist.length, 12);
  const ages = Object.fromEntries(D.lives.flatMap(g => g[1]).map(([n, a]) => [n, a]));
  assert.equal(ages['Matusalén'], 969); assert.equal(ages['Moisés'], 120); assert.equal(ages['Abraham'], 175);
});

test('línea de tiempo: ¿quién vivía? — años sumados del texto', () => {
  const G = Object.fromEntries(D.gen.people.map(p => [p[0], p]));
  assert.equal(G['Matusalén'][2], 1656);           // murió el año del diluvio
  assert.equal(G['Noé'][1] + 600, 1656);           // Gn 7:6
  assert.equal(G['Abraham'][1], 1948);
  assert.equal(G['Lamec'][1] < G['Adán'][2], true); // Lamec conoció a Adán
  for (const [n, b, d] of D.gen.people) assert.ok(d > b, n);
});
