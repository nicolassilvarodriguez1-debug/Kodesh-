// KODESH — Genera las pinturas de las fiestas y del Shabat con la API de
// imágenes de OpenAI y las guarda en Storage (bucket público «insignias»,
// fiestas.json): llegan a la app sin actualizarla.
// Requiere OPENAI_API_KEY en Vercel (opcional: OPENAI_IMAGE_MODEL).
// Solo superadmin (JWT + 2FA). POST { action: 'generate', id, extra? }
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { ART_IDS, artPrompt } from './_art.js';

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
async function manifest() {
  const r = await fetch(`${pub('fiestas.json')}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return {};
  try { return await r.json(); } catch (e) { return {}; }
}
async function generate(id, extra) {
  const models = [process.env.OPENAI_IMAGE_MODEL, 'gpt-image-1'].filter(Boolean);
  let last = '';
  for (const model of [...new Set(models)]) {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: artPrompt(id) + (extra ? `\n\nAlso: ${String(extra).slice(0, 400)}` : ''), size: '1024x1536', quality: 'high', n: 1, output_format: 'webp', output_compression: 86 }),
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
  if (!ART_IDS.includes(id)) return res.status(400).json({ error: 'Fiesta inválida' });
  try {
    const img = await generate(id, req.body?.extra);
    const path = `fiesta-${id}-${Date.now()}.webp`;
    await put(path, img, 'image/webp');
    const m = await manifest();
    m[id] = pub(path);
    await put('fiestas.json', JSON.stringify(m), 'application/json', 'max-age=0');
    return res.status(200).json({ art: m, url: m[id] });
  } catch (e) {
    console.error('art-gen', e.message);
    return res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
}
