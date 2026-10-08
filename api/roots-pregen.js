// KODESH — Raíces hebreas: la IA prepara, capítulo por capítulo, las notas de
// trasfondo hebreo (Evangelios, Hechos, Hebreos y los capítulos de fiestas).
// Todo se valida (api/_roots.js) y se guarda en Storage (bucket público
// «bible-audio», raices/index.json): llega a la app sin actualizarla.
//
// Solo superadmin (JWT + 2FA). POST { action }: status · generate (3 capítulos por vez)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { ROOTS_MODEL, rootsChapters, rootsPrompt, chapterItem, cleanRoots } from './_roots.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'bible-audio';
const FILE = 'raices/index.json';
const BATCH = 3;
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
let BIBLE = null, FEST = null;
const bible = () => BIBLE || (BIBLE = read('../biblia-rvr.json'));
const fiestas = () => FEST || (FEST = read('../data/fiestas.json'));
const targets = () => rootsChapters(fiestas());

async function getIndex() {
  const r = await fetch(`${SB_URL}/storage/v1/object/public/${BUCKET}/${FILE}?t=${Date.now()}`, { cache: 'no-store' });
  const j = r.ok ? await r.json().catch(() => null) : null;
  return j && j.items ? j : { items: {}, failed: {} };
}
async function saveIndex(idx) {
  idx.updated = new Date().toISOString();
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${FILE}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=0' }), body: JSON.stringify(idx),
  });
  if (!r.ok) throw new Error(`storage → ${r.status}`);
}
async function askClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ROOTS_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const m = (d.content || []).map(c => c.text || '').join('').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch (e) { return null; }
}
const pending = idx => targets().filter(k => !idx.items[k] && (idx.failed[k] || 0) < 2);
async function generate() {
  const idx = await getIndex();
  idx.failed = idx.failed || {};
  const todo = pending(idx).slice(0, BATCH);
  if (todo.length) {
    const items = todo.map(k => chapterItem(bible(), k));
    const raw = await askClaude(rootsPrompt(items, fiestas()));
    const got = cleanRoots(raw, items, bible());
    const answered = raw && raw.d && typeof raw.d === 'object' ? raw.d : {};
    for (const k of todo) {
      if (Array.isArray(answered[k])) { idx.items[k] = got[k] || []; delete idx.failed[k]; }
      else idx.failed[k] = (idx.failed[k] || 0) + 1;
    }
    await saveIndex(idx);
  }
  const notes = Object.values(idx.items).reduce((n, a) => n + a.length, 0);
  return { ok: true, done: todo.length, ready: Object.keys(idx.items).length, total: targets().length, remaining: pending(idx).length, notes };
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
    if (action === 'status') {
      const idx = await getIndex();
      return res.status(200).json({ ready: Object.keys(idx.items).length, total: targets().length, notes: Object.values(idx.items).reduce((n, a) => n + a.length, 0) });
    }
    if (action === 'generate') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY' });
      return res.status(200).json(await generate());
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('roots-pregen', e.message);
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
