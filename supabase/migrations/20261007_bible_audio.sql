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
