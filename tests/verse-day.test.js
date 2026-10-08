import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSES, STEP, parseRef, dayIndex, spokenRef, displayRef, wordTimings, cleanEnrich } from '../api/_verseDay.js';

test('versículo del día: la lista es válida y sin repetidos', () => {
  assert.ok(VERSES.length >= 100);
  assert.equal(new Set(VERSES).size, VERSES.length);
  for (const r of VERSES) assert.ok(parseRef(r), r);
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  assert.equal(gcd(STEP, VERSES.length), 1, 'el salto debe recorrer toda la lista');
});

test('versículo del día: cada pasaje sale una vez por ciclo y la app usa la misma fórmula', () => {
  const seen = new Set();
  const d0 = Date.UTC(2026, 0, 1);
  for (let i = 0; i < VERSES.length; i++) seen.add(dayIndex(new Date(d0 + i * 864e5).toISOString().slice(0, 10)));
  assert.equal(seen.size, VERSES.length);
  const client = fs.readFileSync(new URL('../verse-day.js', import.meta.url), 'utf8');
  assert.match(client, new RegExp(`const STEP = ${STEP};`));
  assert.equal(dayIndex('2026-10-08', 10), ((Math.floor(Date.UTC(2026, 9, 8) / 864e5) * STEP) % 10));
});

test('versículo del día: referencia leída y mostrada', () => {
  assert.equal(spokenRef('Lamentaciones', 3, 22, 23), 'Lamentaciones, capítulo tres, versículos veintidós y veintitrés.');
  assert.equal(spokenRef('Salmos', 23, 1, 3), 'Salmos, capítulo veintitrés, versículos uno al tres.');
  assert.equal(spokenRef('Juan', 3, 16, 16), 'Juan, capítulo tres, versículo dieciséis.');
  assert.equal(displayRef('Lamentaciones', 3, 22, 23), 'Lamentaciones 3:22–23');
  assert.equal(parseRef('PSA 23:1-9'), null, 'pasajes de más de 4 versículos no');
});

test('versículo del día: tiempos por palabra (YHWH se lee Adonai)', () => {
  const display = 'Grande es YHWH hoy';
  const spoken = 'Grande es Adonai hoy … Salmos';
  const chars = [...spoken];
  const alignment = { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) };
  assert.deepEqual(wordTimings(display, alignment, 2.5), [2.5, 3.2, 3.5, 4.2]);
  // sin alineado: proporcional, sin romperse
  assert.equal(wordTimings(display, null, 0).length, 4);
});

test('versículo del día: la palabra clave se valida con Strong’s', () => {
  const items = [{ n: 0, text: 'Nuevas son cada mañana; grande es tu fidelidad.', nt: false }, { n: 1, text: 'Porque de tal manera amó', nt: true }];
  const strongs = { H530: { lemma: 'אֱמוּנָה', xlit: 'ʼĕmûwnâh' }, G25: { lemma: 'ἀγαπάω', xlit: 'agapáō' } };
  const base = { contexto: 'c', pregunta: 'p', oracion: 'o' };
  const out = cleanEnrich({ d: [
    { n: 0, ...base, strong: 'H530', palabra: 'fidelidad' },
    { n: 1, ...base, strong: 'H530', palabra: 'amó' },   // hebreo en el NT: no
    { n: 9, ...base },                                     // no existe
  ] }, items, strongs);
  assert.deepEqual(out[0].word, { strong: 'H530', lemma: 'אֱמוּנָה', xlit: 'ʼĕmûwnâh', es: 'fidelidad' });
  assert.equal(out[1].word, undefined);
  assert.equal(out[9], undefined);
});
