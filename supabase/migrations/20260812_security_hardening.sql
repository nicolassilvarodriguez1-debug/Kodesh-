-- KODESH — Security hardening migration
-- Idempotent: safe to run multiple times.
--
-- What this does:
--   1. Ensures ai_usage has a UNIQUE(user_id, month) constraint.
--   2. Adds consume_ai_usage() / release_ai_usage() — atomic, row-locked
--      quota check+increment for search/assistant/lexicon usage, replacing
--      the old read-then-write pattern that could race under concurrency.
--   3. Adds a generic check_rate_limit() RPC for endpoints that don't have
--      a monthly quota (textual translation, interlinear generation).
--   4. Adds a stripe_webhook_events table for webhook idempotency.
--   5. Locks all new functions down to the service_role only — the app
--      always calls these from serverless functions using the service key
--      after verifying the user's JWT with requireUser(), never directly
--      from the browser/app with the user's own token.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste this file → Run.
-- (Or: supabase db push / supabase migration up if you use the CLI locally.)

-- ── 1. ai_usage: unique constraint on (user_id, month) ──
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_usage_user_month_key'
  ) then
    alter table public.ai_usage
      add constraint ai_usage_user_month_key unique (user_id, month);
  end if;
exception when duplicate_table then null;
end $$;

-- ── 2. consume_ai_usage(user_id, type) — atomic check + increment ──
create or replace function public.consume_ai_usage(p_user_id uuid, p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_plan text;
  v_status text;
  v_period_end timestamptz;
  v_effective_plan text := 'free';
  v_limit int;
  v_row public.ai_usage%rowtype;
  v_used int;
  v_field text;
begin
  if p_type not in ('search', 'assistant', 'lexicon') then
    raise exception 'invalid_usage_type';
  end if;

  select plan, subscription_status, current_period_end
    into v_plan, v_status, v_period_end
    from public.user_plans
    where user_id = p_user_id;

  -- 'active' and 'trialing' both count as premium while the period hasn't
  -- lapsed. Anything else (or no row at all) is free.
  if v_status in ('active', 'trialing') and (v_period_end is null or v_period_end > now()) then
    v_effective_plan := coalesce(v_plan, 'free');
  end if;

  v_limit := case
    when v_effective_plan = 'premium' and p_type = 'search'    then 80
    when v_effective_plan = 'premium' and p_type = 'assistant' then 70
    when v_effective_plan = 'premium' and p_type = 'lexicon'   then 999999
    when p_type = 'search'    then 10
    when p_type = 'assistant' then 3
    else 15 -- free lexicon
  end;

  -- Ensure a row exists, then lock it for this transaction so concurrent
  -- calls for the same user+month serialize on this row instead of racing.
  insert into public.ai_usage (user_id, month)
    values (p_user_id, v_month)
    on conflict (user_id, month) do nothing;

  select * into v_row from public.ai_usage
    where user_id = p_user_id and month = v_month
    for update;

  v_used := case p_type
    when 'search' then v_row.searches_used
    when 'assistant' then v_row.assistant_used
    else v_row.lexicon_used
  end;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false, 'used', v_used, 'limit', v_limit,
      'remaining', 0, 'plan', v_effective_plan, 'month', v_month
    );
  end if;

  if p_type = 'search' then
    update public.ai_usage set searches_used = searches_used + 1, updated_at = now()
      where user_id = p_user_id and month = v_month;
  elsif p_type = 'assistant' then
    update public.ai_usage set assistant_used = assistant_used + 1, updated_at = now()
      where user_id = p_user_id and month = v_month;
  else
    update public.ai_usage set lexicon_used = lexicon_used + 1, updated_at = now()
      where user_id = p_user_id and month = v_month;
  end if;

  v_used := v_used + 1;
  return jsonb_build_object(
    'allowed', true, 'used', v_used, 'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used), 'plan', v_effective_plan, 'month', v_month
  );
end;
$$;

-- Releases (decrements) one unit of usage — called when the Anthropic call
-- fails after quota was already reserved, so a failed request doesn't
-- permanently cost the user part of their monthly quota.
create or replace function public.release_ai_usage(p_user_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_month text := to_char(now(), 'YYYY-MM');
begin
  if p_type = 'search' then
    update public.ai_usage set searches_used = greatest(0, searches_used - 1), updated_at = now()
      where user_id = p_user_id and month = v_month;
  elsif p_type = 'assistant' then
    update public.ai_usage set assistant_used = greatest(0, assistant_used - 1), updated_at = now()
      where user_id = p_user_id and month = v_month;
  elsif p_type = 'lexicon' then
    update public.ai_usage set lexicon_used = greatest(0, lexicon_used - 1), updated_at = now()
      where user_id = p_user_id and month = v_month;
  end if;
end;
$$;

revoke all on function public.consume_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, text) to service_role;
revoke all on function public.release_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.release_ai_usage(uuid, text) to service_role;

-- ── 3. Generic rate limiter for non-quota endpoints (textual, interlinear) ──
create table if not exists public.api_rate_limit (
  user_id uuid not null,
  endpoint text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, endpoint, window_start)
);

-- Not meant to be reachable via PostgREST/anon/authenticated at all — only
-- the check_rate_limit() function (service_role only, see below) touches
-- this table. RLS with no policies denies all direct access; service_role
-- bypasses RLS entirely so the function keeps working.
alter table public.api_rate_limit enable row level security;

create or replace function public.check_rate_limit(
  p_user_id uuid, p_endpoint text, p_max int, p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.api_rate_limit (user_id, endpoint, window_start, count)
    values (p_user_id, p_endpoint, v_window, 0)
    on conflict (user_id, endpoint, window_start) do nothing;

  update public.api_rate_limit set count = count + 1
    where user_id = p_user_id and endpoint = p_endpoint and window_start = v_window
    returning count into v_count;

  return jsonb_build_object('allowed', v_count <= p_max, 'count', v_count, 'max', p_max);
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, int, int) to service_role;

-- ── 4. Stripe webhook idempotency ──
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text,
  processed_at timestamptz not null default now()
);

-- Same reasoning as api_rate_limit above: only api/webhook.js (service_role)
-- ever touches this table. No client, including authenticated users,
-- should be able to read or write Stripe event IDs directly.
alter table public.stripe_webhook_events enable row level security;

-- ── 5. Also lock down ai_usage direct access from the client ──
-- consume_ai_usage()/release_ai_usage() are SECURITY DEFINER and already
-- restricted to service_role via the grants above. ai_usage itself, though,
-- may still be reachable directly via PostgREST with the user's own JWT if
-- it predates RLS being enabled — which would let a user query (or worse,
-- patch) another user's row by calling the table directly instead of going
-- through the RPC.
--
-- The web app legitimately reads/deletes the CURRENT user's own row
-- directly via the Supabase client (profile.html: usage display, and the
-- "delete my account" flow), so we can't just block all client access —
-- instead we scope it to auth.uid() = user_id, and deliberately do NOT add
-- an UPDATE/INSERT policy for anon/authenticated: counters may only be
-- incremented through consume_ai_usage()/release_ai_usage() (service_role,
-- bypasses RLS), never written directly by a client.
alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_usage_delete_own on public.ai_usage;
create policy ai_usage_delete_own on public.ai_usage
  for delete
  to authenticated
  using (auth.uid() = user_id);
