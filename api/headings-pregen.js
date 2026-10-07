// KODESH — Generación por lotes de los títulos de sección de toda la Biblia
// (1.189 capítulos) en la tabla section_headings, con la API de lotes de
// Anthropic (50 % más barata). Costo estimado: ~$1 una sola vez.
//
// Solo superadmin (JWT + 2FA). Acciones (POST { action }):
//   status  → último lote y su progreso
//   submit  → lote con los capítulos que aún no tienen títulos
//   process → guarda el siguiente tramo de resultados (el panel lo repite
//             hasta remaining = 0)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';
import { sortedVerseKeys } from './_textualPrompt.js';
import { chapterId, parseChapterId, pendingChapters, sourceFor, costUSD } from './textual-pregen.js';
import { headingsParams, parseHeadings, HEADINGS_MODEL } from './_headings.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages/batches';
const JOBS = 'headings_pregen_jobs';
const PROCESS_CHUNK = 400;
const UPSERT_CHUNK = 200;

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
export function buildHeadingRequests(bibleData, chapters) {
  const out = [];
  for (const { bookId, chapter } of chapters) {
    const src = sourceFor(bibleData, bookId, chapter);
    if (src) out.push({ custom_id: chapterId(bookId, chapter), params: headingsParams(bookId, chapter, src) });
  }
  return out;
}

export function headingLineToRow(bibleData, line) {
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
  const headings = parseHeadings(msg?.content?.[0]?.text, sortedVerseKeys(src));
  if (!headings) return failed;
  return {
    usage, failed: null,
    row: { book_id: id.bookId, chapter: id.chapter, headings, model_version: HEADINGS_MODEL, updated_at: new Date().toISOString() },
  };
}

// ── Supabase ──
async function doneChapters() {
  const ok = new Set();
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/section_headings?select=book_id,chapter&order=book_id,chapter&limit=1000&offset=${offset}`, { headers: sbHeaders() });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const rows = await r.json();
    for (const row of rows) ok.add(chapterId(row.book_id, row.chapter));
    if (rows.length < 1000) return ok;
  }
}
async function latestJob() {
  const r = await fetch(`${SB_URL}/rest/v1/${JOBS}?select=*&order=id.desc&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return (await r.json())[0] || null;
}
async function updateJob(id, patch) {
  const r = await fetch(`${SB_URL}/rest/v1/${JOBS}?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
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
      failed: job.failed, cost_usd: costUSD(Number(job.input_tokens || 0), Number(job.output_tokens || 0)),
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
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 503, ERR.unavailable, null, 'headings-pregen');

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
      return res.status(200).json(jobView(job, batch, { cached: (await doneChapters()).size, total: 1189 }));
    }

    if (action === 'submit') {
      if (job && (job.status === 'in_progress' || job.status === 'ended')) {
        return res.status(409).json({ error: 'job_active', ...jobView(job, null) });
      }
      const done = await doneChapters();
      const requests = buildHeadingRequests(bible(), pendingChapters(bible(), done));
      if (!requests.length) return res.status(200).json({ nothing_to_do: true, ...jobView(job, null, { cached: done.size, total: 1189 }) });
      const r = await fetch(ANTHROPIC, { method: 'POST', headers: aHeaders(), body: JSON.stringify({ requests }) });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const batch = await r.json();
      const ins = await fetch(`${SB_URL}/rest/v1/${JOBS}`, {
        method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ batch_id: batch.id, request_count: requests.length, created_by: admin.email || admin.id }),
      });
      if (!ins.ok) throw new Error(`Supabase ${ins.status}`);
      return res.status(200).json({ submitted: requests.length, ...jobView((await ins.json())[0], batch, { cached: done.size, total: 1189 }) });
    }

    if (action === 'process') {
      if (!job || job.status !== 'ended') return res.status(409).json({ error: 'not_ready', ...jobView(job, null) });
      const batch = await batchStatus(job.batch_id);
      if (!batch.results_url) throw new Error('El lote no tiene results_url todavía');
      const rr = await fetch(batch.results_url, { headers: aHeaders() });
      if (!rr.ok) throw new Error(`Anthropic results ${rr.status}`);
      const lines = (await rr.text()).split('\n').filter(l => l.trim());
      const slice = lines.slice(job.processed, job.processed + PROCESS_CHUNK);
      const results = slice.map(l => headingLineToRow(bible(), l)).filter(Boolean);
      const rows = results.map(x => x.row).filter(Boolean);
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const w = await fetch(`${SB_URL}/rest/v1/section_headings?on_conflict=book_id,chapter`, {
          method: 'POST', headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
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
    return sendError(res, 500, ERR.internal, err, 'headings-pregen');
  }
}
