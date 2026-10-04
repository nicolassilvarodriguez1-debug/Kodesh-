// Diccionario Strong's: el número y el lema deben corresponder siempre.
// Casos reales encontrados en producción (oct 2026).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEntry, verifyEntry, normalizeCode, normalizeLemma, transliterateGreek } from '../api/_strongs.js';

const e = (strongs, lemma, extra = {}) => ({ found: true, strongs, lemma, definition: 'x', ...extra });

describe('diccionario', () => {
  test('los tres números reportados apuntan a la palabra correcta', () => {
    assert.equal(getEntry('G458').lemma, 'ἀνομία');
    assert.equal(getEntry('G946').lemma, 'βδέλυγμα');
    assert.equal(normalizeLemma(getEntry('H1882').lemma), normalizeLemma('דָּת'));
  });
  test('normalizeCode', () => {
    assert.equal(normalizeCode('g0906'), 'G906');
    assert.equal(normalizeCode('H0853'), 'H853');
    assert.equal(normalizeCode('H7rimmon'), null);
  });
  test('normalizeLemma ignora puntos y acentos', () => {
    assert.equal(normalizeLemma('הָיָה'), normalizeLemma('היה'));
    assert.equal(normalizeLemma('ἀγάπη'), normalizeLemma('αγαπη'));
  });
  test('transliteración griega', () => {
    assert.equal(transliterateGreek('ἀνομία'), 'anomia');
    assert.equal(transliterateGreek('βδέλυγμα'), 'bdelygma');
    assert.equal(transliterateGreek('εὐαγγέλιον'), 'euangelion');
  });
});

describe('verifyEntry', () => {
  test('número y lema coinciden → se acepta con el lema canónico', () => {
    const v = verifyEntry(e('G458', 'ἀνομία'), 'NT');
    assert.equal(v.strongs, 'G458');
    assert.equal(v.transliteration, 'anomia');
  });
  test('la IA puso el lema de otro número → se corrige el número por el lema', () => {
    // caché real: "fuerte" → H7704 con lema קַנָּא (H7704 es שָׂדֶה "campo")
    const v = verifyEntry(e('H7704', 'קַנָּא'), 'AT');
    assert.notEqual(v.strongs, 'H7704');
    assert.equal(normalizeLemma(getEntry(v.strongs).lemma), normalizeLemma('קַנָּא'));
  });
  test('ἀνόητος con G458 → G453', () => {
    assert.equal(verifyEntry(e('G458', 'ἀνόητος'), 'NT').strongs, 'G453');
  });
  test('código roto pero lema válido → se recupera', () => {
    assert.equal(verifyEntry(e('H7rimmon', 'רִמּוֹן'), 'AT').strongs[0], 'H');
  });
  test('forma conjugada con número correcto → se acepta', () => {
    const v = verifyEntry(e('G2597', 'κατέβησαν'), 'NT');
    assert.equal(v.strongs, 'G2597');
    assert.equal(v.lemma, getEntry('G2597').lemma);
  });
  test('lema que no corresponde a nada y número ajeno → se rechaza', () => {
    assert.equal(verifyEntry(e('G1', 'βαστάζω-inventado'), 'NT'), null);
  });
  test('testamento equivocado (G en AT) se trata como sin número', () => {
    const v = verifyEntry(e('G2316', 'אֱלֹהִים'), 'AT');
    assert.equal(v.strongs, 'H430');
  });
});

// ── api/lexicon.js con caché equivocada (los casos reportados) ──
import { makeReq, makeRes, createMockFetch, authRoute, setFakeEnv } from './_helpers.js';
setFakeEnv();
const { default: lexiconHandler } = await import('../api/lexicon.js');

function lexiconMocks({ cacheRow, aiReply }) {
  const saved = [];
  let aiPrompt = null;
  const fetchMock = createMockFetch([
    authRoute(),
    { match: (u, o) => u.includes('/rest/v1/lexicon_cache') && (o.method || 'GET') === 'GET',
      handle: async () => ({ json: cacheRow ? [cacheRow] : [] }) },
    { match: (u, o) => u.includes('/rest/v1/lexicon_cache') && o.method === 'POST',
      handle: async (u, o) => { saved.push(JSON.parse(o.body)); return { status: 201, json: {} }; } },
    { match: (u) => u.includes('/rpc/consume_ai_usage'),
      handle: async () => ({ json: { allowed: true, used: 1, limit: 15, plan: 'free' } }) },
    { match: (u) => u.includes('/rpc/release_ai_usage'), handle: async () => ({ json: null }) },
    { match: (u) => u.includes('api.anthropic.com'),
      handle: async (u, o) => { aiPrompt = JSON.parse(o.body).messages[0].content; return { json: { content: [{ text: aiReply }] } }; } },
  ]);
  return { fetchMock, saved, getPrompt: () => aiPrompt };
}

describe('lexicon.js: búsqueda por número Strong', () => {
  test('G458 con caché equivocada (ἀνόητος) → se regenera con ἀνομία sin cobrar', async () => {
    const m = lexiconMocks({
      cacheRow: { strongs: 'G458', lemma: 'ἀνόητος', definition: 'Insensato, necio...', transliteration: 'anoetos' },
      aiReply: '{"definition":"Iniquidad, maldad: vivir sin ley.","pronunciation":"an-om-ee-ah"}',
    });
    globalThis.fetch = m.fetchMock;
    const res = makeRes();
    await lexiconHandler(makeReq({ headers: { authorization: 'Bearer valid-token' }, body: { strongsCode: 'G458' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.strongs, 'G458');
    assert.equal(res.body.lemma, 'ἀνομία');
    assert.equal(res.body.transliteration, 'anomia');
    assert.match(m.getPrompt(), /ἀνομία/);
    assert.equal(m.fetchMock.countCalledWith('/rpc/consume_ai_usage'), 0, 'arreglar caché no cobra');
    assert.equal(m.saved[0].lemma, 'ἀνομία');
  });
  test('G946 en caché correcta → se sirve sin llamar a la IA', async () => {
    const m = lexiconMocks({ cacheRow: { strongs: 'G946', lemma: 'βδέλυγμα', definition: 'Abominación.' } });
    globalThis.fetch = m.fetchMock;
    const res = makeRes();
    await lexiconHandler(makeReq({ headers: { authorization: 'Bearer valid-token' }, body: { strongsCode: 'G946' } }), res);
    assert.equal(res.body.lemma, 'βδέλυγμα');
    assert.equal(m.fetchMock.countCalledWith('api.anthropic.com'), 0);
  });
  test('número inexistente → found:false sin IA ni cobro', async () => {
    const m = lexiconMocks({});
    globalThis.fetch = m.fetchMock;
    const res = makeRes();
    await lexiconHandler(makeReq({ headers: { authorization: 'Bearer valid-token' }, body: { strongsCode: 'G99999' } }), res);
    assert.equal(res.body.found, false);
    assert.equal(m.fetchMock.countCalledWith('api.anthropic.com'), 0);
  });
});

describe('lexicon.js: búsqueda por palabra', () => {
  test('la IA da un número ajeno al lema → se corrige antes de mostrar y guardar', async () => {
    const m = lexiconMocks({ aiReply: '{"found":true,"strongs":"H7704","lemma":"קַנָּא","transliteration":"qanna","definition":"Celoso.","language":"hebreo"}' });
    globalThis.fetch = m.fetchMock;
    const res = makeRes();
    await lexiconHandler(makeReq({ headers: { authorization: 'Bearer valid-token' },
      body: { word: 'celoso', bookId: 'EXO', chapter: 20, verse: 5 } }), res);
    assert.notEqual(res.body.strongs, 'H7704');
    assert.equal(m.saved[0].strongs, res.body.strongs);
  });
});

describe('verifyEntry: homógrafos hebreos', () => {
  test('sukkot H5521 סֻכּוֹת se respeta (no se cambia a H5522 "santuario idólatra")', () => {
    assert.equal(verifyEntry(e('H5521', 'סֻכּוֹת'), 'AT').strongs, 'H5521');
  });
  test('santificación H6944 קְדֻשָּׁה se respeta (no H6948 "prostituta de culto")', () => {
    assert.equal(verifyEntry(e('H6944', 'קְדֻשָּׁה'), 'AT').strongs, 'H6944');
  });
  test('parashah H6572 פָּרָשָׁה → H6575 (coincide con vocales)', () => {
    assert.equal(verifyEntry(e('H6572', 'פָּרָשָׁה'), 'AT').strongs, 'H6575');
  });
  test('pecado H2403 חַטָּאת se respeta (forma de חַטָּאָה)', () => {
    assert.equal(verifyEntry(e('H2403', 'חַטָּאת'), 'AT').strongs, 'H2403');
  });
  test('estrellas H3556 כּוֹכָבִים se respeta (plural de כּוֹכָב)', () => {
    assert.equal(verifyEntry(e('H3556', 'כּוֹכָבִים'), 'AT').strongs, 'H3556');
  });
  test('abram H87 con lema אַבְרָהָם → H85 (el lema manda)', () => {
    assert.equal(verifyEntry(e('H87', 'אַבְרָהָם'), 'AT').strongs, 'H85');
  });
  test('lema sin vocales con número correcto → se acepta', () => {
    assert.equal(verifyEntry(e('H1961', 'היה'), 'AT').strongs, 'H1961');
  });
});
