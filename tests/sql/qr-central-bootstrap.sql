-- Sanitized schema and authoritative helper definitions. No production records.
create role anon;create role authenticated;
create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.absences("id" uuid default gen_random_uuid(),
"company_id" uuid,
"employee_id" uuid,
"legacy_id" text,
"start_date" date,
"end_date" date,
"absence_type" text,
"status" text default 'Genehmigt'::text,
"full_day" boolean default true,
"start_time" time without time zone,
"end_time" time without time zone,
"time_note" text default ''::text,
"note" text default ''::text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now(),
"request_source" text default 'MANAGER'::text,
"requested_by" uuid,
"requested_at" timestamp with time zone,
"reviewed_by" uuid,
"reviewed_at" timestamp with time zone,
"review_note" text default ''::text);
create table public.audit_events("id" uuid default gen_random_uuid(),
"company_id" uuid,
"event_type" text,
"entity_type" text,
"entity_id" uuid,
"actor_id" uuid,
"actor_role" text,
"old_values" jsonb,
"new_values" jsonb,
"metadata" jsonb default '{}'::jsonb,
"created_at" timestamp with time zone default now());
create table public.companies("id" uuid default gen_random_uuid(),
"name" text,
"timezone" text default 'Europe/Berlin'::text,
"created_by" uuid,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now());
create table public.company_members("company_id" uuid,
"user_id" uuid,
"role" text default 'OWNER'::text,
"status" text default 'ACTIVE'::text,
"created_at" timestamp with time zone default now());
create table public.employee_time_account_openings("employee_id" uuid,
"company_id" uuid,
"effective_date" date,
"opening_balance_minutes" integer default 0,
"note" text default ''::text,
"updated_by" uuid,
"updated_at" timestamp with time zone default now());
create table public.employees("id" uuid default gen_random_uuid(),
"company_id" uuid,
"legacy_id" text,
"first_name" text,
"last_name" text,
"personnel_no" text,
"role" text default 'Sicherheitsmitarbeiter'::text,
"employment" text default 'Vollzeit'::text,
"weekly_hours" numeric(6,2) default 40,
"start_date" date,
"contract_end" date,
"birth_date" date,
"status" text default 'active'::text,
"email" text,
"phone" text,
"address" text,
"zip" text,
"city" text,
"shift_permissions" text[] default '{}'::text[],
"qualifications" text[] default '{}'::text[],
"work_time_model" text default 'SHIFT'::text,
"note" text default ''::text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now(),
"auth_user_id" uuid,
"access_status" text default 'NONE'::text,
"access_linked_at" timestamp with time zone,
"deleted_at" timestamp with time zone,
"deleted_by" uuid);
create table public.shift_assignments("id" uuid default gen_random_uuid(),
"company_id" uuid,
"employee_id" uuid,
"legacy_id" text,
"shift_code" text,
"starts_at" timestamp with time zone,
"ends_at" timestamp with time zone,
"break_minutes" integer default 0,
"note" text default ''::text,
"status" text default 'DRAFT'::text,
"published_at" timestamp with time zone,
"version" integer default 1,
"last_change_request_id" uuid,
"created_by" uuid,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now());
create table public.time_account_openings("employee_id" uuid,
"company_id" uuid,
"effective_date" date,
"opening_balance_minutes" integer default 0,
"note" text default ''::text,
"updated_at" timestamp with time zone default now(),
"updated_by" uuid);
create table public.time_account_settings("company_id" uuid,
"account_start_date" date default (date_trunc('month'::text, (CURRENT_DATE + '1 mon'::interval)))::date,
"target_method" text default 'WEEKDAYS_5'::text,
"credited_absence_types" text[] default ARRAY['Urlaub'::text, 'Krank'::text, 'Fortbildung'::text, 'Sonderurlaub'::text],
"updated_by" uuid,
"updated_at" timestamp with time zone default now(),
"federal_state" text default 'DE'::text);
create table public.time_entries("assignment_id" uuid,
"company_id" uuid,
"actual_start" timestamp with time zone,
"actual_end" timestamp with time zone,
"break_minutes" integer default 0,
"status" text default 'open'::text,
"updated_by" uuid,
"updated_at" timestamp with time zone default now(),
"employee_note" text default ''::text,
"manager_note" text default ''::text,
"source" text default 'EMPLOYEE'::text,
"submitted_at" timestamp with time zone,
"confirmed_by" uuid,
"confirmed_at" timestamp with time zone,
"correction_requested_by" uuid,
"correction_requested_at" timestamp with time zone,
"correction_note" text default ''::text,
"created_at" timestamp with time zone default now(),
"version" integer default 1);
create table public.time_month_closures("company_id" uuid,
"month_start" date,
"status" text default 'OPEN'::text,
"revision" integer default 0,
"closed_at" timestamp with time zone,
"closed_by" uuid,
"close_note" text default ''::text,
"reopened_at" timestamp with time zone,
"reopened_by" uuid,
"reopen_note" text default ''::text,
"report_snapshot" jsonb,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now());
create table public.time_qr_independent_breaks("id" uuid default gen_random_uuid(),
"shift_id" uuid,
"ordinal" smallint,
"started_at" timestamp with time zone,
"ended_at" timestamp with time zone);
create table public.time_qr_independent_shifts("id" uuid default gen_random_uuid(),
"company_id" uuid,
"employee_id" uuid,
"terminal_id" uuid,
"started_at" timestamp with time zone,
"ended_at" timestamp with time zone,
"created_at" timestamp with time zone default clock_timestamp());
create table public.time_qr_terminals("id" uuid default gen_random_uuid(),
"company_id" uuid,
"name" text,
"location_note" text default ''::text,
"token_hash" bytea,
"is_active" boolean default false,
"start_window_minutes" integer default 60,
"end_window_minutes" integer default 120,
"created_by" uuid,
"created_at" timestamp with time zone default now(),
"updated_by" uuid,
"updated_at" timestamp with time zone default now(),
"rotated_at" timestamp with time zone,
"disabled_at" timestamp with time zone,
"pilot_mode" boolean default true,
"pilot_employee_id" uuid,
"vault_secret_id" uuid);
alter table public.time_entries add primary key(assignment_id);
alter table public.companies add primary key(id);
alter table public.employees add primary key(id);
CREATE OR REPLACE FUNCTION private.sf_is_manager(p_company_id uuid, p_admin_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id=p_company_id
      and cm.user_id=(select auth.uid())
      and cm.status='ACTIVE'
      and (
        cm.role in ('OWNER','ADMIN')
        or (not p_admin_only and cm.role in ('DISPATCHER','PLANNER'))
      )
  );
$function$;
CREATE OR REPLACE FUNCTION private.sf_can_manage_time(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.sf_is_manager(p_company_id,false) or exists(
 select 1 from public.company_members cm where cm.company_id=p_company_id
 and cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING' and cm.status='ACTIVE');
$function$;
CREATE OR REPLACE FUNCTION private.sf_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.id
  from public.employees e
  where e.auth_user_id=(select auth.uid()) and e.status='active'
  order by e.id
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION private.sf_has_time_only_login()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.company_members cm
 where cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING')
 and not exists(select 1 from public.company_members cm
 where cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role<>'TIME_TRACKING');
$function$;
CREATE OR REPLACE FUNCTION private.sf_easter_sunday(p_year integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  a integer; b integer; c integer; d integer; e integer; f integer;
  g integer; h integer; i integer; k integer; l integer; m integer;
  v_month integer; v_day integer;
begin
  a:=p_year%19; b:=p_year/100; c:=p_year%100; d:=b/4; e:=b%4;
  f:=(b+8)/25; g:=(b-f+1)/3; h:=(19*a+b-d-g+15)%30;
  i:=c/4; k:=c%4; l:=(32+2*e+2*i-h-k)%7;
  m:=(a+11*h+22*l)/451;
  v_month:=(h+l-7*m+114)/31;
  v_day:=((h+l-7*m+114)%31)+1;
  return make_date(p_year,v_month,v_day);
end;
$function$;
CREATE OR REPLACE FUNCTION private.german_easter_sunday(p_year integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.german_public_holidays(p_year integer, p_federal_state text DEFAULT 'DE'::text)
 RETURNS TABLE(holiday_date date, holiday_name text, holiday_scope text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'private', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.german_holiday_name(p_date date, p_federal_state text DEFAULT 'DE'::text)
 RETURNS text
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'private', 'pg_temp'
AS $function$
  select string_agg(h.holiday_name, ' / ' order by h.holiday_name)
  from private.german_public_holidays(extract(year from p_date)::integer,p_federal_state) h
  where h.holiday_date=p_date;
$function$;
CREATE OR REPLACE FUNCTION private.sf_public_holidays(p_year integer, p_state text)
 RETURNS TABLE(holiday_date date, name text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with e as (select private.sf_easter_sunday(p_year) d),
  fixed(d,n,states) as (
    values
      (make_date(p_year,1,1),'Neujahr'::text,array['*']::text[]),
      (make_date(p_year,5,1),'Tag der Arbeit',array['*']::text[]),
      (make_date(p_year,10,3),'Tag der Deutschen Einheit',array['*']::text[]),
      (make_date(p_year,12,25),'1. Weihnachtstag',array['*']::text[]),
      (make_date(p_year,12,26),'2. Weihnachtstag',array['*']::text[]),
      (make_date(p_year,1,6),'Heilige Drei Koenige',array['BW','BY','ST']::text[]),
      (make_date(p_year,3,8),'Internationaler Frauentag',array['BE','MV']::text[]),
      (make_date(p_year,8,15),'Mariae Himmelfahrt',array['SL']::text[]),
      (make_date(p_year,9,20),'Weltkindertag',array['TH']::text[]),
      (make_date(p_year,10,31),'Reformationsfest',array['BB','HB','HH','MV','NI','SN','ST','SH','TH']::text[]),
      (make_date(p_year,11,1),'Allerheiligen',array['BW','BY','NW','RP','SL']::text[])
  ), moving(d,n,states) as (
    select e.d-2,'Karfreitag',array['*']::text[] from e union all
    select e.d+1,'Ostermontag',array['*']::text[] from e union all
    select e.d+39,'Christi Himmelfahrt',array['*']::text[] from e union all
    select e.d+50,'Pfingstmontag',array['*']::text[] from e union all
    select e.d+60,'Fronleichnam',array['BW','BY','HE','NW','RP','SL']::text[] from e union all
    select make_date(p_year,11,22)-((extract(dow from make_date(p_year,11,22))::integer+4)%7),
           'Buß- und Bettag',array['SN']::text[]
  )
  select x.d,x.n from (
    select * from fixed union all select * from moving
  ) x
  where '*'=any(x.states)
     or regexp_replace(upper(coalesce(p_state,'DE')),'^DE-','')=any(x.states)
  order by x.d;
$function$;
CREATE OR REPLACE FUNCTION private.sf_target_minutes(p_weekly_hours numeric, p_from date, p_to date, p_state text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(round(count(*) * greatest(coalesce(p_weekly_hours,0),0) * 60 / 5.0),0)::integer
  from generate_series(p_from,p_to,interval '1 day') g(day)
  where extract(isodow from g.day) between 1 and 5
    and not exists (
      select 1 from private.sf_public_holidays(extract(year from g.day)::integer,p_state) h
      where h.holiday_date=g.day::date
    );
$function$;
CREATE OR REPLACE FUNCTION private.sf_absence_credit_minutes(p_employee_id uuid, p_from date, p_to date, p_types text[], p_daily_minutes integer, p_state text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(case
    when extract(isodow from g.day) between 1 and 5
     and not exists (
       select 1 from private.sf_public_holidays(extract(year from g.day)::integer,p_state) h
       where h.holiday_date=g.day::date
     ) then greatest(p_daily_minutes,0) else 0 end),0)::integer
  from public.absences a
  cross join lateral generate_series(
    greatest(a.start_date,p_from),least(a.end_date,p_to),interval '1 day'
  ) g(day)
  where a.employee_id=p_employee_id
    and a.status in ('Genehmigt','Erfasst','APPROVED')
    and a.absence_type=any(coalesce(p_types,array[]::text[]))
    and a.start_date<=p_to and a.end_date>=p_from;
$function$;
CREATE OR REPLACE FUNCTION private.sf_confirmed_work_minutes(p_employee_id uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(greatest(0,
    round(extract(epoch from (te.actual_end-te.actual_start))/60)::integer-te.break_minutes
  )),0)::integer
  from public.time_entries te
  join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id
  where sa.employee_id=p_employee_id and te.status='confirmed'
    and te.actual_start::date between p_from and p_to;
$function$;
CREATE OR REPLACE FUNCTION private.sf_time_account_rows(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, employee_name text, personnel_no text, employment text, weekly_hours numeric, target_minutes integer, confirmed_work_minutes integer, absence_credit_minutes integer, credited_total_minutes integer, month_balance_minutes integer, account_balance_minutes integer, account_started boolean, effective_account_start date, pending_entries bigint, opening_balance_minutes integer, opening_effective_date date, opening_note text, holiday_minutes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select date_trunc('month',coalesce(p_month,current_date))::date m0,
      (date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date m1
  ), cfg as (
    select coalesce(s.account_start_date,b.m0) account_start_date,
      coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) credited_types,
      coalesce(s.federal_state,'DE') federal_state,b.m0,b.m1
    from bounds b left join public.time_account_settings s on s.company_id=p_company_id
  ), base as (
    select e.*,c.*,coalesce(o.effective_date,c.account_start_date) effective_start,
      coalesce(o.opening_balance_minutes,0) opening_minutes,o.effective_date opening_date,coalesce(o.note,'') opening_note,
      round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer daily_minutes
    from public.employees e cross join cfg c
    left join public.time_account_openings o on o.employee_id=e.id and o.company_id=e.company_id
    where e.company_id=p_company_id and e.status='active' and (p_employee_id is null or e.id=p_employee_id)
  )
  select b.id,trim(concat_ws(' ',b.first_name,b.last_name)),coalesce(b.personnel_no,''),
    coalesce(b.employment,''),coalesce(b.weekly_hours,0),
    case when greatest(b.m0,coalesce(b.start_date,b.m0))<=least(b.m1,coalesce(b.contract_end,b.m1))
      then private.sf_target_minutes(b.weekly_hours,greatest(b.m0,coalesce(b.start_date,b.m0)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end,
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1),
    private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state),
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1)+private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state),
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1)+private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state)-
      case when greatest(b.m0,coalesce(b.start_date,b.m0))<=least(b.m1,coalesce(b.contract_end,b.m1))
        then private.sf_target_minutes(b.weekly_hours,greatest(b.m0,coalesce(b.start_date,b.m0)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end,
    case when b.effective_start>b.m1 then b.opening_minutes else b.opening_minutes+
      private.sf_confirmed_work_minutes(b.id,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),b.m1)+
      private.sf_absence_credit_minutes(b.id,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),b.m1,b.credited_types,b.daily_minutes,b.federal_state)-
      case when greatest(b.effective_start,coalesce(b.start_date,b.effective_start))<=least(b.m1,coalesce(b.contract_end,b.m1))
        then private.sf_target_minutes(b.weekly_hours,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end end,
    b.effective_start<=b.m1,b.effective_start,
    (select count(*) from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id
      where sa.employee_id=b.id and te.company_id=p_company_id and te.status in ('recorded','correction_requested')
        and te.actual_start::date between b.m0 and b.m1),
    b.opening_minutes,b.opening_date,b.opening_note,
    coalesce((select count(*)::integer*b.daily_minutes from private.sf_public_holidays(extract(year from b.m0)::integer,b.federal_state) h
      where h.holiday_date between b.m0 and b.m1 and extract(isodow from h.holiday_date) between 1 and 5),0)
  from base b
  order by b.last_name,b.first_name;
$function$;
CREATE OR REPLACE FUNCTION public.manager_list_time_entries(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(assignment_id uuid, employee_id uuid, employee_name text, personnel_no text, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, planned_break_minutes integer, actual_start timestamp with time zone, actual_end timestamp with time zone, actual_break_minutes integer, entry_status text, employee_note text, manager_note text, correction_note text, submitted_at timestamp with time zone, confirmed_at timestamp with time zone, version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.sf_can_manage_time(p_company_id) then raise exception 'Nicht berechtigt'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  return query
  select sa.id,e.id,trim(concat_ws(' ',e.first_name,e.last_name)),coalesce(e.personnel_no,''),
    sa.shift_code,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0),
    te.actual_start,te.actual_end,coalesce(te.break_minutes,sa.break_minutes,0),
    coalesce(te.status,'open'),coalesce(te.employee_note,''),coalesce(te.manager_note,''),
    coalesce(te.correction_note,''),te.submitted_at,te.confirmed_at,coalesce(te.version,0)
  from public.shift_assignments sa
  join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date
  order by sa.starts_at,e.last_name,e.first_name;
end;
$function$;
CREATE OR REPLACE FUNCTION public.manager_close_time_month(p_company_id uuid, p_month date, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_check jsonb; v_snapshot jsonb; v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren duerfen Monate abschliessen'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||v_month::text,0));
  v_check:=public.manager_time_month_status(p_company_id,v_month);
  if not coalesce((v_check->>'can_close')::boolean,false) then raise exception 'Monat kann wegen offener Pruefpunkte nicht abgeschlossen werden'; end if;
  v_snapshot:=jsonb_build_object('accounts',public.manager_monthly_time_accounts(p_company_id,v_month),
    'report',public.manager_time_report_bundle(p_company_id,v_month,null),'closed_at',now());
  insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,close_note,report_snapshot,updated_at)
  values(p_company_id,v_month,'CLOSED',1,now(),auth.uid(),left(coalesce(p_note,''),1000),v_snapshot,now())
  on conflict(company_id,month_start) do update set status='CLOSED',revision=public.time_month_closures.revision+1,
    closed_at=now(),closed_by=auth.uid(),close_note=excluded.close_note,report_snapshot=excluded.report_snapshot,
    reopened_at=null,reopened_by=null,reopen_note='',updated_at=now()
  returning to_jsonb(time_month_closures.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_MONTH_CLOSED','time_month',p_company_id,auth.uid(),'ADMIN',v_result,jsonb_build_object('monthStart',v_month));
  return v_result;
end;
$function$;
revoke all on function private.sf_confirmed_work_minutes(uuid,date,date) from public,anon,authenticated;

create table private.sf_mfa_protected_rpcs(function_name text primary key,rollout_stage smallint,control_area text,enabled boolean,updated_at timestamptz default now());
insert into private.sf_mfa_protected_rpcs values('manager_list_time_entries',4,'DATEV und Berichte',true,now());
