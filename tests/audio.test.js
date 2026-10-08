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
  assert.ok(LIBRARY.every(x => ['amb', 'sfx', 'music', 'theme', 'bridge', 'sting', 'motif'].includes(x.kind)));
  assert.equal(new Set(LIBRARY.map(x => x.key)).size, LIBRARY.length);
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

import { radioTimeline, radioPlan, divineSpans, SOUNDTRACK_VERSION, LEVELS } from '../api/_audioCinema.js';

test('radionovela: escenas, silencios y música que cubre todo el capítulo', () => {
  const st = cleanSoundtrack({
    scenes: [{ v: 3, bridge: 'puente_asombro' }, { v: 1, bridge: 'puente_drama' }, { v: 5, bridge: 'no_existe' }],
    pauses: [{ v: 3, s: 2 }, { v: 4, s: 9 }],
    music: [{ from: 2, to: 3, key: 'm_creacion' }, { from: 5, to: 5, key: 'm_paz' }],
    stings: [{ v: 4, key: 'golpe_juicio' }, { v: 4, key: 'gallo' }],
  }, [1, 2, 3, 4, 5, 6]);
  assert.equal(st.v, SOUNDTRACK_VERSION);
  assert.deepEqual(st.scenes, [{ v: 3, bridge: 'puente_asombro' }, { v: 5, bridge: 'puente_solemne' }]);
  assert.deepEqual(st.pauses, [{ v: 4, s: 3 }]);                 // el v3 ya es escena; tope 3 s
  assert.deepEqual(st.music, [{ from: 1, to: 4, key: 'm_creacion' }, { from: 5, to: 6, key: 'm_paz' }]);
  assert.deepEqual(st.stings, [{ v: 4, key: 'golpe_juicio', when: 'start' }]);
});

test('radionovela: la voz se abre en silencios y los tiempos se corren', () => {
  const st = { scenes: [{ v: 2, bridge: 'puente_solemne' }], pauses: [{ v: 3, s: 1.5 }], ambience: [], music: [], sfx: [], stings: [] };
  const tl = radioTimeline([[1, 2], [2, 10], [3, 20]], 30, st);
  assert.deepEqual(tl.pieces.map(p => [p.from, p.to, p.at]), [[0, 9.95, 7], [9.95, 19.95, 20.45], [19.95, 30, 31.95]]);
  assert.deepEqual(tl.timings, [[1, 9], [2, 20.5], [3, 32]]);
  assert.equal(tl.voiceEnd, 42); assert.equal(tl.total, 51);
  const segs = [{ v: 1, character: 'narrador', text: 'Y dijo:' }, { v: 1, character: 'Elohim', text: 'Sea la luz y fue.' }];
  const dv = divineSpans(segs, [[1, 2], [2, 10]], 12, null);
  assert.equal(dv.length, 1); assert.ok(dv[0][0] > 2 && dv[0][1] <= 10.01);
  const layers = radioPlan(st, tl, dv, {});
  const keys = layers.map(l => l.key);
  for (const k of ['sintonia', 'cierre', 'puente_solemne', 'tema_divino']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes('m_paz'));
  const motif = layers.find(l => l.key === 'tema_divino');
  assert.equal(motif.bus, 'motif');
  const args = ffmpegArgs('v.mp3', layers, { sintonia: 's.mp3', cierre: 'c.mp3', puente_solemne: 'p.mp3', tema_divino: 't.mp3' }, 'o.mp3', { pieces: tl.pieces, total: tl.total, divine: dv.map(([a, b]) => [tl.map(a), tl.map(b)]) });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(fc.includes('asplit=3[p0][p1][p2]'));
  assert.ok(fc.includes('[motif]'));
  assert.ok(fc.includes("volume=enable='between("));
});

import { holdPoints, parseSilences } from '../api/_audioCinema.js';

test('radionovela: el efecto «hold» detiene la voz tras las palabras indicadas, en un silencio', () => {
  const sil = parseSilences('[silencedetect @ 0x1] silence_start: 5.1\n[silencedetect @ 0x1] silence_end: 5.6 | silence_duration: 0.5\n[silencedetect @ 0x1] silence_start: 9.7\n[silencedetect @ 0x1] silence_end: 10.1 | silence_duration: 0.4');
  assert.deepEqual(sil, [[5.1, 5.6], [9.7, 10.1]]);
  const segs = [{ v: 1, character: 'narrador', text: 'Y dijo Elohim: júntense las aguas, y fue así.' }, { v: 1, character: 'narrador', text: 'Y vio Elohim que era bueno.' }];
  const st = cleanSoundtrack({ scenes: [], sfx: [{ v: 1, key: 'aguas_separan', hold: 3, after: 'y fue así' }, { v: 1, key: 'gallo', hold: 9 }] }, [1, 2]);
  assert.deepEqual(st.sfx[0], { v: 1, key: 'aguas_separan', when: 'start', hold: 3, after: 'y fue así' });
  assert.equal(st.sfx[1].hold, 9);
  const holds = holdPoints({ sfx: [st.sfx[0]] }, segs, [[1, 0], [2, 10]], 15, sil);
  assert.deepEqual(holds, [{ v: 1, keys: ['aguas_separan'], dur: 3, at: 5.3 }]);
  const tl = radioTimeline([[1, 0], [2, 10]], 15, { scenes: [{ v: 2, bridge: 'puente_solemne' }] }, { holds });
  assert.deepEqual(tl.gaps.map(g => [g.kind, g.at, g.dur]), [['hold', 12.3, 3], ['scene', 19.95, 3.5]]);
  assert.deepEqual(tl.timings, [[1, 7], [2, 23.5]]);
  const layers = radioPlan({ sfx: st.sfx.slice(0, 1) }, tl, [], { aguas_separan: 6 });
  const fx = layers.find(l => l.key === 'aguas_separan');
  assert.equal(fx.start, 12.05); assert.equal(fx.gain, LEVELS.hold);
});

test('radionovela: varias capas en una misma escena «hold» (batalla de 6 s)', () => {
  const st = cleanSoundtrack({ scenes: [], sfx: [
    { v: 2, key: 'choque_espadas', hold: 6, after: 'y pelearon' }, { v: 2, key: 'gritos_batalla', hold: 6, after: 'y pelearon' }, { v: 2, key: 'batalla', hold: 5, after: 'y pelearon' },
  ] }, [1, 2, 3]);
  assert.equal(st.sfx.length, 3);
  const segs = [{ v: 2, character: 'narrador', text: 'Salieron los reyes y pelearon. Y huyeron.' }];
  const holds = holdPoints(st, segs, [[1, 0], [2, 4], [3, 12]], 20, [[8.5, 9.1]]);
  assert.deepEqual(holds.map(h => [h.keys, h.dur]), [[['choque_espadas', 'gritos_batalla', 'batalla'], 6]]);
  const tl = radioTimeline([[1, 0], [2, 4], [3, 12]], 20, st, { holds });
  const layers = radioPlan(st, tl, [], { choque_espadas: 4, gritos_batalla: 6 }).filter(l => ['choque_espadas', 'gritos_batalla', 'batalla'].includes(l.key));
  assert.equal(layers.length, 3);
  assert.ok(layers.find(l => l.key === 'batalla').loop);
  assert.deepEqual(tl.timings.map(x => x[0]), [1, 2, 3]);
  assert.equal(tl.timings[2][1], 12 + 7 + 6);
});

import { pickVariant } from '../api/_audioCinema.js';
test('variantes: cada repetición usa otra grabación y solo las que existen', () => {
  const av = new Set(['llanto', 'llanto~2', 'llanto~3']);
  const picks = [0, 1, 2].map(i => pickVariant('llanto', av, 'GEN.23', i));
  assert.equal(new Set(picks).size, 3);
  assert.equal(pickVariant('llanto', new Set(['llanto']), 'GEN.23', 1), 'llanto');
  assert.equal(pickVariant('trueno', new Set(['trueno', 'trueno~3']), 'X', 0) !== undefined, true);
  assert.ok(LIBRARY.some(x => x.key === 'choque_espadas~3' && x.kind === 'sfx'));
});

test('radionovela: látigos y martillazos se repiten, y el fondo de la acción suena mientras pasa', () => {
  const st = cleanSoundtrack({ scenes: [], action: [{ from: 2, to: 3, key: 'obra_esclavos' }, { from: 2, to: 3, key: 'viento_desierto' }],
    sfx: [{ v: 2, key: 'latigazo', repeat: 5, every: 1.5 }, { v: 3, key: 'martillazo', repeat: 20, every: 0.1, hold: 4, after: 'y trabajaban' }] }, [1, 2, 3]);
  assert.deepEqual(st.action, [{ from: 2, to: 3, key: 'obra_esclavos' }], 'solo fondos de acción');
  assert.deepEqual([st.sfx[0].repeat, st.sfx[0].every], [5, 1.5]);
  assert.deepEqual([st.sfx[1].repeat, st.sfx[1].every], [8, 0.8], 'con topes');
  const plan = mixPlan(st, [[1, 0], [2, 4], [3, 12]], 20);
  const lashes = plan.filter(l => l.key === 'latigazo');
  assert.equal(lashes.length, 5);
  assert.deepEqual(lashes.map(l => l.start), [4.2, 5.7, 7.2, 8.7, 10.2]);
  assert.ok(lashes[0].gain > LEVELS.sfx, 'el látigo suena más fuerte');
  const bed = plan.find(l => l.key === 'obra_esclavos');
  assert.equal(bed.bus, 'action'); assert.ok(bed.start <= 4 && bed.start + bed.dur >= 20);
  const holds = holdPoints({ sfx: [st.sfx[1]] }, [{ v: 3, text: 'Y los obligaban y trabajaban. Fin.' }], [[1, 0], [2, 4], [3, 12]], 20, [[16, 16.4]]);
  const tl = radioTimeline([[1, 0], [2, 4], [3, 12]], 20, { scenes: [] }, { holds });
  const hammer = radioPlan({ sfx: [st.sfx[1]] }, tl, [], { martillazo: 2 }).filter(l => l.key === 'martillazo');
  assert.ok(hammer.length >= 5, 'se repite dentro de la escena');
  const args = ffmpegArgs('v.mp3', plan, Object.fromEntries(plan.map(l => [l.key, l.key + '.mp3'])), 'o.mp3', {}).join(' ');
  assert.match(args, /\[voice\]\[ducked\]\[actd\]amix/, 'la voz va primero y el fondo de acción baja poco');
});

test('radionovela: transiciones largas cuando cambia el tiempo o el tema', () => {
  const st = cleanSoundtrack({ scenes: [{ v: 2, bridge: 'puente_tiempo', s: 12 }, { v: 3, bridge: 'puente_asombro', s: 40 }], sfx: [{ v: 1, key: 'zarza', hold: 15, after: 'ardía' }] }, [1, 2, 3]);
  assert.deepEqual(st.scenes, [{ v: 2, bridge: 'puente_tiempo', s: 12 }, { v: 3, bridge: 'puente_asombro', s: 14 }]);
  assert.equal(st.sfx[0].hold, 10, 'los grandes momentos pueden durar hasta 10 s');
  const tl = radioTimeline([[1, 0], [2, 5], [3, 9]], 14, st);
  assert.deepEqual(tl.gaps.map(g => g.dur), [12, 14]);
  const args = ffmpegArgs('v.mp3', [{ key: 'm_paz', kind: 'music', start: 0, dur: 40, fade: 2, loop: true, gain: 0.28 }], { m_paz: 'm.mp3' }, 'o.mp3', { swell: [[12, 23]] }).join(' ');
  assert.match(args, /volume=enable='between\(t,12,23\)':volume=1.6/);
});
