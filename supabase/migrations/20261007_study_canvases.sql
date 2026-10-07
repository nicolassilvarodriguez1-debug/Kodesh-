-- Lienzo de estudio: cada fila es un estudio (cuaderno o lienzo libre) del usuario.
-- data = { pages: [{ id, template, elements: [...] }], v: 1 }
create table if not exists public.study_canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Estudio' check (char_length(title) <= 120),
  format text not null default 'notebook' check (format in ('notebook','free')),
  template text check (char_length(template) <= 40),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 3000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists study_canvases_user_updated on public.study_canvases (user_id, updated_at desc);
alter table public.study_canvases enable row level security;

create policy "study_canvases_own_select" on public.study_canvases for select to authenticated using (user_id = (select auth.uid()));
create policy "study_canvases_own_insert" on public.study_canvases for insert to authenticated with check (user_id = (select auth.uid()));
create policy "study_canvases_own_update" on public.study_canvases for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "study_canvases_own_delete" on public.study_canvases for delete to authenticated using (user_id = (select auth.uid()));
