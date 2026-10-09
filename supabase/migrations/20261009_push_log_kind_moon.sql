-- Avisos de luna nueva (tema FCM «luna-nueva») en el historial de notificaciones
alter table public.push_notification_log drop constraint push_notification_log_kind_check;
alter table public.push_notification_log add constraint push_notification_log_kind_check check (kind = any (array['promise','reading','night','individual','test','moon']));
