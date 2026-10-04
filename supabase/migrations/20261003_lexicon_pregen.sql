-- Pre-generación del diccionario Strong's completo en lexicon_cache vía la
-- API de lotes de Anthropic (api/lexicon-pregen.js). Una fila por lote.
create table if not exists public.lexicon_pregen_jobs (
  id bigint generated always as identity primary key,
  batch_id text not null unique,
  status text not null default 'in_progress',   -- in_progress | ended | processed | failed
  request_count int not null default 0,
  succeeded int not null default 0,
  errored int not null default 0,
  processed int not null default 0,              -- líneas de resultados ya guardadas
  saved int not null default 0,                  -- filas escritas en lexicon_cache
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lexicon_pregen_jobs enable row level security;
-- Sin políticas: solo el service role (las funciones de /api) la usa.
