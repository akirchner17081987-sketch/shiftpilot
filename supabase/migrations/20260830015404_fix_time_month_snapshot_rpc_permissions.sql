create or replace function private.manager_time_report_bundle_v2_impl(p_company_id uuid,p_month date,p_employee_id uuid default null)
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
  select c.report_snapshot into v_snapshot from public.time_month_closures c
  where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is null then return public.manager_time_report_bundle(p_company_id,v_month,p_employee_id); end if;
  if p_employee_id is null then return v_snapshot || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED')); end if;
  v_result:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  v_result:=jsonb_set(v_result,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  return v_result || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED'));
end;
$$;
revoke all on function private.manager_time_report_bundle_v2_impl(uuid,date,uuid) from public,anon;
grant execute on function private.manager_time_report_bundle_v2_impl(uuid,date,uuid) to authenticated;

create or replace function public.manager_time_report_bundle_v2(p_company_id uuid,p_month date,p_employee_id uuid default null)
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.manager_time_report_bundle_v2_impl(p_company_id,p_month,p_employee_id); $$;
revoke all on function public.manager_time_report_bundle_v2(uuid,date,uuid) from public,anon;
grant execute on function public.manager_time_report_bundle_v2(uuid,date,uuid) to authenticated;

create or replace function private.manager_monthly_time_accounts_impl(p_company_id uuid,p_month date)
returns setof jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  r record;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Nicht berechtigt'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    for r in select value as row from jsonb_array_elements(v_snapshot->'employees') loop return next r.row; end loop;
    return;
  end if;
  for r in select e.id from public.employees e where e.company_id=p_company_id
    and (e.start_date is null or e.start_date <= (v_month+interval '1 month - 1 day')::date)
    and (e.contract_end is null or e.contract_end >= v_month)
    order by e.last_name,e.first_name
  loop return next private.time_account_row_v1(r.id,v_month); end loop;
  return;
end;
$$;
revoke all on function private.manager_monthly_time_accounts_impl(uuid,date) from public,anon;
grant execute on function private.manager_monthly_time_accounts_impl(uuid,date) to authenticated;

create or replace function public.manager_monthly_time_accounts(p_company_id uuid,p_month date)
returns setof jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select * from private.manager_monthly_time_accounts_impl(p_company_id,p_month); $$;
revoke all on function public.manager_monthly_time_accounts(uuid,date) from public,anon;
grant execute on function public.manager_monthly_time_accounts(uuid,date) to authenticated;

create or replace function private.employee_my_time_account_month_impl(p_month date default current_date)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_employee_id uuid;
  v_company_id uuid;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_row jsonb;
begin
  select e.id,e.company_id into v_employee_id,v_company_id from public.employees e
  where e.auth_user_id=auth.uid() and e.access_status='ACTIVE' order by e.updated_at desc limit 1;
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=v_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=v_employee_id::text limit 1;
    return v_row;
  end if;
  return private.time_account_row_v1(v_employee_id,v_month);
end;
$$;
revoke all on function private.employee_my_time_account_month_impl(date) from public,anon;
grant execute on function private.employee_my_time_account_month_impl(date) to authenticated;

create or replace function public.employee_my_time_account_month(p_month date default current_date)
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.employee_my_time_account_month_impl(p_month); $$;
revoke all on function public.employee_my_time_account_month(date) from public,anon;
grant execute on function public.employee_my_time_account_month(date) to authenticated;;
