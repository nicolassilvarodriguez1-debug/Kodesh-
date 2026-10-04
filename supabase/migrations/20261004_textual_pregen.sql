-- Pre-generación de la Traducción Kodesh completa en textual_cache vía la
-- API de lotes de Anthropic (api/textual-pregen.js). Una fila por lote.
create table if not exists public.textual_pregen_jobs (
  id bigint generated always as identity primary key,
  batch_id text not null unique,
  status text not null default 'in_progress',   -- in_progress | ended | processed | failed
  request_count int not null default 0,          -- capítulos enviados
  succeeded int not null default 0,
  errored int not null default 0,
  processed int not null default 0,              -- líneas de resultados ya revisadas
  saved int not null default 0,                  -- capítulos guardados en textual_cache
  failed int not null default 0,                 -- capítulos que no pasaron los controles
  failed_chapters text[] not null default '{}',  -- p. ej. {"PSA_119","PHP_2"}
  input_tokens bigint not null default 0,        -- uso real, para el costo
  output_tokens bigint not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.textual_pregen_jobs enable row level security;
-- Sin políticas: solo el service role (las funciones de /api) la usa.
