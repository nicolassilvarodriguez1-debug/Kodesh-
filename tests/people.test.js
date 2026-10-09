import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanPeople, hasNumber, parseRef } from '../api/_people.js';

const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const BIBLE = read('../biblia-rvr.json');
const DATA = read('../data/personas.json');
const STRONGS = { ...read('../strongs-hebrew.json'), ...read('../strongs-greek.json') };

test('personas: los nombres están en sus versículos y los parentescos apuntan a personas reales', () => {
  for (const b of ['GEN', 'EXO', 'ACT']) {
    const byCh = read(`../data/personas/${b}.json`);
    for (const [c, list] of Object.entries(byCh)) for (const [v, id, form] of list) {
      assert.ok(DATA.p[id], id);
      assert.ok(BIBLE[b][c][String(v)].includes(form), `${b} ${c}:${v} ${form}`);
    }
  }
  for (const [id, r] of Object.entries(DATA.r)) for (const ids of Object.values(r)) for (const x of ids) assert.ok(DATA.p[x], `${id} → ${x}`);
  assert.equal(DATA.p.abraham_58[0], 'Abraham');
  assert.equal(DATA.p.israel_682[0], 'Jacob');
  assert.equal(DATA.p.peter_2745[0], 'Pedro');
  assert.deepEqual(DATA.r.isaac_616.pa, ['abraham_58']);
});

test('personas: edades solo si el versículo las dice', () => {
  assert.ok(hasNumber(BIBLE.GEN['12']['4'], 75));
  assert.ok(hasNumber(BIBLE.GEN['25']['7'], 175));
  assert.ok(hasNumber(BIBLE.GEN['21']['5'], 100));
  assert.ok(!hasNumber(BIBLE.GEN['12']['4'], 80));
  assert.deepEqual(parseRef('GEN 22:1-14'), { book: 'GEN', c: 22, v1: 1, v2: 14 });
});

test('personas: la ficha se valida (Strong\'s, capítulos y edades)', () => {
  const items = [{ id: 'abraham_58', en: 'Abraham', alias: ['Abraham'], chapters: new Set(DATA.p.abraham_58[4]) }];
  const out = cleanPeople({ d: [{ id: 'abraham_58', strong: 'H85', sig: 'padre de una multitud', resumen: 'Patriarca.',
    momentos: [{ ref: 'GEN 12:1', t: 'El llamado' }, { ref: 'EXO 20:1', t: 'No estuvo ahí' }, { ref: 'GEN 22:1-14', t: 'La cita «inventada aquí»' }],
    edades: [{ edad: 75, ref: 'GEN 12:4', t: 'Sale de Harán' }, { edad: 80, ref: 'GEN 12:4', t: 'Falso' }] }] }, items, BIBLE, STRONGS);
  const a = out.abraham_58;
  assert.equal(a.heb.lemma, STRONGS.H85.lemma);
  assert.deepEqual(a.momentos.map(m => m.ref), ['GEN 12:1']);
  assert.deepEqual(a.edades.map(x => x.edad), [75]);
  const bad = cleanPeople({ d: [{ id: 'abraham_58', strong: 'H1', resumen: 'x' }] }, items, BIBLE, STRONGS);
  assert.equal(bad.abraham_58.heb, undefined, 'Strong\'s de otra palabra no se acepta');
});

test('personas: edición en inglés alineada con lo que pasó la validación', () => {
  const items = [{ id: 'abraham_58', en: 'Abraham', alias: ['Abraham'], chapters: new Set(DATA.p.abraham_58[4]) }];
  const raw = { d: [{ id: 'abraham_58', strong: 'H85', sig: 'padre de una multitud', sig_en: 'father of a multitude', resumen: 'Patriarca.', resumen_en: 'Patriarch of Jesus\' people.',
    momentos: [{ ref: 'GEN 12:1', t: 'El llamado', t_en: 'The call' }, { ref: 'EXO 20:1', t: 'No estuvo ahí', t_en: 'Not there' }],
    edades: [{ edad: 75, ref: 'GEN 12:4', t: 'Sale de Harán', t_en: 'Leaves Haran' }] }] };
  const a = cleanPeople(raw, items, BIBLE, STRONGS).abraham_58;
  assert.deepEqual(a.en, { resumen: 'Patriarch of Yeshua\' people.', sig: 'father of a multitude', momentos: ['The call'], edades: ['Leaves Haran'] });
  assert.equal(a.momentos[0].ten, undefined);
  raw.d[0].momentos[0].t_en = 'El llamado';                                   // un texto en español → sin edición en inglés
  assert.equal(cleanPeople(raw, items, BIBLE, STRONGS).abraham_58.en, undefined);
});
