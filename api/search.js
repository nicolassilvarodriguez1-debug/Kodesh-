import { checkLimit, incrementUsage } from './_limits.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, userId } = req.body;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query requerida' });

  // ── Check limits ──
  if (userId) {
    try {
      const check = await checkLimit(userId, 'search');
      if (!check.allowed) {
        return res.status(429).json({
          error: 'limit_reached',
          plan: check.plan,
          used: check.used,
          limit: check.limit,
          message: check.plan === 'free'
            ? `Alcanzaste tu límite de ${check.limit} búsquedas este mes. Actualiza a Berith para continuar.`
            : `Alcanzaste tu límite de ${check.limit} búsquedas este mes.`,
        });
      }
    } catch(e) {
      console.warn('Limit check error:', e.message);
      // Don't block if limit check fails
    }
  }

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
        system: `Eres un asistente bíblico para KODESH, plataforma Hebreo-Mesiánica hispanohablante.
Cuando el usuario haga una pregunta o descripción, encuentra los 3 versículos más relevantes de toda la Biblia.
Usa siempre nombres mesiánicos: YHWH, Yeshúa, Mashíaj.
Responde SOLO en JSON válido sin texto adicional ni backticks:
{"resultados":[{"referencia":"Josué 1:9","libro_id":"JOS","capitulo":1,"versiculo":9,"texto":"texto...","razon":"por qué es relevante"}]}`,
        messages: [{ role: 'user', content: query }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {resultados:[]}; }

    // ── Increment usage after successful call ──
    if (userId) {
      try {
        const { getCurrentMonth } = await import('./_limits.js');
        await incrementUsage(userId, 'search', getCurrentMonth());
      } catch(e) { console.warn('Usage increment error:', e.message); }
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
