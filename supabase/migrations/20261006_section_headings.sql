-- Títulos de sección propios de KODESH (api/headings-pregen.js → index.html).
create table if not exists public.section_headings (
  book_id text not null,
  chapter int not null,
  headings jsonb not null,            -- [{"v":1,"t":"La creación"}, …]
  model_version text,
  updated_at timestamptz not null default now(),
  primary key (book_id, chapter)
);
alter table public.section_headings enable row level security;
drop policy if exists "Anyone can read section headings" on public.section_headings;
create policy "Anyone can read section headings" on public.section_headings for select using (true);

create table if not exists public.headings_pregen_jobs (
  id bigint generated always as identity primary key,
  batch_id text not null unique,
  status text not null default 'in_progress',
  request_count int not null default 0,
  succeeded int not null default 0,
  errored int not null default 0,
  processed int not null default 0,
  saved int not null default 0,
  failed int not null default 0,
  failed_chapters text[] not null default '{}',
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.headings_pregen_jobs enable row level security;
