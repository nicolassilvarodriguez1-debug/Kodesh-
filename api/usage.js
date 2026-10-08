// KODESH — Plan y uso del mes del usuario que llama (requiere sesión: el
// userId sale del token, nunca del cuerpo, para que nadie consulte a otro).
import { getUserPlanAndUsage } from './_limits.js';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const info = await getUserPlanAndUsage(user.id);
    return res.status(200).json({
      plan: info.plan,
      limits: info.limits,
      usage: info.usage,
      month: info.month,
      remaining: {
        searches: Math.max(0, info.limits.searches - info.usage.searches),
        assistant: Math.max(0, info.limits.assistant - info.usage.assistant),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'usage_failed' });
  }
}
