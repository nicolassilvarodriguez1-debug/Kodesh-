-- Audio de la Biblia (ElevenLabs). Lo escribe solo api/audio-pregen.js con la
-- service key; cualquiera puede leerlo (el lector lo reproduce).
create table if not exists public.bible_audio (
  id bigint generated always as identity primary key,
  version text not null default 'kodesh',
  book text not null,
  chapter integer not null,
  path text not null,
  bytes integer,
  duration_s numeric,
  timings jsonb not null default '[]'::jsonb,   -- [[versículo, segundo de inicio], …]
  chars integer,
  text_hash text,
  voice_id text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version, book, chapter)
);

alter table public.bible_audio enable row level security;

drop policy if exists "bible_audio_select" on public.bible_audio;
create policy "bible_audio_select" on public.bible_audio for select using (true);

insert into storage.buckets (id, name, public)
values ('bible-audio', 'bible-audio', true)
on conflict (id) do update set public = true;

-- Elenco de voces (papel → voz de ElevenLabs). Solo lo escribe el servidor.
create table if not exists public.bible_audio_cast (
  role text primary key,           -- narrador, yeshua, pedro, mujer_1, hombre_1…
  label text not null,
  voice_id text,
  updated_at timestamptz not null default now()
);
alter table public.bible_audio_cast enable row level security;

-- Guion de cada capítulo: quién dice qué (lo prepara la IA, se puede revisar
-- en el panel antes de grabar).
create table if not exists public.bible_audio_scripts (
  version text not null default 'kodesh',
  book text not null,
  chapter integer not null,
  segments jsonb not null,         -- [{ v, speaker, character, gender, text, tags }]
  text_hash text,
  edited boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (version, book, chapter)
);
alter table public.bible_audio_scripts enable row level security;
