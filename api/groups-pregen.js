// KODESH — Preguntas para el grupo: la IA prepara, porción por porción, las
// preguntas (adultos, jóvenes, niños), la pregunta de la semana y la guía del
// líder, a partir de la Traducción Kodesh. Se valida todo (api/_groups.js) y
// se guarda en Storage (bucket público «bible-audio», carpeta grupos/) con un
// index.json: llega a la app sin actualizarla.
//
// Solo superadmin (JWT + 2FA). POST { action }:
//   status            → porciones listas
//   generate {num}    → prepara una porción (el panel las recorre una por una)
import fs from 'node:fs';
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { GROUPS_MODEL, groupsPrompt, cleanGroups } from './_groups.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'bible-audio';
const DIR = 'grupos';
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });
const publicUrl = p => `${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`;

let BIBLE = null, PARASHOT = null;
const bible = () => BIBLE || (BIBLE = JSON.parse(fs.readFileSync(new URL('../biblia-rvr.json', import.meta.url), 'utf8')));
const parashot = () => PARASHOT || (PARASHOT = JSON.parse(fs.readFileSync(new URL('../parashot-data.json', import.meta.url), 'utf8')));

async function upload(p, body, cache) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${p}`, {
    method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': cache }), body,
  });
  if (!r.ok) throw new Error(`storage → ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
}
async function getIndex() {
  const r = await fetch(`${publicUrl(`${DIR}/index.json`)}?t=${Date.now()}`, { cache: 'no-store' });
  const j = r.ok ? await r.json().catch(() => null) : null;
  return j && typeof j.ready === 'object' ? j : { ready: {} };
}

// Texto Kodesh de la porción, con la referencia en cada línea
async function parashaText(p) {
  const chs = []; for (let c = p.startChapter; c <= p.endChapter; c++) chs.push(c);
  const r = await fetch(`${SB_URL}/rest/v1/textual_cache?book_id=eq.${p.book}&chapter=in.(${chs.join(',')})&select=chapter,verses`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`supabase textual_cache → ${r.status}`);
  const rows = await r.json();
  const lines = [];
  for (const c of chs) {
    const vs = rows.find(x => x.chapter === c)?.verses || bible()[p.book]?.[String(c)] || {};
    for (const k of Object.keys(vs).map(Number).sort((a, b) => a - b)) {
      if (c === p.startChapter && k < p.startVerse) continue;
      if (c === p.endChapter && k > p.endVerse) continue;
      lines.push(`${p.book} ${c}:${k} ${String(vs[String(k)]).replace(/\s+/g, ' ').trim()}`);
    }
  }
  return lines.join('\n');
}
async function askClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: GROUPS_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = await r.json();
  const m = (d.content || []).map(c => c.text || '').join('').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}
async function generate(num) {
  const p = parashot().find(x => x.num === num);
  if (!p) throw Object.assign(new Error('Porción no válida'), { status: 400 });
  const text = await parashaText(p);
  let out = null;
  for (let k = 0; k < 2 && !(out && out.data); k++) out = cleanGroups(await askClaude(groupsPrompt(p, text)), p, bible(), text);
  if (!out.data) return { ok: false, num, error: out.error };
  const v = Date.now().toString(36);
  await upload(`${DIR}/${num}.json`, JSON.stringify({ ...out.data, v, generated: new Date().toISOString() }), 'max-age=31536000');
  const idx = await getIndex();
  idx.ready[num] = v; idx.updated = new Date().toISOString();
  await upload(`${DIR}/index.json`, JSON.stringify(idx), 'max-age=0');
  return { ok: true, num, adultos: out.data.adultos.length };
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
    if (action === 'status') { const idx = await getIndex(); return res.status(200).json({ total: 54, ready: Object.keys(idx.ready).map(Number).sort((a, b) => a - b) }); }
    if (action === 'generate') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY' });
      return res.status(200).json(await generate(parseInt(req.body?.num, 10)));
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('groups-pregen', e.message);
    return res.status(e.status === 400 ? 400 : 500).json({ error: String(e.message).slice(0, 300) });
  }
}
