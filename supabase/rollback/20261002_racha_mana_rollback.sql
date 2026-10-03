-- CHECKPOINT / REVERSIÓN de 20261002_racha_mana.sql + _backfill.sql
-- Deja la racha exactamente como estaba el 2 oct 2026 a las ~21:30 (Nueva York),
-- usando la copia en el esquema kodesh_backup (tomada justo antes de migrar).
-- Se pierde lo que se haya leído/ganado DESPUÉS de migrar (maná, días nuevos).
-- Correr completo en el SQL editor de Supabase.
begin;

-- 1. Proceso horario
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kodesh-settle-streaks';
  end if;
end $$;

-- 2. Trigger y funciones
drop trigger if exists trg_kodesh_progress_streak on public.reading_progress;
drop function if exists public._kodesh_on_progress_insert();
drop function if exists public.get_my_streak_state(text);
drop function if exists public.buy_streak_shield();
drop function if exists public.get_reading_calendar(int);
drop function if exists public.settle_all_streaks();
drop function if exists public._kodesh_record_chapter(uuid, text, int);
drop function if exists public._kodesh_settle(uuid);
drop function if exists public._kodesh_notice(uuid, jsonb);
drop function if exists public._kodesh_award(uuid, int, text, text);
drop function if exists public._kodesh_today(uuid);
drop function if exists public._kodesh_now();
drop function if exists public._kodesh_tz(uuid);

-- 3. Tablas nuevas
drop table if exists public.mana_ledger;
drop table if exists public.reading_days;

-- 4. reading_streaks: datos y columnas originales
alter table public.reading_streaks
  drop column if exists mana, drop column if exists shields, drop column if exists last_active_date,
  drop column if exists premium_shield_month, drop column if exists pending_notices;
delete from public.reading_streaks;
insert into public.reading_streaks select * from kodesh_backup.reading_streaks_20261002;

-- 5. Política original (el usuario escribía su propia racha)
drop policy if exists "Users read own streak" on public.reading_streaks;
drop policy if exists "Users delete own streak" on public.reading_streaks;
drop policy if exists "Users manage own streak" on public.reading_streaks;
create policy "Users manage own streak" on public.reading_streaks for all using (auth.uid() = user_id);

-- 6. user_profiles.timezone
alter table public.user_profiles drop column if exists timezone;

commit;
-- La copia sigue en kodesh_backup.* por si hace falta; borrarla cuando ya no:
--   drop schema kodesh_backup cascade;
