import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function load(lang) {
  const store = { kodesh_lang: lang };
  const ctx = { window: {}, document: { documentElement: { lang: '', classList: { add() {} }, appendChild() {} }, head: { appendChild() {} }, readyState: 'complete', createElement: () => ({}), write() {}, addEventListener() {}, createTreeWalker() {} },
    localStorage: { getItem: k => store[k] ?? null, setItem() {}, length: 1, key: () => 'kodesh_lang' }, navigator: { language: 'es-ES' },
    MutationObserver: class { observe() {} }, NodeFilter: {}, location: { reload() {} } };
  vm.createContext(ctx); ctx.window = ctx;
  for (const f of ['bible-ref.js', 'i18n.js', 'i18n-en.js']) vm.runInContext(read(f), ctx);
  ctx.KodeshI18n.patchRef();
  return ctx.KodeshI18n;
}

test('idioma: en español no cambia nada', () => {
  const I = load('es');
  assert.equal(I.isEn, false); assert.equal(I.bible, './biblia-rvr.json'); assert.equal(I.t('Capítulo 3'), 'Capítulo 3');
});

test('idioma: en inglés traduce textos, reglas y libros', () => {
  const I = load('en');
  assert.equal(I.isEn, true); assert.equal(I.bible, './biblia-wmb.json'); assert.equal(I.version, 'WMB');
  assert.equal(I.tr('Capítulo 3'), 'Chapter 3');
  assert.equal(I.tr('— Salmos 119:105'), '— Psalms 119:105');
  assert.equal(I.tr('Génesis — Capítulos'), 'Genesis — Chapters');
  assert.equal(I.tr('  Marcar como leído '), '  Mark as read ');
  assert.equal(I.tr('· c. 5 a.C.–30 d.C.'), '· c. 5 BC–30 AD');
  assert.equal(I.tr('Algo que no está'), null);
  assert.equal(I.bookName('JHN', 'Juan'), 'John');
  assert.equal(I.tr('130 · Hch 7:4'), '130 · Acts 7:4');
});

test('WMB: mismo formato y versículos que la RVR, con YHWH', () => {
  const R = JSON.parse(read('biblia-rvr.json')), W = JSON.parse(read('biblia-wmb.json'));
  assert.deepEqual(Object.keys(W), Object.keys(R));
  for (const b in R) for (const c in R[b]) assert.deepEqual(Object.keys(W[b][c]), Object.keys(R[b][c]), `${b} ${c}`);
  assert.match(W.PSA['23']['1'], /^YHWH is my shepherd/);
  assert.match(W.MAL['4']['5'], /Elijah/);
  assert.ok(!/\bLORD\b/.test(JSON.stringify(W.GEN)));
});

// Garantía de «sin mezcla»: todo texto de las funciones activas en inglés tiene traducción (o es técnico).
// Si agregas un texto nuevo en español, corre scripts/i18n-extract.py <módulo> y tradúcelo en data/i18n/<módulo>.en.json.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
test('idioma: los módulos activos en inglés no tienen textos sin traducir', () => {
  for (const mod of ['core', 'tiempo', 'moedim', 'parashot', 'profile', 'ayuda', 'estudio']) {
    const out = path.join(os.tmpdir(), `i18n-${mod}-${process.pid}.json`);
    const r = spawnSync('python3', ['scripts/i18n-extract.py', mod, out], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const todo = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(todo.slice(0, 10), [], `${mod}: ${todo.length} textos sin traducir`);
  }
});
