// KODESH Lexicon API — AI-powered Strong's lookup
// Uses Claude to find the correct Hebrew/Greek entry for any Spanish word

const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, bookId, verseContext } = req.body;
  if (!word) return res.status(400).json({ error: 'word required' });

  const isNT = NT_BOOKS.has(bookId);
  const lang = isNT ? 'griego' : 'hebreo';
  const testament = isNT ? 'Nuevo Testamento' : 'Antiguo Testamento';

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
        max_tokens: 400,
        system: `Eres un experto en léxico bíblico hebreo y griego para la plataforma KODESH (Hebreo-Mesiánica).
Cuando te den una palabra en español del ${testament}, devuelve su entrada Strong's en ${lang}.

REGLAS ESTRICTAS:
- Si es Antiguo Testamento: usa SIEMPRE hebreo (Strong's H####)
- Si es Nuevo Testamento: usa SIEMPRE griego (Strong's G####)
- Usa nombres mesiánicos: YHWH, Yeshúa, Mashíaj
- Responde SOLO en JSON válido sin texto extra ni backticks

Formato exacto:
{"found":true,"strongs":"H1234","lemma":"אָב","transliteration":"av","pronunciation":"awv","definition":"padre, antepasado. Raíz de la relación de YHWH con Israel como Padre.","language":"hebreo"}

Si la palabra no tiene entrada Strong's significativa: {"found":false}`,
        messages: [{
          role: 'user',
          content: `Palabra: "${word}" | Libro: ${bookId} | Testamento: ${testament}${verseContext ? ` | Contexto: "${verseContext}"` : ''}`
        }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch(e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { found: false };
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Lexicon error:', err.message);
    return res.status(500).json({ found: false, error: err.message });
  }
}
