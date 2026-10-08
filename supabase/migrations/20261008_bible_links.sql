-- Red bíblica: conexiones del Nuevo Testamento con el Tanaj (citas, cumplimientos, alusiones)
create table if not exists public.bible_links (
  id bigserial primary key,
  nt_book text not null, nt_chapter int not null, nt_verse int not null,
  ot_book text not null, ot_chapter int not null, ot_verse int not null, ot_verse_end int,
  kind text not null default 'cita',
  phrase text, note text, model_version text,
  created_at timestamptz not null default now()
);
create index if not exists bible_links_nt on public.bible_links (nt_book, nt_chapter);
create index if not exists bible_links_ot on public.bible_links (ot_book, ot_chapter);
create table if not exists public.bible_links_done (
  book text not null, chapter int not null, links int not null default 0, updated_at timestamptz not null default now(),
  primary key (book, chapter)
);
create table if not exists public.links_pregen_jobs (like public.headings_pregen_jobs including defaults);
alter table public.bible_links enable row level security;
alter table public.bible_links_done enable row level security;
alter table public.links_pregen_jobs enable row level security;
create policy "bible_links lectura pública" on public.bible_links for select using (true);
