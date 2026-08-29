-- El panel admin de cobertura interlineal dejó de cargar: interlinear_cache
-- guarda una fila por PALABRA (no por capítulo), y ya tiene ~238k filas para
-- solo 559 capítulos cacheados. El endpoint traía TODA la tabla paginando de
-- 1000 en 1000 (≈238 requests secuenciales) solo para sacar los pares
-- (book, chapter) distintos en JS — eso ahora excede el timeout de la función
-- de Vercel. Esta función hace el DISTINCT en la base de datos, así el
-- backend solo trae ~559 filas en una sola llamada.
create or replace function public.interlinear_cached_chapters()
returns table(book text, chapter integer)
language sql
stable
as $$
  select distinct book, chapter from interlinear_cache;
$$;

grant execute on function public.interlinear_cached_chapters() to service_role;
