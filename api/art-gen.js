// KODESH — Genera las pinturas de las fiestas y del Shabat con la API de
// imágenes de OpenAI y las guarda en Storage (bucket público «insignias»,
// fiestas.json): llegan a la app sin actualizarla.
// Requiere OPENAI_API_KEY en Vercel (opcional: OPENAI_IMAGE_MODEL).
// Solo superadmin (JWT + 2FA). POST { action: 'generate', id, extra? }
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import fs from 'node:fs';
import { ART_IDS, artPrompt, HOME_IDS, HOME_SCENES, homePrompt, parashaPrompt, parashaSafePrompt, TIEMPO_IDS, tiempoPrompt } from './_art.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'insignias';
const pub = p => `${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`;
async function put(path, body, type, cache = 'max-age=31536000') {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': cache }, body,
  });
  if (!r.ok) throw new Error(`storage → ${r.status}`);
}
let PARASHOT = null;
const parashot = () => PARASHOT || (PARASHOT = JSON.parse(fs.readFileSync(new URL('../parashot-data.json', import.meta.url), 'utf8')));
// id: fiesta («pesaj») · «home:hero_day» · «parasha:2» · «tiempo:arca»
function job(id) {
  if (ART_IDS.includes(id)) return { set: 'fiestas.json', key: id, prompt: artPrompt(id), size: '1536x1024' };
  const h = /^home:(\w+)$/.exec(id);
  if (h && HOME_IDS.includes(h[1])) return { set: 'inicio.json', key: h[1], prompt: homePrompt(h[1]), size: HOME_SCENES[h[1]][1] };
  const t = /^tiempo:(\w+)$/.exec(id);
  if (t && TIEMPO_IDS.includes(t[1])) return { set: 'inicio.json', key: 'tl_' + t[1], prompt: tiempoPrompt(t[1]), size: '1536x1024' };
  const p = /^parasha:(\d{1,2})$/.exec(id);
  if (p) { const x = parashot().find(q => q.num === +p[1]); if (x) return { set: 'inicio.json', key: 'p' + x.num, prompt: parashaPrompt(x), safe: parashaSafePrompt(x), size: '1536x1024' }; }
  return null;
}
async function manifest(file) {
  const r = await fetch(`${pub(file)}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return {};
  try { return await r.json(); } catch (e) { return {}; }
}
async function generate(j, extra) {
  const models = [process.env.OPENAI_IMAGE_MODEL, 'gpt-image-1'].filter(Boolean);
  let last = '';
  for (const model of [...new Set(models)]) {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: j.prompt + (extra ? `\n\nAlso: ${String(extra).slice(0, 400)}` : ''), size: j.size, quality: 'high', n: 1, output_format: 'webp', output_compression: 86 }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.data && d.data[0] && d.data[0].b64_json) return Buffer.from(d.data[0].b64_json, 'base64');
    last = `OpenAI ${r.status}: ${(d.error && d.error.message) || ''}`.slice(0, 240);
  }
  throw new Error(last || 'OpenAI no devolvió imagen');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Falta OPENAI_API_KEY en Vercel' });
  const id = String(req.body?.id || '');
  const j = job(id);
  if (!j) return res.status(400).json({ error: 'Imagen inválida' });
  try {
    let img;
    try { img = await generate(j, req.body?.extra); }
    catch (e) {
      // El filtro de seguridad rechazó la escena: se intenta una versión simbólica, sin personas
      if (!j.safe || !/safety|rejected/i.test(e.message)) throw e;
      img = await generate({ ...j, prompt: j.safe }, '');
    }
    const path = `${j.set === 'fiestas.json' ? 'fiesta' : 'inicio'}-${j.key}-${Date.now()}.webp`;
    await put(path, img, 'image/webp');
    const m = await manifest(j.set);
    m[j.key] = pub(path);
    await put(j.set, JSON.stringify(m), 'application/json', 'max-age=0');
    return res.status(200).json({ art: m, url: m[j.key] });
  } catch (e) {
    console.error('art-gen', e.message);
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
