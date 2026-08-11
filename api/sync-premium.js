// KODESH — Activates Premium for the authenticated user only after verifying
// their entitlement directly with RevenueCat's server-side API. The client
// (profile.html) calls this right after a StoreKit purchase/restore succeeds,
// but the actual Supabase write only happens if RevenueCat confirms it.
import { requireUser } from './_auth.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RC_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
const RC_ENTITLEMENT = 'KODESH Pro';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const user = await requireUser(req, res);
  if (!user) return; // requireUser already sent 401

  if (!RC_SECRET_KEY) {
    console.error('sync-premium: REVENUECAT_SECRET_KEY no configurada');
    return res.status(503).json({ error: 'service_unavailable' });
  }

  try {
    const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
      headers: { 'Authorization': `Bearer ${RC_SECRET_KEY}` },
    });

    if (!rcRes.ok) {
      return res.status(200).json({ success: false, plan: 'free' });
    }

    const rcData = await rcRes.json();
    const entitlement = rcData?.subscriber?.entitlements?.[RC_ENTITLEMENT];
    const isActive = !!entitlement && (!entitlement.expires_date || new Date(entitlement.expires_date) > new Date());

    if (!isActive) {
      return res.status(200).json({ success: false, plan: 'free' });
    }

    // RevenueCat marca period_type='trial' mientras dura la prueba gratis de
    // 7 días; lo reflejamos en subscription_status para que el badge de la
    // app diga "Prueba gratis" en vez de "Premium" durante ese período.
    const isTrial = entitlement.period_type === 'trial' || entitlement.period_type === 'intro';

    await fetch(`${SB_URL}/rest/v1/user_plans?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: user.id,
        plan: 'premium',
        subscription_status: isTrial ? 'trialing' : 'active',
        current_period_end: entitlement.expires_date || null,
        updated_at: new Date().toISOString(),
      }),
    });

    return res.status(200).json({ success: true, plan: 'premium' });
  } catch (err) {
    console.error('sync-premium error:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
}
