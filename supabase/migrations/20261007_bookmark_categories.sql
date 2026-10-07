-- Nombres y colores de resaltado personalizados por usuario (index.html:
-- "Personalizar colores"). {"gold":{"name":"Pacto","color":"#38b6c9"}, …}
alter table public.user_profiles add column if not exists bookmark_categories jsonb;
