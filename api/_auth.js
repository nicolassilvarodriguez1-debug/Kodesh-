// KODESH — Shared auth helper: verifies a Supabase JWT from the Authorization header.
// Uses Supabase's REST auth endpoint directly (no SDK), consistent with the rest of /api.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Verifies the request's Bearer token with Supabase Auth and returns { id, email }.
// On failure, writes the appropriate error response to `res` and returns null —
// callers should `return` immediately when this returns null.
export async function requireUser(req, res) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
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

    return { id: user.id, email: user.email || null };
  } catch (e) {
    console.warn('Auth check error:', e.message);
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
}
