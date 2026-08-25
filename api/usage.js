// KODESH — Usage/plan lookup for the current logged-in user.
//
// Third audit pass finding: this endpoint previously took `userId` directly
// from the request body with NO authentication at all — anyone could query
// any other user's plan and usage counters by guessing/enumerating UUIDs
// (an IDOR). It also echoed `err.message` straight to the client, which
// could leak internal Supabase error details. Both fixed: identity now
// comes only from the verified JWT (requireUser), matching every other
// endpoint in this API, and errors return a generic message.
import { getUserPlanAndUsage, PLAN_LIMITS } from './_limits.js';
import { requireUser } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res, { headers: 'Content-Type, Authorization' });
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

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
  } catch(err) {
    return sendError(res, 500, ERR.internal, err, 'usage');
  }
}
