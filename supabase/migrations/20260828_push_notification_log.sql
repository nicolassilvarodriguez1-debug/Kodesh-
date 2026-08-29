-- Historial de notificaciones push realmente enviadas (no cuenta vistas
-- previas / dry-run). Cubre los 3 recordatorios masivos (promise/reading/
-- night, disparados por cron o manualmente desde el panel), el push
-- individual a un usuario, y el push de prueba. sent_by queda null cuando
-- lo dispara Vercel Cron (no hay sesión de admin en ese caso).
create table if not exists public.push_notification_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_email text,
  kind text not null check (kind in ('promise','reading','night','individual','test')),
  target_label text,
  title text not null,
  body text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  total_count integer not null default 0
);

create index if not exists idx_push_notification_log_sent_at
  on public.push_notification_log (sent_at desc);

alter table public.push_notification_log enable row level security;

-- Solo el service role (usado por las funciones de api/) puede leer/escribir;
-- no hay acceso directo desde el cliente.
create policy "service role only" on public.push_notification_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
