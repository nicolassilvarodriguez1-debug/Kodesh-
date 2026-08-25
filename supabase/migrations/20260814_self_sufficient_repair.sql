-- KODESH — Third security/consistency pass: self-sufficient repair migration.
--
-- WHY THIS FILE EXISTS
-- ─────────────────────
-- 20260813_webhook_lifecycle_ai_usage_repair_locks.sql documented itself as
-- "apply after 20260812_security_hardening.sql" — but 20260812 could itself
-- fail partway through (e.g. its ai_usage UNIQUE constraint could fail with
-- unique_violation if duplicates already existed, aborting that statement
-- and, depending on how the SQL editor executes multi-statement scripts,
-- possibly leaving later statements in that file unexecuted too). That
-- created an impossible dependency: 20260813 says it needs 20260812 to have
-- finished, but 20260812 might need exactly the repair that only 20260813
-- knows how to do.
--
-- This migration does NOT assume either prior migration ran, ran fully, or
-- ran correctly. It is fully self-sufficient: every table, function, index,
-- constraint, RLS policy and grant it touches is verified/created/replaced
-- from scratch, regardless of starting state. It is safe (and a no-op
-- beyond a couple of corrective UPDATEs) to run on a database where
-- 20260812 and 20260813 already applied cleanly — which is the case for
-- KODESH's production database as of this writing (verified via the
-- queries at the end of this file before this migration was written).
--
-- It also fixes two real bugs found in this third audit pass, neither of
-- which 20260812/20260813 got right:
--
--   1. ai_usage duplicate-consolidation used min(ctid) across TWO separate
--      statements (SELECT to find the row, UPDATE it, then SELECT
--      min(ctid) AGAIN to decide what to delete). In PostgreSQL, UPDATE
--      writes a new physical row version with a NEW ctid — so the second
--      min(ctid) query could pick a DIFFERENT row than the one that was
--      just updated, and the DELETE could remove the consolidated row
--      instead of the duplicates. Fixed by keying everything off the
--      logical (user_id, month) pair instead of the physical ctid: build a
--      temp table of per-group totals, delete every row in a group that
--      had duplicates, then re-insert exactly one consolidated row per
--      group. (In KODESH's production database this bug never actually
--      lost data — verification query (a) below confirms zero duplicate
--      rows existed — but the logic itself was unsound and would have
--      corrupted data on any database where duplicates DID exist.)
--
--   2. stripe_webhook_events' legacy backfill (from 20260813) marked every
--      pre-redesign row (identified by lease_token IS NULL) as 'completed'
--      — but the OLD webhook code inserted a row the instant it SAW an
--      event id, before doing any real work; a row existing there proves
--      only "we saw this event once", never "we successfully processed
--      it". A crash or a failed Supabase write under the old code would
--      leave exactly this signature (id present, no further trace of
--      failure) — indistinguishable from genuine success. This migration
--      reclassifies every lease_token-IS-NULL row (which the OLD code
--      never touched — that column didn't exist for it to set) to
--      'legacy_unknown', a new state that the webhook handler treats as
--      "already settled, never blindly reprocess" (same as 'completed',
--      to avoid overwriting a user's current plan with an old event's
--      stale payload) but that is honestly distinguishable for manual
--      reconciliation. See scripts/reconcile-stripe-subscriptions.mjs.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste this file → Run.
-- This is the ONLY file you need to run for this third pass — it
-- supersedes needing to re-run 20260812 or 20260813 (both are kept in this
-- folder for history; do not delete them).

-- ════════════════════════════════════════════════════════════════════
-- 1. ai_usage — UNIQUE(user_id, month), verified by columns, with a
--    ctid-safe duplicate consolidation.
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  v_constraint_cols text[];
  v_pre_totals record;
  v_post_totals record;
begin
  select array_agg(kcu.column_name::text order by kcu.column_name::text)
    into v_constraint_cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
     and kcu.table_name = tc.table_name
    where tc.constraint_type = 'UNIQUE'
      and tc.table_schema = 'public'
      and tc.table_name = 'ai_usage'
    group by tc.constraint_name
    having array_agg(kcu.column_name::text order by kcu.column_name::text) = array['month','user_id']::text[]
    limit 1;

  if v_constraint_cols is null then
    select sum(coalesce(searches_used, 0)) as s, sum(coalesce(assistant_used, 0)) as a, sum(coalesce(lexicon_used, 0)) as l
      into v_pre_totals from public.ai_usage;

    -- Per-(user_id, month) totals, keyed ONLY by logical columns — never by
    -- ctid, which is not stable across statements once any row in the
    -- group has been touched by DELETE/INSERT below.
    create temp table _ai_usage_dedup_totals on commit drop as
    select user_id, month,
           sum(coalesce(searches_used, 0))  as total_searches,
           sum(coalesce(assistant_used, 0)) as total_assistant,
           sum(coalesce(lexicon_used, 0))   as total_lexicon,
           max(updated_at)                  as last_updated,
           count(*)                         as row_count
    from public.ai_usage
    group by user_id, month;

    -- Delete every row belonging to a group that had more than one row.
    -- Groups with exactly one row are never matched here, so they are left
    -- completely untouched (not even an UPDATE).
    delete from public.ai_usage a
      using _ai_usage_dedup_totals t
      where a.user_id = t.user_id and a.month = t.month and t.row_count > 1;

    -- Re-insert exactly one consolidated row per group that had duplicates.
    insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    select user_id, month, total_searches, total_assistant, total_lexicon, coalesce(last_updated, now())
    from _ai_usage_dedup_totals
    where row_count > 1;

    -- Verify no usage was lost in the process before committing to the new
    -- constraint. If this ever fires, the whole DO block (and everything
    -- in it) rolls back — we never leave the database in an uncertain
    -- half-consolidated state.
    select sum(coalesce(searches_used, 0)) as s, sum(coalesce(assistant_used, 0)) as a, sum(coalesce(lexicon_used, 0)) as l
      into v_post_totals from public.ai_usage;
    if v_pre_totals.s is distinct from v_post_totals.s
       or v_pre_totals.a is distinct from v_post_totals.a
       or v_pre_totals.l is distinct from v_post_totals.l then
      raise exception 'ai_usage dedup lost counters: before=(searches=%, assistant=%, lexicon=%) after=(searches=%, assistant=%, lexicon=%)',
        v_pre_totals.s, v_pre_totals.a, v_pre_totals.l, v_post_totals.s, v_post_totals.a, v_post_totals.l;
    end if;

    -- Now safe: no two rows can share (user_id, month) anymore.
    alter table public.ai_usage add constraint ai_usage_user_month_key unique (user_id, month);
  end if;
end $$;

-- consume_ai_usage() / release_ai_usage() — redefined unconditionally
-- (create or replace is itself idempotent/safe) in case 20260812 failed
-- before reaching these definitions. Body is byte-identical to
-- 20260812_security_hardening.sql's version.
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
begin
  if p_type not in ('search', 'assistant', 'lexicon') then
    raise exception 'invalid_usage_type';
  end if;

  select plan, subscription_status, current_period_end
    into v_plan, v_status, v_period_end
    from public.user_plans
    where user_id = p_user_id;

  if v_status in ('active', 'trialing') and (v_period_end is null or v_period_end > now()) then
    v_effective_plan := coalesce(v_plan, 'free');
  end if;

  v_limit := case
    when v_effective_plan = 'premium' and p_type = 'search'    then 80
    when v_effective_plan = 'premium' and p_type = 'assistant' then 70
    when v_effective_plan = 'premium' and p_type = 'lexicon'   then 999999
    when p_type = 'search'    then 10
    when p_type = 'assistant' then 3
    else 15
  end;

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

alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists ai_usage_delete_own on public.ai_usage;
create policy ai_usage_delete_own on public.ai_usage
  for delete to authenticated using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════
-- 2. api_rate_limit / check_rate_limit()
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.api_rate_limit (
  user_id uuid not null,
  endpoint text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, endpoint, window_start)
);
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

-- ════════════════════════════════════════════════════════════════════
-- 3. STRIPE WEBHOOK LIFECYCLE — full schema, legacy-safe backfill
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text
);

alter table public.stripe_webhook_events add column if not exists status text not null default 'processing';
alter table public.stripe_webhook_events add column if not exists attempts int not null default 1;
alter table public.stripe_webhook_events add column if not exists last_error text;
alter table public.stripe_webhook_events add column if not exists lease_token text;
alter table public.stripe_webhook_events add column if not exists created_at timestamptz not null default now();
alter table public.stripe_webhook_events add column if not exists updated_at timestamptz not null default now();
alter table public.stripe_webhook_events add column if not exists completed_at timestamptz;

-- Drop and recreate the check constraint unconditionally so its allowed
-- values are always in sync with this file, regardless of what an earlier
-- migration attempt left behind (e.g. the narrower 3-value version from
-- 20260813).
alter table public.stripe_webhook_events drop constraint if exists stripe_webhook_events_status_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
  check (status in ('processing', 'completed', 'failed', 'legacy_unknown', 'reconciled'));

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, updated_at);

-- CORRECTED legacy backfill. A row with lease_token IS NULL was NEVER
-- touched by claim_stripe_webhook_event() (which always sets a lease
-- token) — it can only be a row inserted by the pre-redesign webhook code,
-- which recorded "seen" the instant an event id arrived, before doing any
-- real work. That is NOT evidence of successful processing (see the
-- header comment above). Reclassify these as 'legacy_unknown' rather than
-- 'completed' — this is corrective even if an earlier migration attempt
-- already (incorrectly) set some of these rows to 'completed', since we
-- match on lease_token IS NULL, not on the current status value.
update public.stripe_webhook_events
  set status = 'legacy_unknown'
  where lease_token is null and status <> 'legacy_unknown';

alter table public.stripe_webhook_events enable row level security;

-- claim_stripe_webhook_event: unchanged acquire/reclaim semantics, EXCEPT
-- 'legacy_unknown' and 'reconciled' are now treated the same as
-- 'completed' for claiming purposes — never silently auto-reprocessed.
-- (Auto-reprocessing would replay that event's years-old payload over
-- user_plans, potentially overwriting a user's CURRENT plan with stale
-- data if later events since superseded it — see
-- scripts/reconcile-stripe-subscriptions.mjs for the safe alternative.)
create or replace function public.claim_stripe_webhook_event(
  p_event_id text, p_event_type text, p_lease_token text, p_lease_seconds int default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_row public.stripe_webhook_events%rowtype;
begin
  if p_event_id is null or p_lease_token is null then
    raise exception 'event_id and lease_token are required';
  end if;

  insert into public.stripe_webhook_events (id, type, status, attempts, lease_token, created_at, updated_at)
    values (p_event_id, p_event_type, 'processing', 1, p_lease_token, now(), now())
    on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return jsonb_build_object('claimed', true, 'status', 'processing', 'attempts', 1);
  end if;

  select * into v_row from public.stripe_webhook_events where id = p_event_id for update;

  if v_row.status in ('completed', 'legacy_unknown', 'reconciled') then
    return jsonb_build_object('claimed', false, 'status', v_row.status, 'attempts', v_row.attempts);
  end if;

  if v_row.status = 'processing' and v_row.updated_at > now() - make_interval(secs => p_lease_seconds) then
    return jsonb_build_object('claimed', false, 'status', 'processing', 'attempts', v_row.attempts);
  end if;

  -- 'failed', or an abandoned 'processing' lease past expiry — reclaim it.
  update public.stripe_webhook_events
    set status = 'processing', attempts = attempts + 1, lease_token = p_lease_token,
        last_error = null, updated_at = now(), type = coalesce(p_event_type, type)
    where id = p_event_id;

  return jsonb_build_object('claimed', true, 'status', 'processing', 'attempts', v_row.attempts + 1);
end;
$$;

create or replace function public.complete_stripe_webhook_event(p_event_id text, p_lease_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  update public.stripe_webhook_events
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = p_event_id and lease_token = p_lease_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.fail_stripe_webhook_event(p_event_id text, p_lease_token text, p_error text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  update public.stripe_webhook_events
    set status = 'failed', last_error = left(coalesce(p_error, ''), 500), updated_at = now()
    where id = p_event_id and lease_token = p_lease_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, text, int) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, text, int) to service_role;
revoke all on function public.complete_stripe_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.complete_stripe_webhook_event(text, text) to service_role;
revoke all on function public.fail_stripe_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.fail_stripe_webhook_event(text, text, text) to service_role;

-- ════════════════════════════════════════════════════════════════════
-- 4. DISTRIBUTED GENERATION LOCK — with a renew function for long
--    generations (Objective 6: locks must outlive the real generation, or
--    be renewable while it's still legitimately in progress).
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.generation_locks (
  kind text not null,
  book text not null,
  chapter int not null,
  lease_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (kind, book, chapter)
);
alter table public.generation_locks enable row level security;

create or replace function public.acquire_generation_lock(
  p_kind text, p_book text, p_chapter int, p_lease_token text, p_lease_seconds int default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_row public.generation_locks%rowtype;
begin
  if p_kind is null or p_book is null or p_chapter is null or p_lease_token is null then
    raise exception 'kind, book, chapter and lease_token are required';
  end if;

  insert into public.generation_locks (kind, book, chapter, lease_token, created_at, expires_at)
    values (p_kind, p_book, p_chapter, p_lease_token, now(), now() + make_interval(secs => p_lease_seconds))
    on conflict (kind, book, chapter) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return jsonb_build_object('acquired', true);
  end if;

  select * into v_row from public.generation_locks
    where kind = p_kind and book = p_book and chapter = p_chapter
    for update;

  if v_row.expires_at > now() then
    return jsonb_build_object('acquired', false);
  end if;

  update public.generation_locks
    set lease_token = p_lease_token, created_at = now(), expires_at = now() + make_interval(secs => p_lease_seconds)
    where kind = p_kind and book = p_book and chapter = p_chapter;

  return jsonb_build_object('acquired', true);
end;
$$;

-- NEW: renew_generation_lock — extends expires_at for a lock WE still
-- hold, without releasing/reacquiring it (which would create a window
-- where another instance could steal it). Used by long-running chapter
-- generations (e.g. large Psalms with many verses under
-- api/interlinear.js) so the lock never expires out from under a
-- generation that is still legitimately in progress. Only succeeds if the
-- caller's lease_token still matches — a lock already reclaimed by someone
-- else (because we were too slow to renew) correctly refuses to be
-- extended by the old holder.
create or replace function public.renew_generation_lock(
  p_kind text, p_book text, p_chapter int, p_lease_token text, p_lease_seconds int default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  update public.generation_locks
    set expires_at = now() + make_interval(secs => p_lease_seconds)
    where kind = p_kind and book = p_book and chapter = p_chapter and lease_token = p_lease_token;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.release_generation_lock(
  p_kind text, p_book text, p_chapter int, p_lease_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.generation_locks
    where kind = p_kind and book = p_book and chapter = p_chapter and lease_token = p_lease_token;
end;
$$;

revoke all on function public.acquire_generation_lock(text, text, int, text, int) from public, anon, authenticated;
grant execute on function public.acquire_generation_lock(text, text, int, text, int) to service_role;
revoke all on function public.renew_generation_lock(text, text, int, text, int) from public, anon, authenticated;
grant execute on function public.renew_generation_lock(text, text, int, text, int) to service_role;
revoke all on function public.release_generation_lock(text, text, int, text) from public, anon, authenticated;
grant execute on function public.release_generation_lock(text, text, int, text) to service_role;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — run these after applying.
-- ════════════════════════════════════════════════════════════════════

-- (a) No duplicate (user_id, month) rows remain in ai_usage. Expected: 0 rows.
-- select user_id, month, count(*) from public.ai_usage group by user_id, month having count(*) > 1;

-- (b) Exactly one UNIQUE(user_id, month) constraint exists on ai_usage.
-- select conname, pg_get_constraintdef(oid) as definition
--   from pg_constraint where conrelid = 'public.ai_usage'::regclass and contype = 'u';

-- (c) All 9 expected RPC functions exist.
-- select proname from pg_proc
--   where pronamespace = 'public'::regnamespace
--   and proname in ('consume_ai_usage','release_ai_usage','check_rate_limit',
--     'claim_stripe_webhook_event','complete_stripe_webhook_event','fail_stripe_webhook_event',
--     'acquire_generation_lock','renew_generation_lock','release_generation_lock')
--   order by proname;

-- (d) Only service_role can execute the sensitive RPCs. Expected: 0 rows.
-- select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--   and routine_name in ('consume_ai_usage','release_ai_usage','check_rate_limit',
--     'claim_stripe_webhook_event','complete_stripe_webhook_event','fail_stripe_webhook_event',
--     'acquire_generation_lock','renew_generation_lock','release_generation_lock')
--   and grantee not in ('service_role', 'postgres')
--   order by routine_name, grantee;

-- (e) RLS is enabled on all 4 tables. Expected: relrowsecurity = true for each.
-- select relname, relrowsecurity from pg_class
--   where relname in ('ai_usage','api_rate_limit','stripe_webhook_events','generation_locks')
--   and relnamespace = 'public'::regnamespace;

-- (f) The status check constraint allows the 5 expected values.
-- select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'stripe_webhook_events_status_check';

-- (g) How many legacy (pre-redesign) webhook events need reconciliation.
--     If this returns 0, you can skip running
--     scripts/reconcile-stripe-subscriptions.mjs entirely.
-- select count(*) from public.stripe_webhook_events where status = 'legacy_unknown';
