alter table public.time_account_settings
  add column if not exists federal_state text not null default 'DE';

alter table public.time_account_settings
  drop constraint if exists time_account_settings_federal_state_check;
alter table public.time_account_settings
  add constraint time_account_settings_federal_state_check
  check (federal_state in ('DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV','DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH'));

create or replace function private.german_easter_sunday(p_year integer)
returns date
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  a integer; b integer; c integer; d integer; e integer; f integer; g integer;
  h integer; i integer; k integer; l integer; m integer; mon integer; dy integer;
begin
  if p_year < 1583 or p_year > 4099 then
    raise exception 'Jahr außerhalb des unterstützten Bereichs (1583-4099)';
  end if;
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mon := (h + l - 7 * m + 114) / 31;
  dy := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_year, mon, dy);
end;
$$;

create or replace function private.german_public_holidays(p_year integer, p_federal_state text default 'DE')
returns table(holiday_date date, holiday_name text, holiday_scope text)
language plpgsql
stable
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_state text := coalesce(nullif(p_federal_state,''),'DE');
  v_easter date := private.german_easter_sunday(p_year);
  v_buss date;
begin
  if v_state not in ('DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV','DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH') then
    raise exception 'Unbekanntes Bundesland: %', v_state;
  end if;

  return query values
    (make_date(p_year,1,1),'Neujahr'::text,'BUND'::text),
    (v_easter-2,'Karfreitag'::text,'BUND'::text),
    (v_easter+1,'Ostermontag'::text,'BUND'::text),
    (make_date(p_year,5,1),'Tag der Arbeit'::text,'BUND'::text),
    (v_easter+39,'Christi Himmelfahrt'::text,'BUND'::text),
    (v_easter+50,'Pfingstmontag'::text,'BUND'::text),
    (make_date(p_year,10,3),'Tag der Deutschen Einheit'::text,'BUND'::text),
    (make_date(p_year,12,25),'1. Weihnachtstag'::text,'BUND'::text),
    (make_date(p_year,12,26),'2. Weihnachtstag'::text,'BUND'::text);

  if v_state in ('DE-BW','DE-BY','DE-ST') then
    return query select make_date(p_year,1,6),'Heilige Drei Könige'::text,'LAND'::text;
  end if;
  if v_state in ('DE-BE','DE-MV') then
    return query select make_date(p_year,3,8),'Internationaler Frauentag'::text,'LAND'::text;
  end if;
  if v_state='DE-BB' then
    return query select v_easter,'Ostersonntag'::text,'LAND'::text;
    return query select v_easter+49,'Pfingstsonntag'::text,'LAND'::text;
  end if;
  if v_state in ('DE-BW','DE-BY','DE-HE','DE-NW','DE-RP','DE-SL') then
    return query select v_easter+60,'Fronleichnam'::text,'LAND'::text;
  end if;
  if v_state='DE-SL' then
    return query select make_date(p_year,8,15),'Mariä Himmelfahrt'::text,'LAND'::text;
  end if;
  if v_state='DE-TH' then
    return query select make_date(p_year,9,20),'Weltkindertag'::text,'LAND'::text;
  end if;
  if v_state in ('DE-BB','DE-HB','DE-HH','DE-MV','DE-NI','DE-SN','DE-ST','DE-SH','DE-TH') then
    return query select make_date(p_year,10,31),'Reformationstag'::text,'LAND'::text;
  end if;
  if v_state in ('DE-BW','DE-BY','DE-NW','DE-RP','DE-SL') then
    return query select make_date(p_year,11,1),'Allerheiligen'::text,'LAND'::text;
  end if;
  if v_state='DE-SN' then
    v_buss := make_date(p_year,11,22) - (((extract(isodow from make_date(p_year,11,22))::integer - 3 + 7) % 7));
    return query select v_buss,'Buß- und Bettag'::text,'LAND'::text;
  end if;
end;
$$;

create or replace function private.german_holiday_name(p_date date, p_federal_state text default 'DE')
returns text
language sql
stable
strict
set search_path = pg_catalog, private, pg_temp
as $$
  select string_agg(h.holiday_name, ' / ' order by h.holiday_name)
  from private.german_public_holidays(extract(year from p_date)::integer,p_federal_state) h
  where h.holiday_date=p_date;
$$;

create or replace function private.time_account_row_v1(p_employee_id uuid, p_month date)
returns jsonb
language sql
set search_path = public, private, pg_temp
as $$
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
  select b.id,
    coalesce(sum(case when te.assignment_id is not null then greatest(0,round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int-te.break_minutes) else 0 end),0)::int as minutes,
    count(te.assignment_id)::int as confirmed_entries
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id and (timezone('Europe/Berlin',sa.starts_at))::date between b.month_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  group by b.id
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
  select b.id,case when b.month_end<b.account_start then 0 else coalesce(sum(case when te.assignment_id is not null then greatest(0,round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int-te.break_minutes) else 0 end),0)::int end as minutes
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id and (timezone('Europe/Berlin',sa.starts_at))::date between b.account_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  group by b.id,b.month_end,b.account_start
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
$$;

create or replace function private.manager_update_time_account_settings_v2_impl(
  p_company_id uuid,
  p_account_start_date date,
  p_credited_absence_types text[],
  p_federal_state text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_role text; v_old jsonb; v_state text := coalesce(nullif(p_federal_state,''),'DE');
begin
  select cm.role into v_role from public.company_members cm
   where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE';
  if v_role not in ('OWNER','ADMIN') then raise exception 'Nur OWNER/ADMIN dürfen Stundenkonto-Einstellungen ändern'; end if;
  if p_account_start_date is null then raise exception 'Kontostart fehlt'; end if;
  if v_state not in ('DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV','DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH') then
    raise exception 'Ungültiges Bundesland';
  end if;
  select to_jsonb(s) into v_old from public.time_account_settings s where s.company_id=p_company_id;
  insert into public.time_account_settings(company_id,account_start_date,credited_absence_types,federal_state,updated_by,updated_at)
  values(p_company_id,p_account_start_date,coalesce(p_credited_absence_types,array[]::text[]),v_state,auth.uid(),now())
  on conflict(company_id) do update set account_start_date=excluded.account_start_date,
    credited_absence_types=excluded.credited_absence_types,federal_state=excluded.federal_state,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(p_company_id,'TIME_ACCOUNT_SETTINGS_UPDATED','COMPANY',p_company_id,auth.uid(),v_role,v_old,
    jsonb_build_object('account_start_date',p_account_start_date,'credited_absence_types',coalesce(p_credited_absence_types,array[]::text[]),'federal_state',v_state),'{}'::jsonb);
end;
$$;

create or replace function public.manager_update_time_account_settings_v2(
  p_company_id uuid,
  p_account_start_date date,
  p_credited_absence_types text[],
  p_federal_state text
)
returns void
language sql
set search_path = public, private, pg_temp
as $$
  select private.manager_update_time_account_settings_v2_impl(p_company_id,p_account_start_date,p_credited_absence_types,p_federal_state);
$$;

revoke all on function public.manager_update_time_account_settings_v2(uuid,date,text[],text) from public, anon;
grant execute on function public.manager_update_time_account_settings_v2(uuid,date,text[],text) to authenticated;
revoke all on function private.german_easter_sunday(integer) from public, anon, authenticated;
revoke all on function private.german_public_holidays(integer,text) from public, anon, authenticated;
revoke all on function private.german_holiday_name(date,text) from public, anon, authenticated;
revoke all on function private.manager_update_time_account_settings_v2_impl(uuid,date,text[],text) from public, anon, authenticated;;
