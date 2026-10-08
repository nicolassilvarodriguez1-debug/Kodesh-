-- Escuchas anónimas de la Biblia en audio: por capítulo y por día.
-- Solo se escribe con la función log_audio_event (sin políticas de lectura pública).
create table if not exists public.bible_audio_stats (
  book text not null, chapter int not null,
  plays int not null default 0, cine_plays int not null default 0, completes int not null default 0,
  seconds numeric not null default 0, last_at timestamptz,
  primary key (book, chapter)
);
create table if not exists public.bible_audio_daily (
  day date primary key, plays int not null default 0, completes int not null default 0, seconds numeric not null default 0
);
alter table public.bible_audio_stats enable row level security;
alter table public.bible_audio_daily enable row level security;

create or replace function public.log_audio_event(p_book text, p_chapter int, p_event text, p_cine boolean, p_seconds numeric)
returns void language plpgsql security definer set search_path = public as $$
declare s numeric := least(greatest(coalesce(p_seconds, 0), 0), 3600);
        d date := (now() at time zone 'America/New_York')::date;
begin
  if p_book !~ '^[A-Z0-9]{3}$' or p_chapter < 1 or p_chapter > 150 or p_event not in ('play', 'complete', 'leave') then return; end if;
  insert into bible_audio_stats as t (book, chapter, plays, cine_plays, completes, seconds, last_at)
  values (p_book, p_chapter,
          case when p_event = 'play' then 1 else 0 end,
          case when p_event = 'play' and p_cine then 1 else 0 end,
          case when p_event = 'complete' then 1 else 0 end, s, now())
  on conflict (book, chapter) do update set
    plays = t.plays + excluded.plays, cine_plays = t.cine_plays + excluded.cine_plays,
    completes = t.completes + excluded.completes, seconds = t.seconds + excluded.seconds, last_at = now();
  insert into bible_audio_daily as t (day, plays, completes, seconds)
  values (d, case when p_event = 'play' then 1 else 0 end, case when p_event = 'complete' then 1 else 0 end, s)
  on conflict (day) do update set plays = t.plays + excluded.plays, completes = t.completes + excluded.completes, seconds = t.seconds + excluded.seconds;
end $$;
revoke all on function public.log_audio_event(text, int, text, boolean, numeric) from public;
grant execute on function public.log_audio_event(text, int, text, boolean, numeric) to anon, authenticated;
