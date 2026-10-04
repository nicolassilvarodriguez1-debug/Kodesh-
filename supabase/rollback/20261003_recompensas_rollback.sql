-- REVERSIÓN de 20261003_recompensas.sql (Shabat, parashá semanal, créditos IA).
-- Vuelve a las funciones de 20261002_racha_mana.sql y a consume/release_ai_usage
-- originales. Se pierden los créditos de IA comprados (el maná gastado queda en
-- mana_ledger por si hay que devolverlo) y los bonos de parashá ya dados se quedan.
begin;

create or replace function public._kodesh_settle(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.reading_streaks%rowtype;
  v_today date := public._kodesh_today(p_uid);
  v_last date;
  v_missed int;
begin
  select * into r from public.reading_streaks where user_id = p_uid for update;
  if not found or r.current_streak = 0 then return; end if;
  v_last := coalesce(r.last_active_date, r.last_read_date);
  if v_last is null then
    update public.reading_streaks set current_streak = 0 where user_id = p_uid;
    return;
  end if;
  v_missed := v_today - v_last - 1;
  if v_missed <= 0 then return; end if;

  if r.shields >= v_missed then
    insert into public.reading_days (user_id, day, shielded)
      select p_uid, d::date, true
        from generate_series(v_last + 1, v_today - 1, interval '1 day') d
      on conflict (user_id, day) do update set shielded = true;
    update public.reading_streaks
       set shields = shields - v_missed, last_active_date = v_today - 1, updated_at = now()
     where user_id = p_uid;
    perform public._kodesh_notice(p_uid, jsonb_build_object(
      'type', 'shield_used', 'days', v_missed, 'streak', r.current_streak, 'shields_left', r.shields - v_missed));
  else
    update public.reading_streaks set current_streak = 0, updated_at = now() where user_id = p_uid;
    perform public._kodesh_notice(p_uid, jsonb_build_object(
      'type', 'streak_lost', 'streak', r.current_streak, 'days', v_missed));
  end if;
end $$;

create or replace function public._kodesh_record_chapter(p_uid uuid, p_book text, p_chapter int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := public._kodesh_today(p_uid);
  v_key text := upper(p_book) || ':' || p_chapter;
  v_day public.reading_days%rowtype;
  r public.reading_streaks%rowtype;
  v_n int;
  v_goal int;
  v_new_streak int;
  v_bonus int;
begin
  insert into public.reading_streaks (user_id) values (p_uid) on conflict (user_id) do nothing;
  perform public._kodesh_settle(p_uid);
  select * into r from public.reading_streaks where user_id = p_uid for update;

  insert into public.reading_days (user_id, day) values (p_uid, v_today) on conflict do nothing;
  select * into v_day from public.reading_days where user_id = p_uid and day = v_today for update;
  if v_key = any (v_day.chapters) then return; end if;   -- ya contado hoy

  v_n := cardinality(v_day.chapters) + 1;
  update public.reading_days
     set chapters = array_append(chapters, v_key),
         mana_earned = mana_earned + case when v_n <= 5 then 10 else 0 end,
         shielded = false
   where user_id = p_uid and day = v_today;
  if v_n <= 5 then perform public._kodesh_award(p_uid, 10, 'chapter', v_key); end if;

  select coalesce(reading_goal_chapters, 2) into v_goal from public.user_profiles where id = p_uid;
  v_goal := greatest(coalesce(v_goal, 2), 1);
  if v_n >= v_goal and not v_day.goal_bonus then
    update public.reading_days set goal_bonus = true, mana_earned = mana_earned + 20
     where user_id = p_uid and day = v_today;
    perform public._kodesh_award(p_uid, 20, 'goal', v_today::text);
  end if;

  -- Racha: solo cambia con el primer capítulo del día.
  if r.last_active_date is distinct from v_today then
    v_new_streak := case when r.last_active_date = v_today - 1 then r.current_streak + 1 else 1 end;
    update public.reading_streaks
       set current_streak = v_new_streak,
           longest_streak = greatest(longest_streak, v_new_streak),
           total_days_read = total_days_read + 1,
           last_read_date = v_today,
           last_active_date = v_today,
           updated_at = now()
     where user_id = p_uid;
    v_bonus := case v_new_streak when 7 then 50 when 30 then 200 when 100 then 500 when 365 then 1000 else 0 end;
    if v_bonus > 0 then
      perform public._kodesh_award(p_uid, v_bonus, 'milestone', v_new_streak::text);
      perform public._kodesh_notice(p_uid, jsonb_build_object('type', 'milestone', 'streak', v_new_streak, 'mana', v_bonus));
    end if;
  elsif r.last_read_date is distinct from v_today then
    update public.reading_streaks set last_read_date = v_today where user_id = p_uid;
  end if;
end $$;

create or replace function public.get_my_streak_state(p_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_month text;
  r public.reading_streaks%rowtype;
  v_premium boolean;
  v_today_n int;
  v_notices jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_tz is not null and p_tz in (select name from pg_timezone_names) then
    update public.user_profiles set timezone = p_tz where id = v_uid and timezone is distinct from p_tz;
  end if;

  insert into public.reading_streaks (user_id) values (v_uid) on conflict (user_id) do nothing;
  perform public._kodesh_settle(v_uid);
  v_today := public._kodesh_today(v_uid);
  v_month := to_char(v_today, 'YYYY-MM');

  select * into r from public.reading_streaks where user_id = v_uid for update;

  -- Protector mensual de Premium (si hay hueco; si no, se reintenta).
  select exists (
    select 1 from public.user_plans
     where user_id = v_uid and plan = 'premium'
       and subscription_status in ('active', 'trialing')
       and (current_period_end is null or current_period_end > public._kodesh_now())
  ) into v_premium;
  if v_premium and r.premium_shield_month is distinct from v_month and r.shields < 2 then
    update public.reading_streaks set shields = shields + 1, premium_shield_month = v_month where user_id = v_uid;
    perform public._kodesh_notice(v_uid, jsonb_build_object('type', 'premium_shield'));
  end if;

  select pending_notices into v_notices from public.reading_streaks where user_id = v_uid;

  -- Avisos pendientes (protector usado, racha perdida, hito, Premium):
  -- se devuelven una sola vez y se limpian.
  update public.reading_streaks set pending_notices = '[]'::jsonb
   where user_id = v_uid
   returning * into r;
  select coalesce(cardinality(chapters), 0) into v_today_n
    from public.reading_days where user_id = v_uid and day = v_today;

  return jsonb_build_object(
    'current', r.current_streak,
    'longest', r.longest_streak,
    'total_days', r.total_days_read,
    'last_read_date', r.last_read_date,
    'last_active_date', r.last_active_date,
    'read_today', coalesce(r.last_read_date = v_today, false),
    'mana', r.mana,
    'shields', r.shields,
    'max_shields', 2,
    'shield_price', 200,
    'premium', v_premium,
    'today', v_today,
    'today_chapters', coalesce(v_today_n, 0),
    'notices', v_notices
  );
end $$;

create or replace function public.consume_ai_usage(p_user_id uuid, p_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_plan text; v_status text; v_period_end timestamptz;
  v_effective_plan text := 'free';
  v_limit int;
  v_row public.ai_usage%rowtype;
  v_used int;
begin
  if p_type not in ('search', 'assistant', 'lexicon') then raise exception 'invalid_usage_type'; end if;
  select plan, subscription_status, current_period_end into v_plan, v_status, v_period_end
    from public.user_plans where user_id = p_user_id;
  if v_status in ('active', 'trialing') and (v_period_end is null or v_period_end > now()) then
    v_effective_plan := coalesce(v_plan, 'free');
  end if;
  v_limit := case
    when v_effective_plan = 'premium' and p_type = 'search'    then 80
    when v_effective_plan = 'premium' and p_type = 'assistant' then 70
    when v_effective_plan = 'premium' and p_type = 'lexicon'   then 999999
    when p_type = 'search'    then 10
    when p_type = 'assistant' then 3
    else 15 end;
  insert into public.ai_usage (user_id, month) values (p_user_id, v_month) on conflict (user_id, month) do nothing;
  select * into v_row from public.ai_usage where user_id = p_user_id and month = v_month for update;
  v_used := case p_type when 'search' then v_row.searches_used when 'assistant' then v_row.assistant_used else v_row.lexicon_used end;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'remaining', 0, 'plan', v_effective_plan, 'month', v_month);
  end if;
  if p_type = 'search' then
    update public.ai_usage set searches_used = searches_used + 1, updated_at = now() where user_id = p_user_id and month = v_month;
  elsif p_type = 'assistant' then
    update public.ai_usage set assistant_used = assistant_used + 1, updated_at = now() where user_id = p_user_id and month = v_month;
  else
    update public.ai_usage set lexicon_used = lexicon_used + 1, updated_at = now() where user_id = p_user_id and month = v_month;
  end if;
  v_used := v_used + 1;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'remaining', greatest(0, v_limit - v_used), 'plan', v_effective_plan, 'month', v_month);
end $$;

create or replace function public.release_ai_usage(p_user_id uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
declare v_month text := to_char(now(), 'YYYY-MM');
begin
  if p_type = 'search' then
    update public.ai_usage set searches_used = greatest(0, searches_used - 1), updated_at = now() where user_id = p_user_id and month = v_month;
  elsif p_type = 'assistant' then
    update public.ai_usage set assistant_used = greatest(0, assistant_used - 1), updated_at = now() where user_id = p_user_id and month = v_month;
  elsif p_type = 'lexicon' then
    update public.ai_usage set lexicon_used = greatest(0, lexicon_used - 1), updated_at = now() where user_id = p_user_id and month = v_month;
  end if;
end $$;

revoke all on function public.consume_ai_usage(uuid, text), public.release_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, text), public.release_ai_usage(uuid, text) to service_role;
revoke all on function public._kodesh_settle(uuid), public._kodesh_record_chapter(uuid, text, int) from public, anon, authenticated;
grant execute on function public.get_my_streak_state(text) to authenticated;

drop function if exists public.buy_ai_credit(text);
drop function if exists public._kodesh_check_parasha(uuid);
drop function if exists public._kodesh_parasha_progress(uuid);
drop function if exists public._kodesh_parasha_for(date);
drop function if exists public._kodesh_ai_limit(uuid, text);
drop function if exists public._kodesh_gap(date, date);
drop table if exists public.kodesh_parasha_calendar;
drop table if exists public.kodesh_parashot;
alter table public.reading_streaks
  drop column if exists credits_search, drop column if exists credits_assistant, drop column if exists credits_lexicon;

commit;
