-- Lanzamiento de racha en servidor + maná (correr DESPUÉS de 20261002_racha_mana.sql).
--   1. reading_days a partir del historial de reading_progress (read_at, hora de Nueva York).
--   2. Recalcula las rachas: las 49 rachas falsas (último día leído antes de
--      ayer) quedan en 0. Para quien leyó hoy o ayer se respeta la racha que
--      ya tenía, porque reading_progress solo guarda la ÚLTIMA vez que se marcó
--      cada capítulo y puede no ver todos sus días.
--   3. Maná de bienvenida: 10 por capítulo ya leído, máximo 1000.
--   4. pg_cron: settle_all_streaks() cada hora.

-- 1 ─────────────────────────────────────────────────────────────────────
insert into public.reading_days (user_id, day, chapters)
select rp.user_id,
       (rp.read_at at time zone 'America/New_York')::date,
       array_agg(distinct upper(rp.book_id) || ':' || rp.chapter)
  from public.reading_progress rp
  join auth.users u on u.id = rp.user_id
 where rp.read_at is not null
 group by 1, 2
on conflict (user_id, day) do update
  set chapters = (select array_agg(distinct x) from unnest(public.reading_days.chapters || excluded.chapters) x);

-- 2 ─────────────────────────────────────────────────────────────────────
insert into public.reading_streaks (user_id)
select distinct d.user_id from public.reading_days d
on conflict (user_id) do nothing;

with today as (select (now() at time zone 'America/New_York')::date as d),
days as (
  select user_id, day from public.reading_days where not shielded
),
islands as (
  select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp from days
),
runs as (
  select user_id, max(day) as last_day, count(*)::int as len from islands group by user_id, grp
),
calc as (
  select r.user_id,
         max(r.len) as longest,
         max(r.last_day) as last_day,
         coalesce(max(r.len) filter (where r.last_day >= (select d from today) - 1), 0) as current,
         (select count(*)::int from days d where d.user_id = r.user_id) as total
    from runs r group by r.user_id
)
update public.reading_streaks s set
  current_streak = case
    when s.last_read_date >= (select d from today) - 1 then greatest(s.current_streak, coalesce(c.current, 0))
    else coalesce(c.current, 0) end,
  longest_streak = greatest(s.longest_streak, coalesce(c.longest, 0)),
  total_days_read = greatest(s.total_days_read, coalesce(c.total, 0)),
  last_read_date = greatest(s.last_read_date, c.last_day),
  last_active_date = greatest(s.last_read_date, c.last_day),
  updated_at = now()
from public.reading_streaks s2
left join calc c on c.user_id = s2.user_id
where s.user_id = s2.user_id;

-- 3 ─────────────────────────────────────────────────────────────────────
with gift as (
  select rp.user_id, least(count(*) * 10, 1000)::int as amount, count(*)::int as chapters
    from public.reading_progress rp
    join public.reading_streaks s on s.user_id = rp.user_id
   where not exists (select 1 from public.mana_ledger l where l.user_id = rp.user_id and l.reason = 'welcome')
   group by rp.user_id
)
, ledger as (
  insert into public.mana_ledger (user_id, amount, reason, detail)
  select user_id, amount, 'welcome', chapters || ' capítulos leídos' from gift
  returning user_id, amount
)
update public.reading_streaks s set mana = s.mana + l.amount
  from ledger l where l.user_id = s.user_id;

-- 4 ─────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'kodesh-settle-streaks';
select cron.schedule('kodesh-settle-streaks', '5 * * * *', $$select public.settle_all_streaks()$$);
