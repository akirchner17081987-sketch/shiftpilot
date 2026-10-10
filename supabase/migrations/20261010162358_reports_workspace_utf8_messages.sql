-- Read-only analytics. The private definer deliberately reads a complete period
-- without RLS per-row overhead; tenant and time permissions are checked first.
create or replace function private.manager_reports_workspace(p_company_id uuid,p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text; today_ date; can_time boolean; settings_ public.time_account_settings%rowtype;
 result_ jsonb; people_ jsonb; snapshot_ jsonb; times_ jsonb:='[]'; qr_ jsonb:='[]';
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) then
  raise exception 'Für dieses Unternehmen fehlen Auswertungsrechte.' using errcode='42501';
 end if;
 if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>30
    or date_trunc('month',p_start_date)<>date_trunc('month',p_end_date) then
  raise exception 'Bitte einen gültigen Monatsabschnitt mit höchstens 31 Tagen angeben.' using errcode='22023';
 end if;
 select timezone into strict tz from public.companies where id=p_company_id;
 today_:=(now() at time zone tz)::date;
 can_time:=private.sf_can_manage_time(p_company_id);
 select * into settings_ from public.time_account_settings where company_id=p_company_id;
 select report_snapshot into snapshot_ from public.time_month_closures where company_id=p_company_id and month_start=date_trunc('month',p_start_date)::date and status='CLOSED';
 with roster as (
  select e.*,greatest(p_start_date,coalesce(e.start_date,p_start_date)) a,
   least(p_end_date,coalesce(e.contract_end,p_end_date)) b
  from public.employees e where e.company_id=p_company_id and e.deleted_at is null
   and coalesce(e.start_date,p_start_date)<=p_end_date and coalesce(e.contract_end,p_end_date)>=p_start_date
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'legacy_id',e.legacy_id,'first',e.first_name,'last',e.last_name,'personnel_no',e.personnel_no,
  'status',e.status,'employment',e.employment,'weekly_hours',e.weekly_hours,
  'start_date',e.start_date,'contract_end',e.contract_end,'shifts',e.shift_permissions,
  'team',private.sf_month_meta(e.qualifications,'planningTeam'),'site_name',private.sf_month_meta(e.qualifications,'team'),
  'monthly_hours',private.sf_month_meta(e.qualifications,'monthlyHours'),
  'target_minutes',coalesce((saved.row_->>'target_minutes')::integer,private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,e.b,coalesce(settings_.federal_state,'DE'))),
  'elapsed_target_minutes',case when today_>=p_end_date then coalesce((saved.row_->>'target_minutes')::integer,private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,least(e.b,today_),coalesce(settings_.federal_state,'DE'))) else private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,least(e.b,today_),coalesce(settings_.federal_state,'DE')) end,
  'credit_minutes',coalesce((saved.row_->>'absence_credit_minutes')::integer,private.sf_absence_credit_minutes(e.id,e.a,e.b,coalesce(settings_.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']),round(coalesce(e.weekly_hours,0)*60/5)::integer,coalesce(settings_.federal_state,'DE'))),
  'elapsed_credit_minutes',case when today_<e.a then 0 when today_>=p_end_date and saved.row_ is not null then coalesce((saved.row_->>'absence_credit_minutes')::integer,0) else private.sf_absence_credit_minutes(e.id,e.a,least(e.b,today_),coalesce(settings_.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']),round(coalesce(e.weekly_hours,0)*60/5)::integer,coalesce(settings_.federal_state,'DE')) end,
  'confirmed_minutes',case when can_time then private.sf_confirmed_work_minutes(e.id,p_start_date,p_end_date) else null end
 ) order by e.last_name,e.first_name,e.id),'[]') into people_ from roster e left join lateral (
  select x row_ from jsonb_array_elements(coalesce(snapshot_#>'{accounts,rows}',snapshot_->'employees','[]'::jsonb)) x
  where x->>'employee_id'=e.id::text limit 1
 ) saved on p_start_date=date_trunc('month',p_start_date)::date and p_end_date=(date_trunc('month',p_start_date)+interval '1 month - 1 day')::date;
 if can_time then
  select coalesce(jsonb_agg(jsonb_build_object('id',t.assignment_id,'employee_id',a.employee_id,
   'start',t.actual_start,'end',t.actual_end,'break_minutes',t.break_minutes,'status',t.status,
   'shift',a.shift_code,'date',(a.starts_at at time zone tz)::date,'site_id',s.site_id)),'[]') into times_
  from public.time_entries t join public.shift_assignments a on a.id=t.assignment_id and a.company_id=p_company_id
   left join public.shift_templates s on s.company_id=p_company_id and s.code=a.shift_code
  where t.company_id=p_company_id and a.status<>'CANCELLED'
   and ((a.starts_at>=p_start_date::timestamp at time zone tz and a.starts_at<(p_end_date+1)::timestamp at time zone tz)
    or (t.actual_start<(p_end_date+1)::timestamp at time zone tz and t.actual_end>p_start_date::timestamp at time zone tz));
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'employee_id',q.employee_id,'start',q.started_at,
   'end',q.ended_at,'site_id',t.site_id,'terminal',t.name,'status',case when q.ended_at is null then 'qr_running' else 'qr_booked' end,
   'break_minutes',0,'shift',null)),'[]') into qr_
  from public.time_qr_independent_shifts q left join public.time_qr_terminals t on t.id=q.terminal_id and t.company_id=p_company_id
  where q.company_id=p_company_id and q.started_at<(p_end_date+1)::timestamp at time zone tz
   and coalesce(q.ended_at,now())>p_start_date::timestamp at time zone tz;
 end if;
 select jsonb_build_object('company_id',p_company_id,'timezone',tz,'today',today_,'as_of',now(),
  'from',p_start_date,'to',p_end_date,'can_time',can_time,'employees',people_,'times',times_,'qr',qr_,
  'company_name',(select name from public.companies where id=p_company_id),
  'settings',jsonb_build_object('target_method',coalesce(settings_.target_method,'WEEKDAYS_5'),
    'target_method_from',settings_.target_method_from,'federal_state',coalesce(settings_.federal_state,'DE')),
  'closed_month',exists(select 1 from public.time_month_closures where company_id=p_company_id and month_start=date_trunc('month',p_start_date)::date and status='CLOSED'),
  'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'is_active',s.is_active) order by s.name) from public.company_locations s where s.company_id=p_company_id),'[]'),
  'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date between p_start_date and p_end_date),'[]'),
  'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'legacy_id',a.legacy_id,'employee_id',a.employee_id,
    'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,'date',(a.starts_at at time zone tz)::date,
    'break_minutes',a.break_minutes,'status',a.status,'site_id',t.site_id,
    'extra',exists(select 1 from public.open_shift_market_claims m where m.company_id=p_company_id and m.assignment_id=a.id and m.status='APPLIED')))
   from public.shift_assignments a left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where a.company_id=p_company_id and a.status<>'CANCELLED' and a.starts_at>=(p_start_date-1)::timestamp at time zone tz
    and a.starts_at<(p_end_date+2)::timestamp at time zone tz),'[]'),
  'absences',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'from',a.start_date,'to',a.end_date,
    'type',a.absence_type,'status',a.status,'full_day',a.full_day,'start_time',a.start_time,'end_time',a.end_time))
   from public.absences a where a.company_id=p_company_id and a.start_date<=p_end_date+1 and a.end_date>=p_start_date-1
    and a.status not in ('Abgelehnt','REJECTED','CANCELLED')),'[]')) into result_;
 return result_;
end $$;
revoke all on function private.manager_reports_workspace(uuid,date,date) from public,anon;
grant execute on function private.manager_reports_workspace(uuid,date,date) to authenticated;
create or replace function public.manager_reports_workspace(p_company_id uuid,p_start_date date,p_end_date date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.manager_reports_workspace(p_company_id,p_start_date,p_end_date);
$$;
revoke all on function public.manager_reports_workspace(uuid,date,date) from public,anon;
grant execute on function public.manager_reports_workspace(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
