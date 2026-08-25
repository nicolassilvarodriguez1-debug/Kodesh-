// KODESH — Shared auth helper: verifies a Supabase JWT from the Authorization header.
// Uses Supabase's REST auth endpoint directly (no SDK), consistent with the rest of /api.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Decodes the (already-verified-by-Supabase) JWT payload to read the `aal` claim.
// Not a signature check — only call this on a token that just passed requireUser().
function decodeAal(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json).aal || 'aal1';
  } catch {
    return 'aal1';
  }
}

// Verifies the request's Bearer token with Supabase Auth and returns { id, email, aal }.
// On failure, writes the appropriate error response to `res` and returns null —
// callers should `return` immediately when this returns null.
export async function requireUser(req, res) {
  let authHeader = req.headers['authorization'] || req.headers['Authorization'];

  // Native-app fallback — confirmed via incident diagnostics (Aug 2026):
  // on the current iOS build, the Authorization header never arrives at
  // Vercel at all. index.html's kapiFetch() also embeds the token in a
  // reserved JSON body field (__authToken) for native calls as a backup.
  //
  // Defensive body parsing: Vercel's automatic req.body parsing depends on
  // the incoming Content-Type header arriving intact. If whatever strips
  // Authorization on this native build also strips/mangles Content-Type,
  // req.body can arrive as a raw string/Buffer instead of a parsed object,
  // which would silently break the __authToken fallback (and the rest of
  // the handler, which also reads req.body). Parse it ourselves if that
  // happened, and normalize req.body so downstream handler code benefits
  // too.
  let body = req.body;
  if (body && Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString('utf8')); } catch {}
  } else if (typeof body === 'string' && body.length) {
    try { body = JSON.parse(body); } catch {}
  }
  if (body && typeof body === 'object' && body !== req.body) {
    req.body = body;
  }

  if ((!authHeader || !authHeader.startsWith('Bearer ')) && body && typeof body.__authToken === 'string' && body.__authToken) {
    authHeader = `Bearer ${body.__authToken}`;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
    });

    if (!r.ok) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }

    const user = await r.json();
    if (!user?.id) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }

    return { id: user.id, email: user.email || null, aal: decodeAal(token) };
  } catch (e) {
    console.warn('Auth check error:', e.message);
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
}

// Like requireUser(), but also requires a row in admin_roles and an aal2
// (2FA-verified) session. Returns { id, email, role } or null (response already sent).
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;

  if (user.aal !== 'aal2') {
    res.status(403).json({ error: 'mfa_required' });
    return null;
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_roles?user_id=eq.${user.id}&select=role&limit=1`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await r.json();
    const role = rows?.[0]?.role;
    if (!role) {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    return { id: user.id, email: user.email, role };
  } catch (e) {
    console.warn('Admin role check error:', e.message);
    res.status(500).json({ error: 'internal_error' });
    return null;
  }
}
