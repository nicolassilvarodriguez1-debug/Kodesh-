-- KODESH — Reproducible test for the ai_usage duplicate-consolidation logic
-- in supabase/migrations/20260814_self_sufficient_repair.sql.
--
-- This uses the EXACT SAME statements as the migration's DO block (not a
-- simplified reimplementation) — copy verbatim from section 1 of that file.
-- If you ever change the migration's consolidation logic, update this file
-- to match or the two will silently drift apart.
--
-- Transactional: everything happens inside begin/rollback, so this makes NO
-- permanent changes to your database, real or fake. Safe to run against
-- production (though a staging project is still recommended).
--
-- Run in the Supabase SQL Editor, or via psql. Expect to see a series of
-- `NOTICE:  PASS: ...` lines and no `ERROR:` — if any assertion fails, the
-- script raises an exception and the whole thing rolls back automatically.

begin;

-- Use a fixed fake UUID so this is trivially identifiable/cleanable if the
-- transaction were ever accidentally committed.
do $$
declare
  v_user uuid := '00000000-0000-0000-0000-000000000002';
  v_month text := '2099-01'; -- far-future month, can't collide with real data
  v_constraint_cols text[];
  v_pre_totals record;
  v_post_totals record;
  v_row_count int;
  v_searches int; v_assistant int; v_lexicon int;
begin
  raise notice '--- Step 1: seed 3 duplicate rows for the same (user_id, month) ---';
  -- searches: 2, 3, 4 -> expect sum 9
  -- assistant: 1, 5, 2 -> expect sum 8
  -- lexicon:   7, 8, 9 -> expect sum 24
  insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    values
      (v_user, v_month, 2, 1, 7, now() - interval '2 days'),
      (v_user, v_month, 3, 5, 8, now() - interval '1 day'),
      (v_user, v_month, 4, 2, 9, now());

  select count(*) into v_row_count from public.ai_usage where user_id = v_user and month = v_month;
  if v_row_count <> 3 then
    raise exception 'FAIL: expected 3 seed rows, got %', v_row_count;
  end if;
  raise notice 'PASS: 3 duplicate rows seeded.';

  raise notice '--- Step 2: run the EXACT consolidation logic from 20260814_self_sufficient_repair.sql ---';

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

    create temp table _ai_usage_dedup_totals on commit drop as
    select user_id, month,
           sum(coalesce(searches_used, 0))  as total_searches,
           sum(coalesce(assistant_used, 0)) as total_assistant,
           sum(coalesce(lexicon_used, 0))   as total_lexicon,
           max(updated_at)                  as last_updated,
           count(*)                         as row_count
    from public.ai_usage
    group by user_id, month;

    delete from public.ai_usage a
      using _ai_usage_dedup_totals t
      where a.user_id = t.user_id and a.month = t.month and t.row_count > 1;

    insert into public.ai_usage (user_id, month, searches_used, assistant_used, lexicon_used, updated_at)
    select user_id, month, total_searches, total_assistant, total_lexicon, coalesce(last_updated, now())
    from _ai_usage_dedup_totals
    where row_count > 1;

    select sum(coalesce(searches_used, 0)) as s, sum(coalesce(assistant_used, 0)) as a, sum(coalesce(lexicon_used, 0)) as l
      into v_post_totals from public.ai_usage;
    if v_pre_totals.s is distinct from v_post_totals.s
       or v_pre_totals.a is distinct from v_post_totals.a
       or v_pre_totals.l is distinct from v_post_totals.l then
      raise exception 'ai_usage dedup lost counters: before=(%,%,%) after=(%,%,%)',
        v_pre_totals.s, v_pre_totals.a, v_pre_totals.l, v_post_totals.s, v_post_totals.a, v_post_totals.l;
    end if;

    alter table public.ai_usage add constraint ai_usage_user_month_key unique (user_id, month);
  end if;

  raise notice '--- Step 3: verify exact totals and row count for our test user/month ---';
  select searches_used, assistant_used, lexicon_used
    into v_searches, v_assistant, v_lexicon
    from public.ai_usage where user_id = v_user and month = v_month;

  select count(*) into v_row_count from public.ai_usage where user_id = v_user and month = v_month;
  if v_row_count <> 1 then
    raise exception 'FAIL: expected exactly 1 row after consolidation, got %', v_row_count;
  end if;
  if v_searches <> 9 then raise exception 'FAIL: expected searches_used=9, got %', v_searches; end if;
  if v_assistant <> 8 then raise exception 'FAIL: expected assistant_used=8, got %', v_assistant; end if;
  if v_lexicon <> 24 then raise exception 'FAIL: expected lexicon_used=24, got %', v_lexicon; end if;
  raise notice 'PASS: consolidated row has searches=9, assistant=8, lexicon=24, and is the only row for this user/month.';

  raise notice '--- Step 4: prove the UNIQUE constraint now rejects a new duplicate ---';
  begin
    insert into public.ai_usage (user_id, month, searches_used) values (v_user, v_month, 1);
    raise exception 'FAIL: duplicate insert should have been rejected by the UNIQUE constraint';
  exception when unique_violation then
    raise notice 'PASS: duplicate insert correctly rejected by ai_usage_user_month_key.';
  end;

  raise notice '--- Step 5: run the consolidation guard AGAIN — must be a no-op (idempotent) ---';
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
    raise exception 'FAIL: guard should have detected the constraint added in step 2 and skipped re-consolidation';
  end if;
  raise notice 'PASS: guard correctly detects the existing constraint on re-run — no re-consolidation attempted.';

  select searches_used, assistant_used, lexicon_used
    into v_searches, v_assistant, v_lexicon
    from public.ai_usage where user_id = v_user and month = v_month;
  if v_searches <> 9 or v_assistant <> 8 or v_lexicon <> 24 then
    raise exception 'FAIL: totals changed after re-running the guard: searches=%, assistant=%, lexicon=%', v_searches, v_assistant, v_lexicon;
  end if;
  raise notice 'PASS: totals unchanged after re-running the migration logic (searches=9, assistant=8, lexicon=24).';

  raise notice '=== ALL CHECKS PASSED ===';
end $$;

rollback;
