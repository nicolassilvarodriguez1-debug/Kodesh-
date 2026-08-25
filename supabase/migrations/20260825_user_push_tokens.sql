-- KODESH — Tabla de tokens push (Firebase Cloud Messaging) por dispositivo.
-- Aplicada directamente vía Supabase MCP el 2026-08-25; este archivo queda
-- como registro histórico de la migración, igual que las anteriores.

create table public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index user_push_tokens_user_id_idx on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

-- Los tokens se escriben siempre desde el backend con la service key
-- (igual que el resto del proyecto); esta política solo cubre lecturas
-- directas desde el cliente si algún día se necesitan.
create policy "select_own_push_tokens"
  on public.user_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);
