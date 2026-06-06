// KODESH — Plan limits using Supabase REST API directly (no npm)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export const PLAN_LIMITS = {
  free:   { searches: 10,  assistant: 15  },
  berith: { searches: 80,  assistant: 150 },
  pro:    { searches: 300, assistant: 400 },
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
  if (planData?.plan && planData?.subscription_status === 'active') {
    if (!planData.current_period_end || new Date(planData.current_period_end) > new Date()) {
      plan = planData.plan;
    }
  }

  // Get usage
  const usageData = await sbGet('ai_usage', {
    'user_id': `eq.${userId}`,
    'month': `eq.${month}`,
    'select': 'searches_used,assistant_used'
  });

  return {
    plan,
    limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free,
    usage: {
      searches: usageData?.searches_used || 0,
      assistant: usageData?.assistant_used || 0,
    },
    month,
  };
}

export async function incrementUsage(userId, type, month) {
  const field = type === 'search' ? 'searches_used' : 'assistant_used';

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
    }, 'user_id,month');
  }
}

export async function checkLimit(userId, type) {
  const { plan, limits, usage, month } = await getUserPlanAndUsage(userId);
  const used = type === 'search' ? usage.searches : usage.assistant;
  const limit = type === 'search' ? limits.searches : limits.assistant;

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan,
    month,
  };
}
