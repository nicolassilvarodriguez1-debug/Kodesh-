-- KODESH — Second security hardening pass.
-- Idempotent and safe to run multiple times, including on a database where
-- 20260812_security_hardening.sql has already been applied in production.
--
-- This migration does NOT edit or replace 20260812_security_hardening.sql.
-- It repairs/extends what that one left incomplete:
--
--   1. stripe_webhook_events: redesigned from a plain "insert = done" marker
--      table into a real processing-state machine (processing/completed/
--      failed) with a claim/complete/fail RPC trio, so a mid-processing
--      crash no longer permanently swallows an event.
--   2. ai_usage: safely consolidates any pre-existing duplicate
--      (user_id, month) rows (which could exist if the UNIQUE constraint in
--      the previous migration failed to apply because duplicates already
--      existed) BEFORE adding the real UNIQUE constraint, so no recorded
--      usage is lost and the constraint can't fail with unique_violation.
--   3. generation_locks: a new distributed lock table + RPC pair so two
--      serverless instances can never generate the same book/chapter at the
--      same time for textual.js / interlinear.js / interlinear-warm.js.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Apply AFTER 20260812_security_hardening.sql (if that one hasn't run yet,
-- run it first — this migration assumes ai_usage, api_rate_limit, and
-- consume_ai_usage()/release_ai_usage()/check_rate_limit() already exist).

-- ════════════════════════════════════════════════════════════════════
-- 1. STRIPE WEBHOOK LIFECYCLE
-- ════════════════════════════════════════════════════════════════════

-- Table may already exist in either shape:
--   (a) doesn't exist at all (fresh DB) → create with full new shape.
--   (b) old shape from 20260812 (id, type, processed_at) → add the new
--       lifecycle columns.
--   (c) already this new shape (migration re-run) → all ADD COLUMN IF NOT
--       EXISTS are no-ops.
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

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'stripe_webhook_events_status_check'
  ) then
    alter table public.stripe_webhook_events
      add constraint stripe_webhook_events_status_check
      check (status in ('processing', 'completed', 'failed'));
  end if;
end $$;

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, updated_at);

-- Backfill: rows that predate this redesign (inserted by the OLD
-- claimEventOnce() logic, which only ever inserted a row AFTER successfully
-- finishing processing) have lease_token IS NULL. Treat them as completed —
-- NOT as 'processing' (the column default), which would make them eligible
-- for reclaiming and reprocessing an event that was, under the old code,
-- already fully handled. This WHERE clause only ever matches pre-migration
-- rows: every row created by the new claim function always sets a
-- lease_token, so this is a no-op on repeated runs.
update public.stripe_webhook_events
  set status = 'completed', completed_at = coalesce(completed_at, created_at, now())
  where status = 'processing' and lease_token is null;

alter table public.stripe_webhook_events enable row level security;

-- claim_stripe_webhook_event: atomically decides whether THIS invocation
-- should process the event now.
--   - Brand-new event id → inserted as 'processing', claimed = true.
--   - Existing row, status = 'completed' → claimed = false (duplicate delivery).
--   - Existing row, status = 'processing' AND lease still fresh (< lease
--     seconds old) → claimed = false, another instance is actively on it.
--   - Existing row, status = 'failed', OR status = 'processing' with an
--     EXPIRED lease (crashed instance) → reclaimed: attempts += 1,
--     lease_token replaced, claimed = true.
-- Row-locked via `for update`, so two concurrent callers for the same
-- event.id serialize on this row and can never both get claimed = true.
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

  if v_row.status = 'completed' then
    return jsonb_build_object('claimed', false, 'status', 'completed', 'attempts', v_row.attempts);
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

-- complete_stripe_webhook_event: marks the event completed, but ONLY if the
-- caller still holds the lease (lease_token match) and it's still in
-- 'processing' — so an instance whose lease already expired and got
-- reclaimed by someone else cannot stomp on the reclaimer's work.
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

-- fail_stripe_webhook_event: marks the event failed (so it becomes
-- reclaimable immediately, rather than waiting out the full lease), with the
-- same lease-ownership check as complete.
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
-- 2. ai_usage — safe duplicate repair before adding the UNIQUE constraint
-- ════════════════════════════════════════════════════════════════════
-- 20260812_security_hardening.sql tried to add UNIQUE(user_id, month)
-- directly. If duplicate (user_id, month) rows already existed at that
-- point (possible under the pre-atomic incrementUsage() read-then-write
-- race), that ALTER TABLE would fail with unique_violation and the
-- constraint would simply not exist — silently leaving consume_ai_usage()
-- able to violate the assumption of at most one row per user+month.
--
-- This block checks for the constraint by table/schema/columns (not just by
-- name, since a same-named constraint elsewhere wouldn't prove this table is
-- protected), and if it's missing, consolidates duplicates first.
do $$
declare
  v_constraint_cols text[];
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
    -- No UNIQUE(user_id, month) found under any name — consolidate any
    -- duplicates first so adding the constraint can never fail.
    -- Never lose recorded usage: SUM the three counters across every
    -- duplicate row (each row reflects real increments that happened), and
    -- take MAX(updated_at) as the safe "most recent activity" timestamp.
    with dups as (
      select user_id, month,
             sum(coalesce(searches_used, 0))  as total_searches,
             sum(coalesce(assistant_used, 0)) as total_assistant,
             sum(coalesce(lexicon_used, 0))   as total_lexicon,
             max(updated_at)                  as last_updated,
             min(ctid)                        as keep_ctid,
             count(*)                         as row_count
      from public.ai_usage
      group by user_id, month
    ),
    only_dups as (
      select * from dups where row_count > 1
    )
    update public.ai_usage a
      set searches_used = d.total_searches,
          assistant_used = d.total_assistant,
          lexicon_used = d.total_lexicon,
          updated_at = coalesce(d.last_updated, a.updated_at)
      from only_dups d
      where a.ctid = d.keep_ctid;

    with dups as (
      select user_id, month, min(ctid) as keep_ctid, count(*) as row_count
      from public.ai_usage
      group by user_id, month
      having count(*) > 1
    )
    delete from public.ai_usage a
      using dups d
      where a.user_id = d.user_id and a.month = d.month and a.ctid <> d.keep_ctid;

    -- Now safe: no two rows can share (user_id, month) anymore.
    alter table public.ai_usage add constraint ai_usage_user_month_key unique (user_id, month);
  end if;
end $$;

-- consume_ai_usage() / release_ai_usage() themselves are unchanged by this
-- repair (their row-lock logic already operates correctly once at most one
-- row per user+month exists) — see 20260812_security_hardening.sql for
-- their definitions. Not redefined here to avoid two migrations disagreeing
-- about the same function body.

-- ════════════════════════════════════════════════════════════════════
-- 3. DISTRIBUTED GENERATION LOCK (textual.js / interlinear.js / interlinear-warm.js)
-- ════════════════════════════════════════════════════════════════════
-- Bounded by construction: the primary key is (kind, book, chapter), so this
-- table can never grow past (# kinds × # books × # chapters) rows — a few
-- thousand at most — regardless of how many times generation is triggered.
-- No separate cleanup job is needed; expired leases are simply reclaimed
-- in place by the next acquire attempt for that same (kind, book, chapter).
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

-- acquire_generation_lock: atomic acquire-or-reclaim, identical shape to the
-- webhook claim function above.
--   - No existing row → inserted, acquired = true.
--   - Existing row, not yet expired → acquired = false (someone else is
--     generating this book/chapter right now).
--   - Existing row, expired (the holder crashed/timed out) → reclaimed,
--     acquired = true.
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

-- release_generation_lock: only the current lease holder can release —
-- otherwise a slow instance whose lease already expired (and was reclaimed
-- by someone else) could delete the RECLAIMER's active lock out from under
-- them.
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
revoke all on function public.release_generation_lock(text, text, int, text) from public, anon, authenticated;
grant execute on function public.release_generation_lock(text, text, int, text) to service_role;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — run these after applying, expected results noted.
-- ════════════════════════════════════════════════════════════════════

-- (a) No duplicate (user_id, month) rows remain in ai_usage.
--     Expected: 0 rows.
-- select user_id, month, count(*) from public.ai_usage group by user_id, month having count(*) > 1;

-- (b) The UNIQUE(user_id, month) constraint exists on ai_usage.
--     Expected: 1 row, columns = {month, user_id}.
-- select tc.constraint_name, array_agg(kcu.column_name::text order by kcu.column_name::text) as columns
--   from information_schema.table_constraints tc
--   join information_schema.key_column_usage kcu
--     on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
--   where tc.constraint_type = 'UNIQUE' and tc.table_schema = 'public' and tc.table_name = 'ai_usage'
--   group by tc.constraint_name;

-- (c) All expected RPC functions exist.
--     Expected: 8 rows (consume_ai_usage, release_ai_usage, check_rate_limit,
--     claim_stripe_webhook_event, complete_stripe_webhook_event,
--     fail_stripe_webhook_event, acquire_generation_lock, release_generation_lock).
-- select proname from pg_proc
--   where pronamespace = 'public'::regnamespace
--   and proname in ('consume_ai_usage','release_ai_usage','check_rate_limit',
--     'claim_stripe_webhook_event','complete_stripe_webhook_event','fail_stripe_webhook_event',
--     'acquire_generation_lock','release_generation_lock')
--   order by proname;

-- (d) Only service_role can execute the sensitive RPCs (no rows = correctly locked down).
-- select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--   and routine_name in ('consume_ai_usage','release_ai_usage','check_rate_limit',
--     'claim_stripe_webhook_event','complete_stripe_webhook_event','fail_stripe_webhook_event',
--     'acquire_generation_lock','release_generation_lock')
--   and grantee not in ('service_role', 'postgres')
--   order by routine_name, grantee;

-- (e) RLS is enabled on all three tables (expected: relrowsecurity = true for each).
-- select relname, relrowsecurity from pg_class
--   where relname in ('ai_usage','api_rate_limit','stripe_webhook_events','generation_locks')
--   and relnamespace = 'public'::regnamespace;
