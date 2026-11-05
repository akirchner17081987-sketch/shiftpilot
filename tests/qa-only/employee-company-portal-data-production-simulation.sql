-- Isolated QA database only; all fixture data and temporary functions roll back.
begin;
CREATE OR REPLACE FUNCTION private.sf_paid_time_ranges(p_company_id uuid, p_employee_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(employee_id uuid, paid_range tstzrange)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with accepted as (
    select e.id employee_id,te.actual_start a,
      te.actual_end-make_interval(mins=>greatest(0,te.break_minutes)) b
    from public.time_entries te
    join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id
    join public.employees e on e.id=sa.employee_id and e.company_id=te.company_id
    where te.company_id=p_company_id and (p_employee_id is null or e.id=p_employee_id)
      and te.status='confirmed' and te.actual_start is not null and te.actual_end is not null
      and te.actual_end<=statement_timestamp() and te.actual_start<p_to and te.actual_end>p_from
    union all
    select s.employee_id,s.started_at,s.ended_at
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
    where s.company_id=p_company_id and (p_employee_id is null or s.employee_id=p_employee_id)
      and s.ended_at is not null and s.ended_at<=statement_timestamp()
      and s.started_at<p_to and s.ended_at>p_from
  ), clipped as (
    select employee_id,case when least(b,p_to)>greatest(a,p_from)
      then tstzrange(greatest(a,p_from),least(b,p_to),'[)') else 'empty'::tstzrange end r
    from accepted where p_to>p_from
  )
  select employee_id,unnest(range_agg(r)) from clipped where not isempty(r) group by employee_id;
$function$
;
CREATE OR REPLACE FUNCTION private.sf_paid_work_seconds(p_employee_id uuid, p_from date, p_to date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(extract(epoch from(upper(r.paid_range)-lower(r.paid_range)))),0)
  from public.employees e join public.companies c on c.id=e.company_id
  cross join lateral private.sf_paid_time_ranges(e.company_id,e.id,
    p_from::timestamp at time zone coalesce(c.timezone,'Europe/Berlin'),
    (p_to+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin')) r
  where e.id=p_employee_id and p_to>=p_from;
$function$
;
-- Derived from production functions; require an explicitly authorized company.
CREATE OR REPLACE FUNCTION private.sf_employee_identity_for_company(p_company uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
declare v_ids uuid[];
begin
 if auth.uid() is null or p_company is null or private.sf_has_time_only_login() then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
 select array_agg(e.id) into v_ids from public.employees e where e.company_id=p_company and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
 and not exists(select 1 from public.company_members m where m.company_id=e.company_id and m.user_id=auth.uid() and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)));
 if coalesce(cardinality(v_ids),0)<>1 then raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return v_ids[1];
end $$;
CREATE OR REPLACE FUNCTION private.sf_confirmed_work_minutes(p_employee_id uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_month date; v_end date; v_from date; v_to date; v_snapshot jsonb; v_seconds numeric:=0; v_saved jsonb;
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select company_id into v_company from public.employees where id=p_employee_id;
  if v_company is null then return 0; end if;
  if auth.uid() is not null and not private.sf_can_manage_time(v_company)
    and private.sf_employee_identity_for_company(v_company) is distinct from p_employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  for v_month in select d::date from generate_series(date_trunc('month',p_from),date_trunc('month',p_to),interval '1 month') d loop
    v_end:=(v_month+interval '1 month - 1 day')::date;
    v_from:=greatest(v_month,p_from);v_to:=least(v_end,p_to);v_saved:=null;
    select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=v_month and status='CLOSED';
    if v_snapshot is not null and v_from=v_month and v_to=v_end then
      select x into v_saved from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=p_employee_id::text limit 1;
    end if;
    if v_saved is not null then v_seconds:=v_seconds+coalesce((v_saved->>'confirmed_work_minutes')::numeric,0)*60;
    elsif v_snapshot is not null then
      v_seconds:=v_seconds+(select coalesce(sum(coalesce((x->>'confirmed_actual_minutes')::numeric,0)),0)*60
        from jsonb_array_elements(coalesce(v_snapshot#>'{report,details}',v_snapshot->'details','[]'::jsonb)) x
        where x->>'employee_id'=p_employee_id::text and (x->>'work_date')::date between v_from and v_to);
    else v_seconds:=v_seconds+private.sf_paid_work_seconds(p_employee_id,v_from,v_to); end if;
  end loop;
  return round(v_seconds/60)::integer;
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_employee_company_time_account_month(p_company uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_identity_for_company(p_company); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb; v_snapshot jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  v_company:=p_company;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=date_trunc('month',coalesce(p_month,current_date))::date and status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=v_employee::text limit 1;
    if v_row is not null then return v_row||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,'federal_state',coalesce(v_snapshot#>>'{accounts,settings,federal_state}','DE'),'holidays',coalesce(v_snapshot#>'{report,holidays}',v_snapshot->'holidays','[]'::jsonb)); end if;
  end if;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=v_company;
  v_state:=coalesce(v_state,'DE');
  select to_jsonb(r) into v_row from private.sf_time_account_rows(v_company,p_month,v_employee) r;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from coalesce(p_month,current_date))::integer,v_state) h
    where h.holiday_date>=date_trunc('month',coalesce(p_month,current_date))::date
      and h.holiday_date<(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  return coalesce(v_row,'{}'::jsonb)||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,
    'federal_state',v_state,'holidays',v_holidays);
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_employee_company_submit_time_entry(p_company uuid, p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  v_employee:=private.sf_employee_identity_for_company(p_company);
  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and company_id=p_company and employee_id=v_employee and status='PUBLISHED' for update;
  if not found then raise exception 'Schicht nicht gefunden oder nicht berechtigt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    employee_note,manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    'recorded',coalesce(p_note,''),'','EMPLOYEE','',now(),null,null,null,null,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,break_minutes=excluded.break_minutes,
    status='recorded',employee_note=excluded.employee_note,source='EMPLOYEE',correction_note='',submitted_at=now(),
    confirmed_by=null,confirmed_at=null,correction_requested_by=null,correction_requested_at=null,
    updated_at=now(),updated_by=auth.uid(),version=public.time_entries.version+1
  returning to_jsonb(time_entries.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_assignment.company_id,'TIME_ENTRY_SUBMITTED','time_entry',p_assignment_id,auth.uid(),'EMPLOYEE',v_result,'{}'::jsonb);
  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION private.sf_employee_identity_for_company(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sf_employee_company_time_account_month(uuid,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_company_time_account_month(uuid,date),private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.employee_company_time_account_month(p_company uuid,p_month date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT private.sf_employee_company_time_account_month(p_company,p_month) $$;
CREATE OR REPLACE FUNCTION public.employee_company_submit_time_entry(p_company uuid,p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer,p_note text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT private.sf_employee_company_submit_time_entry(p_company,p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note) $$;
REVOKE ALL ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
-- Exact production QR and wage calculations with company-specific identity.
CREATE OR REPLACE FUNCTION private.sf_employee_company_qr_bookings(p_company uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_timezone text;
  v_month date;
  v_next date;
  v_now timestamptz:=statement_timestamp();
  v_rows jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=v_employee.company_id;
  if p_month is not null and (p_month < date '1900-01-01' or p_month >= date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023';
  end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_timezone)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc,x.id) filter(where x.position<=500),'[]'::jsonb),count(*)
  into v_rows,v_count from (
    select s.id,s.started_at,s.ended_at,t.name terminal_name,
      row_number() over(order by s.started_at desc,s.id) position,
      round(greatest(0,extract(epoch from (coalesce(s.ended_at,v_now)-s.started_at)))/60)::integer attendance_minutes,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at,
        'minutes',round(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))/60)::integer) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      (select coalesce(round(sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at))))/60),0)::integer
        from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at >= (v_month::timestamp at time zone v_timezone)
      and s.started_at < (v_next::timestamp at time zone v_timezone)
    order by s.started_at desc,s.id limit 501
  ) x;
  return jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_timezone,'as_of',v_now,
    'rows',v_rows,'truncated',v_count>500);
end;$function$
;
CREATE OR REPLACE FUNCTION private.sf_employee_company_wage_month(p_company uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_tz text;
  v_state text;
  v_month date;
  v_next date;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz:=statement_timestamp();
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=v_employee.company_id;
  select coalesce(federal_state,'DE') into v_state from public.time_account_settings where company_id=v_employee.company_id;
  v_state:=coalesce(v_state,'DE');
  if p_month is not null and (p_month<date '1900-01-01' or p_month>=date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023'; end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_tz)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  v_start:=v_month::timestamp at time zone v_tz;v_end:=v_next::timestamp at time zone v_tz;
  with qr as materialized (
    select s.id,s.started_at,s.ended_at,t.name label from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at<v_end and coalesce(s.ended_at,v_now)>v_start
  ), plan as materialized (
    select te.assignment_id id,te.actual_start started_at,te.actual_end ended_at,te.status,sa.shift_code label,
      case when upper(coalesce(te.source,''))='QR' then 0 else greatest(0,coalesce(te.break_minutes,0)) end break_minutes
    from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id
      and sa.company_id=v_employee.company_id and sa.employee_id=v_employee.id
    where te.company_id=v_employee.company_id and te.actual_start is not null
      and te.actual_start<v_end and coalesce(te.actual_end,v_now)>v_start
  ), accepted as (
    select greatest(started_at,v_start) a,least(ended_at,v_end) b,'qr' source from qr
      where ended_at is not null and ended_at<=v_now
    union all
    select greatest(started_at,v_start),least(ended_at-make_interval(mins=>break_minutes),v_end),'plan' from plan
      where status='confirmed' and ended_at is not null and ended_at<=v_now
  ), paid as materialized (
    select tstzrange(a,b,'[)') r from accepted where b>a
  ), merged as materialized (
    select unnest(range_agg(r)) r from paid
  ), calendar as (
    select v_month+n d,h.name holiday_name
    from generate_series(0,v_next-v_month-1) n
    left join private.sf_public_holidays(extract(year from v_month)::integer,v_state) h on h.holiday_date=v_month+n
  ), windows as (
    select c.d,c.holiday_name,
      case when c.holiday_name is not null then 'holiday' when extract(isodow from c.d)=7 then 'sunday'
        when w.h in(0,22) then 'night' else 'base' end kind,
      tstzrange((c.d+w.h*interval '1 hour') at time zone v_tz,
        (c.d+w.next_h*interval '1 hour') at time zone v_tz,'[)') r
    from calendar c cross join (values(0,6),(6,22),(22,24)) w(h,next_h)
  ), portions as (
    select w.d,w.holiday_name,w.kind,extract(epoch from(upper(m.r*w.r)-lower(m.r*w.r))) seconds
    from merged m join windows w on m.r&&w.r
  ), daily as (
    select d,max(holiday_name) holiday_name,sum(seconds) paid_seconds,
      coalesce(sum(seconds) filter(where kind='night'),0) night_seconds,
      coalesce(sum(seconds) filter(where kind='sunday'),0) sunday_seconds,
      coalesce(sum(seconds) filter(where kind='holiday'),0) holiday_seconds
    from portions group by d
  ), pending as (
    select id,'qr' source,label,started_at,ended_at,
      case when ended_at is null then 'open' else 'future' end state from qr where ended_at is null or ended_at>v_now
    union all
    select id,'plan',label,started_at,ended_at,
      case when ended_at is null then 'open' when ended_at>v_now then 'future' else status end from plan
      where status<>'confirmed' or ended_at is null or ended_at>v_now
  )
  select jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_tz,'federal_state',v_state,'as_of',v_now,
    'rates',jsonb_build_object('night',0.2,'sunday',0.5,'holiday',1),
    'totals',jsonb_build_object('paid_seconds',coalesce(sum(paid_seconds),0),'night_seconds',coalesce(sum(night_seconds),0),
      'sunday_seconds',coalesce(sum(sunday_seconds),0),'holiday_seconds',coalesce(sum(holiday_seconds),0)),
    'days',coalesce(jsonb_agg(to_jsonb(daily) order by d) filter(where d is not null),'[]'::jsonb),
    'sources',jsonb_build_object('qr_entries',(select count(*) from qr where ended_at is not null and ended_at<=v_now),
      'confirmed_entries',(select count(*) from plan where status='confirmed' and ended_at is not null and ended_at<=v_now),
      'legacy_break_entries',(select count(*) from plan where status='confirmed' and ended_at<=v_now and break_minutes>0),
      'overlap_seconds',greatest(0,(select coalesce(sum(extract(epoch from(upper(r)-lower(r)))),0) from paid)-coalesce(sum(paid_seconds),0))),
    'pending',coalesce((select jsonb_agg(to_jsonb(pending) order by started_at desc,id) from pending),'[]'::jsonb)
  ) into v_result from daily;
  return v_result;
end;$function$
;
revoke all on function private.sf_employee_company_qr_bookings(uuid,date),private.sf_employee_company_wage_month(uuid,date) from public,anon;
grant execute on function private.sf_employee_company_qr_bookings(uuid,date),private.sf_employee_company_wage_month(uuid,date) to authenticated;
create or replace function public.employee_company_qr_bookings(p_company uuid,p_month date default null) returns jsonb language sql stable set search_path='' as $$select private.sf_employee_company_qr_bookings(p_company,p_month)$$;
create or replace function public.employee_company_wage_month(p_company uuid,p_month date default null) returns jsonb language sql stable set search_path='' as $$select private.sf_employee_company_wage_month(p_company,p_month)$$;
revoke all on function public.employee_company_qr_bookings(uuid,date),public.employee_company_wage_month(uuid,date) from public,anon;
grant execute on function public.employee_company_qr_bookings(uuid,date),public.employee_company_wage_month(uuid,date) to authenticated;
CREATE OR REPLACE FUNCTION private.employee_submit_absence_request_for_company(p_company_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_full_day boolean DEFAULT true, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_time_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_employee_id uuid;
  v_id uuid;
  v_type text := btrim(coalesce(p_absence_type,''));
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_type not in ('Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office','Frei','Fortbildung','Sperrzeit','Sonstiges') then
    raise exception 'Ungültige Abwesenheitsart';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Bitte einen gültigen Zeitraum wählen';
  end if;
  if (p_end_date - p_start_date) > 366 then raise exception 'Der Zeitraum ist zu lang'; end if;
  if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then
    raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  v_employee_id:=private.sf_employee_identity_for_company(p_company_id);
  select e.* into v_employee from public.employees e where e.id=v_employee_id and e.company_id=p_company_id;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  -- Serialize absence submissions for the same employee. Without this lock,
  -- concurrent requests can both pass the overlap check before either inserts.
  perform pg_advisory_xact_lock(
    hashtextextended('absence-request:' || v_employee.id::text, 0)
  );

  if exists (
    select 1 from public.absences a
    where a.employee_id=v_employee.id
      and a.status in ('Beantragt','Genehmigt','Erfasst')
      and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  insert into public.absences(
    company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,
    start_time,end_time,time_note,note,request_source,requested_by,requested_at
  ) values (
    v_employee.company_id,v_employee.id,null,p_start_date,p_end_date,v_type,'Beantragt',coalesce(p_full_day,true),
    case when coalesce(p_full_day,true) then null else p_start_time end,
    case when coalesce(p_full_day,true) then null else p_end_time end,
    coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',v_uid,now()
  ) returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_employee.company_id,'ABSENCE_REQUEST_CREATED','absence',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('status','Beantragt','type',v_type,'startDate',p_start_date,'endDate',p_end_date),
    jsonb_build_object('source','EMPLOYEE_PORTAL'));

  return v_id;
end
$function$
;
create function public.test_company_absence(p_company_id uuid,p_absence_type text,p_start_date date,p_end_date date) returns uuid language sql set search_path='' as $$select private.employee_submit_absence_request_for_company(p_company_id,p_absence_type,p_start_date,p_end_date)$$; grant execute on function private.employee_submit_absence_request_for_company(uuid,text,date,date,text,boolean,time,time,text),public.test_company_absence(uuid,text,date,date) to authenticated;

do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); result jsonb; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-wage-'||u::text||'@example.invalid','{}'),(other,'qa-wage-other-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA C',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(sa,a,ea,'O1','2026-01-05 08:00Z','2026-01-05 16:00Z','PUBLISHED',now()),(sb,b,eb,'O1','2026-01-06 08:00Z','2026-01-06 10:00Z','PUBLISHED',now());
 insert into public.time_entries(assignment_id,company_id,actual_start,actual_end,status,break_minutes) values(sa,a,'2026-01-05 08:00Z','2026-01-05 16:00Z','confirmed',0),(sb,b,'2026-01-06 08:00Z','2026-01-06 10:00Z','confirmed',0);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 result:=public.employee_company_wage_month(a,'2026-01-01');if result->>'employee_id'<>ea::text or (result->'totals'->>'paid_seconds')::numeric<>28800 then raise exception 'Wrong A wage preview'; end if;
 result:=public.employee_company_wage_month(b,'2026-01-01');if result->>'employee_id'<>eb::text or (result->'totals'->>'paid_seconds')::numeric<>7200 then raise exception 'Wrong B wage preview'; end if;
 denied:=false;begin perform public.employee_company_wage_month(c,'2026-01-01');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign company wage preview accessible'; end if;
 perform set_config('role','postgres',true);update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_company_wage_month(b,'2026-01-01');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Disabled company wage preview accessible'; end if;
 perform set_config('role','postgres',true);
end $test$;

select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); result jsonb; rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-portal-'||u::text||'@example.invalid','{}'::jsonb),(outsider,'qa-other-'||outsider::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA outsider',outsider);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(ec,c,'QA','C','QA-C',outsider,'ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 if (select count(*) from public.qa_employee_company_options())<>2 then raise exception 'Wrong company options'; end if;
 result:=public.qa_employee_profile_scoped(a);
 if result->'employee'->>'id'<>ea::text or result->'company'->>'id'<>a::text then raise exception 'Wrong profile A'; end if;
 result:=public.qa_employee_profile_scoped(b);
 if result->'employee'->>'id'<>eb::text or result->'company'->>'id'<>b::text then raise exception 'Wrong profile B'; end if;
 result:=public.employee_company_qr_bookings(a,current_date);
 if result->>'employee_id'<>ea::text then raise exception 'Wrong QR profile A'; end if;
 result:=public.employee_company_qr_bookings(b,current_date);
 if result->>'employee_id'<>eb::text then raise exception 'Wrong QR profile B'; end if;
 result:=public.qa_employee_time_account_scoped(a,current_date);
 if result->>'employee_id'<>ea::text then raise exception 'Wrong time account A'; end if;
 result:=public.qa_employee_time_account_scoped(b,current_date);
 if result->>'employee_id'<>eb::text then raise exception 'Wrong time account B'; end if;
 rejected:=false;
 begin perform public.qa_employee_profile_scoped(c); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company profile accessible'; end if;
 rejected:=false;
 begin perform public.employee_company_qr_bookings(c,current_date); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company QR data accessible'; end if;
 rejected:=false;
 begin perform public.qa_employee_time_account_scoped(c,current_date); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company time account accessible'; end if;
 perform set_config('role','postgres',true);
 update public.employees set access_status='DISABLED' where id=eb;
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform public.qa_employee_profile_scoped(b); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Disabled profile accessible'; end if;
 if (select count(*) from public.qa_employee_company_options())<>1 then raise exception 'Disabled company listed'; end if;
 perform set_config('role','postgres',true);
end $test$;


select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ida uuid; idb uuid; idc uuid; idd uuid; rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-absence-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-absence-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA foreign',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 ida:=public.test_company_absence(a,'Urlaub','2030-01-02','2030-01-03');
 idb:=public.test_company_absence(b,'Urlaub','2030-01-02','2030-01-03');
 idc:=public.test_company_absence(b,'Home-Office','2030-01-05','2030-01-05');
 idd:=public.test_company_absence(b,'Kind Krank','2030-01-06','2030-01-06');
 rejected:=false;
 begin perform public.test_company_absence(a,'Urlaub','2030-01-03','2030-01-04'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Overlapping absence accepted'; end if;
 rejected:=false;
 begin perform public.test_company_absence(c,'Urlaub','2030-01-02','2030-01-03'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company accepted'; end if;
 perform set_config('role','postgres',true);
 if not exists(select 1 from public.absences where id=ida and employee_id=ea and company_id=a) or not exists(select 1 from public.absences where id=idb and employee_id=eb and company_id=b) then raise exception 'Absence assigned to wrong company'; end if;
 if not exists(select 1 from public.absences where id=idc and employee_id=eb and absence_type='Home-Office') or not exists(select 1 from public.absences where id=idd and employee_id=eb and absence_type='Kind Krank') then raise exception 'Current portal categories missing'; end if;
 if (select count(*) from public.audit_events where entity_id in (ida,idb) and event_type='ABSENCE_REQUEST_CREATED')<>2 then raise exception 'Audit events missing'; end if;
 update public.employees set access_status='DISABLED' where id=eb;
 perform set_config('role','authenticated',true);
 rejected:=false;begin perform public.test_company_absence(b,'Urlaub','2031-01-01','2031-01-01');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Disabled company could submit absence';end if;
 perform set_config('role','postgres',true);
end $test$;

rollback;