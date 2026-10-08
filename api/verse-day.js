// KODESH — Versículo del día con audio (lote del admin).
//
// Cada pasaje de VERSES (api/_verseDay.js) se prepara una vez:
//   1. prepare → toma el texto de la Traducción Kodesh (textual_cache) y la IA
//      escribe el contexto, la pregunta, la oración y la palabra clave
//      (validada contra Strong's).
//   2. record  → el narrador del elenco lo lee con ElevenLabs (con tiempos por
//      palabra para resaltarla en la app) y se mezcla con música suave de la
//      biblioteca de la radionovela.
// Todo queda en Storage (bucket público «bible-audio», carpeta verso-dia/) con
// un index.json que la app lee: el contenido llega sin actualizar la app.
//
// Solo superadmin (JWT + 2FA). POST { action }:
//   status              → resumen y créditos
//   prepare             → prepara hasta 10 pasajes pendientes
//   record {n, force?}  → graba un pasaje
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import '../bible-ref.js';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { speakable, mp3Duration, textHash } from './_audioCore.js';
import { NT_BOOKS } from './_textualPrompt.js';
import { VERSES, parseRef, spokenRef, displayRef, wordTimings, bedFor, enrichPrompt, cleanEnrich, ENRICH_MODEL } from './_verseDay.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const EL = 'https://api.elevenlabs.io/v1';
const BUCKET = 'bible-audio';
const DIR = 'verso-dia';
const LEAD = 2.5, TAIL = 3.5;   // segundos de música antes y después de la voz
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' });
const bookName = id => (globalThis.KodeshRef?.BOOKS || []).find(b => b[0] === id)?.[1] || id;
const publicUrl = p => `${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`;

async function sbJson(p) {
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`supabase ${p.split('?')[0]} → ${r.status}`);
  return r.json();
}
async function upload(p, body, type, cache = 'max-age=31536000') {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${p}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': type, 'x-upsert': 'true', 'cache-control': cache }), body,
  });
  if (!r.ok) throw new Error(`storage → ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
}

// ── Índice (index.json) ──
async function getIndex() {
  const r = await fetch(`${publicUrl(`${DIR}/index.json`)}?t=${Date.now()}`, { cache: 'no-store' });
  const j = r.ok ? await r.json().catch(() => null) : null;
  const items = Array.isArray(j?.items) ? j.items : [];
  return { v: 1, count: VERSES.length, items: VERSES.map((ref, n) => (items[n] && items[n].ref === ref ? items[n] : { n, ref })) };
}
async function saveIndex(idx) {
  idx.count = VERSES.length; idx.updated = new Date().toISOString();
  await upload(`${DIR}/index.json`, JSON.stringify(idx), 'application/json', 'max-age=0');
}

async function credits() {
  try {
    const r = await fetch(`${EL}/user/subscription`, { headers: elHeaders() });
    if (!r.ok) return null;
    const s = await r.json();
    return { used: s.character_count, limit: s.character_limit };
  } catch (e) { return null; }
}
async function status() {
  const idx = await getIndex();
  const prepared = idx.items.filter(x => x.text && x.oracion).length;
  const recorded = idx.items.filter(x => x.audio).length;
  const chars = idx.items.filter(x => x.text && !x.audio).reduce((a, x) => a + speakable(x.text).length + 60, 0);
  return { total: VERSES.length, prepared, recorded, pendingChars: chars, credits: await credits(),
    items: idx.items.map(x => ({ n: x.n, ref: x.refText || x.ref, ready: !!(x.text && x.oracion), audio: !!x.audio, dur: x.dur || null })) };
}

// ── 1. Preparar texto + devocional ──
async function verseText(p) {
  const rows = await sbJson(`textual_cache?book_id=eq.${p.book}&chapter=eq.${p.chapter}&select=verses&limit=1`);
  const vs = rows?.[0]?.verses || {};
  const parts = [];
  for (let v = p.v1; v <= p.v2; v++) { const t = String(vs[String(v)] || '').replace(/\s+/g, ' ').trim(); if (!t) return null; parts.push(t); }
  return parts.join(' ');
}
let STRONGS = null;
function strongs() {
  if (!STRONGS) {
    STRONGS = {};
    for (const f of ['strongs-hebrew.json', 'strongs-greek.json']) {
      try { Object.assign(STRONGS, JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf8'))); } catch (e) {}
    }
  }
  return STRONGS;
}
async function askClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ENRICH_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const txt = (d.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}
async function prepare() {
  const idx = await getIndex();
  const todo = idx.items.filter(x => !(x.text && x.oracion)).slice(0, 10);
  const batch = [];
  for (const it of todo) {
    const p = parseRef(it.ref);
    if (!p) continue;
    const text = it.text || await verseText(p);
    if (!text) { it.error = 'sin texto Kodesh'; continue; }
    Object.assign(it, p, { text, refText: displayRef(bookName(p.book), p.chapter, p.v1, p.v2) });
    delete it.error;
    batch.push({ n: it.n, ref: it.refText, text, nt: NT_BOOKS.has(p.book) });
  }
  if (batch.length) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY');
    const extra = cleanEnrich(await askClaude(enrichPrompt(batch)), batch, strongs());
    for (const it of idx.items) if (extra[it.n]) Object.assign(it, extra[it.n]);
  }
  await saveIndex(idx);
  const remaining = idx.items.filter(x => !(x.text && x.oracion) && !x.error).length;
  return { ok: true, prepared: batch.length, remaining };
}

// ── 2. Grabar con voz + música ──
function runFfmpeg(args) {
  return new Promise((resolve, reject) => execFile(ffmpegPath, args, { maxBuffer: 1 << 24 }, (err, _o, stderr) => err ? reject(new Error('ffmpeg: ' + String(stderr || err.message).slice(0, 300))) : resolve()));
}
async function narratorVoice() {
  const rows = await sbJson('bible_audio_cast?select=role,voice_id&role=eq.narrador').catch(() => []);
  return rows?.[0]?.voice_id || process.env.ELEVENLABS_VOICE_ID || null;
}
async function record(n, force) {
  const idx = await getIndex();
  const it = idx.items[n];
  if (!it || !it.text) throw Object.assign(new Error('Primero prepara este versículo'), { status: 400 });
  const voice = await narratorVoice();
  if (!voice) throw new Error('El elenco no tiene voz de narrador');
  const spoken = `${speakable(it.text)} … ${spokenRef(bookName(it.book), it.chapter, it.v1, it.v2)}`;
  const hash = await textHash(`${spoken}|${voice}|${bedFor(n)}`);
  if (it.audio && it.hash === hash && !force) return { ok: true, n, skipped: true };

  const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: elHeaders(),
    body: JSON.stringify({ text: spoken, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) { const e = new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`); e.status = r.status; throw e; }
  const d = await r.json();
  const voiceBuf = Buffer.from(d.audio_base64, 'base64');
  const vdur = mp3Duration(voiceBuf).seconds || 0;

  const lib = await sbJson(`bible_audio_library?key=eq.${bedFor(n)}&select=path&limit=1`).catch(() => []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vdd-'));
  const vFile = path.join(tmp, 'v.mp3'), mFile = path.join(tmp, 'm.mp3'), out = path.join(tmp, 'o.mp3');
  fs.writeFileSync(vFile, voiceBuf);
  const total = Math.round((LEAD + vdur + TAIL) * 100) / 100;
  const ms = Math.round(LEAD * 1000);
  let args;
  if (lib?.[0]?.path) {
    const mr = await fetch(publicUrl(lib[0].path));
    if (!mr.ok) throw new Error('No se pudo bajar la música de fondo');
    fs.writeFileSync(mFile, Buffer.from(await mr.arrayBuffer()));
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', mFile, '-i', vFile, '-filter_complex',
      `[0:a]atrim=0:${total},asetpts=N/SR/TB,volume=0.22,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 3)}:d=3[m];` +
      `[1:a]adelay=${ms}|${ms},apad[v];[m][v]amix=inputs=2:duration=first:normalize=0[o]`,
      '-map', '[o]', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', out];
  } else {   // sin música en la biblioteca: solo la voz con su silencio
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', vFile, '-af', `adelay=${ms}|${ms},apad=whole_dur=${total}`, '-c:a', 'libmp3lame', '-b:a', '96k', out];
  }
  await runFfmpeg(args);
  const mp3 = fs.readFileSync(out);
  fs.rmSync(tmp, { recursive: true, force: true });

  const file = `${DIR}/${n}-${hash.slice(0, 8)}.mp3`;
  await upload(file, mp3, 'audio/mpeg');
  Object.assign(it, { audio: publicUrl(file), dur: total, voiceAt: LEAD, voiceEnd: Math.round((LEAD + vdur) * 100) / 100,
    words: wordTimings(it.text, d.alignment, LEAD), bed: bedFor(n), hash, recorded: new Date().toISOString() });
  await saveIndex(idx);
  return { ok: true, n, seconds: total, chars: spoken.length };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  const action = req.body?.action || 'status';
  try {
    if (action === 'status') return res.status(200).json(await status());
    if (action === 'prepare') return res.status(200).json(await prepare());
    if (action === 'record') {
      if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'Falta ELEVENLABS_API_KEY' });
      const n = parseInt(req.body?.n, 10);
      if (!(n >= 0 && n < VERSES.length)) return res.status(400).json({ error: 'Número no válido' });
      return res.status(200).json(await record(n, !!req.body?.force));
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('verse-day', e.message);
    return res.status([400, 429].includes(e.status) ? e.status : 500).json({ error: String(e.message).slice(0, 300) });
  }
}
