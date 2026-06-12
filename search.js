import { checkLimit, incrementUsage, getCurrentMonth } from './_limits.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, userId } = req.body;
  if (!query) return res.status(400).json({ error: 'Query requerida' });

  // Check limits if user is logged in
  let month;
  if (userId) {
    try {
      const { allowed, used, limit, plan, month: m } = await checkLimit(userId, 'search');
      month = m;
      if (!allowed) {
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
      month = getCurrentMonth();
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
        system: `Eres un asistente bíblico para KODESH, plataforma Hebreo-Mesiánica. Encuentra los 3 versículos más relevantes. Usa YHWH, Yeshúa, Mashíaj.

IDs de libros EXACTOS que debes usar:
AT: GEN,EXO,LEV,NUM,DEU,JOS,JDG,RUT,1SA,2SA,1KI,2KI,1CH,2CH,EZR,NEH,EST,JOB,PSA,PRO,ECC,SNG,ISA,JER,LAM,EZK,DAN,HOS,JOL,AMO,OBA,JON,MIC,NAM,HAB,ZEP,HAG,ZEC,MAL
NT: MAT,MRK,LUK,JHN,ACT,ROM,1CO,2CO,GAL,EPH,PHP,COL,1TH,2TH,1TI,2TI,TIT,PHM,HEB,JAS,1PE,2PE,1JN,2JN,3JN,JUD,REV

Responde SOLO en JSON: {"resultados":[{"referencia":"Juan 21:1","libro_id":"JHN","capitulo":21,"versiculo":1,"texto":"texto...","razon":"razón"}]}`,
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
    if (userId) {
      try {
        await incrementUsage(userId, 'search', month || getCurrentMonth());
      } catch(e) { console.warn('Usage increment error:', e.message); }
    }

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
