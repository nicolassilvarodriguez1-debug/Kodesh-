// Controles de calidad de la Traducción Kodesh (api/_textualCheck.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { looksEnglish, applyManuscriptRules, validateChapter, maxTokensFor, INTERPOLATED_NOTE } from '../api/_textualCheck.js';

describe('looksEnglish', () => {
  test('detecta Filipenses 2:2 tal como estaba guardado', () => {
    assert.equal(looksEnglish('Completed my joy, that you think the same thing, having the same love, united in mind, thinking one thing.'), true);
  });
  test('no marca versículos en español (toda la RVR60 de muestra)', () => {
    const bible = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8'));
    const flagged = [];
    for (const book of ['GEN', 'PSA', 'ISA', 'MAT', 'JHN', 'ROM', 'PHP', 'REV']) {
      for (const [ch, verses] of Object.entries(bible[book] || {})) {
        for (const [v, t] of Object.entries(verses)) if (looksEnglish(t)) flagged.push(`${book} ${ch}:${v}`);
      }
    }
    assert.deepEqual(flagged, []);
  });
  test('no marca nombres hebreos ni YHWH', () => {
    assert.equal(looksEnglish('Y dijo YHWH a Moshé: Habla a Aharón y a sus hijos, y diles que Yitzjak y Yaakov…'), false);
  });
});

describe('applyManuscriptRules', () => {
  test('1 Juan 5:7-8: texto fijo correcto aunque la IA ponga la nota', () => {
    const out = applyManuscriptRules('1JN', 5, { 7: INTERPOLATED_NOTE, 8: 'Porque tres son los que dan testimonio en la tierra…' });
    assert.equal(out['7'], 'Porque tres son los que dan testimonio:');
    assert.match(out['8'], /^el Espíritu, el agua y la sangre/);
  });
  test('Juan 7:53 lleva la nota; si la IA la puso en 8:1 se quita de ahí', () => {
    assert.match(applyManuscriptRules('JHN', 7, { 53: 'Y se fue cada uno a su casa.' })['53'], /^\[Este pasaje \(7:53–8:11\)/);
    const ch8 = applyManuscriptRules('JHN', 8, { 1: '[Este pasaje no aparece en los manuscritos más antiguos.] Y Yeshúa se fue al monte de los Olivos.' });
    assert.equal(ch8['1'], 'Y Yeshúa se fue al monte de los Olivos.');
  });
  test('versículos interpolados reciben la nota siempre', () => {
    assert.equal(applyManuscriptRules('ACT', 8, { 37: 'Felipe dijo: Si crees…' })['37'], INTERPOLATED_NOTE);
  });
  test('Marcos 16:9 lleva la nota sin duplicarla', () => {
    const out = applyManuscriptRules('MRK', 16, { 9: '[Los manuscritos más antiguos concluyen…] Habiendo, pues, resucitado…' });
    assert.equal((out['9'].match(/\[Los manuscritos/g) || []).length, 1);
  });
});

describe('validateChapter', () => {
  const keys = ['1', '2', '3'];
  test('capítulo correcto → sin problemas', () => {
    assert.deepEqual(validateChapter('PHP', 2, { 1: 'Por tanto…', 2: 'completad mi gozo…', 3: 'Nada hagáis…' }, keys), []);
  });
  test('inglés, versículo faltante y nota indebida se reportan', () => {
    const p = validateChapter('PHP', 2, { 1: INTERPOLATED_NOTE, 2: 'Completed my joy, that you think the same thing, having the same love.' }, keys);
    assert.deepEqual(p.map(x => x.type).sort(), ['english', 'missing', 'spurious_note']);
  });
});

test('max_tokens alcanza para el Salmo 119 y no baja de 4096 en capítulos medianos', () => {
  assert.ok(maxTokensFor(176) >= 16000);
  assert.ok(maxTokensFor(31) >= 4096);
});

// ── Prompt compartido y pre-generación por lotes (api/textual-pregen.js) ──
import { buildTextualParams, parseTextualReply, sortedVerseKeys } from '../api/_textualPrompt.js';
import {
  chapterId, parseChapterId, pendingChapters, buildBatchRequests, resultLineToRow, costUSD,
} from '../api/textual-pregen.js';

const BIBLE = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8'));

describe('prompt de la Traducción Kodesh', () => {
  test('incluye reglas, número de versículos y nota de reintento', () => {
    const src = BIBLE.GEN['1'];
    const p = buildTextualParams('GEN', 1, src);
    assert.equal(p.model, 'claude-haiku-4-5-20251001');
    assert.match(p.system, /EXACTAMENTE 31 versículos \(del 1 al 31\)/);
    assert.match(p.system, /hebreo bíblico/);
    assert.match(p.messages[0].content, /^Aquí está Génesis 1 en RVR60 \(31 versículos\)/);
    assert.doesNotMatch(p.messages[0].content, /ATENCIÓN/);
    const retry = buildTextualParams('GEN', 1, src, [{ verse: '2', type: 'english' }]);
    assert.match(retry.messages[0].content, /ATENCIÓN: el intento anterior tuvo errores \(v2 english\)/);
    assert.match(buildTextualParams('JHN', 3, BIBLE.JHN['3']).system, /griego koiné/);
  });
  test('parseTextualReply valida y aplica reglas de manuscritos', () => {
    const keys = sortedVerseKeys(BIBLE['1JN']['5']);
    const reply = {}; for (const k of keys) reply[k] = 'Texto en español ' + k;
    const ok = parseTextualReply('1JN', 5, '```json\n' + JSON.stringify(reply) + '\n```', keys, 'end_turn');
    assert.deepEqual(ok.problems, []);
    assert.equal(ok.verses['7'], 'Porque tres son los que dan testimonio:');
    assert.deepEqual(parseTextualReply('1JN', 5, '{"1":"a"', keys, 'max_tokens').problems, [{ type: 'truncated' }]);
  });
});

describe('pre-generación de capítulos', () => {
  test('ids de capítulo válidos para la API de lotes', () => {
    assert.equal(chapterId('1SA', 17), '1SA_17');
    assert.deepEqual(parseChapterId('1SA_17'), { bookId: '1SA', chapter: 17 });
    assert.equal(parseChapterId('../x'), null);
  });
  test('toda la Biblia: 1.189 capítulos, se saltan los que ya están', () => {
    assert.equal(pendingChapters(BIBLE, new Set()).length, 1189);
    const pend = pendingChapters(BIBLE, new Set(['GEN_1', 'PSA_119']));
    assert.equal(pend.length, 1187);
    assert.ok(!pend.some(c => c.bookId === 'PSA' && c.chapter === 119));
    const reqs = buildBatchRequests(BIBLE, pendingChapters(BIBLE, new Set()));
    assert.equal(reqs.length, 1189);
    assert.ok(reqs.every(r => /^[a-zA-Z0-9_-]{1,64}$/.test(r.custom_id)));
  });
  test('resultado válido → fila; con inglés o error → fallido (no se guarda)', () => {
    const keys = sortedVerseKeys(BIBLE.PHP['2']);
    const good = {}; for (const k of keys) good[k] = 'Completad mi gozo, sintiendo lo mismo ' + k;
    const line = (verses, type = 'succeeded') => JSON.stringify({
      custom_id: 'PHP_2',
      result: { type, message: { stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 1500 }, content: [{ type: 'text', text: JSON.stringify(verses) }] } },
    });
    const ok = resultLineToRow(BIBLE, line(good));
    assert.equal(ok.failed, null);
    assert.equal(ok.row.book_id, 'PHP'); assert.equal(ok.row.chapter, 2); assert.equal(ok.row.verse_count, keys.length);
    assert.deepEqual(ok.usage, { input: 2000, output: 1500 });
    const english = { ...good, 2: 'Complete my joy, that you think the same thing, having the same love.' };
    const bad = resultLineToRow(BIBLE, line(english));
    assert.equal(bad.row, null); assert.equal(bad.failed, 'PHP_2');
    assert.equal(resultLineToRow(BIBLE, line(good, 'errored')).failed, 'PHP_2');
  });
  test('costo con precio de lote de Haiku 4.5', () => {
    assert.equal(costUSD(2_700_000, 1_000_000), 3.85);
  });
});

// ── Asistente: saber qué capítulo se está leyendo ──
import { resolveBookId, buildAssistantSystem } from '../api/assistant.js';
describe('asistente — capítulo actual', () => {
  test('acepta id o nombre en español (apps ya instaladas mandan el nombre)', () => {
    assert.equal(resolveBookId(undefined, 'Génesis'), 'GEN');
    assert.equal(resolveBookId('JHN', 'lo que sea'), 'JHN');
    assert.equal(resolveBookId(null, '1 Corintios'), '1CO');
    assert.equal(resolveBookId(null, 'Cantares'), 'SNG');
    assert.equal(resolveBookId('_GENERAL', 'Preguntas generales'), null);
  });
  test('el prompt indica el capítulo y no pide aclararlo', () => {
    const sys = buildAssistantSystem({ bookId: 'GEN', chapter: 1, verse: null, userName: '', userGoals: [] });
    assert.match(sys, /está leyendo Génesis 1/);
    assert.match(sys, /sin preguntarle cuál es/);
    assert.doesNotMatch(buildAssistantSystem({ bookId: null, userName: '', userGoals: [] }), /CAPÍTULO ACTUAL/);
  });
});

// ── Títulos de sección ──
import { headingsParams, parseHeadings } from '../api/_headings.js';
import { buildHeadingRequests, headingLineToRow } from '../api/headings-pregen.js';
describe('títulos de sección', () => {
  const keys = sortedVerseKeys(BIBLE.REV['2']);
  test('prompt con el texto del capítulo y reglas de nombres', () => {
    const p = headingsParams('REV', 2, BIBLE.REV['2']);
    assert.match(p.messages[0].content, /^Apocalipsis 2 \(Nuevo Testamento\), versículos 1–29/);
    assert.match(p.system, /Yeshúa \(nunca "Jesús"\)/);
    assert.match(p.system, /No copies/);
  });
  test('valida: orden, rango, primera en v1, sin inglés ni "Jesús"', () => {
    const raw = JSON.stringify({ h: [
      { v: 1, t: 'Mensaje a la iglesia en Éfeso.' }, { v: 8, t: 'Mensaje a la iglesia en Esmirna' },
      { v: 8, t: 'duplicado' }, { v: 12, t: 'Message to the church of the city that they have' },
      { v: 18, t: 'Jesús habla a Tiatira' }, { v: 99, t: 'Fuera de rango' }, { v: 12, t: 'Mensaje a Pérgamo' },
    ] });
    assert.deepEqual(parseHeadings(raw, keys), [
      { v: 1, t: 'Mensaje a la iglesia en Éfeso' }, { v: 8, t: 'Mensaje a la iglesia en Esmirna' }, { v: 12, t: 'Mensaje a Pérgamo' },
    ]);
    assert.deepEqual(parseHeadings('{"h":[{"v":3,"t":"Empieza tarde"}]}', keys), [{ v: 1, t: 'Empieza tarde' }]);
    assert.equal(parseHeadings('no json', keys), null);
  });
  test('lote: 1.189 pedidos y línea de resultado → fila', () => {
    assert.equal(buildHeadingRequests(BIBLE, pendingChapters(BIBLE, new Set())).length, 1189);
    const line = JSON.stringify({ custom_id: 'REV_2', result: { type: 'succeeded', message: { usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: '{"h":[{"v":1,"t":"A Éfeso"},{"v":12,"t":"A Pérgamo"}]}' }] } } });
    const r = headingLineToRow(BIBLE, line);
    assert.equal(r.failed, null);
    assert.deepEqual(r.row.headings, [{ v: 1, t: 'A Éfeso' }, { v: 12, t: 'A Pérgamo' }]);
    assert.equal(headingLineToRow(BIBLE, line.replace('succeeded', 'errored')).failed, 'REV_2');
  });
});
