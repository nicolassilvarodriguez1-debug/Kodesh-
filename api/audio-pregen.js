// KODESH — Audio de la Biblia con ElevenLabs (Traducción Kodesh).
// Se graba capítulo por capítulo desde el panel de administración; cada MP3
// queda en Supabase Storage (bucket público «bible-audio») y su fila en
// bible_audio guarda la duración y cuándo empieza cada versículo, para que el
// lector resalte el versículo que suena.
//
// Es una lectura DRAMATIZADA: la IA prepara el guion de cada capítulo (qué
// dice el narrador y qué dice cada personaje, sin cambiar una palabra) y cada
// papel tiene su voz (tabla bible_audio_cast). El guion se puede revisar en el
// panel antes de grabar.
//
// Solo superadmin (JWT + 2FA). Acciones (POST { action }):
//   status                          → capítulos grabados por libro y créditos de ElevenLabs
//   cast_get / cast_save {voices}   → elenco de voces
//   script {book, chapter, regen?}  → guion del capítulo (lo crea si no existe)
//   script_save {book, chapter, segments} → guarda un guion corregido a mano
//   generate {book, chapter, force?} → graba un capítulo (el panel llama uno por uno)
//
// Variables en Vercel: ELEVENLABS_API_KEY, ELEVENLABS_MODEL (p. ej. eleven_v4),
// ELEVENLABS_VOICE_ID (voz del narrador si el elenco aún no tiene una) y
// ANTHROPIC_API_KEY (guiones).
import fs from 'node:fs';
import '../bible-ref.js';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, isValidBookId, isValidChapter } from './_security.js';
import { speakable, numberToSpanish, mp3Duration, textHash } from './_audioCore.js';
import { CAST, scriptPrompt, cleanScript, validateScript, planCalls, roleFor } from './_audioScript.js';
import { LIBRARY, LIB, MUSIC_SECONDS, soundtrackPrompt, cleanSoundtrack, mixPlan, ffmpegArgs } from './_audioCinema.js';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_MODEL = 'claude-sonnet-4-5';
let WJ = null;
function redLetter(book, chapter) {
  try { if (!WJ) WJ = JSON.parse(fs.readFileSync(new URL('../palabras-yeshua.json', import.meta.url), 'utf8')); } catch (e) { WJ = {}; }
  return WJ?.[book]?.[String(chapter)] || {};
}

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const EL = 'https://api.elevenlabs.io/v1';
const VERSION = 'kodesh';
const BUCKET = 'bible-audio';
export const AUDIO_BOOKS = ['MAT', 'MRK', 'LUK', 'JHN'];   // se amplía poco a poco
const FORMAT = 'mp3_44100_64';

const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' });
const bookName = id => (globalThis.KodeshRef?.BOOKS || []).find(b => b[0] === id)?.[1] || id;
const bookChapters = id => (globalThis.KodeshRef?.BOOKS || []).find(b => b[0] === id)?.[2] || 0;

async function sbJson(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: sbHeaders({ 'Content-Type': 'application/json', ...(opts.headers || {}) }) });
  if (!r.ok) throw new Error(`supabase ${path.split('?')[0]} → ${r.status} ${await r.text().catch(() => '')}`.slice(0, 300));
  const body = await r.text();   // con return=minimal Supabase responde 201 sin cuerpo
  return body ? JSON.parse(body) : null;
}

async function credits() {
  try {
    const r = await fetch(`${EL}/user/subscription`, { headers: elHeaders() });
    if (!r.ok) return null;
    const s = await r.json();
    return { used: s.character_count, limit: s.character_limit, resetAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : null, tier: s.tier };
  } catch (e) { return null; }
}

async function status() {
  const [audio, textual] = await Promise.all([
    sbJson(`bible_audio?version=eq.${VERSION}&select=book,chapter,duration_s,chars,text_hash,updated_at,path_cine`),
    sbJson(`textual_cache?book_id=in.(${AUDIO_BOOKS.join(',')})&select=book_id,chapter,updated_at`),
  ]);
  const books = AUDIO_BOOKS.map(id => {
    const mine = audio.filter(a => a.book === id);
    const tx = textual.filter(t => t.book_id === id);
    const outdated = mine.filter(a => { const t = tx.find(x => x.chapter === a.chapter); return t && new Date(t.updated_at) > new Date(a.updated_at); }).map(a => a.chapter);
    return {
      book: id, name: bookName(id), chapters: bookChapters(id), withText: tx.length,
      done: mine.map(a => a.chapter).sort((a, b) => a - b), outdated,
      cine: mine.filter(a => a.path_cine).map(a => a.chapter).sort((a, b) => a - b),
      minutes: Math.round(mine.reduce((s, a) => s + Number(a.duration_s || 0), 0) / 60),
      chars: mine.reduce((s, a) => s + Number(a.chars || 0), 0),
    };
  });
  const scripts = await sbJson(`bible_audio_scripts?version=eq.${VERSION}&select=book,chapter,edited`).catch(() => []);
  for (const b of books) b.scripts = scripts.filter(x => x.book === b.book).map(x => x.chapter).sort((x, y) => x - y);
  return { books, credits: await credits(), model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' };
}

// ── Elenco ──
async function castVoices() {
  const rows = await sbJson('bible_audio_cast?select=role,voice_id').catch(() => []);
  const v = {}; for (const r of rows || []) if (r.voice_id) v[r.role] = r.voice_id;
  if (!v.narrador && process.env.ELEVENLABS_VOICE_ID) v.narrador = process.env.ELEVENLABS_VOICE_ID;
  return v;
}
async function castGet() {
  const v = await castVoices();
  return { cast: CAST.map(c => ({ role: c.role, label: c.label, voice_id: v[c.role] || '', fallback: c.fallback || null })) };
}
async function castSave(voices) {
  const valid = new Set(CAST.map(c => c.role));
  const rows = Object.entries(voices || {}).filter(([r]) => valid.has(r)).map(([role, id]) => ({
    role, label: CAST.find(c => c.role === role).label, voice_id: String(id || '').trim().slice(0, 64) || null, updated_at: new Date().toISOString(),
  }));
  if (rows.length) await sbJson('bible_audio_cast?on_conflict=role', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  return castGet();
}

// ── Guion ──
async function chapterText(book, chapter) {
  const rows = await sbJson(`textual_cache?book_id=eq.${book}&chapter=eq.${chapter}&select=verses&limit=1`);
  const raw = rows?.[0]?.verses || {};
  const verses = {};
  for (const k of Object.keys(raw)) { const t = speakable(raw[k]); if (t) verses[k] = t; }
  return verses;
}
async function askClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SCRIPT_MODEL, max_tokens: 16000, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const txt = (d.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un guion válido');
  return JSON.parse(m[0]).segments || [];
}
async function askClaudeJson(prompt, maxTokens = 4000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SCRIPT_MODEL, max_tokens: maxTokens, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const txt = (d.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió JSON');
  return JSON.parse(m[0]);
}

async function makeScript(book, chapter) {
  const verses = await chapterText(book, chapter);
  if (!Object.keys(verses).length) return null;
  const prompt = scriptPrompt(bookName(book), chapter, verses, redLetter(book, chapter));
  let segs = await askClaude(prompt);
  let check = validateScript(verses, segs);
  if (!check.ok && check.bad.length) {   // un reintento con la lista de errores
    segs = await askClaude({ system: prompt.system, user: prompt.user + `\n\nEn el intento anterior estos versículos NO reproducían el texto exacto: ${check.bad.join(', ')}. Copia cada palabra tal cual.` });
  }
  const { segments, repaired } = cleanScript(verses, segs);
  const hash = await textHash(JSON.stringify(verses));
  await sbJson('bible_audio_scripts?on_conflict=version,book,chapter', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ version: VERSION, book, chapter, segments, text_hash: hash, edited: false, updated_at: new Date().toISOString() }]),
  });
  return { segments, repaired, text_hash: hash };
}
async function getScript(book, chapter, regen) {
  if (!regen) {
    const rows = await sbJson(`bible_audio_scripts?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}&select=segments,text_hash,edited&limit=1`);
    if (rows?.[0]) return { ...rows[0], repaired: [] };
  }
  return makeScript(book, chapter);
}
async function saveScript(book, chapter, segments) {
  const verses = await chapterText(book, chapter);
  const check = validateScript(verses, segments);
  if (!check.ok) return { ok: false, errors: check.errors.slice(0, 10) };
  const { segments: clean } = cleanScript(verses, segments);
  await sbJson('bible_audio_scripts?on_conflict=version,book,chapter', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ version: VERSION, book, chapter, segments: clean, text_hash: await textHash(JSON.stringify(verses)), edited: true, updated_at: new Date().toISOString() }]),
  });
  return { ok: true };
}
function withRoles(segments) { return segments.map(s => ({ ...s, role: roleFor(s.character, s.gender) })); }

// Algunos modelos (p. ej. eleven_v3) no aceptan previous_text/next_text:
// si los rechazan, se repite la petición sin ellos.
// Si ElevenLabs dice que hay demasiadas peticiones a la vez (429), se espera y
// se reintenta (el plan Creator permite 5 simultáneas).
async function tts(voice, text, previous, next) {
  let usePrev = true;
  for (let k = 1; ; k++) {
    try { return await ttsOnce(voice, text, usePrev ? previous : '', usePrev ? next : ''); }
    catch (e) {
      if (e.status === 400 && usePrev && (previous || next) && /previous_text|next_text|not supported|unsupported/i.test(e.message)) { usePrev = false; continue; }
      if ((e.status === 429 || e.status >= 500) && k < 6) { await new Promise(r => setTimeout(r, 2500 * k + Math.random() * 1500)); continue; }
      throw e;
    }
  }
}
async function ttsOnce(voice, text, previous, next) {
  const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=${FORMAT}`, {
    method: 'POST', headers: elHeaders(),
    body: JSON.stringify({
      text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      previous_text: previous || undefined, next_text: next || undefined,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`ElevenLabs ${r.status}: ${body.slice(0, 240)}`);
    err.status = r.status;
    throw err;
  }
  const d = await r.json();
  return { audio: Buffer.from(d.audio_base64, 'base64'), alignment: d.alignment };
}

async function generate(book, chapter, force) {
  const script = await getScript(book, chapter, false);
  if (!script) return { ok: false, reason: 'sin_texto_kodesh' };
  const voices = await castVoices();
  if (!voices.narrador) throw new Error('Falta la voz del narrador en el elenco');
  const intro = `${bookName(book)}, capítulo ${numberToSpanish(chapter)}.`;
  const calls = planCalls(script.segments, voices, { intro: `[reverent] ${intro}` });
  const hash = await textHash(JSON.stringify({ s: script.segments, v: voices, m: process.env.ELEVENLABS_MODEL || '' }));
  if (!force) {
    const ex = await sbJson(`bible_audio?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}&select=text_hash&limit=1`);
    if (ex?.[0]?.text_hash === hash) return { ok: true, skipped: true };
  }
  // Varias llamadas a la vez (cada una ya sabe su texto y su voz)
  const results = new Array(calls.length);
  let next = 0;
  async function worker() {
    while (next < calls.length) {
      const i = next++;
      const c = calls[i];
      results[i] = await tts(c.voice, c.text, i > 0 ? calls[i - 1].text.slice(-200) : '', i + 1 < calls.length ? calls[i + 1].text.slice(0, 200) : '');
    }
  }
  await Promise.all([worker(), worker()]);   // 2 a la vez: deja margen dentro del límite de 5
  const parts = []; const timings = []; let offset = 0;
  calls.forEach((c, i) => {
    const { audio, alignment } = results[i];
    const { seconds } = mp3Duration(audio);
    const duration = seconds || (alignment?.character_end_times_seconds?.slice(-1)[0] ?? 0);
    const starts = alignment?.character_start_times_seconds || [];
    const exact = starts.length && (alignment.characters || []).length === c.text.length;
    for (const m of c.marks) {
      const t = exact ? starts[Math.min(m.at, starts.length - 1)] : (m.at / Math.max(1, c.text.length)) * duration;
      timings.push([m.v, Math.round((offset + t) * 100) / 100]);
    }
    parts.push(audio);
    offset += duration;
  });
  timings.sort((a, b) => a[0] - b[0]);
  const mp3 = Buffer.concat(parts);
  const path = `${VERSION}/${book}/${chapter}.mp3`;
  const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': 'audio/mpeg', 'x-upsert': 'true', 'cache-control': 'max-age=604800' }), body: mp3,
  });
  if (!up.ok) throw new Error(`storage → ${up.status} ${(await up.text().catch(() => '')).slice(0, 200)}`);
  const chars = calls.reduce((s2, c) => s2 + c.text.length, 0);
  await sbJson('bible_audio?on_conflict=version,book,chapter', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      version: VERSION, book, chapter, path, bytes: mp3.length, duration_s: Math.round(offset * 100) / 100,
      timings, chars, text_hash: hash, voice_id: 'elenco',
      model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', updated_at: new Date().toISOString(),
    }]),
  });
  return { ok: true, book, chapter, seconds: Math.round(offset), chars, calls: calls.length };
}

// ════════ Película: biblioteca, banda sonora y mezcla ════════
const publicUrl = p => `${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`;
async function upload(p, buf, type = 'audio/mpeg') {
  const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${p}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=604800' }), body: buf,
  });
  if (!up.ok) throw new Error(`storage → ${up.status} ${(await up.text().catch(() => '')).slice(0, 200)}`);
}
async function libRows() { return (await sbJson('bible_audio_library?select=key,kind,path,seconds,credits').catch(() => [])) || []; }
async function libStatus() {
  const rows = await libRows();
  const have = Object.fromEntries(rows.map(r => [r.key, r]));
  return { items: LIBRARY.map(x => ({ key: x.key, kind: x.kind, label: x.label, done: !!have[x.key], credits: have[x.key]?.credits ?? null })) };
}
async function libBuild(key) {
  const item = LIB[key];
  if (!item) throw new Error('Sonido desconocido');
  let audio, credits = null, seconds = null;
  if (item.kind === 'music') {
    const r = await fetch(`${EL}/music?output_format=mp3_44100_128`, {
      method: 'POST', headers: elHeaders(),
      body: JSON.stringify({ prompt: item.prompt, music_length_ms: MUSIC_SECONDS * 1000, force_instrumental: true }),
    });
    if (!r.ok) { const e = new Error(`ElevenLabs música ${r.status}: ${(await r.text().catch(() => '')).slice(0, 240)}`); e.status = r.status; throw e; }
    audio = Buffer.from(await r.arrayBuffer());
    credits = Number(r.headers.get('character-cost')) || null;
    seconds = MUSIC_SECONDS;
  } else {
    const loop = item.kind === 'amb';
    const r = await fetch(`${EL}/sound-generation?output_format=mp3_44100_128`, {
      method: 'POST', headers: elHeaders(),
      body: JSON.stringify({ text: item.prompt, loop, duration_seconds: loop ? 30 : (item.seconds || 3), prompt_influence: 0.45 }),
    });
    if (!r.ok) { const e = new Error(`ElevenLabs efectos ${r.status}: ${(await r.text().catch(() => '')).slice(0, 240)}`); e.status = r.status; throw e; }
    audio = Buffer.from(await r.arrayBuffer());
    credits = Number(r.headers.get('character-cost')) || null;
    seconds = mp3Duration(audio).seconds || (loop ? 30 : item.seconds);
  }
  const p = `library/${key}.mp3`;
  await upload(p, audio);
  await sbJson('bible_audio_library?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key, kind: item.kind, path: p, seconds, credits, prompt: item.prompt, created_at: new Date().toISOString() }]),
  });
  return { ok: true, key, credits, seconds };
}
async function getSoundtrack(book, chapter, regen) {
  const rows = await sbJson(`bible_audio_scripts?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}&select=segments,soundtrack&limit=1`);
  const row = rows?.[0];
  if (!row) return null;
  if (row.soundtrack && !regen) return row.soundtrack;
  const raw = await askClaudeJson(soundtrackPrompt(bookName(book), chapter, row.segments));
  const st = cleanSoundtrack(raw, [...new Set(row.segments.map(x => x.v))]);
  await sbJson(`bible_audio_scripts?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ soundtrack: st }),
  });
  return st;
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga ${r.status} ${url.split('/').slice(-2).join('/')}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => execFile(ffmpegPath, args, { maxBuffer: 1 << 24 }, (err, _o, stderr) => err ? reject(new Error('ffmpeg: ' + String(stderr || err.message).slice(0, 300))) : resolve()));
}
async function mix(book, chapter) {
  const rows = await sbJson(`bible_audio?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}&select=path,timings,duration_s,text_hash&limit=1`);
  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'sin_voz' };
  const st = await getSoundtrack(book, chapter, false);
  if (!st) return { ok: false, reason: 'sin_guion' };
  const lib = Object.fromEntries((await libRows()).map(r => [r.key, r]));
  const sfxSeconds = Object.fromEntries(Object.values(lib).filter(r => r.kind === 'sfx').map(r => [r.key, Number(r.seconds) || 3]));
  const layers = mixPlan(st, row.timings, Number(row.duration_s), sfxSeconds).filter(l => lib[l.key]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-'));
  try {
    const voice = path.join(dir, 'voice.mp3');
    await download(publicUrl(row.path), voice);
    const files = {};
    for (const key of [...new Set(layers.map(l => l.key))]) {
      files[key] = path.join(dir, key + '.mp3');
      await download(publicUrl(lib[key].path), files[key]);
    }
    const out = path.join(dir, 'out.mp3');
    await runFfmpeg(ffmpegArgs(voice, layers, files, out));
    const p = `${VERSION}/${book}/${chapter}.cine.mp3`;
    await upload(p, fs.readFileSync(out));
    await sbJson(`bible_audio?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ path_cine: p, cine_updated_at: new Date().toISOString() }),
    });
    const missing = [...new Set(mixPlan(st, row.timings, Number(row.duration_s), sfxSeconds).map(l => l.key).filter(k => !lib[k]))];
    return { ok: true, layers: layers.length, missing, soundtrack: st };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'Falta configurar ELEVENLABS_API_KEY en Vercel.' });
  }
  const action = req.body?.action || 'status';
  try {
    if (action === 'status') return res.status(200).json(await status());
    if (action === 'cast_get') return res.status(200).json(await castGet());
    if (action === 'cast_save') return res.status(200).json(await castSave(req.body?.voices));
    if (action === 'lib_status') return res.status(200).json(await libStatus());
    if (action === 'lib_build') return res.status(200).json(await libBuild(String(req.body?.key || '')));
    const book = isValidBookId(req.body?.book) ? String(req.body.book).toUpperCase() : null;
    const chapter = book && isValidChapter(req.body?.chapter) ? Number(req.body.chapter) : null;
    if (!book || !chapter || !AUDIO_BOOKS.includes(book)) return res.status(400).json({ error: 'Libro o capítulo no válido' });
    if (action === 'script') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY' });
      const sc = await getScript(book, chapter, !!req.body?.regen);
      if (!sc) return res.status(200).json({ ok: false, reason: 'sin_texto_kodesh' });
      return res.status(200).json({ ok: true, ...sc, segments: withRoles(sc.segments) });
    }
    if (action === 'script_save') return res.status(200).json(await saveScript(book, chapter, req.body?.segments));
    if (action === 'generate') return res.status(200).json(await generate(book, chapter, !!req.body?.force));
    if (action === 'soundtrack') return res.status(200).json({ ok: true, soundtrack: await getSoundtrack(book, chapter, !!req.body?.regen) });
    if (action === 'mix') return res.status(200).json(await mix(book, chapter));
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('audio-pregen', e.message);
    return res.status(e.status === 401 ? 401 : e.status === 429 ? 429 : 500).json({ error: e.message.slice(0, 300) });
  }
}
