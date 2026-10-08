// KODESH — Personajes: la IA escribe la ficha de los personajes principales
// (los que aparecen en 10 versículos o más): significado del nombre, resumen,
// momentos clave y edades. Todo se valida (api/_people.js) y se guarda en
// Storage (bucket público «bible-audio», personas/index.json): llega a la
// app sin actualizarla.
//
// Solo superadmin (JWT + 2FA). POST { action }: status · generate (4 por vez)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { PEOPLE_MODEL, peoplePrompt, cleanPeople } from './_people.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'bible-audio';
const FILE = 'personas/index.json';
const BATCH = 4, MIN_VERSES = 10;
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
let BIBLE = null, DATA = null, EZ = null, STRONGS = null;
const bible = () => BIBLE || (BIBLE = read('../biblia-rvr.json'));
const data = () => DATA || (DATA = read('../data/personas.json'));
const easton = () => EZ || (EZ = read('./_personas-easton.json'));
const strongs = () => STRONGS || (STRONGS = { ...read('../strongs-hebrew.json'), ...read('../strongs-greek.json') });
const targets = () => Object.entries(data().p).filter(([, p]) => p[2] >= MIN_VERSES).sort((a, b) => b[1][2] - a[1][2]).map(([id]) => id);

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
    body: JSON.stringify({ model: PEOPLE_MODEL, max_tokens: 5000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const m = (d.content || []).map(c => c.text || '').join('').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}
function item(id) {
  const P = data().p, R = data().r[id] || {};
  const [n, g, , en, chapters] = P[id];
  const name = x => (P[x] || [x])[0];
  const fam = [['padre', R.pa], ['madre', R.ma], ['pareja', R.pr], ['hijos', R.hi]].filter(([, a]) => a && a.length).map(([k, a]) => `${k}: ${a.slice(0, 6).map(name).join(', ')}`).join('; ');
  const ch = chapters.slice(0, 40).map(k => k.replace(':', ' ')).join(', ') + (chapters.length > 40 ? '…' : '');
  return { id, n, g, en, fam, ch, ez: easton()[id] || '', chapters: new Set(chapters), alias: [n] };
}
async function generate() {
  const idx = await getIndex();
  idx.failed = idx.failed || {};
  const todo = targets().filter(id => !idx.items[id] && (idx.failed[id] || 0) < 2).slice(0, BATCH);
  if (todo.length) {
    const items = todo.map(item);
    const got = cleanPeople(await askClaude(peoplePrompt(items)), items, bible(), strongs());
    for (const id of todo) { if (got[id]) { idx.items[id] = got[id]; delete idx.failed[id]; } else idx.failed[id] = (idx.failed[id] || 0) + 1; }
    await saveIndex(idx);
  }
  const remaining = targets().filter(id => !idx.items[id] && (idx.failed[id] || 0) < 2).length;
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
    console.error('people-pregen', e.message);
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
