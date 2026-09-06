do $$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manager_time_report_bundle' and pg_get_function_identity_arguments(p.oid)='p_company_id uuid, p_month date, p_employee_id uuid')
     and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manager_time_report_bundle_live' and pg_get_function_identity_arguments(p.oid)='p_company_id uuid, p_month date, p_employee_id uuid') then
    alter function public.manager_time_report_bundle(uuid,date,uuid) rename to manager_time_report_bundle_live;
  end if;
end $$;

revoke all on function public.manager_time_report_bundle_live(uuid,date,uuid) from public,anon,authenticated;

create or replace function private.manager_time_report_bundle_snapshot_impl(p_company_id uuid,p_month date,p_employee_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_result jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_employee_id is not null and not exists(select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id) then
    raise exception 'Mitarbeiter gehört nicht zum Unternehmen';
  end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is null then
    return public.manager_time_report_bundle_live(p_company_id,v_month,p_employee_id);
  end if;
  if p_employee_id is null then
    return v_snapshot || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED'));
  end if;
  v_result:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  v_result:=jsonb_set(v_result,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  return v_result || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED'));
end;
$$;
revoke all on function private.manager_time_report_bundle_snapshot_impl(uuid,date,uuid) from public,anon;
grant execute on function private.manager_time_report_bundle_snapshot_impl(uuid,date,uuid) to authenticated;

create or replace function public.manager_time_report_bundle(p_company_id uuid,p_month date,p_employee_id uuid default null)
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.manager_time_report_bundle_snapshot_impl(p_company_id,p_month,p_employee_id); $$;
revoke all on function public.manager_time_report_bundle(uuid,date,uuid) from public,anon;
grant execute on function public.manager_time_report_bundle(uuid,date,uuid) to authenticated;

create or replace function private.manager_time_report_bundle_v2_impl(p_company_id uuid,p_month date,p_employee_id uuid default null)
returns jsonb
language sql
security definer
set search_path='public','private','pg_temp'
as $$ select private.manager_time_report_bundle_snapshot_impl(p_company_id,p_month,p_employee_id); $$;
revoke all on function private.manager_time_report_bundle_v2_impl(uuid,date,uuid) from public,anon;
grant execute on function private.manager_time_report_bundle_v2_impl(uuid,date,uuid) to authenticated;;
