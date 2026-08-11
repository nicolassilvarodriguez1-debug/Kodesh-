// KODESH — Portal de facturación de Stripe (solo web).
// Crea una sesión del Customer Portal de Stripe donde el usuario puede
// cancelar su suscripción, cambiar tarjeta o ver facturas, sin que
// nosotros toquemos nada manualmente.
//
// Requisito manual en Stripe: activar el "Customer Portal" en
// https://dashboard.stripe.com/settings/billing/portal (una sola vez).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  try {
    const planRes = await fetch(
      `${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=stripe_customer_id&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const planData = await planRes.json();
    const customerId = planData?.[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({ error: 'no_subscription', message: 'No encontramos una suscripción asociada a esta cuenta.' });
    }

    const sessionBody = new URLSearchParams({
      customer: customerId,
      return_url: 'https://kodeshbible.com/profile.html',
    });

    const sessionRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionBody.toString(),
    });

    const session = await sessionRes.json();
    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
