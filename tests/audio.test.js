import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberToSpanish, speakable, buildNarration, chunkNarration, mp3Duration, verseTimings } from '../api/_audioCore.js';

test('números en palabras', () => {
  assert.equal(numberToSpanish(3), 'tres');
  assert.equal(numberToSpanish(21), 'veintiuno');
  assert.equal(numberToSpanish(28), 'veintiocho');
  assert.equal(numberToSpanish(40), 'cuarenta');
  assert.equal(numberToSpanish(119), 'ciento diecinueve');
  assert.equal(numberToSpanish(150), 'ciento cincuenta');
});

test('YHWH se lee Adonai', () => {
  assert.equal(speakable('YHWH es mi pastor'), 'Adonai es mi pastor');
  assert.equal(speakable('dijo [a ellos]  YHWH Dios'), 'dijo a ellos Adonai Dios');
});

test('narración: anuncia el capítulo y marca cada versículo', () => {
  const n = buildNarration('Juan', 3, { 1: 'Había un hombre.', 2: 'Este vino de noche.', 10: 'Respondió Yeshúa.' });
  assert.ok(n.text.startsWith('Juan, capítulo tres. Había un hombre.'));
  assert.deepEqual(n.marks.map(m => m.v), [1, 2, 10]);
  for (const m of n.marks) assert.ok(n.text.slice(m.at).startsWith({ 1: 'Había', 2: 'Este', 10: 'Respondió' }[m.v]));
});

test('trozos: cortan al inicio de un versículo y cubren todo el texto', () => {
  const verses = {}; for (let i = 1; i <= 60; i++) verses[i] = `Versículo número ${i} con algo de texto para que sea largo y se parta en varios trozos.`;
  const n = buildNarration('Lucas', 1, verses);
  const ch = chunkNarration(n, 1000);
  assert.ok(ch.length > 3);
  assert.equal(ch.map(c => n.text.slice(c.start, c.end)).join(''), n.text);
  for (const c of ch) { assert.ok(c.text.length <= 1000); if (c.start) assert.ok(n.marks.some(m => m.at === c.start)); }
});

test('duración de MP3 por frames', () => {
  // 10 frames MPEG-1 Layer III, 64 kbps, 44.1 kHz, sin padding: 208 bytes cada uno
  const frame = new Uint8Array(208); frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x50; frame[3] = 0xc4;
  const buf = new Uint8Array(208 * 10); for (let i = 0; i < 10; i++) buf.set(frame, i * 208);
  const d = mp3Duration(buf);
  assert.equal(d.frames, 10);
  assert.ok(Math.abs(d.seconds - 10 * 1152 / 44100) < 1e-9);
});

test('tiempos por versículo con el alineado (y desplazamiento entre trozos)', () => {
  const n = buildNarration('Juan', 1, { 1: 'Uno.', 2: 'Dos.' });
  const ch = chunkNarration(n, 4000);
  const c = ch[0];
  const starts = [...c.text].map((_, i) => i * 0.1);
  const t = verseTimings(n, [{ chunk: c, alignment: { characters: [...c.text], character_start_times_seconds: starts }, offset: 2, duration: 3 }]);
  assert.deepEqual(t.map(x => x[0]), [1, 2]);
  assert.equal(t[0][1], Math.round((2 + (n.marks[0].at - c.start) * 0.1) * 100) / 100);
});
