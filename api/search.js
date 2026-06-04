export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query requerida' });

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
        system: `Eres un asistente bíblico para KODESH. Encuentra los 3 versículos más relevantes. Usa YHWH, Yeshúa, Mashíaj. Responde SOLO en JSON: {"resultados":[{"referencia":"Josué 1:9","libro_id":"JOS","capitulo":1,"versiculo":9,"texto":"texto...","razon":"por qué es relevante"}]}`,
        messages: [{ role: 'user', content: query }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {resultados:[]}; }
    return res.status(200).json(parsed);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
