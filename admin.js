// KODESH Admin API — only accessible by admin user
const ADMIN_USER_ID = 'ce384f84-a3fd-41b9-a33c-163625e01804';
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return res.json();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body;

  // Verify admin
  if (userId !== ADMIN_USER_ID) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const month = new Date().toISOString().slice(0, 7);

  try {
    // Get all auth users via admin API
    const authRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=500`, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
      }
    });
    const authData = await authRes.json();
    const authUsers = authData.users || [];

    // Get profiles, plans, usage
    const [profiles, plans, usage, cache] = await Promise.all([
      sbGet('user_profiles?select=id,display_name'),
      sbGet('user_plans?select=user_id,plan,subscription_status,current_period_end'),
      sbGet(`ai_usage?select=user_id,searches_used,assistant_used,lexicon_used&month=eq.${month}`),
      sbGet('lexicon_cache?select=testament'),
    ]);

    // Build maps
    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p.display_name);

    const planMap = {};
    (plans || []).forEach(p => planMap[p.user_id] = p);

    const usageMap = {};
    (usage || []).forEach(u => usageMap[u.user_id] = u);

    // Build user list from auth users
    const users = authUsers.map(u => {
      const profile = profileMap[u.id];
      const plan = planMap[u.id];
      const use = usageMap[u.id] || {};

      const isPremium = plan?.plan === 'premium' && plan?.subscription_status === 'active';

      return {
        id: u.id,
        email: u.email,
        name: profile || u.user_metadata?.full_name || u.email?.split('@')[0] || '—',
        plan: isPremium ? 'premium' : 'free',
        provider: u.app_metadata?.provider || 'email',
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        searches: use.searches_used || 0,
        assistant: use.assistant_used || 0,
        lexicon: use.lexicon_used || 0,
      };
    });

    // Cache stats
    const cacheAT = (cache || []).filter(c => c.testament === 'AT').length;
    const cacheNT = (cache || []).filter(c => c.testament === 'NT').length;

    return res.status(200).json({
      users,
      month,
      cache: { total: cacheAT + cacheNT, at: cacheAT, nt: cacheNT },
    });

  } catch(err) {
    console.error('Admin error:', err);
    return res.status(500).json({ error: err.message });
  }
}
