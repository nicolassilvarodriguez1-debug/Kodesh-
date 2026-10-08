import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, inParasha, quotesOk, cleanGroups } from '../api/_groups.js';

const P = { num: 1, book: 'GEN', startChapter: 1, startVerse: 1, endChapter: 6, endVerse: 8 };
const BIBLE = { GEN: { 1: { 1: 'a', 2: 'b', 31: 'z' }, 2: { 3: 'c', 7: 'd' }, 3: { 9: 'e' }, 4: { 7: 'f' }, 6: { 8: 'g', 9: 'h' } } };
const TEXT = 'GEN 3:9 Y YHWH Elohim llamó al hombre, y le dijo: ¿Dónde estás tú?\nGEN 4:7 el pecado está a la puerta';

test('grupos: rangos y límites de la porción', () => {
  assert.deepEqual(parseRange('GEN 1:1-2:3'), { book: 'GEN', c1: 1, v1: 1, c2: 2, v2: 3 });
  assert.deepEqual(parseRange('GEN 3:9'), { book: 'GEN', c1: 3, v1: 9, c2: 3, v2: 9 });
  assert.equal(parseRange('GEN 3:9-2'), null);
  assert.ok(inParasha(parseRange('GEN 6:8'), P));
  assert.ok(!inParasha(parseRange('GEN 6:9'), P), 'Gn 6:9 ya es Noaj');
  assert.ok(!inParasha(parseRange('EXO 1:1'), P));
});

test('grupos: las citas entre «» deben estar en el texto', () => {
  const n = s => s.toLowerCase().replace(/[«»“”"'.,;:¿?¡!()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
  assert.ok(quotesOk('«¿Dónde estás tú?» ¿Por qué pregunta?', n(TEXT)));
  assert.ok(!quotesOk('«¿Dónde te escondiste?»', n(TEXT)));
  assert.ok(quotesOk('Sin citas', n(TEXT)));
});

test('grupos: limpia, valida y descarta lo inventado', () => {
  const q = (t, ref) => ({ q: t, ref });
  const raw = {
    central: q('«¿Dónde estás tú?»', 'GEN 3:9'),
    adultos: [q('Uno', 'GEN 1:1'), q('Dos', 'GEN 2:7'), q('«¿Dónde estás tú?» ¿Por qué?', 'GEN 3:9'), q('Fuera', 'GEN 6:9'), q('Cita falsa «hágase la luz y fue»', 'GEN 1:2')],
    jovenes: [q('J1', 'GEN 4:7'), q('J2', 'GEN 1:31')],
    ninos: [q('N1'), q('N2', 'GEN 99:1')],
    lectura: { ref: 'GEN 1:1-2:3', nota: 'La creación' },
    conexion: 'Juan 1 retoma Génesis 1.',
  };
  const { data, error } = cleanGroups(raw, P, BIBLE, TEXT);
  assert.equal(error, undefined);
  assert.deepEqual(data.adultos.map(x => x.q), ['Uno', 'Dos', '«¿Dónde estás tú?» ¿Por qué?']);
  assert.deepEqual(data.ninos, [{ q: 'N1' }, { q: 'N2' }], 'en niños la referencia mala se quita, la pregunta queda');
  assert.equal(data.central.ref, 'GEN 3:9');
  assert.equal(data.lectura.ref, 'GEN 1:1-2:3');
  assert.ok(cleanGroups({ adultos: [] }, P, BIBLE, TEXT).error);
});
