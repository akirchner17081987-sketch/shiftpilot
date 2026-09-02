-- Remove legacy permissive policies so only the OWNER/ADMIN policy can read
-- audit rows. Writes remain available exclusively to trusted database code.
drop policy if exists audit_select on public.audit_events;
drop policy if exists audit_insert on public.audit_events;

revoke insert, update, delete on table public.audit_events from anon, authenticated;
