// KODESH — Paralelos de los Evangelios: la IA compara, hecho por hecho, cómo
// lo cuentan los Evangelios (data/paralelos.json) y anota lo que trae solo
// cada uno. Todo se valida (api/_parallels.js) y se guarda en Storage
// (bucket público «bible-audio», paralelos/index.json): llega a la app sin
// actualizarla.
//
// Solo superadmin (JWT + 2FA). POST { action }:
//   status    → cuántos hechos están listos
//   generate  → compara los 4 siguientes pendientes (el panel lo repite)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { PARALLELS_MODEL, parallelsPrompt, cleanParallels, passage, comparable } from './_parallels.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'bible-audio';
const FILE = 'paralelos/index.json';
const BATCH = 4;
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });

let BIBLE = null, DATA = null;
const bible = () => BIBLE || (BIBLE = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8')));
const data = () => DATA || (DATA = JSON.parse(fs.readFileSync(new URL('../data/paralelos.json', import.meta.url), 'utf8')));
const targets = () => data().events.filter(comparable);

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
    body: JSON.stringify({ model: PARALLELS_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const m = (d.content || []).map(c => c.text || '').join('').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}
async function generate() {
  const idx = await getIndex();
  idx.failed = idx.failed || {};
  const todo = targets().filter(e => !idx.items[e.id] && (idx.failed[e.id] || 0) < 2).slice(0, BATCH);
  if (todo.length) {
    const items = todo.map(e => ({ id: e.id, t: e.t, texts: Object.entries(e.r).map(([g, refs]) => [g, passage(bible(), g, refs[0])]) }));
    const got = cleanParallels(await askClaude(parallelsPrompt(items)), items);
    for (const e of todo) { if (got[e.id]) { idx.items[e.id] = got[e.id]; delete idx.failed[e.id]; } else idx.failed[e.id] = (idx.failed[e.id] || 0) + 1; }
    await saveIndex(idx);
  }
  const remaining = targets().filter(e => !idx.items[e.id] && (idx.failed[e.id] || 0) < 2).length;
  return { ok: true, done: todo.length, ready: Object.keys(idx.items).length, total: targets().length, remaining };
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
    if (action === 'status') { const idx = await getIndex(); return res.status(200).json({ ready: Object.keys(idx.items).length, total: targets().length }); }
    if (action === 'generate') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY' });
      return res.status(200).json(await generate());
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('parallels-pregen', e.message);
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
