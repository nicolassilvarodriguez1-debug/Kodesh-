// KODESH — Interlinear endpoint (premium feature)
// Returns per-word interlinear data (Hebrew + Strong's + morphology + Spanish gloss)
// for a given book/chapter from interlinear_cache.

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

async function getUserPlan(userId) {
  if (!userId) return 'free';
  try {
    const data = await sbGet(`user_plans?user_id=eq.${userId}&select=plan,subscription_status&limit=1`);
    if (data?.[0]?.subscription_status === 'active') return data[0].plan || 'free';
  } catch(e) {}
  return 'free';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { book, chapter, userId } = req.body;
  if (!book || !chapter) return res.status(400).json({ error: 'book y chapter requeridos' });

  // Check premium
  const plan = await getUserPlan(userId);
  if (plan !== 'premium') {
    return res.status(403).json({
      error: 'premium_required',
      message: 'El Modo Interlineal es una función Premium. Actualiza tu plan para acceder al texto hebreo/griego original con análisis palabra por palabra.',
    });
  }

  try {
    const data = await sbGet(
      `interlinear_cache?book=eq.${book.toUpperCase()}&chapter=eq.${chapter}&select=verse,word_order,original_text,strongs,morph_code,morph_label,gloss,language&order=verse.asc,word_order.asc`
    );

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'not_available', message: 'El Modo Interlineal aún no está disponible para este capítulo.' });
    }

    // Group by verse
    const verses = {};
    for (const row of data) {
      if (!verses[row.verse]) verses[row.verse] = [];
      verses[row.verse].push({
        text: row.original_text,
        strongs: row.strongs,
        morph: row.morph_label,
        gloss: row.gloss,
        language: row.language,
      });
    }

    return res.status(200).json({ book: book.toUpperCase(), chapter: Number(chapter), verses });
  } catch(err) {
    console.error('Interlinear error:', err);
    return res.status(500).json({ error: err.message });
  }
}
