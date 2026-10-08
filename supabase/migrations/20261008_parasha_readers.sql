-- Comunidad Kodesh: cuántos lectores completaron la porción esta semana (anónimo).
CREATE OR REPLACE FUNCTION public.parasha_readers(p_chapters text[], p_since date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Cuántos lectores marcaron TODOS los capítulos de la porción desde p_since.
  -- Anónimo: solo un número, y nada si son menos de 3.
  select case when n >= 3 then n else null end from (
    select count(*)::int n from (
      select d.user_id
      from reading_days d, unnest(d.chapters) c
      where d.day >= p_since and c = any(p_chapters)
      group by d.user_id
      having count(distinct c) = coalesce(array_length(p_chapters, 1), 0)
    ) t
  ) x
  where coalesce(array_length(p_chapters, 1), 0) between 1 and 40;
$function$;

grant execute on function public.parasha_readers(text[], date) to anon, authenticated;
