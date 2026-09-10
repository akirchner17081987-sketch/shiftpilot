drop trigger if exists trg_notifications_web_push_refresh on public.notifications;

create trigger trg_notifications_web_push_refresh
after update of created_at on public.notifications
for each row
when (new.created_at is distinct from old.created_at)
execute function private.sf_enqueue_push_notification();
