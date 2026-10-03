// Ciclo de parashot: 54 porciones, cobertura continua de la Torah y
// calendario por fecha (ver scripts/gen-parashot-calendar.py).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const P = JSON.parse(fs.readFileSync(new URL('../parashot-data.json', import.meta.url)));
const CAL = JSON.parse(fs.readFileSync(new URL('../parashot-calendar.json', import.meta.url)));
const BOOKS = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'];

describe('parashot-data.json', () => {
  test('54 porciones numeradas 1..54 sin huecos', () => {
    assert.equal(P.length, 54);
    P.forEach((p, i) => assert.equal(p.num, i + 1));
  });
  test('incluye Vayelej, Haazinu y Vezot HaBerajá en Deut 31, 32 y 33–34', () => {
    const [v, h, z] = P.slice(51);
    assert.deepEqual([v.startChapter, v.endChapter], [31, 31]);
    assert.deepEqual([h.startChapter, h.endChapter], [32, 32]);
    assert.deepEqual([z.startChapter, z.endChapter], [33, 34]);
  });
  test('cobertura continua: cada porción empieza donde terminó la anterior', () => {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (a.book !== b.book) {
        assert.equal(BOOKS.indexOf(b.book), BOOKS.indexOf(a.book) + 1, `${a.nombre} → ${b.nombre}`);
        assert.deepEqual([b.startChapter, b.startVerse], [1, 1], b.nombre);
      } else {
        const contiguo = (b.startChapter === a.endChapter && b.startVerse === a.endVerse + 1)
          || (b.startChapter === a.endChapter + 1 && b.startVerse === 1);
        assert.ok(contiguo, `${a.nombre} (${a.endChapter}:${a.endVerse}) → ${b.nombre} (${b.startChapter}:${b.startVerse})`);
      }
    }
  });
});

describe('parashot-calendar.json', () => {
  const entries = Object.entries(CAL);
  test('fechas válidas y números 1..54', () => {
    for (const [d, nums] of entries) {
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(nums.length >= 1 && nums.length <= 2, d);
      nums.forEach(n => assert.ok(n >= 1 && n <= 54, `${d}: ${n}`));
    }
  });
  test('todas las 54 porciones aparecen', () => {
    assert.equal(new Set(entries.flatMap(([, n]) => n)).size, 54);
  });
  test('Vezot HaBerajá nunca cae en Shabat; el resto siempre en sábado', () => {
    for (const [d, nums] of entries) {
      const dow = new Date(d + 'T12:00:00Z').getUTCDay();
      if (nums[0] === 54) assert.notEqual(dow, 6, d);
      else assert.equal(dow, 6, d);
    }
  });
  test('fechas conocidas de 5786/5787 (diáspora)', () => {
    assert.deepEqual(CAL['2026-09-05'], [51, 52]); // Nitzavim-Vayelej
    assert.deepEqual(CAL['2026-09-19'], [53]);     // Haazinu
    assert.deepEqual(CAL['2026-10-04'], [54]);     // Simjat Torá
    assert.deepEqual(CAL['2026-10-10'], [1]);      // Bereshit 5787
    assert.equal(CAL['2026-09-12'], undefined);    // Shabat de Rosh Hashaná
  });
  test('aviso: quedan al menos 5 años de calendario (si falla, correr el script)', () => {
    const last = entries.map(([d]) => d).sort().pop();
    const years = (new Date(last) - Date.now()) / (365.25 * 86400000);
    assert.ok(years >= 5, `el calendario termina en ${last}: python3 scripts/gen-parashot-calendar.py`);
  });
});
