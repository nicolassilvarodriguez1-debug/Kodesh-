// KODESH — Shared security helpers for API endpoints.
// CORS allowlist, generic error responses, and input validation.
// Nothing here talks to Anthropic/Stripe/Supabase directly.

// ── CORS ──
// Native app calls go through Capacitor's CapacitorHttp plugin, which makes a
// native OS-level request (no browser, no Origin header, no CORS enforcement
// at all). Only the web app (kodeshbible.com) and the WKWebView `fetch()`
// fallback path are subject to CORS, so this allowlist only needs to cover
// those. We do NOT reflect arbitrary origins or use '*' for endpoints that
// require Authorization.
const ALLOWED_ORIGINS = new Set([
  'https://kodeshbible.com',
  'https://www.kodeshbible.com',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
]);

// Applies CORS headers. Pass `credentials: true` only for endpoints that
// need cookies (none currently — auth is Bearer-token based).
export function applyCors(req, res, { methods = 'POST, OPTIONS', headers = 'Content-Type, Authorization' } = {}) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  // No Origin header (native CapacitorHttp, server-to-server, curl) — no ACAO
  // needed since there's no browser enforcing same-origin policy there.
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}

// ── Generic error responses ──
// Logs the real error server-side; sends a generic, safe message to the
// client. Never forwards err.message from Stripe/Supabase/Anthropic, which
// can contain internal details.
export function sendError(res, status, publicMessage, err, context) {
  if (err) console.error(`[${context || 'error'}]`, err?.message || err);
  return res.status(status).json({ error: publicMessage });
}

export const ERR = {
  badRequest: 'Solicitud inválida.',
  unauthorized: 'No autenticado.',
  forbidden: 'No tienes permiso para esta acción.',
  conflict: 'Conflicto con el estado actual.',
  rateLimited: 'Alcanzaste tu límite. Intenta más tarde.',
  internal: 'Ocurrió un error. Intenta de nuevo.',
};

// ── Input validation ──
export function isNonEmptyString(v, maxLen = 4000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

export function clampString(v, maxLen) {
  if (typeof v !== 'string') return '';
  return v.slice(0, maxLen);
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);
const AT_BOOKS = new Set(['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM',
  'EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL']);
export const ALL_BOOKS = new Set([...AT_BOOKS, ...NT_BOOKS]);

export function isValidBookId(id) {
  return typeof id === 'string' && ALL_BOOKS.has(id.toUpperCase());
}

export function isValidChapter(n) {
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= 150;
}

export function isValidVerse(n) {
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= 176;
}

// Validates a chat-style history array: capped length, each item a plain
// { role, content } with bounded content size.
export function sanitizeHistory(history, { maxItems = 20, maxContentLen = 4000 } = {}) {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxItems)
    .filter(h => isPlainObject(h) && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    .map(h => ({ role: h.role, content: clampString(h.content, maxContentLen) }));
}

// Validates sourceVerses: { "1": "text", "2": "text", ... } with bounded
// verse count and per-verse text length, to stop arbitrarily large/expensive
// payloads from reaching Anthropic.
export function sanitizeSourceVerses(sourceVerses, { maxVerses = 176, maxLen = 2000 } = {}) {
  if (!isPlainObject(sourceVerses)) return null;
  const keys = Object.keys(sourceVerses);
  if (keys.length === 0 || keys.length > maxVerses) return null;
  const out = {};
  for (const k of keys) {
    if (!/^\d{1,3}$/.test(k)) return null;
    const v = sourceVerses[k];
    if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) return null;
    out[k] = v;
  }
  return out;
}
