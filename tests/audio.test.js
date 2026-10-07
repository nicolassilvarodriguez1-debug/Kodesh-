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

import { roleFor, voiceFor, validateScript, cleanScript, planCalls } from '../api/_audioScript.js';

test('reparto: personajes con nombre, mujeres y multitudes', () => {
  assert.equal(roleFor('Yeshúa', 'm'), 'yeshua');
  assert.equal(roleFor('Simón Pedro', 'm'), 'pedro');
  assert.equal(roleFor('Juan el Bautista', 'm'), 'juan_bautista');
  assert.equal(roleFor('Tomás', 'm'), 'tomas');
  assert.equal(roleFor('la multitud', 'grupo'), 'narrador');
  assert.equal(roleFor('Los fariseos', 'grupo'), 'narrador');
  const marta = roleFor('Marta', 'f'), maria = roleFor('María', 'f');
  assert.match(marta, /^mujer_[1-4]$/);
  assert.equal(roleFor('Marta', 'f'), marta);   // misma voz siempre
  assert.notEqual(marta, maria);                 // Marta y María suenan distinto
  assert.match(roleFor('Nicodemo', 'm'), /^hombre_[1-4]$/);
});

test('voces: cadena de respaldo hasta el narrador', () => {
  const v = { narrador: 'N', yeshua: 'Y', hombre_1: 'H1' };
  assert.equal(voiceFor('yeshua', v), 'Y');
  assert.equal(voiceFor('pedro', v), 'H1');      // pedro → hombre_1
  assert.equal(voiceFor('mujer_3', v), 'N');     // mujer_3 → mujer_1 → narrador
  assert.equal(voiceFor('juan', v), 'H1');       // juan → hombre_2 → hombre_1
});

test('guion: no se acepta si cambia una palabra; se repara al narrador', () => {
  const verses = { 1: 'Le dijo Nicodemo: ¿Cómo puede ser?', 2: 'Respondió Yeshúa: De cierto te digo.' };
  const good = [
    { v: 1, character: 'narrador', text: 'Le dijo Nicodemo:' }, { v: 1, character: 'Nicodemo', gender: 'm', tags: ['questioning'], text: '¿Cómo puede ser?' },
    { v: 2, character: 'narrador', text: 'Respondió Yeshúa:' }, { v: 2, character: 'Yeshúa', gender: 'm', tags: ['calm', 'nope'], text: 'De cierto te digo.' },
  ];
  assert.equal(validateScript(verses, good).ok, true);
  const bad = good.map(s => s.v === 2 && s.character === 'Yeshúa' ? { ...s, text: 'De verdad te digo.' } : s);
  const chk = validateScript(verses, bad);
  assert.equal(chk.ok, false); assert.deepEqual(chk.bad, [2]);
  const { segments } = cleanScript(verses, bad);
  assert.deepEqual(segments.filter(s => s.v === 2).map(s => s.character), ['narrador']);
  assert.deepEqual(cleanScript(verses, good).segments[3].tags, ['calm']);   // marca no permitida fuera
});

test('llamadas: junta partes seguidas de la misma voz y marca los versículos', () => {
  const segs = [
    { v: 1, character: 'narrador', text: 'Uno.' }, { v: 2, character: 'narrador', text: 'Dijo:' },
    { v: 2, character: 'Yeshúa', gender: 'm', tags: ['calm'], text: 'Paz.' }, { v: 3, character: 'narrador', text: 'Fin.' },
  ];
  const calls = planCalls(segs, { narrador: 'N', yeshua: 'Y' }, { intro: 'Juan, capítulo uno.' });
  assert.deepEqual(calls.map(c => c.voice), ['N', 'Y', 'N']);
  assert.equal(calls[0].text, 'Juan, capítulo uno. Uno. Dijo:');
  assert.deepEqual(calls[0].marks.map(m => m.v), [1, 2]);
  assert.equal(calls[0].text.slice(calls[0].marks[1].at), 'Dijo:');
  assert.equal(calls[1].text, '[calm] Paz.');
  assert.deepEqual(calls[2].marks, [{ v: 3, at: 0 }]);
});

import { cleanSoundtrack, mixPlan, ffmpegArgs, LIBRARY } from '../api/_audioCinema.js';

test('película: banda sonora limpia (claves válidas, sin solapes, topes)', () => {
  const st = cleanSoundtrack({
    ambience: [{ from: 1, to: 3, key: 'mar_calmo' }, { from: 2, to: 5, key: 'templo' }, { from: 4, to: 6, key: 'no_existe' }],
    music: [{ from: 1, to: 6, key: 'm_paz' }, { from: 1, to: 2, key: 'gallo' }],
    sfx: [{ v: 3, key: 'gallo', when: 'end' }, { v: 99, key: 'trueno' }, { v: 2, key: 'm_paz' }],
  }, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(st.ambience, [{ from: 1, to: 3, key: 'mar_calmo' }]);
  assert.deepEqual(st.music, [{ from: 1, to: 6, key: 'm_paz' }]);
  assert.deepEqual(st.sfx, [{ v: 3, key: 'gallo', when: 'end' }]);
  assert.ok(LIBRARY.every(x => ['amb', 'sfx', 'music'].includes(x.kind)));
});

test('película: capas en el tiempo de cada versículo y comando de mezcla', () => {
  const st = { ambience: [{ from: 1, to: 2, key: 'mar_calmo' }], music: [], sfx: [{ v: 2, key: 'gallo', when: 'start' }] };
  const layers = mixPlan(st, [[1, 2], [2, 10], [3, 20]], 30, { gallo: 3 });
  assert.equal(layers.length, 2);
  assert.equal(layers[0].start, 1.5); assert.equal(layers[0].dur, 19.5);   // 1.5 → 21 (fin del v2 + 1 s)
  assert.equal(layers[1].start, 10.2);
  const args = ffmpegArgs('v.mp3', layers, { mar_calmo: 'a.mp3', gallo: 'g.mp3' }, 'o.mp3');
  assert.equal(args.filter(a => a === '-i').length, 3);
  assert.ok(args.join(' ').includes('sidechaincompress'));
  assert.ok(args.includes('-stream_loop'));
});
