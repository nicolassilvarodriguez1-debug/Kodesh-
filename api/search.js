export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, userId } = req.body;
  if (!query) return res.status(400).json({ error: 'Query requerida' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  const LIMITS = { free: 10, premium: 80 };
  const month = new Date().toISOString().slice(0, 7);

  // Check limits if user is logged in
  if (userId && SB_URL && SB_KEY) {
    try {
      const headers = {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      };

      // Get plan
      const planRes = await fetch(`${SB_URL}/rest/v1/user_plans?user_id=eq.${userId}&select=plan,subscription_status&limit=1`, { headers });
      const planData = await planRes.json();
      const plan = planData?.[0]?.subscription_status === 'active' ? (planData[0].plan || 'free') : 'free';
      const limit = LIMITS[plan] || LIMITS.free;

      // Get usage
      const usageRes = await fetch(`${SB_URL}/rest/v1/ai_usage?user_id=eq.${userId}&month=eq.${month}&select=searches_used&limit=1`, { headers });
      const usageData = await usageRes.json();
      const used = usageData?.[0]?.searches_used || 0;

      if (used >= limit) {
        return res.status(429).json({
          error: 'limit_reached',
          plan, used, limit,
          message: plan === 'free'
            ? `Alcanzaste tu límite de ${limit} búsquedas este mes. Actualiza a Premium para continuar.`
            : `Alcanzaste tu límite de ${limit} búsquedas este mes.`,
        });
      }
    } catch(e) {
      console.warn('Limit check error:', e.message);
    }
  }

  // Call Anthropic
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `Eres un asistente bíblico para KODESH, plataforma Hebreo-Mesiánica. Encuentra los 3 versículos más relevantes. Usa YHWH, Yeshúa, Mashíaj. Responde SOLO en JSON: {"resultados":[{"referencia":"Josué 1:9","libro_id":"JOS","capitulo":1,"versiculo":9,"texto":"texto...","razon":"razón"}]}`,
        messages: [{ role: 'user', content: query }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { resultados: [] }; }

    // Increment usage
    if (userId && SB_URL && SB_KEY) {
      try {
        const headers = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' };
        const usageRes = await fetch(`${SB_URL}/rest/v1/ai_usage?user_id=eq.${userId}&month=eq.${month}&select=searches_used&limit=1`, { headers });
        const usageData = await usageRes.json();
        const current = usageData?.[0]?.searches_used || 0;
        if (usageData?.[0]) {
          await fetch(`${SB_URL}/rest/v1/ai_usage?user_id=eq.${userId}&month=eq.${month}`, { method: 'PATCH', headers, body: JSON.stringify({ searches_used: current + 1 }) });
        } else {
          await fetch(`${SB_URL}/rest/v1/ai_usage`, { method: 'POST', headers, body: JSON.stringify({ user_id: userId, month, searches_used: 1, assistant_used: 0 }) });
        }
      } catch(e) { console.warn('Usage increment error:', e.message); }
    }

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
