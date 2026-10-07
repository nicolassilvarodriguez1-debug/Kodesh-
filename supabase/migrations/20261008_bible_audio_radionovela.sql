-- Radionovela: tiempos de la versión con sintonía y silencios entre escenas,
-- y los tramos exactos donde habla Elohim (para su tema musical).
alter table public.bible_audio
  add column if not exists timings_cine jsonb,
  add column if not exists duration_cine numeric,
  add column if not exists voice_spans jsonb;
