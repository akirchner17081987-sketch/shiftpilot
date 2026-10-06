-- Read aggregation only: do not manufacture assignments or copy QR punches.
-- All paid intervals are merged per employee before minutes are calculated.
begin;

create or replace function private.sf_paid_time_ranges(
  p_company_id uuid,p_employee_id uuid,p_from timestamptz,p_to timestamptz
) returns table(employee_id uuid,paid_range tstzrange)
language sql stable security invoker set search_path='' as $$
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
$$;
revoke all on function private.sf_paid_time_ranges(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function private.sf_paid_work_seconds(p_employee_id uuid,p_from date,p_to date)
returns numeric language sql stable security invoker set search_path='' as $$
  select coalesce(sum(extract(epoch from(upper(r.paid_range)-lower(r.paid_range)))),0)
  from public.employees e join public.companies c on c.id=e.company_id
  cross join lateral private.sf_paid_time_ranges(e.company_id,e.id,
    p_from::timestamp at time zone coalesce(c.timezone,'Europe/Berlin'),
    (p_to+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin')) r
  where e.id=p_employee_id and p_to>=p_from;
$$;
revoke all on function private.sf_paid_work_seconds(uuid,date,date) from public,anon,authenticated;

create or replace function private.sf_confirmed_work_minutes(p_employee_id uuid,p_from date,p_to date)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_company uuid; v_month date; v_end date; v_from date; v_to date; v_snapshot jsonb; v_seconds numeric:=0; v_saved jsonb;
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select company_id into v_company from public.employees where id=p_employee_id;
  if v_company is null then return 0; end if;
  if auth.uid() is not null and not private.sf_can_manage_time(v_company)
    and private.sf_employee_id() is distinct from p_employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
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
end;$$;

create or replace function public.manager_central_time_entries(p_company_id uuid,p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tz text; v_from timestamptz; v_to timestamptz; v_now timestamptz:=statement_timestamp(); v_rows jsonb; v_qr jsonb; v_summary jsonb;
begin
  if auth.uid() is null or not private.sf_can_manage_time(p_company_id) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>366 then raise exception 'Ungültiger Zeitraum' using errcode='22023'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=p_company_id;
  v_from:=p_start_date::timestamp at time zone v_tz;v_to:=(p_end_date+1)::timestamp at time zone v_tz;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at,r.employee_name),'[]'::jsonb) into v_rows
    from public.manager_list_time_entries(p_company_id,p_start_date-2,p_end_date+1) r
    where (r.starts_at<v_to and r.ends_at>v_from)
      or (r.actual_start<v_to and coalesce(r.actual_end,v_now)>v_from);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at,r.employee_name),'[]'::jsonb) into v_qr from (
    select s.id,s.employee_id,coalesce(e.legacy_id,e.id::text) employee_legacy_id,
      trim(concat_ws(' ',e.first_name,e.last_name)) employee_name,coalesce(e.personnel_no,'') personnel_no,
      s.started_at,s.ended_at,t.name terminal_name,t.location_note,
      match.id matched_assignment_id,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      coalesce((select sum(greatest(0,extract(epoch from(least(coalesce(b.ended_at,v_now),coalesce(s.ended_at,v_now))-greatest(b.started_at,s.started_at)))/60))
        from public.time_qr_independent_breaks b where b.shift_id=s.id),0) pause_minutes
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
    left join lateral (
      select sa.id from public.shift_assignments sa
      where sa.company_id=s.company_id and sa.employee_id=s.employee_id and sa.status<>'CANCELLED'
        and sa.starts_at<coalesce(s.ended_at,v_now) and sa.ends_at>s.started_at
      order by least(sa.ends_at,coalesce(s.ended_at,v_now))-greatest(sa.starts_at,s.started_at) desc,sa.id limit 1
    ) match on true
    where s.company_id=p_company_id and s.started_at<v_to and coalesce(s.ended_at,v_now)>v_from
  ) r;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_summary from (
    select e.id employee_id,coalesce(e.legacy_id,e.id::text) employee_legacy_id,
      private.sf_confirmed_work_minutes(e.id,p_start_date,p_end_date)*60 confirmed_seconds
    from public.employees e where e.company_id=p_company_id
  ) x;
  return jsonb_build_object('as_of',v_now,'timezone',v_tz,'rows',v_rows,'qr_rows',v_qr,'confirmed_summary',v_summary);
end;$$;
revoke all on function public.manager_central_time_entries(uuid,date,date) from public,anon;
grant execute on function public.manager_central_time_entries(uuid,date,date) to authenticated;

-- Monthly report details and totals use the same deduplicated intervals.
CREATE OR REPLACE FUNCTION public.manager_time_report_bundle(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_snapshot jsonb; v_tz text; v_state text; v_employees jsonb; v_details jsonb; v_holidays jsonb; v_company jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  if p_employee_id is not null and not exists(select 1 from public.employees where id=p_employee_id and company_id=p_company_id) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED';
  if v_snapshot is not null then
    v_snapshot:=coalesce(v_snapshot->'report',v_snapshot);
    if p_employee_id is not null then
      v_snapshot:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
      v_snapshot:=jsonb_set(v_snapshot,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
    end if;
    return v_snapshot;
  end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=p_company_id;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_employees
    from private.sf_time_account_rows(p_company_id,v_month,p_employee_id) r;
  select coalesce(to_jsonb(c),'{}'::jsonb) into v_company from public.companies c where c.id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.employee_name,x.work_date),'[]'::jsonb) into v_details
  from (
    select e.id employee_id,trim(concat_ws(' ',e.first_name,e.last_name)) employee_name,
      coalesce(e.personnel_no,'') personnel_no,g.day::date work_date,
      coalesce(s.shift_codes,'') shift_codes,coalesce(s.planned_times,'') planned_times,
      case when extract(isodow from g.day) between 1 and 5 and h.name is null
        then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end target_minutes,
      coalesce((select string_agg(to_char(lower(x.paid_range) at time zone v_tz,'HH24:MI')||'–'||to_char(upper(x.paid_range) at time zone v_tz,'HH24:MI'),', ' order by lower(x.paid_range)) from private.sf_paid_time_ranges(p_company_id,e.id,g.day::date::timestamp at time zone v_tz,(g.day::date+1)::timestamp at time zone v_tz) x),s.actual_times,'') actual_times,private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date) confirmed_actual_minutes,
      coalesce(a.absence_types,'') absence_types,
      private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state) absence_credit_minutes,
      coalesce(h.name,'') holiday_name,concat_ws(', ',nullif(s.time_statuses,''),case when exists(select 1 from public.time_qr_independent_shifts q where q.company_id=p_company_id and q.employee_id=e.id and q.started_at<(g.day::date+1)::timestamp at time zone v_tz and coalesce(q.ended_at,statement_timestamp())>g.day::date::timestamp at time zone v_tz) then 'QR' end) time_statuses,
      private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date)+private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state)-
        case when extract(isodow from g.day) between 1 and 5 and h.name is null
          then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end day_balance_minutes
    from public.employees e
    cross join generate_series(v_month,v_end,interval '1 day') g(day)
    left join public.time_account_settings cfg on cfg.company_id=e.company_id
    left join private.sf_public_holidays(extract(year from v_month)::integer,v_state) h on h.holiday_date=g.day::date
    left join lateral (
      select string_agg(distinct sa.shift_code,', ' order by sa.shift_code) shift_codes,
        string_agg(to_char(sa.starts_at,'HH24:MI')||'-'||to_char(sa.ends_at,'HH24:MI'),', ' order by to_char(sa.starts_at,'HH24:MI')) planned_times,
        string_agg(case when te.actual_start is not null then to_char(te.actual_start,'HH24:MI')||'-'||to_char(te.actual_end,'HH24:MI') end,', ' order by to_char(te.actual_start,'HH24:MI')) actual_times,
        string_agg(distinct coalesce(te.status,'open'),', ' order by coalesce(te.status,'open')) time_statuses,
        coalesce(sum(case when te.status='confirmed' then greatest(0,
          round(extract(epoch from (te.actual_end-te.actual_start))/60)::integer-te.break_minutes) else 0 end),0)::integer confirmed_minutes
      from public.shift_assignments sa left join public.time_entries te on te.assignment_id=sa.id
      where sa.employee_id=e.id and sa.company_id=e.company_id and sa.status<>'CANCELLED' and sa.starts_at::date=g.day::date
    ) s on true
    left join lateral (
      select string_agg(distinct ab.absence_type,', ' order by ab.absence_type) absence_types
      from public.absences ab where ab.employee_id=e.id and ab.company_id=e.company_id
        and ab.status in ('Genehmigt','Erfasst','APPROVED') and g.day::date between ab.start_date and ab.end_date
    ) a on true
    where e.company_id=p_company_id and e.status='active'
      and (p_employee_id is null or e.id=p_employee_id)
      and g.day::date>=coalesce(e.start_date,g.day::date)
      and g.day::date<=coalesce(e.contract_end,g.day::date)
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from v_month)::integer,v_state) h
    where h.holiday_date between v_month and v_end;
  return jsonb_build_object('company',v_company,'month_start',v_month,'federal_state',v_state,
    'employees',v_employees,'details',v_details,'holidays',v_holidays);
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_monthly_time_accounts(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_rows jsonb; v_settings jsonb; v_snapshot jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED';
  if v_snapshot is not null and v_snapshot ? 'accounts' then return v_snapshot->'accounts'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from private.sf_time_account_rows(p_company_id,v_month,null) r;
  select coalesce(
    (select to_jsonb(s) from public.time_account_settings s where s.company_id=p_company_id),
    jsonb_build_object('company_id',p_company_id,'account_start_date',v_month,
      'credited_absence_types',array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[],'federal_state','DE')
  ) into v_settings;
  return jsonb_build_object('month_start',v_month,'settings',v_settings,'rows',v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION public.employee_my_time_account_month(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_id(); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb; v_snapshot jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  select e.company_id into v_company from public.employees e where e.id=v_employee;
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

CREATE OR REPLACE FUNCTION private.time_account_row_v1(p_employee_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
with emp as (
  select e.* from public.employees e where e.id=p_employee_id
), cfg as (
  select e.*,
    coalesce(s.account_start_date,date_trunc('month',current_date+interval '1 month')::date) as company_account_start,
    coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) as credited_types,
    coalesce(s.federal_state,'DE') as federal_state,
    o.effective_date as opening_effective_date,
    coalesce(o.opening_balance_minutes,0) as opening_balance_minutes,
    coalesce(o.note,'') as opening_note
  from emp e
  left join public.time_account_settings s on s.company_id=e.company_id
  left join public.employee_time_account_openings o on o.employee_id=e.id and o.company_id=e.company_id
), b as (
  select c.*,
    date_trunc('month',coalesce(p_month,current_date))::date as month_start,
    (date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date as month_end,
    round(c.weekly_hours*60/5.0)::int as daily_target_minutes,
    coalesce(c.opening_effective_date,c.company_account_start) as account_start
  from cfg c
), month_days as (
  select b.id,d::date as work_date,b.daily_target_minutes,
    private.german_holiday_name(d::date,b.federal_state) as holiday_name
  from b cross join lateral generate_series(b.month_start,b.month_end,interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=coalesce(b.start_date,b.month_start) and d::date<=coalesce(b.contract_end,b.month_end)
), month_target as (
  select b.id,coalesce(sum(case when md.holiday_name is null then md.daily_target_minutes else 0 end),0)::int as minutes
  from b left join month_days md on md.id=b.id group by b.id
), month_holidays as (
  select b.id,
    count(md.work_date) filter(where md.holiday_name is not null)::int as holiday_count,
    coalesce(sum(md.daily_target_minutes) filter(where md.holiday_name is not null),0)::int as holiday_minutes,
    coalesce(jsonb_agg(jsonb_build_object('date',md.work_date,'name',md.holiday_name) order by md.work_date) filter(where md.holiday_name is not null),'[]'::jsonb) as holidays
  from b left join month_days md on md.id=b.id group by b.id
), month_work as (
  select b.id,private.sf_confirmed_work_minutes(b.id,b.month_start,b.month_end) minutes,
    ((select count(*) from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id where sa.employee_id=b.id and te.status='confirmed' and te.actual_start::date between b.month_start and b.month_end)+
     (select count(*) from public.time_qr_independent_shifts q where q.company_id=b.company_id and q.employee_id=b.id and q.ended_at is not null and q.ended_at<=statement_timestamp() and (q.started_at at time zone 'Europe/Berlin')::date between b.month_start and b.month_end))::integer confirmed_entries
  from b
), month_pending as (
  select b.id,count(te.assignment_id)::int as pending_entries
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id and (timezone('Europe/Berlin',sa.starts_at))::date between b.month_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status in ('recorded','correction_requested')
  group by b.id
), month_absence_raw as (
  select b.id,d::date as absence_date,b.daily_target_minutes,
    case when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
      then least(b.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int)) else 0 end as credit_minutes
  from b join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(b.credited_types)
    and a.end_date>=b.month_start and a.start_date<=b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.month_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=coalesce(b.start_date,b.month_start) and d::date<=coalesce(b.contract_end,b.month_end)
    and private.german_holiday_name(d::date,b.federal_state) is null
), month_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes,coalesce(count(x.absence_date),0)::int as credited_days
  from b left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from month_absence_raw group by id,absence_date
  ) x on x.id=b.id group by b.id
), account_days as (
  select b.id,d::date as work_date,b.daily_target_minutes,
    private.german_holiday_name(d::date,b.federal_state) as holiday_name
  from b left join lateral generate_series(b.account_start,b.month_end,interval '1 day') d on b.month_end>=b.account_start
  where extract(isodow from d)::int between 1 and 5
    and d::date>=greatest(b.account_start,coalesce(b.start_date,b.account_start))
    and d::date<=coalesce(b.contract_end,b.month_end)
), account_target as (
  select b.id,case when b.month_end<b.account_start then 0 else coalesce(sum(case when ad.holiday_name is null then ad.daily_target_minutes else 0 end),0)::int end as minutes
  from b left join account_days ad on ad.id=b.id group by b.id,b.month_end,b.account_start
), account_work as (
  select b.id,case when b.month_end<b.account_start then 0 else private.sf_confirmed_work_minutes(b.id,b.account_start,b.month_end) end minutes from b
), account_absence_raw as (
  select b.id,d::date as absence_date,b.daily_target_minutes,
    case when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
      then least(b.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int)) else 0 end as credit_minutes
  from b join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(b.credited_types)
    and b.month_end>=b.account_start and a.end_date>=b.account_start and a.start_date<=b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.account_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=greatest(b.account_start,coalesce(b.start_date,b.account_start)) and d::date<=coalesce(b.contract_end,b.month_end)
    and private.german_holiday_name(d::date,b.federal_state) is null
), account_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes
  from b left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from account_absence_raw group by id,absence_date
  ) x on x.id=b.id group by b.id
)
select jsonb_build_object(
  'employee_id',b.id,'employee_name',trim(b.first_name||' '||b.last_name),'personnel_no',b.personnel_no,
  'employment',b.employment,'weekly_hours',b.weekly_hours,'month_start',b.month_start,'month_end',b.month_end,
  'daily_target_minutes',b.daily_target_minutes,'target_minutes',mt.minutes,'confirmed_work_minutes',mw.minutes,
  'absence_credit_minutes',ma.minutes,'credited_total_minutes',(mw.minutes+ma.minutes),'month_balance_minutes',(mw.minutes+ma.minutes-mt.minutes),
  'confirmed_entries',mw.confirmed_entries,'pending_entries',mp.pending_entries,'credited_absence_days',ma.credited_days,
  'federal_state',b.federal_state,'holiday_count',mh.holiday_count,'holiday_minutes',mh.holiday_minutes,'holidays',mh.holidays,
  'company_account_start',b.company_account_start,'opening_effective_date',b.opening_effective_date,
  'effective_account_start',b.account_start,'opening_balance_minutes',b.opening_balance_minutes,'opening_note',b.opening_note,
  'account_started',(b.month_end>=b.account_start),'account_balance_minutes',(b.opening_balance_minutes+aw.minutes+aa.minutes-at.minutes)
)
from b join month_target mt on mt.id=b.id join month_holidays mh on mh.id=b.id join month_work mw on mw.id=b.id join month_pending mp on mp.id=b.id
join month_absence ma on ma.id=b.id join account_target at on at.id=b.id join account_work aw on aw.id=b.id join account_absence aa on aa.id=b.id;
$function$;

CREATE OR REPLACE FUNCTION private.manager_bulk_record_time_entries(p_company_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer:=0;
  v_updated integer:=0;
  v_skipped_existing integer:=0;
  v_skipped_future integer:=0;
  v_skipped_invalid integer:=0;
  v_reopened_months integer:=0;
  v_month date;
begin
  if not private.sf_can_manage_time(p_company_id) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  if p_end_date-p_start_date>366 then
    raise exception 'Der Zeitraum darf hoechstens 366 Tage umfassen';
  end if;
  if length(coalesce(p_note,''))>1000 then
    raise exception 'Die Bemerkung darf hoechstens 1.000 Zeichen enthalten';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text||p_start_date::text||p_end_date::text,0
  ));

  select count(*) into v_total
  from public.shift_assignments sa
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_existing
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_future
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at>now();

  select count(*) into v_skipped_invalid
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
    and (
      sa.ends_at<=sa.starts_at or sa.ends_at-sa.starts_at>interval '24 hours'
      or coalesce(sa.break_minutes,0)<0
      or coalesce(sa.break_minutes,0)>=extract(epoch from(sa.ends_at-sa.starts_at))/60
    );

  -- Eine Sammeluebernahme ist die ausdrueckliche Entscheidung, dass Plan = Ist gilt.
  -- Falls der Zeitraum bereits abgeschlossen war, wird nur fuer wirklich uebernehmbare
  -- fehlende Eintraege kontrolliert wieder geoeffnet. Die bestehende RPC protokolliert
  -- jede Wiedereroeffnung und beschraenkt sie auf OWNER/ADMIN.
  for v_month in
    select distinct date_trunc('month',sa.starts_at)::date
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    join public.time_month_closures c
      on c.company_id=sa.company_id
     and c.month_start=date_trunc('month',sa.starts_at)::date
     and c.status='CLOSED'
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
    order by 1
  loop
    if not private.sf_is_manager(p_company_id,true) then
      raise exception 'Der Monat ist abgeschlossen. Nur Inhaber und Administratoren duerfen ihn fuer die Sammeluebernahme oeffnen.';
    end if;
    perform public.manager_reopen_time_month(
      p_company_id,
      v_month,
      'Automatisch fuer die Sammeluebernahme unveraenderter Planzeiten geoeffnet'
    );
    v_reopened_months:=v_reopened_months+1;
  end loop;

  with candidates as (
    select sa.id,sa.company_id,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0) as break_minutes
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
  ), inserted as (
    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      updated_at,updated_by,version
    )
    select id,company_id,starts_at,ends_at,break_minutes,
      case when p_confirm then 'confirmed' else 'recorded' end,
      left(coalesce(p_note,''),1000),'MANAGER','',
      case when p_confirm then now() else null end,
      case when p_confirm then auth.uid() else null end,
      case when p_confirm then now() else null end,
      now(),auth.uid(),1
    from candidates
    on conflict(assignment_id) do nothing
    returning assignment_id,company_id,actual_start,actual_end,break_minutes,status,version
  ), audited as (
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    )
    select company_id,
      case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
      'time_entry',assignment_id,auth.uid(),'MANAGER',
      jsonb_build_object(
        'actualStart',actual_start,'actualEnd',actual_end,'breakMinutes',break_minutes,
        'status',status,'version',version
      ),
      jsonb_build_object('bulk',true,'planEqualsActual',true,'comment',left(coalesce(p_note,''),1000))
    from inserted
    returning 1
  )
  select count(*) into v_updated from audited;

  return jsonb_build_object(
    'total',v_total,
    'updated',v_updated,
    'status',case when p_confirm then 'confirmed' else 'recorded' end,
    'reopenedMonths',v_reopened_months,
    'skippedExisting',v_skipped_existing,
    'skippedQr',(select count(*) from public.shift_assignments sa where sa.company_id=p_company_id and sa.status<>'CANCELLED' and sa.starts_at::date between p_start_date and p_end_date and exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)),
    'skippedFuture',v_skipped_future,
    'skippedClosed',0,
    'skippedUnpublished',0,
    'skippedInvalid',v_skipped_invalid
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_time_month_status(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_status text:='OPEN'; v_closed_at timestamptz; v_revision integer:=0;
  v_missing bigint; v_absences bigint; v_entries bigint; v_open_qr bigint; v_past boolean;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select c.status,c.closed_at,c.revision into v_status,v_closed_at,v_revision
    from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month;
  v_status:=coalesce(v_status,'OPEN'); v_revision:=coalesce(v_revision,0);
  select count(*) into v_missing from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
    where sa.company_id=p_company_id and sa.status='PUBLISHED' and sa.ends_at::date between v_month and v_end
      and sa.ends_at<=now() and te.assignment_id is null;
  select count(*) into v_absences from public.absences a where a.company_id=p_company_id
    and a.start_date<=v_end and a.end_date>=v_month and a.status in ('Beantragt','PENDING','REQUESTED');
  select count(*) into v_entries from public.time_entries te where te.company_id=p_company_id
    and te.actual_start::date between v_month and v_end and te.status in ('recorded','correction_requested');
  select count(*) into v_open_qr from public.time_qr_independent_shifts q join public.companies c on c.id=q.company_id where q.company_id=p_company_id and q.ended_at is null and q.started_at<(v_end+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin');
  v_past:=v_end<current_date;
  return jsonb_build_object('month_start',v_month,'status',v_status,'closed_at',v_closed_at,'revision',v_revision,
    'missing_confirmed_assignments',v_missing,'pending_absence_requests',v_absences,'pending_time_entries',v_entries,
    'open_qr_shifts',v_open_qr,'is_past_month',v_past,'can_close',v_past and v_status<>'CLOSED' and v_missing=0 and v_absences=0 and v_entries=0 and v_open_qr=0,
    'can_reopen',v_status='CLOSED');
end;
$function$;

notify pgrst,'reload schema';
commit;
