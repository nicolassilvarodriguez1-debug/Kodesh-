-- Imita lo mínimo de Supabase para probar las migraciones en un Postgres local.
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
create table public.user_profiles (id uuid primary key references auth.users(id), display_name text,
  reading_goal_chapters int, created_at timestamptz default now());
create table public.user_plans (user_id uuid primary key, plan text, subscription_status text,
  current_period_end timestamptz);
create table public.reading_progress (id uuid default gen_random_uuid() primary key, user_id uuid,
  book_id text, chapter int, read_at timestamptz default now(), unique (user_id, book_id, chapter));
create table public.reading_streaks (id uuid default gen_random_uuid() primary key, user_id uuid unique,
  current_streak int default 0, longest_streak int default 0, last_read_date date,
  total_days_read int default 0, updated_at timestamptz default now());
alter table public.reading_streaks enable row level security;
create policy "Users manage own streak" on public.reading_streaks for all using (auth.uid() = user_id);
-- Como en Supabase: los roles tienen permisos de tabla y la RLS es la que filtra.
grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated;
create table public.ai_usage (user_id uuid, month text, searches_used int not null default 0,
  assistant_used int not null default 0, lexicon_used int not null default 0, updated_at timestamptz,
  primary key (user_id, month));
grant select, insert, update, delete on public.ai_usage to anon, authenticated, service_role;
