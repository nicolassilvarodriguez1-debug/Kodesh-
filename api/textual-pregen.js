// KODESH — Pre-generación de la Traducción Kodesh completa (1.189 capítulos)
// en textual_cache, con la API de lotes de Anthropic (50 % más barata). Así
// ningún lector espera a la IA al abrir un capítulo en Kodesh.
// Costo estimado (oct 2026, ~990 capítulos faltantes): $4–6 una sola vez.
//
// Cada capítulo pasa por los mismos controles que api/textual.js
// (_textualPrompt.js + _textualCheck.js): si no los pasa, NO se guarda y
// queda para el siguiente lote o para generarse al abrirlo.
//
// Solo superadmin (JWT + 2FA). Acciones (POST { action }):
//   status  → último lote y su progreso (consulta a Anthropic si sigue en curso)
//   submit  → crea un lote con todos los capítulos que aún no están en caché
//   process → guarda en textual_cache el siguiente tramo de resultados (el
//             panel lo llama hasta que devuelva remaining = 0)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR, sanitizeSourceVerses } from './_security.js';
import { TEXTUAL_MODEL, buildTextualParams, parseTextualReply, sortedVerseKeys } from './_textualPrompt.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages/batches';
const PROCESS_CHUNK = 150;   // capítulos por llamada a "process"
const UPSERT_CHUNK = 40;     // capítulos por escritura a Supabase

// Precio de lote de Haiku 4.5 (USD por millón de tokens).
export const BATCH_PRICE = { input: 0.5, output: 2.5 };

const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra,
});
const aHeaders = () => ({
  'x-api-key': process.env.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'Content-Type': 'application/json',
});

let BIBLE = null;
function bible() {
  if (!BIBLE) BIBLE = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8'));
  return BIBLE;
}

// ── Funciones puras (probadas en tests/textual.test.js) ──
// custom_id: "GEN_1", "1SA_17"…
export const chapterId = (bookId, chapter) => `${bookId}_${chapter}`;
export function parseChapterId(id) {
  const m = String(id || '').match(/^([1-3]?[A-Z]{2,3})_(\d{1,3})$/);
  return m ? { bookId: m[1], chapter: Number(m[2]) } : null;
}

export function sourceFor(bibleData, bookId, chapter) {
  return sanitizeSourceVerses(bibleData?.[bookId]?.[String(chapter)], { maxVerses: 176, maxLen: 2000 });
}

// Todos los capítulos de la Biblia que no estén en `cached` (Set "GEN_1").
export function pendingChapters(bibleData, cached) {
  const out = [];
  for (const [bookId, chapters] of Object.entries(bibleData)) {
    for (const ch of Object.keys(chapters).map(Number).sort((a, b) => a - b)) {
      if (!cached.has(chapterId(bookId, ch))) out.push({ bookId, chapter: ch });
    }
  }
  return out;
}

export function buildBatchRequests(bibleData, chapters) {
  const out = [];
  for (const { bookId, chapter } of chapters) {
    const src = sourceFor(bibleData, bookId, chapter);
    if (src) out.push({ custom_id: chapterId(bookId, chapter), params: buildTextualParams(bookId, chapter, src) });
  }
  return out;
}

// Una línea JSONL de resultados → { row, usage, failed }.
//   row:    fila para textual_cache (solo si pasó todos los controles)
//   usage:  tokens usados (para el costo real)
//   failed: id del capítulo si no se pudo guardar
export function resultLineToRow(bibleData, line) {
  if (!line || !line.trim()) return null;
  let obj;
  try { obj = JSON.parse(line); } catch (e) { return null; }
  const id = parseChapterId(obj.custom_id);
  if (!id) return null;
  const msg = obj.result?.message;
  const usage = { input: msg?.usage?.input_tokens || 0, output: msg?.usage?.output_tokens || 0 };
  const failed = { row: null, usage, failed: obj.custom_id };
  if (obj.result?.type !== 'succeeded') return failed;
  const src = sourceFor(bibleData, id.bookId, id.chapter);
  if (!src) return failed;
  const verseKeys = sortedVerseKeys(src);
  const { verses, problems } = parseTextualReply(id.bookId, id.chapter, msg?.content?.[0]?.text, verseKeys, msg?.stop_reason);
  if (problems.length) return failed;
  return {
    usage, failed: null,
    row: {
      book_id: id.bookId, chapter: id.chapter, verses, verse_count: verseKeys.length,
      model_version: TEXTUAL_MODEL, updated_at: new Date().toISOString(),
    },
  };
}

export function costUSD(inputTokens, outputTokens) {
  return Math.round(((inputTokens * BATCH_PRICE.input + outputTokens * BATCH_PRICE.output) / 1e6) * 100) / 100;
}

// ── Supabase ──
async function cachedChapters() {
  const ok = new Set();
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/textual_cache?select=book_id,chapter&order=book_id,chapter&limit=1000&offset=${offset}`, { headers: sbHeaders() });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const rows = await r.json();
    for (const row of rows) ok.add(chapterId(row.book_id, row.chapter));
    if (rows.length < 1000) return ok;
  }
}

async function latestJob() {
  const r = await fetch(`${SB_URL}/rest/v1/textual_pregen_jobs?select=*&order=id.desc&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return (await r.json())[0] || null;
}

async function updateJob(id, patch) {
  const r = await fetch(`${SB_URL}/rest/v1/textual_pregen_jobs?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
}

async function batchStatus(batchId) {
  const r = await fetch(`${ANTHROPIC}/${batchId}`, { headers: aHeaders() });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function jobView(job, batch, extra = {}) {
  return {
    ...extra,
    job: job && {
      id: job.id, batch_id: job.batch_id, status: job.status, request_count: job.request_count,
      succeeded: job.succeeded, errored: job.errored, processed: job.processed, saved: job.saved,
      failed: job.failed, input_tokens: job.input_tokens, output_tokens: job.output_tokens,
      cost_usd: costUSD(Number(job.input_tokens || 0), Number(job.output_tokens || 0)),
      created_at: job.created_at,
    },
    batch: batch && { processing_status: batch.processing_status, request_counts: batch.request_counts, ended_at: batch.ended_at },
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 503, ERR.unavailable, null, 'textual-pregen');

  const action = req.body?.action || 'status';
  try {
    let job = await latestJob();

    if (action === 'status') {
      let batch = null;
      if (job && job.status === 'in_progress') {
        batch = await batchStatus(job.batch_id);
        if (batch.processing_status === 'ended') {
          await updateJob(job.id, { status: 'ended', succeeded: batch.request_counts.succeeded, errored: batch.request_counts.errored });
          job = await latestJob();
        }
      }
      const cached = await cachedChapters();
      return res.status(200).json(jobView(job, batch, { cached: cached.size, total: 1189 }));
    }

    if (action === 'submit') {
      if (job && (job.status === 'in_progress' || job.status === 'ended')) {
        return res.status(409).json({ error: 'job_active', ...jobView(job, null) });
      }
      const cached = await cachedChapters();
      const requests = buildBatchRequests(bible(), pendingChapters(bible(), cached));
      if (!requests.length) return res.status(200).json({ nothing_to_do: true, ...jobView(job, null, { cached: cached.size, total: 1189 }) });
      const r = await fetch(ANTHROPIC, { method: 'POST', headers: aHeaders(), body: JSON.stringify({ requests }) });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const batch = await r.json();
      const ins = await fetch(`${SB_URL}/rest/v1/textual_pregen_jobs`, {
        method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ batch_id: batch.id, request_count: requests.length, created_by: admin.email || admin.id }),
      });
      if (!ins.ok) throw new Error(`Supabase ${ins.status}`);
      return res.status(200).json({ submitted: requests.length, ...jobView((await ins.json())[0], batch, { cached: cached.size, total: 1189 }) });
    }

    if (action === 'process') {
      if (!job || job.status !== 'ended') return res.status(409).json({ error: 'not_ready', ...jobView(job, null) });
      const batch = await batchStatus(job.batch_id);
      if (!batch.results_url) throw new Error('El lote no tiene results_url todavía');
      const rr = await fetch(batch.results_url, { headers: aHeaders() });
      if (!rr.ok) throw new Error(`Anthropic results ${rr.status}`);
      const lines = (await rr.text()).split('\n').filter(l => l.trim());
      const slice = lines.slice(job.processed, job.processed + PROCESS_CHUNK);
      const results = slice.map(l => resultLineToRow(bible(), l)).filter(Boolean);
      const rows = results.map(x => x.row).filter(Boolean);
      // ignore-duplicates: si un lector ya generó ese capítulo mientras tanto,
      // se conserva el suyo (y sus reportes).
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const w = await fetch(`${SB_URL}/rest/v1/textual_cache?on_conflict=book_id,chapter`, {
          method: 'POST', headers: sbHeaders({ Prefer: 'resolution=ignore-duplicates' }),
          body: JSON.stringify(rows.slice(i, i + UPSERT_CHUNK)),
        });
        if (!w.ok) throw new Error(`Supabase upsert ${w.status}: ${(await w.text()).slice(0, 200)}`);
      }
      const processed = job.processed + slice.length;
      const remaining = lines.length - processed;
      const failedIds = results.map(x => x.failed).filter(Boolean);
      await updateJob(job.id, {
        processed,
        saved: job.saved + rows.length,
        failed: (job.failed || 0) + failedIds.length,
        failed_chapters: [...(job.failed_chapters || []), ...failedIds],
        input_tokens: Number(job.input_tokens || 0) + results.reduce((s, x) => s + x.usage.input, 0),
        output_tokens: Number(job.output_tokens || 0) + results.reduce((s, x) => s + x.usage.output, 0),
        status: remaining <= 0 ? 'processed' : 'ended',
      });
      return res.status(200).json({ remaining, saved_now: rows.length, ...jobView(await latestJob(), batch) });
    }

    return res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'textual-pregen');
  }
}
