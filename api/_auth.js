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
  // Vercel at all (verified server-side: header names received contain no
  // "authorization" entry, on repeated real-device attempts, both via
  // CapacitorHttp and the fetch() fallback). This isn't a bug in this file
  // — the header is lost somewhere in the native networking stack before
  // the request leaves the device. Rather than depend on a header that
  // demonstrably doesn't survive the trip, index.html's kapiFetch() now
  // also embeds the token in a reserved JSON body field for native calls;
  // request bodies aren't affected by whatever is stripping headers. Only
  // used when the header is missing/malformed, so web (which sends the
  // header fine) is unaffected.
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && req.body && typeof req.body.__authToken === 'string' && req.body.__authToken) {
    authHeader = `Bearer ${req.body.__authToken}`;
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
