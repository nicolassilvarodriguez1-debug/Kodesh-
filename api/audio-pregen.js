// KODESH — Audio de la Biblia con ElevenLabs (Traducción Kodesh).
// Se graba capítulo por capítulo desde el panel de administración; cada MP3
// queda en Supabase Storage (bucket público «bible-audio») y su fila en
// bible_audio guarda la duración y cuándo empieza cada versículo, para que el
// lector resalte el versículo que suena.
//
// Solo superadmin (JWT + 2FA). Acciones (POST { action }):
//   status              → capítulos grabados por libro y créditos de ElevenLabs
//   generate {book, chapter, force?} → graba un capítulo (el panel llama uno por uno)
//
// Variables en Vercel: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID y, opcional,
// ELEVENLABS_MODEL (por defecto eleven_multilingual_v2).
import '../bible-ref.js';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, isValidBookId, isValidChapter } from './_security.js';
import { buildNarration, chunkNarration, mp3Duration, verseTimings, textHash } from './_audioCore.js';

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
  return r.status === 204 ? null : r.json();
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
    sbJson(`bible_audio?version=eq.${VERSION}&select=book,chapter,duration_s,chars,text_hash,updated_at`),
    sbJson(`textual_cache?book_id=in.(${AUDIO_BOOKS.join(',')})&select=book_id,chapter,updated_at`),
  ]);
  const books = AUDIO_BOOKS.map(id => {
    const mine = audio.filter(a => a.book === id);
    const tx = textual.filter(t => t.book_id === id);
    const outdated = mine.filter(a => { const t = tx.find(x => x.chapter === a.chapter); return t && new Date(t.updated_at) > new Date(a.updated_at); }).map(a => a.chapter);
    return {
      book: id, name: bookName(id), chapters: bookChapters(id), withText: tx.length,
      done: mine.map(a => a.chapter).sort((a, b) => a - b), outdated,
      minutes: Math.round(mine.reduce((s, a) => s + Number(a.duration_s || 0), 0) / 60),
      chars: mine.reduce((s, a) => s + Number(a.chars || 0), 0),
    };
  });
  return { books, credits: await credits(), voice: process.env.ELEVENLABS_VOICE_ID || null };
}

async function tts(text, previous, next) {
  const voice = process.env.ELEVENLABS_VOICE_ID;
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
  const rows = await sbJson(`textual_cache?book_id=eq.${book}&chapter=eq.${chapter}&select=verses,updated_at&limit=1`);
  const verses = rows?.[0]?.verses;
  if (!verses || !Object.keys(verses).length) return { ok: false, reason: 'sin_texto_kodesh' };
  const narration = buildNarration(bookName(book), chapter, verses);
  const hash = await textHash(narration.text);
  if (!force) {
    const ex = await sbJson(`bible_audio?version=eq.${VERSION}&book=eq.${book}&chapter=eq.${chapter}&select=text_hash&limit=1`);
    if (ex?.[0]?.text_hash === hash) return { ok: true, skipped: true };
  }
  const chunks = chunkNarration(narration, 4000);
  const parts = []; const results = []; let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const { audio, alignment } = await tts(c.text, i > 0 ? chunks[i - 1].text.slice(-300) : '', i + 1 < chunks.length ? chunks[i + 1].text.slice(0, 300) : '');
    const { seconds } = mp3Duration(audio);
    const duration = seconds || (alignment?.character_end_times_seconds?.slice(-1)[0] ?? 0);
    results.push({ chunk: c, alignment, offset, duration });
    parts.push(audio);
    offset += duration;
  }
  const mp3 = Buffer.concat(parts);
  const timings = verseTimings(narration, results);
  const path = `${VERSION}/${book}/${chapter}.mp3`;
  const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': 'audio/mpeg', 'x-upsert': 'true', 'cache-control': 'max-age=604800' }), body: mp3,
  });
  if (!up.ok) throw new Error(`storage → ${up.status} ${(await up.text().catch(() => '')).slice(0, 200)}`);
  const now = new Date().toISOString();
  await sbJson('bible_audio?on_conflict=version,book,chapter', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      version: VERSION, book, chapter, path, bytes: mp3.length, duration_s: Math.round(offset * 100) / 100,
      timings, chars: narration.text.length, text_hash: hash, voice_id: process.env.ELEVENLABS_VOICE_ID,
      model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', updated_at: now,
    }]),
  });
  return { ok: true, book, chapter, seconds: Math.round(offset), chars: narration.text.length, chunks: chunks.length, path: `${path}?v=${hash}` };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    return res.status(503).json({ error: 'Falta configurar ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID en Vercel.' });
  }
  const action = req.body?.action || 'status';
  try {
    if (action === 'status') return res.status(200).json(await status());
    if (action === 'generate') {
      const book = isValidBookId(req.body?.book) ? String(req.body.book).toUpperCase() : null;
      const chapter = book && isValidChapter(req.body?.chapter) ? Number(req.body.chapter) : null;
      if (!book || !chapter || !AUDIO_BOOKS.includes(book)) return res.status(400).json({ error: 'Libro o capítulo no válido' });
      return res.status(200).json(await generate(book, chapter, !!req.body?.force));
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('audio-pregen', e.message);
    return res.status(e.status === 401 ? 401 : e.status === 429 ? 429 : 500).json({ error: e.message.slice(0, 300) });
  }
}
