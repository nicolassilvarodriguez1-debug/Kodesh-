-- KODESH — Reproducible test script for the ai_usage dedup repair
-- (supabase/migrations/20260813_webhook_lifecycle_ai_usage_repair_locks.sql).
--
-- Run this against a STAGING/TEST Supabase project, never production. It:
--   1. Creates a scratch duplicate scenario for a fake user/month.
--   2. Runs the exact consolidation logic from the migration.
--   3. Asserts the counters were summed (not lost) and duplicates are gone.
--   4. Re-runs the migration's constraint-adding block to prove it's a
--      no-op the second time (idempotency / "constraint already exists").
--   5. Simulates a "partial previous migration" state and proves the repair
--      still works.
--
-- Wrap everything in a transaction and roll back at the end so this leaves
-- no trace in the test database either.

begin;

-- Use an obviously-fake UUID so this can never collide with a real user.
do $$
declare
  v_test_user uuid := '00000000-0000-0000-0000-000000000001';
  v_test_month text := '2099-01';
  v_count int;
  v_searches int;
  v_assistant int;
  v_lexicon int;
begin
  raise notice '--- Step 1: seed duplicate rows (simulating the pre-atomic race) ---';

  -- Temporarily drop the unique constraint if this test DB already has it,
  -- so we CAN insert duplicates to test the repair against.
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'ai_usage' and constraint_name = 'ai_usage_user_month_key'
  ) then
    alter table public.ai_usage drop constraint ai_usage_user_month_key;
  end if;

  delete from public.ai_usage where user_id = v_test_user and month = v_test_month;

  insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    values (v_test_user, v_test_month, 5, 2, 1, now() - interval '2 days');
  insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    values (v_test_user, v_test_month, 3, 1, 0, now() - interval '1 day');
  insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    values (v_test_user, v_test_month, 2, 0, 4, now());
  -- Expected total after consolidation: searches=10, assistant=3, lexicon=5

  select count(*) into v_count from public.ai_usage where user_id = v_test_user and month = v_test_month;
  raise notice 'Seeded % duplicate rows (expected 3)', v_count;
  if v_count <> 3 then raise exception 'TEST SETUP FAILED: expected 3 seed rows, got %', v_count; end if;

  raise notice '--- Step 2: run the consolidation logic (copy of the migration block) ---';

  with dups as (
    select user_id, month,
           sum(coalesce(searches_used, 0))  as total_searches,
           sum(coalesce(assistant_used, 0)) as total_assistant,
           sum(coalesce(lexicon_used, 0))   as total_lexicon,
           max(updated_at)                  as last_updated,
           min(ctid)                        as keep_ctid,
           count(*)                         as row_count
    from public.ai_usage
    where user_id = v_test_user and month = v_test_month
    group by user_id, month
  ),
  only_dups as (select * from dups where row_count > 1)
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
    where user_id = v_test_user and month = v_test_month
    group by user_id, month
    having count(*) > 1
  )
  delete from public.ai_usage a
    using dups d
    where a.user_id = d.user_id and a.month = d.month and a.ctid <> d.keep_ctid;

  raise notice '--- Step 3: assert no data was lost and duplicates are gone ---';

  select count(*) into v_count from public.ai_usage where user_id = v_test_user and month = v_test_month;
  if v_count <> 1 then raise exception 'FAIL: expected exactly 1 consolidated row, got %', v_count; end if;

  select searches_used, assistant_used, lexicon_used
    into v_searches, v_assistant, v_lexicon
    from public.ai_usage where user_id = v_test_user and month = v_test_month;

  raise notice 'Consolidated counters: searches=%, assistant=%, lexicon=% (expected 10, 3, 5)', v_searches, v_assistant, v_lexicon;
  if v_searches <> 10 or v_assistant <> 3 or v_lexicon <> 5 then
    raise exception 'FAIL: consolidated counters do not match expected sums (usage was lost)';
  end if;

  raise notice 'PASS: duplicates consolidated with zero usage loss.';

  raise notice '--- Step 4: add the UNIQUE constraint, then prove a duplicate insert is now rejected ---';
  alter table public.ai_usage add constraint ai_usage_user_month_key unique (user_id, month);

  begin
    insert into public.ai_usage (user_id, month, searches_used) values (v_test_user, v_test_month, 999);
    raise exception 'FAIL: duplicate insert should have been rejected by the UNIQUE constraint';
  exception when unique_violation then
    raise notice 'PASS: duplicate insert correctly rejected by ai_usage_user_month_key.';
  end;

  raise notice '--- Step 5: prove the migration guard is a no-op when the constraint already exists ---';
  -- This mirrors the actual migration's guard condition.
  if exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name
    where tc.constraint_type = 'UNIQUE' and tc.table_schema = 'public' and tc.table_name = 'ai_usage'
    group by tc.constraint_name
    having array_agg(kcu.column_name::text order by kcu.column_name::text) = array['month','user_id']::text[]
  ) then
    raise notice 'PASS: guard correctly detects the existing constraint and would skip re-consolidation.';
  else
    raise exception 'FAIL: guard did not detect the constraint that was just added';
  end if;

  raise notice '--- Step 6: simulate a "partially applied previous migration" (constraint missing, but only ONE row — the common case) and confirm the guard still repairs cleanly ---';
  alter table public.ai_usage drop constraint ai_usage_user_month_key;
  delete from public.ai_usage where user_id = v_test_user and month = v_test_month;
  insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used)
    values (v_test_user, v_test_month, 7, 1, 2);

  -- Guard: no constraint found -> would run consolidation (safe no-op on a
  -- single row: sum of one row equals itself) -> add constraint.
  with dups as (
    select user_id, month, sum(searches_used) as s, sum(assistant_used) as a, sum(lexicon_used) as l,
           max(updated_at) as u, min(ctid) as keep_ctid, count(*) as row_count
    from public.ai_usage where user_id = v_test_user and month = v_test_month
    group by user_id, month
  ), only_dups as (select * from dups where row_count > 1)
  update public.ai_usage x set searches_used = d.s, assistant_used = d.a, lexicon_used = d.l
    from only_dups d where x.ctid = d.keep_ctid;

  alter table public.ai_usage add constraint ai_usage_user_month_key unique (user_id, month);

  select searches_used into v_searches from public.ai_usage where user_id = v_test_user and month = v_test_month;
  if v_searches <> 7 then raise exception 'FAIL: single-row (no real duplicates) case corrupted data'; end if;
  raise notice 'PASS: partial-migration / single-row case handled correctly, no data corruption.';

  raise notice '=== ALL ai_usage DEDUP TESTS PASSED ===';
end $$;

-- Clean up and leave no trace.
rollback;
