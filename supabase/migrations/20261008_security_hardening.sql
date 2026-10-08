-- Aplicado el 8 oct 2026 (antes del modo invitado)
revoke execute on function public._kodesh_on_progress_insert() from anon, authenticated, public;
alter function public.interlinear_cached_chapters set search_path = public, pg_temp;
alter function public.set_preview_url set search_path = public, pg_temp;
alter function public._kodesh_now set search_path = public, pg_temp;
