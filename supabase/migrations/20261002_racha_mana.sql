-- ═══════════════════════════════════════════════════════════════════════
-- Racha en el servidor + Maná + Protectores de racha
-- ═══════════════════════════════════════════════════════════════════════
-- Antes la racha la calculaba el navegador (auth.js updateStreak) y solo al
-- marcar un capítulo: al abrir la app se mostraba current_streak aunque el
-- último día leído fuera de hace semanas (49 de 51 rachas guardadas eran
-- falsas) y el push "no pierdas tu racha" le hablaba a gente inactiva.
--
-- Ahora:
--   - Un trigger en reading_progress (lo que ya escriben TODAS las versiones
--     de la app al marcar un capítulo) registra el día en reading_days, da
--     maná y actualiza la racha. Las apps viejas funcionan sin build nueva.
--   - settle_all_streaks() corre cada hora (pg_cron): si alguien faltó un
--     día gasta un protector o pone la racha en 0. El número guardado en
--     reading_streaks es siempre verdadero.
--   - RPCs para la app: get_my_streak_state, buy_streak_shield,
--     get_reading_calendar.
--
-- Reglas:
--   Maná: +10 por capítulo distinto (máx. 5 por día), +20 al cumplir la meta
--   diaria, hitos de racha 7/30/100/365 → +50/+200/+500/+1000.
--   Protector: 200 de maná, máximo 2. Cubre UN día perdido cada uno; si se
--   perdieron más días que protectores, la racha se pierde y los protectores
--   no se gastan. Premium: 1 protector gratis por mes.
--   "Hoy" es la fecha local del usuario (user_profiles.timezone, por defecto
--   America/New_York).

-- ── Esquema ─────────────────────────────────────────────────────────────
alter table public.user_profiles add column if not exists timezone text;

alter table public.reading_streaks
  add column if not exists mana integer not null default 0,
  add column if not exists shields integer not null default 0,
  add column if not exists last_active_date date,          -- último día leído O protegido
  add column if not exists premium_shield_month text,      -- 'YYYY-MM' del último protector Premium
  add column if not exists pending_notices jsonb not null default '[]'::jsonb;

create unique index if not exists reading_streaks_user_id_key on public.reading_streaks (user_id);

create table if not exists public.reading_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  chapters text[] not null default '{}',   -- 'GEN:1', 'JHN:3' … (distintos)
  mana_earned integer not null default 0,
  goal_bonus boolean not null default false,
  shielded boolean not null default false, -- día cubierto por un protector
  primary key (user_id, day)
);

create table if not exists public.mana_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,   -- chapter | goal | milestone | shield_purchase | welcome
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mana_ledger_user on public.mana_ledger (user_id, created_at desc);

-- ── Helpers internos ────────────────────────────────────────────────────
create or replace function public._kodesh_tz(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select up.timezone from public.user_profiles up
      where up.id = p_uid and up.timezone in (select name from pg_timezone_names)),
    'America/New_York');
$$;

-- kodesh.fake_now permite a los tests fijar "ahora" dentro de una transacción.
create or replace function public._kodesh_now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('kodesh.fake_now', true), '')::timestamptz, now());
$$;

create or replace function public._kodesh_today(p_uid uuid) returns date
language sql stable security definer set search_path = public as $$
  select (public._kodesh_now() at time zone public._kodesh_tz(p_uid))::date;
$$;

create or replace function public._kodesh_award(p_uid uuid, p_amount int, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount = 0 then return; end if;
  update public.reading_streaks set mana = mana + p_amount, updated_at = now() where user_id = p_uid;
  insert into public.mana_ledger (user_id, amount, reason, detail) values (p_uid, p_amount, p_reason, p_detail);
end $$;

create or replace function public._kodesh_notice(p_uid uuid, p_notice jsonb)
returns void language sql security definer set search_path = public as $$
  update public.reading_streaks
     set pending_notices = (pending_notices || jsonb_build_array(p_notice))
   where user_id = p_uid;
$$;

-- Resuelve los días perdidos desde last_active_date hasta ayer.
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

-- Registra un capítulo leído hoy. Idempotente por (usuario, día, capítulo).
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

-- Trigger: cualquier versión de la app inserta en reading_progress al marcar
-- un capítulo. Solo INSERT: un upsert de un capítulo ya marcado no cuenta.
create or replace function public._kodesh_on_progress_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._kodesh_record_chapter(new.user_id, new.book_id, new.chapter);
  exception when others then
    -- La racha nunca debe impedir guardar el progreso de lectura.
    raise warning 'kodesh racha: % (%)', sqlerrm, new.user_id;
  end;
  return new;
end $$;

drop trigger if exists trg_kodesh_progress_streak on public.reading_progress;
create trigger trg_kodesh_progress_streak
  after insert on public.reading_progress
  for each row execute function public._kodesh_on_progress_insert();

-- ── API para la app (auth.uid()) ────────────────────────────────────────
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

create or replace function public.buy_streak_shield()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.reading_streaks%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.reading_streaks (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into r from public.reading_streaks where user_id = v_uid for update;
  if r.shields >= 2 then
    return jsonb_build_object('ok', false, 'error', 'max_shields', 'mana', r.mana, 'shields', r.shields);
  end if;
  if r.mana < 200 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_mana', 'mana', r.mana, 'shields', r.shields);
  end if;
  update public.reading_streaks set shields = shields + 1, updated_at = now() where user_id = v_uid;
  perform public._kodesh_award(v_uid, -200, 'shield_purchase', null);
  return jsonb_build_object('ok', true, 'mana', r.mana - 200, 'shields', r.shields + 1);
end $$;

create or replace function public.get_reading_calendar(p_days int default 35)
returns table (day date, chapters int, shielded boolean)
language sql stable security definer set search_path = public as $$
  select d.day, cardinality(d.chapters), d.shielded
    from public.reading_days d
   where d.user_id = auth.uid()
     and d.day > public._kodesh_today(auth.uid()) - least(greatest(p_days, 1), 400)
   order by d.day;
$$;

-- Cada hora (pg_cron): resuelve rachas vencidas en la zona horaria de cada usuario.
create or replace function public.settle_all_streaks()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_n int := 0;
begin
  for v_uid in
    select s.user_id from public.reading_streaks s
     where s.current_streak > 0
       and coalesce(s.last_active_date, s.last_read_date, '1900-01-01')
           < public._kodesh_today(s.user_id) - 1
  loop
    perform public._kodesh_settle(v_uid);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────
revoke all on function public._kodesh_tz(uuid), public._kodesh_today(uuid),
  public._kodesh_award(uuid, int, text, text), public._kodesh_notice(uuid, jsonb),
  public._kodesh_settle(uuid), public._kodesh_record_chapter(uuid, text, int),
  public.settle_all_streaks() from public, anon, authenticated;
revoke all on function public.get_my_streak_state(text), public.buy_streak_shield(),
  public.get_reading_calendar(int) from public, anon;
grant execute on function public.get_my_streak_state(text), public.buy_streak_shield(),
  public.get_reading_calendar(int) to authenticated;

-- reading_streaks: el usuario ya no puede escribir su racha ni su maná
-- (antes la política era ALL). Lectura y borrado (eliminar cuenta) sí.
drop policy if exists "Users manage own streak" on public.reading_streaks;
drop policy if exists "Users read own streak" on public.reading_streaks;
drop policy if exists "Users delete own streak" on public.reading_streaks;
create policy "Users read own streak" on public.reading_streaks for select using (auth.uid() = user_id);
create policy "Users delete own streak" on public.reading_streaks for delete using (auth.uid() = user_id);

alter table public.reading_days enable row level security;
drop policy if exists "Users read own reading days" on public.reading_days;
create policy "Users read own reading days" on public.reading_days for select using (auth.uid() = user_id);

alter table public.mana_ledger enable row level security;
drop policy if exists "Users read own mana" on public.mana_ledger;
create policy "Users read own mana" on public.mana_ledger for select using (auth.uid() = user_id);
