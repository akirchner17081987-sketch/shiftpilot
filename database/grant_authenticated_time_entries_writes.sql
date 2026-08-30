-- SchichtFunk: Data-API privileges for time-entry synchronization.
-- Row access remains restricted by the existing time_entries RLS policies.

grant select, insert, update, delete
on table public.time_entries
to authenticated;

notify pgrst, 'reload schema';

