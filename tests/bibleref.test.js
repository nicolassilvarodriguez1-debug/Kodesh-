import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../bible-ref.js');
const R = globalThis.KodeshRef;
const f = q => { const r = R.parseRef(q); return r && !r.error ? R.formatRef(r) : r?.error || null; };

test('capítulos y versículos', () => {
  assert.equal(f('juan 1'), 'Juan 1');
  assert.equal(f('Juan 1:1'), 'Juan 1:1');
  assert.equal(f('salmo 23.1-4'), 'Salmos 23:1-4');
  assert.equal(f('mateo cap 5'), 'Mateo 5');
  assert.equal(f('judas 5'), 'Judas 1:5');
});
test('abreviaturas y números de libro', () => {
  assert.equal(f('jn 3:16'), 'Juan 3:16');
  assert.equal(f('1 cor 13'), '1 Corintios 13');
  assert.equal(f('primera de corintios 13'), '1 Corintios 13');
  assert.equal(f('I Juan 1'), '1 Juan 1');
  assert.equal(f('1juan 2'), '1 Juan 2');
  assert.equal(f('san juan 3:16'), 'Juan 3:16');
  assert.equal(f('corintios 13'), '1 Corintios 13');
});
test('errores de ortografía', () => {
  assert.equal(f('genisis 1'), 'Génesis 1');
  assert.equal(f('apocalisis 2'), 'Apocalipsis 2');
  assert.equal(f('deuteronimo 6:4'), 'Deuteronomio 6:4');
  assert.equal(f('filipences 4:13'), 'Filipenses 4:13');
  assert.equal(f('jaun 3:16'), 'Juan 3:16');
  assert.equal(f('ebreos 11'), 'Hebreos 11');
  assert.equal(R.parseRef('genisis 1').how, 'fuzzy');
});
test('capítulo fuera de rango', () => {
  assert.equal(f('salmos 151'), 'chapter');
});
test('palabras comunes no son libros', () => {
  for (const w of ['sal', 'rey', 'dios', 'luz', 'gracia', 'os', 'jesus']) assert.equal(R.parseRef(w), null, w);
});
