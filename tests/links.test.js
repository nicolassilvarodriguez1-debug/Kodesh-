import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRef, parseLinks } from '../api/_links.js';

const BIBLE = { ISA: { '7': { '14': 'Por tanto el mismo Señor os dará señal…', '15': 'x' } }, PSA: { '22': { '1': 'Dios mío…' } } };

test('red bíblica: referencias del Tanaj que existen', () => {
  assert.deepEqual(parseRef('ISA 7:14', BIBLE), { book: 'ISA', chapter: 7, verse: 14, verseEnd: null });
  assert.deepEqual(parseRef('isa 7:14-15', BIBLE), { book: 'ISA', chapter: 7, verse: 14, verseEnd: 15 });
  assert.equal(parseRef('ISA 7:99', BIBLE), null);
  assert.equal(parseRef('MAT 1:23', BIBLE), null);        // el NT no cuenta como fuente
  assert.equal(parseRef('Isaías 7:14', BIBLE), null);
});

test('red bíblica: solo conexiones válidas y frases que están en el versículo', () => {
  const src = { '22': 'Todo esto aconteció para que se cumpliese lo que fué dicho por el Señor, por el profeta que dijo,', '23': 'He aquí la virgen concebirá y parirá un hijo, Y llamarás su nombre Emmanuel' };
  const raw = JSON.stringify({ l: [
    { v: 23, ref: 'ISA 7:14', kind: 'cumplimiento', phrase: 'He aquí la virgen concebirá', note: 'Cumple lo dicho sobre Jesús' },
    { v: 23, ref: 'ISA 7:14', kind: 'cita' },                        // repetida
    { v: 23, ref: 'PSA 22:1', kind: 'rara', phrase: 'no está en el texto' },
    { v: 99, ref: 'ISA 7:14' },                                       // versículo que no existe
    { v: 22, ref: 'ZEC 9:9' },                                        // no existe en esta Biblia de prueba
  ] });
  const rows = parseLinks(raw, 'MAT', 1, src, BIBLE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].phrase, 'He aquí la virgen concebirá');
  assert.match(rows[0].note, /Yeshúa/);
  assert.equal(rows[1].kind, 'alusion');
  assert.equal(rows[1].phrase, null);
  assert.equal(parseLinks('no es json', 'MAT', 1, src, BIBLE), null);
});

test('red bíblica: nota en inglés con nombres mesiánicos y sin español', () => {
  const src = { '23': 'He aquí la virgen concebirá y parirá un hijo' };
  const raw = JSON.stringify({ l: [
    { v: 23, ref: 'ISA 7:14', kind: 'cumplimiento', note: 'Isaías…', note_en: 'Fulfilled in Jesus Christ, as the LORD said.' },
    { v: 23, ref: 'ISA 7:15', kind: 'alusion', note: 'Eco', note_en: 'Eco de Isaías' },
  ] });
  const rows = parseLinks(raw, 'MAT', 1, src, BIBLE);
  assert.equal(rows[0].note_en, 'Fulfilled in Yeshua Messiah, as YHWH said.');
  assert.equal(rows[1].note_en, null);   // tenía español → no se muestra en inglés
});
