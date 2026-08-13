// KODESH — Plan limits using Supabase REST API directly (no npm)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export const PLAN_LIMITS = {
  free:    { searches: 10, assistant: 3,  lexicon: 15 },
  premium: { searches: 80, assistant: 70, lexicon: 999999 },
};

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function sbGet(table, filters) {
  const params = new URLSearchParams(filters);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}&limit=1`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0] : null;
}

async function sbUpsert(table, body, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(body)
  });
  return res.ok;
}

async function sbPatch(table, filters, body) {
  const params = new URLSearchParams(filters);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  return res.ok;
}

export async function getUserPlanAndUsage(userId) {
  const month = getCurrentMonth();

  // Get plan
  const planData = await sbGet('user_plans', {
    'user_id': `eq.${userId}`,
    'select': 'plan,subscription_status,current_period_end'
  });

  let plan = 'free';
  // 'active' and 'trialing' both count as premium while the period hasn't lapsed.
  if (planData?.plan && (planData?.subscription_status === 'active' || planData?.subscription_status === 'trialing')) {
    if (!planData.current_period_end || new Date(planData.current_period_end) > new Date()) {
      plan = planData.plan;
    }
  }

  // Get usage
  const usageData = await sbGet('ai_usage', {
    'user_id': `eq.${userId}`,
    'month': `eq.${month}`,
    'select': 'searches_used,assistant_used,lexicon_used'
  });

  return {
    plan,
    limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free,
    usage: {
      searches: usageData?.searches_used || 0,
      assistant: usageData?.assistant_used || 0,
      lexicon: usageData?.lexicon_used || 0,
    },
    month,
  };
}

export async function incrementUsage(userId, type, month) {
  const field = type === 'search' ? 'searches_used' : type === 'lexicon' ? 'lexicon_used' : 'assistant_used';

  const existing = await sbGet('ai_usage', {
    'user_id': `eq.${userId}`,
    'month': `eq.${month}`,
    'select': field
  });

  if (existing) {
    const newVal = (existing[field] || 0) + 1;
    await sbPatch('ai_usage',
      { 'user_id': `eq.${userId}`, 'month': `eq.${month}` },
      { [field]: newVal, updated_at: new Date().toISOString() }
    );
  } else {
    await sbUpsert('ai_usage', {
      user_id: userId,
      month,
      searches_used: type === 'search' ? 1 : 0,
      assistant_used: type === 'assistant' ? 1 : 0,
      lexicon_used: type === 'lexicon' ? 1 : 0,
    }, 'user_id,month');
  }
}

// Deprecated — kept only in case something still imports it. Has a
// read-then-write race under concurrency. Use consumeUsage() instead, which
// calls the atomic consume_ai_usage() Postgres RPC (row-locked check+increment
// in a single transaction, see supabase/migrations/20260812_security_hardening.sql).
export async function checkLimit(userId, type) {
  const { plan, limits, usage, month } = await getUserPlanAndUsage(userId);
  const used = type === 'search' ? usage.searches : type === 'lexicon' ? usage.lexicon : usage.assistant;
  const limit = type === 'search' ? limits.searches : type === 'lexicon' ? limits.lexicon : limits.assistant;

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan,
    month,
  };
}

async function sbRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC ${fn} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Atomically checks the quota AND reserves one unit of usage in a single
// Postgres transaction (row-locked), so concurrent requests from the same
// user can never both slip past the limit. Call this BEFORE hitting
// Anthropic; if `allowed` is false, do not call Anthropic.
export async function consumeUsage(userId, type) {
  const result = await sbRpc('consume_ai_usage', { p_user_id: userId, p_type: type });
  return result; // { allowed, used, limit, remaining, plan, month }
}

// Releases (decrements) one unit of usage. Call this from a catch block if
// the Anthropic call fails after quota was already reserved, so a failed
// request doesn't permanently cost the user part of their monthly quota.
export async function releaseUsage(userId, type) {
  try { await sbRpc('release_ai_usage', { p_user_id: userId, p_type: type }); }
  catch(e) { console.warn('releaseUsage failed:', e.message); }
}

// Generic short-window rate limiter, atomic via check_rate_limit() RPC.
// Used for endpoints that don't have a monthly quota of their own
// (textual translation, interlinear generation).
// Throws on RPC failure (via sbRpc) — callers MUST fail closed (503, no
// Anthropic call) rather than catch-and-continue, since a failure here means
// we cannot verify whether the caller is within their limit.
export async function checkRateLimit(userId, endpoint, max, windowSeconds) {
  return sbRpc('check_rate_limit', { p_user_id: userId, p_endpoint: endpoint, p_max: max, p_window_seconds: windowSeconds });
}

// Distributed generation lock (supabase/migrations/
// 20260813_webhook_lifecycle_ai_usage_repair_locks.sql) — prevents two
// serverless instances from generating the same (kind, book, chapter) at
// the same time. `kind` is a free-form namespace string ('textual',
// 'interlinear') so different generators never collide with each other.
// Throws on RPC failure — callers MUST fail closed (503, no Anthropic call).
export async function acquireGenerationLock(kind, book, chapter, leaseToken, leaseSeconds) {
  return sbRpc('acquire_generation_lock', {
    p_kind: kind, p_book: book, p_chapter: chapter, p_lease_token: leaseToken, p_lease_seconds: leaseSeconds,
  });
}

// Releases a lock previously acquired with the same (kind, book, chapter,
// leaseToken). Safe to call even if the lease already expired/was reclaimed
// by someone else — the RPC only deletes a row matching OUR lease_token, so
// releasing a lock we no longer hold is a harmless no-op.
export async function releaseGenerationLock(kind, book, chapter, leaseToken) {
  return sbRpc('release_generation_lock', {
    p_kind: kind, p_book: book, p_chapter: chapter, p_lease_token: leaseToken,
  });
}
