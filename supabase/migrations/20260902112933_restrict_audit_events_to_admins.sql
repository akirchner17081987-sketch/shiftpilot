drop policy if exists audit_select on public.audit_events;
drop policy if exists audit_insert on public.audit_events;
revoke insert, update, delete on table public.audit_events from anon, authenticated;;
