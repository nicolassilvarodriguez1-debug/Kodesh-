-- Idioma del dispositivo para las notificaciones (modo inglés). Aplicada el 9 oct 2026.
alter table public.user_push_tokens add column if not exists lang text not null default 'es';
alter table public.user_push_tokens drop constraint if exists user_push_tokens_lang_check;
alter table public.user_push_tokens add constraint user_push_tokens_lang_check check (lang in ('es','en'));
