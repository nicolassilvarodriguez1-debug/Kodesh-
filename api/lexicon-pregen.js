// KODESH — Pre-generación del diccionario Strong's completo (~14.200 entradas)
// en lexicon_cache, con la API de lotes de Anthropic (50 % más barata y sin
// límites de velocidad). Así ningún usuario espera a la IA al tocar un número
// Strong's en el interlineal. Costo aproximado: $6–7 una sola vez.
//
// Solo superadmin (JWT + 2FA). Acciones (POST { action }):
//   status  → último lote y su progreso (consulta a Anthropic si sigue en curso)
//   submit  → crea un lote con todos los números que aún no están bien en caché
//   process → guarda en lexicon_cache el siguiente tramo de resultados (llamar
//             hasta que devuelva remaining = 0; el panel lo hace solo)
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';
import {
  allStrongsCodes, getEntry, lemmaMatches, normalizeCode, strongsCacheKey,
  strongsPromptParams, parseStrongsReply, strongsCacheRow,
} from './_strongs.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages/batches';
const PROCESS_CHUNK = 3000;   // líneas de resultados por llamada a "process"
const UPSERT_CHUNK = 500;     // filas por escritura a Supabase

const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra,
});
const aHeaders = () => ({
  'x-api-key': process.env.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'Content-Type': 'application/json',
});

async function sbGetAll(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers: sbHeaders() });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function latestJob() {
  const r = await fetch(`${SB_URL}/rest/v1/lexicon_pregen_jobs?select=*&order=id.desc&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return (await r.json())[0] || null;
}

async function updateJob(id, patch) {
  await fetch(`${SB_URL}/rest/v1/lexicon_pregen_jobs?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

// Números que ya tienen una entrada correcta en caché (se saltan).
async function alreadyCached() {
  const rows = await sbGetAll(`lexicon_cache?select=strongs,lemma,definition&word=like.strongs_*&order=id`);
  const ok = new Set();
  for (const r of rows) {
    const c = normalizeCode(r.strongs);
    if (c && r.definition && lemmaMatches(c, r.lemma)) ok.add(c);
  }
  return ok;
}

// ── Funciones puras (probadas en tests/strongs.test.js) ──
export function buildBatchRequests(codes) {
  return codes.map(code => ({ custom_id: code, params: strongsPromptParams(getEntry(code)) }));
}

// Una línea JSONL de resultados → fila de lexicon_cache, o null.
export function resultLineToRow(line) {
  if (!line || !line.trim()) return null;
  let obj;
  try { obj = JSON.parse(line); } catch (e) { return null; }
  if (obj?.result?.type !== 'succeeded') return null;
  const entry = getEntry(obj.custom_id);
  if (!entry) return null;
  const reply = parseStrongsReply(obj.result.message?.content?.[0]?.text);
  return reply ? strongsCacheRow(entry, reply) : null;
}

async function batchStatus(batchId) {
  const r = await fetch(`${ANTHROPIC}/${batchId}`, { headers: aHeaders() });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function jobView(job, batch) {
  return {
    job: job && {
      id: job.id, batch_id: job.batch_id, status: job.status, request_count: job.request_count,
      succeeded: job.succeeded, errored: job.errored, processed: job.processed, saved: job.saved,
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
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 503, ERR.unavailable, null, 'lexicon-pregen');

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
      return res.status(200).json(jobView(job, batch));
    }

    if (action === 'submit') {
      if (job && (job.status === 'in_progress' || job.status === 'ended')) {
        return res.status(409).json({ error: 'job_active', ...jobView(job, null) });
      }
      const skip = await alreadyCached();
      const codes = allStrongsCodes().filter(c => !skip.has(c));
      if (!codes.length) return res.status(200).json({ nothing_to_do: true, ...jobView(job, null) });
      const r = await fetch(ANTHROPIC, {
        method: 'POST', headers: aHeaders(),
        body: JSON.stringify({ requests: buildBatchRequests(codes) }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const batch = await r.json();
      const ins = await fetch(`${SB_URL}/rest/v1/lexicon_pregen_jobs`, {
        method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ batch_id: batch.id, request_count: codes.length, created_by: admin.email || admin.id }),
      });
      if (!ins.ok) throw new Error(`Supabase ${ins.status}`);
      return res.status(200).json({ submitted: codes.length, skipped: skip.size, ...jobView((await ins.json())[0], batch) });
    }

    if (action === 'process') {
      if (!job || job.status !== 'ended') return res.status(409).json({ error: 'not_ready', ...jobView(job, null) });
      const batch = await batchStatus(job.batch_id);
      if (!batch.results_url) throw new Error('El lote no tiene results_url todavía');
      const rr = await fetch(batch.results_url, { headers: aHeaders() });
      if (!rr.ok) throw new Error(`Anthropic results ${rr.status}`);
      const lines = (await rr.text()).split('\n').filter(l => l.trim());
      const slice = lines.slice(job.processed, job.processed + PROCESS_CHUNK);
      const rows = slice.map(resultLineToRow).filter(Boolean);
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const w = await fetch(`${SB_URL}/rest/v1/lexicon_cache?on_conflict=word,testament`, {
          method: 'POST', headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
          body: JSON.stringify(rows.slice(i, i + UPSERT_CHUNK)),
        });
        if (!w.ok) throw new Error(`Supabase upsert ${w.status}: ${(await w.text()).slice(0, 200)}`);
      }
      const processed = job.processed + slice.length;
      const remaining = lines.length - processed;
      await updateJob(job.id, {
        processed, saved: job.saved + rows.length,
        status: remaining <= 0 ? 'processed' : 'ended',
      });
      return res.status(200).json({ remaining, saved_now: rows.length, ...jobView(await latestJob(), batch) });
    }

    return res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'lexicon-pregen');
  }
}
