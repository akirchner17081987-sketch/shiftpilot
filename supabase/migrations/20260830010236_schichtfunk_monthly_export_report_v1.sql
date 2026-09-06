create or replace function public.manager_time_report_bundle(
  p_company_id uuid,
  p_month date,
  p_employee_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_month_start date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_month_end date := (date_trunc('month',coalesce(p_month,current_date)) + interval '1 month - 1 day')::date;
  v_state text;
  v_types text[];
  v_company_name text;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
      and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Nicht berechtigt'; end if;

  if p_employee_id is not null and not exists (
    select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id
  ) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;

  select c.name into v_company_name from public.companies c where c.id=p_company_id;
  select coalesce(s.federal_state,'DE'),coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[])
    into v_state,v_types
  from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  v_types:=coalesce(v_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]);

  with selected_employees as (
    select e.*
    from public.employees e
    where e.company_id=p_company_id
      and (p_employee_id is null or e.id=p_employee_id)
      and (e.start_date is null or e.start_date<=v_month_end)
      and (e.contract_end is null or e.contract_end>=v_month_start)
  ), summaries as (
    select e.id,e.last_name,e.first_name,private.time_account_row_v1(e.id,v_month_start) as summary
    from selected_employees e
  ), all_days as (
    select e.id as employee_id,e.company_id,e.first_name,e.last_name,e.personnel_no,e.employment,e.weekly_hours,
      e.start_date,e.contract_end,
      round(e.weekly_hours*60/5.0)::int as daily_target_minutes,
      d::date as work_date,
      private.german_holiday_name(d::date,v_state) as holiday_name
    from selected_employees e
    cross join lateral generate_series(v_month_start,v_month_end,interval '1 day') d
    where d::date>=coalesce(e.start_date,v_month_start)
      and d::date<=coalesce(e.contract_end,v_month_end)
  ), planned as (
    select ad.employee_id,ad.work_date,
      string_agg(sa.shift_code,', ' order by sa.starts_at) as shift_codes,
      string_agg(to_char(timezone('Europe/Berlin',sa.starts_at),'HH24:MI')||'–'||to_char(timezone('Europe/Berlin',sa.ends_at),'HH24:MI'),', ' order by sa.starts_at) as planned_times,
      coalesce(sum(sa.break_minutes),0)::int as planned_break_minutes,
      coalesce(sum(greatest(0,round(extract(epoch from (sa.ends_at-sa.starts_at))/60.0)::int-sa.break_minutes)),0)::int as planned_net_minutes
    from all_days ad
    join public.shift_assignments sa on sa.employee_id=ad.employee_id and sa.company_id=ad.company_id
      and (timezone('Europe/Berlin',sa.starts_at))::date=ad.work_date
      and sa.status='PUBLISHED'
    group by ad.employee_id,ad.work_date
  ), actuals as (
    select ad.employee_id,ad.work_date,
      string_agg(case when te.actual_start is not null and te.actual_end is not null
        then to_char(timezone('Europe/Berlin',te.actual_start),'HH24:MI')||'–'||to_char(timezone('Europe/Berlin',te.actual_end),'HH24:MI') else null end,
        ', ' order by sa.starts_at) as actual_times,
      string_agg(coalesce(te.status,'open'),', ' order by sa.starts_at) as time_statuses,
      coalesce(sum(case when te.status='confirmed' then te.break_minutes else 0 end),0)::int as actual_break_minutes,
      coalesce(sum(case when te.status='confirmed' and te.actual_start is not null and te.actual_end is not null
        then greatest(0,round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int-te.break_minutes) else 0 end),0)::int as confirmed_actual_minutes,
      count(te.assignment_id) filter (where te.status in ('recorded','correction_requested'))::int as pending_entries
    from all_days ad
    join public.shift_assignments sa on sa.employee_id=ad.employee_id and sa.company_id=ad.company_id
      and (timezone('Europe/Berlin',sa.starts_at))::date=ad.work_date
      and sa.status='PUBLISHED'
    left join public.time_entries te on te.assignment_id=sa.id
    group by ad.employee_id,ad.work_date
  ), absence_raw as (
    select ad.employee_id,ad.work_date,ad.daily_target_minutes,a.absence_type,
      case
        when ad.holiday_name is not null or extract(isodow from ad.work_date)::int not between 1 and 5 then 0
        when a.full_day then ad.daily_target_minutes
        when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
          then least(ad.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int))
        else 0 end as credit_minutes
    from all_days ad
    join public.absences a on a.employee_id=ad.employee_id and a.company_id=ad.company_id
      and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(v_types)
      and ad.work_date between a.start_date and a.end_date
  ), absence_day as (
    select employee_id,work_date,
      string_agg(distinct absence_type,', ' order by absence_type) as absence_types,
      least(max(daily_target_minutes),sum(credit_minutes))::int as absence_credit_minutes
    from absence_raw group by employee_id,work_date
  ), details as (
    select ad.employee_id,trim(ad.first_name||' '||ad.last_name) as employee_name,ad.personnel_no,
      ad.work_date,to_char(ad.work_date,'Dy') as weekday,
      case when extract(isodow from ad.work_date)::int between 1 and 5 and ad.holiday_name is null then ad.daily_target_minutes else 0 end::int as target_minutes,
      coalesce(p.shift_codes,'') as shift_codes,coalesce(p.planned_times,'') as planned_times,
      coalesce(p.planned_break_minutes,0) as planned_break_minutes,coalesce(p.planned_net_minutes,0) as planned_net_minutes,
      coalesce(ac.actual_times,'') as actual_times,coalesce(ac.actual_break_minutes,0) as actual_break_minutes,
      coalesce(ac.confirmed_actual_minutes,0) as confirmed_actual_minutes,coalesce(ac.time_statuses,'') as time_statuses,
      coalesce(ac.pending_entries,0) as pending_entries,
      coalesce(ab.absence_types,'') as absence_types,coalesce(ab.absence_credit_minutes,0) as absence_credit_minutes,
      coalesce(ad.holiday_name,'') as holiday_name,
      (coalesce(ac.confirmed_actual_minutes,0)+coalesce(ab.absence_credit_minutes,0)-
       case when extract(isodow from ad.work_date)::int between 1 and 5 and ad.holiday_name is null then ad.daily_target_minutes else 0 end)::int as day_balance_minutes
    from all_days ad
    left join planned p on p.employee_id=ad.employee_id and p.work_date=ad.work_date
    left join actuals ac on ac.employee_id=ad.employee_id and ac.work_date=ad.work_date
    left join absence_day ab on ab.employee_id=ad.employee_id and ab.work_date=ad.work_date
  )
  select jsonb_build_object(
    'company',jsonb_build_object('id',p_company_id,'name',coalesce(v_company_name,'SchichtFunk')),
    'month_start',v_month_start,'month_end',v_month_end,
    'federal_state',v_state,
    'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.holiday_name) order by h.holiday_date)
      from private.german_public_holidays(extract(year from v_month_start)::int,v_state) h
      where h.holiday_date between v_month_start and v_month_end),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(s.summary order by s.last_name,s.first_name) from summaries s),'[]'::jsonb),
    'details',coalesce((select jsonb_agg(to_jsonb(d) order by d.employee_name,d.work_date) from details d),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.manager_time_report_bundle(uuid,date,uuid) from public,anon;
grant execute on function public.manager_time_report_bundle(uuid,date,uuid) to authenticated;;
