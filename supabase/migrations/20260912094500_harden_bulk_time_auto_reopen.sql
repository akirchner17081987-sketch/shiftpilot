begin;

alter function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean)
  set schema private;

create function public.manager_bulk_record_time_entries(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text default '',
  p_confirm boolean default false
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.manager_bulk_record_time_entries(
    p_company_id,p_start_date,p_end_date,p_note,p_confirm
  );
$$;

comment on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean)
is 'Authenticated API wrapper for the audited manager bulk time-entry workflow.';

revoke all on function private.manager_bulk_record_time_entries(uuid,date,date,text,boolean) from public,anon;
revoke all on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean) from public,anon;
grant execute on function private.manager_bulk_record_time_entries(uuid,date,date,text,boolean) to authenticated;
grant execute on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean) to authenticated;

notify pgrst,'reload schema';

commit;
