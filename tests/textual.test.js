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
