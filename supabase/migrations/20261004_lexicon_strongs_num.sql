-- Número Strong's como entero para ordenar el diccionario (H1, H2… no H1, H10, H100)
-- en lexicon.html, que ahora pagina en el servidor (antes cargaba todo y
-- PostgREST cortaba en 1000 filas).
alter table public.lexicon_cache add column if not exists strongs_num int
  generated always as (nullif(regexp_replace(coalesce(strongs,''), '\D', '', 'g'), '')::int) stored;
create index if not exists lexicon_cache_strongs_browse
  on public.lexicon_cache (testament, strongs_num) where word like 'strongs\_%';
