-- Correcciones a la Traducción Kodesh guardada (textual_cache), 3 oct 2026.
-- Correr en el SQL Editor de Supabase. Guarda copia en kodesh_backup antes.
create table if not exists kodesh_backup.textual_cache_20261003 as
  select * from public.textual_cache where (book_id, chapter) in (('PHP',2),('1JN',5),('JHN',7),('JHN',8));

-- Filipenses 2:2 estaba entero en inglés.
update public.textual_cache set updated_at = now(), verses = jsonb_set(verses, '{2}',
  to_jsonb('completad mi gozo, sintiendo lo mismo, teniendo el mismo amor, unánimes, pensando una misma cosa.'::text))
where book_id = 'PHP' and chapter = 2;

-- 1 Juan 5:7-8: el v7 existe en el griego antiguo; lo tardío es el Comma Johanneum.
update public.textual_cache set updated_at = now(), verses = jsonb_set(jsonb_set(verses, '{7}',
  to_jsonb('Porque tres son los que dan testimonio:'::text)), '{8}',
  to_jsonb('el Espíritu, el agua y la sangre; y los tres concuerdan en uno.'::text))
where book_id = '1JN' and chapter = 5;

-- Juan 7:53–8:11: la nota va en 7:53, no en 8:1.
update public.textual_cache set updated_at = now(), verses = jsonb_set(verses, '{53}',
  to_jsonb('[Este pasaje (7:53–8:11) no aparece en los manuscritos más antiguos. Su ubicación varía en los que lo incluyen.] Y se fue cada uno a su casa.'::text))
where book_id = 'JHN' and chapter = 7;
update public.textual_cache set updated_at = now(), verses = jsonb_set(verses, '{1}',
  to_jsonb('Y Yeshúa se fue al monte de los Olivos.'::text))
where book_id = 'JHN' and chapter = 8;

-- Comprobación
select book_id, chapter, e.key as verso, e.value as texto
from public.textual_cache, jsonb_each_text(verses) e
where (book_id, chapter, e.key) in (('PHP',2,'2'),('1JN',5,'7'),('1JN',5,'8'),('JHN',7,'53'),('JHN',8,'1'))
order by 1, 2, 3;
