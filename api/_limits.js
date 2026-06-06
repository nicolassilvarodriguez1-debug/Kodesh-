// KODESH — Plan limits and usage tracking
// Shared module for all API functions

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Plan limits per month
export const PLAN_LIMITS = {
  free:   { searches: 10,  assistant: 15  },
  berith: { searches: 80,  assistant: 150 },
  pro:    { searches: 300, assistant: 400 },
};

export function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get user plan and current usage
export async function getUserPlanAndUsage(userId) {
  const sb = getSupabaseAdmin();
  const month = getCurrentMonth();

  // Get plan
  const { data: planData } = await sb
    .from('user_plans')
    .select('plan, subscription_status, current_period_end')
    .eq('user_id', userId)
    .single();

  let plan = 'free';
  if (planData?.plan && planData?.subscription_status === 'active') {
    // Check subscription hasn't expired
    if (!planData.current_period_end || new Date(planData.current_period_end) > new Date()) {
      plan = planData.plan;
    }
  }

  // Get usage
  const { data: usageData } = await sb
    .from('ai_usage')
    .select('searches_used, assistant_used')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    usage: {
      searches: usageData?.searches_used || 0,
      assistant: usageData?.assistant_used || 0,
    },
    month,
  };
}

// Increment usage counter
export async function incrementUsage(userId, type, month) {
  const sb = getSupabaseAdmin();
  const field = type === 'search' ? 'searches_used' : 'assistant_used';

  // Upsert — create if not exists, increment if exists
  const { data: existing } = await sb
    .from('ai_usage')
    .select(field)
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (existing) {
    await sb.from('ai_usage')
      .update({
        [field]: (existing[field] || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('month', month);
  } else {
    await sb.from('ai_usage').insert({
      user_id: userId,
      month,
      searches_used: type === 'search' ? 1 : 0,
      assistant_used: type === 'assistant' ? 1 : 0,
    });
  }
}

// Check if user can make a request
export async function checkLimit(userId, type) {
  const { plan, limits, usage, month } = await getUserPlanAndUsage(userId);
  const used = type === 'search' ? usage.searches : usage.assistant;
  const limit = type === 'search' ? limits.searches : limits.assistant;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
    plan,
    month,
  };
}
