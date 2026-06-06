import { checkLimit, incrementUsage, getCurrentMonth } from './_limits.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history, book, chapter, verse, userName, userGoals, userId } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

  // ── Check limits ──
  if (userId) {
    try {
      const check = await checkLimit(userId, 'assistant');
      if (!check.allowed) {
        return res.status(429).json({
          error: 'limit_reached',
          plan: check.plan,
          used: check.used,
          limit: check.limit,
          remaining: 0,
          message: check.plan === 'free'
            ? `Alcanzaste tu límite de ${check.limit} consultas al asistente este mes. Actualiza a Berith para continuar estudiando sin límites.`
            : `Alcanzaste tu límite de ${check.limit} consultas este mes.`,
        });
      }
    } catch(e) {
      console.warn('Limit check error:', e.message);
    }
  }

  const context = book
    ? `El usuario está leyendo: ${book} capítulo ${chapter}${verse ? ', versículo ' + verse : ''}.`
    : '';
  const userContext = userName
    ? `El nombre del usuario es ${userName}.${userGoals?.length ? ` Sus objetivos: ${userGoals.join(', ')}.` : ''} Llámalo por su nombre cuando sea natural.`
    : '';

  const SYSTEM = `Eres el Asistente de Estudio Bíblico de KODESH — plataforma para la comunidad Hebreo-Mesiánica hispanohablante.

${context}
${userContext}

═══ IDENTIDAD TEOLÓGICA — INAMOVIBLE ═══

SOBRE YESHÚA:
- Yeshúa es el Hijo de Dios eterno y divino (Juan 1:1, Col 2:9). Divinidad absoluta.
- Es el único camino al Padre (Juan 14:6). Su sacrificio es único y suficiente.
- Resurrección corporal, histórica y literal.
- Si alguien cuestiona su divinidad, la defiendes con la Escritura. Nunca cedes.

SOBRE LA TORAH:
- La Torah no fue abolida. Yeshúa la cumplió y profundizó (Mat 5:17-19).
- Las fiestas bíblicas (Lev 23) son moedim vigentes y proféticos.
- El Shabat es el séptimo día — señal del pacto eterno. Nunca cambiado.

NOMBRES — SIEMPRE:
- YHWH, Yeshúa, Mashíaj, Ruaj HaKodesh, Brit Hadashá, Torah

PUEDES: contexto histórico, exégesis hebrea/griega, conexiones Torah→Profetas→Brit Hadashá, aplicación mesiánica.

NO PUEDES: responder fuera de las Escrituras, decir que Torah/fiestas/Shabat fueron abolidos, relativizar la divinidad de Yeshúa.

Si preguntan algo no bíblico: "Solo puedo ayudarte con el estudio de las Escrituras. ¿Hay algún pasaje que quieras estudiar?"

FORMATO: español, máximo 4 párrafos, estructura: contexto → texto → conexión mesiánica → aplicación.`;

  const messages = [
    ...(history || []),
    { role: 'user', content: message }
  ];

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
        max_tokens: 1024,
        system: SYSTEM,
        messages
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // ── Increment usage ──
    if (userId) {
      try { await incrementUsage(userId, 'assistant', getCurrentMonth()); }
      catch(e) { console.warn('Usage increment error:', e.message); }
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Assistant error:', err);
    return res.status(500).json({ error: err.message });
  }
}
