import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cleanRoots, rootsChapters, chapterItem, rootsPrompt, norm } from '../api/_roots.js';

const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const BIBLE = read('../biblia-rvr.json');
const FEST = read('../data/fiestas.json');

test('fiestas: datos curados válidos (citas y referencias contra el texto)', () => {
  const out = execFileSync('python3', [new URL('../scripts/fiestas/build.py', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /^ok 9 fiestas/);
  const ids = FEST.f.map(f => f.id);
  assert.deepEqual(ids.slice(0, 7), ['pesaj', 'matzot', 'bikurim', 'shavuot', 'terua', 'kipur', 'sukot']);
  assert.deepEqual(FEST.ch['JHN:7'][0], ['sukot']);
  assert.ok(FEST.templo.find(p => p.id === 'mujeres').ch.includes('JHN:8'));
});

test('fiestas: el calendario hebreo del sistema ubica las fiestas', () => {
  const f = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' });
  const parts = d => Object.fromEntries(f.formatToParts(new Date(d + 'T12:00:00')).map(p => [p.type, p.value]));
  assert.deepEqual([parts('2026-09-26').month, parts('2026-09-26').day], ['Tishri', '15']); // Sukot 5787
  assert.deepEqual([parts('2027-04-21').month, parts('2027-04-21').day], ['Nisan', '14']);
});

test('raíces: capítulos a preparar', () => {
  const ch = rootsChapters(FEST);
  assert.ok(ch.includes('MAT:1') && ch.includes('HEB:13') && ch.includes('LEV:23') && ch.includes('EST:9'));
  assert.equal(new Set(ch).size, ch.length);
  const it = chapterItem(BIBLE, 'JHN:7');
  assert.match(rootsPrompt([it], FEST), /CAPÍTULO JHN:7/);
});

test('raíces: validación de las notas', () => {
  const it = chapterItem(BIBLE, 'JHN:7');
  const ok = { v: 37, frase: 'venga á mí y beba', tema: 'sukot', titulo: 'El agua del estanque de Siloé', he: 'שִׂמְחַת בֵּית הַשּׁוֹאֵבָה', xlit: 'Simjat Beit HaShoevá',
    texto: 'Cada mañana de Sukot se derramaba agua de Siloé sobre el altar; Isaías dice «Sacaréis aguas con gozo». En ese ambiente Yeshúa ofrece agua viva.', refs: ['ISA 12:3', 'XXX 1:1'], fuente: 'Misná, Sucá 4:9' };
  const raw = { d: { 'JHN:7': [
    ok,
    { ...ok, frase: 'agua bendita del cielo' },                         // no está en el versículo
    { ...ok, v: 38, frase: 'ríos de agua viva', texto: 'Una explicación suficientemente larga que cita «palabras inventadas» del texto.' },
    { ...ok, v: 2, frase: 'la de los tabernáculos', tema: 'otra' },     // tema inválido
    { ...ok, v: 2, frase: 'la de los tabernáculos', fuente: 'Un rabino famoso', he: 'abc' },
  ] } };
  const out = cleanRoots(raw, [it], BIBLE)['JHN:7'];
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].refs, ['ISA 12:3']);
  assert.equal(out[0].fuente, 'Misná, Sucá 4:9');
  assert.equal(out[1].v, 2);
  assert.equal(out[1].fuente, undefined);
  assert.equal(out[1].he, undefined);
  assert.equal(norm('venga á mí, y beba.'), 'venga a mi y beba');
});
