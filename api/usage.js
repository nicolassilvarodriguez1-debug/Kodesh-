import { getUserPlanAndUsage, PLAN_LIMITS } from './_limits.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  try {
    const info = await getUserPlanAndUsage(userId);
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
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
