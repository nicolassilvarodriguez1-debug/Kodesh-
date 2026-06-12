import { checkLimit, incrementUsage, getCurrentMonth } from './_limits.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history, book, chapter, verse, userName, userGoals, userId } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

  // Check limits
  let month;
  if (userId) {
    try {
      const { allowed, used, limit, plan, month: m } = await checkLimit(userId, 'assistant');
      month = m;
      if (!allowed) {
        return res.status(429).json({
          error: 'limit_reached', plan, used, limit,
          message: plan === 'free'
            ? `Alcanzaste tu límite de ${limit} consultas al asistente este mes. Actualiza a Premium para continuar estudiando sin límites.`
            : `Alcanzaste tu límite de ${limit} consultas este mes.`,
        });
      }
    } catch(e) { console.warn('Limit check error:', e.message); month = getCurrentMonth(); }
  }

  const context = book ? `El usuario lee: ${book} capítulo ${chapter}${verse ? ', versículo ' + verse : ''}.` : '';
  const userCtx = userName ? `El nombre del usuario es ${userName}.${userGoals?.length ? ` Sus objetivos: ${userGoals.join(', ')}.` : ''} Llámalo por su nombre.` : '';

  const SYSTEM = `Eres el Asistente de Estudio Bíblico de KODESH — plataforma Hebreo-Mesiánica hispanohablante.
${context}
${userCtx}

SOBRE YESHÚA (INAMOVIBLE): Es el Hijo de Dios eterno y divino (Juan 1:1, Col 2:9). Único camino al Padre (Juan 14:6). Resurrección corporal y literal. Defiendes su divinidad siempre.
SOBRE TORAH: No fue abolida (Mat 5:17-19). Fiestas bíblicas vigentes. Shabat séptimo día eterno.
NOMBRES: Usa siempre YHWH, Yeshúa, Mashíaj, Ruaj HaKodesh, Brit Hadashá.
PUEDES: contexto histórico, exégesis, conexiones Torah→Profetas→Brit Hadashá, aplicación mesiánica.
NO PUEDES: responder fuera de las Escrituras, decir que Torah/fiestas/Shabat fueron abolidos.
Si preguntan algo no bíblico: "Solo puedo ayudarte con el estudio de las Escrituras."
FORMATO: español, máximo 4 párrafos, estructura: contexto → texto → conexión mesiánica → aplicación.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: SYSTEM, messages: [...(history || []), { role: 'user', content: message }] })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // Increment usage
    if (userId) {
      try {
        await incrementUsage(userId, 'assistant', month || getCurrentMonth());
      } catch(e) { console.warn('Usage increment error:', e.message); }
    }

    return res.status(200).json({ reply });
  } catch(err) {
    console.error('Assistant error:', err);
    return res.status(500).json({ error: err.message });
  }
}
