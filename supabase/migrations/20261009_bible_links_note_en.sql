-- Red bíblica en inglés: nota de cada conexión traducida (la de español queda en note).
alter table public.bible_links add column if not exists note_en text;
