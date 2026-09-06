-- SchichtFunk: versionierte Zeitwirtschaft und Stundenkonten
-- Alle schreibenden Zugriffe laufen ueber tenant-gepruefte RPCs.

begin;
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Bestehende Installationen besitzen time_entries bereits. Die Migration ergaenzt
-- die fuer Portal, Korrekturprozess und Monatsabschluss benoetigten Felder.
create table if not exists public.time_entries (
  assignment_id uuid primary key,
  company_id uuid not null,
  actual_start timestamptz,
  actual_end timestamptz,
  break_minutes integer not null default 0,
  status text not null default 'open',
  employee_note text not null default '',
  manager_note text not null default '',
  source text not null default 'EMPLOYEE',
  correction_note text not null default '',
  submitted_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  correction_requested_by uuid,
  correction_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  constraint time_entries_interval_chk check (actual_end > actual_start),
  constraint time_entries_break_chk check (
    break_minutes >= 0 and break_minutes < extract(epoch from (actual_end-actual_start))/60
  ),
  constraint time_entries_status_chk check (
    status in ('open','recorded','confirmed','correction_requested')
  )
);
alter table public.time_entries add column if not exists employee_note text not null default '';
alter table public.time_entries add column if not exists manager_note text not null default '';
alter table public.time_entries add column if not exists source text not null default 'EMPLOYEE';
alter table public.time_entries add column if not exists correction_note text not null default '';
alter table public.time_entries add column if not exists submitted_at timestamptz;
alter table public.time_entries add column if not exists confirmed_by uuid;
alter table public.time_entries add column if not exists confirmed_at timestamptz;
alter table public.time_entries add column if not exists correction_requested_by uuid;
alter table public.time_entries add column if not exists correction_requested_at timestamptz;
alter table public.time_entries add column if not exists created_at timestamptz not null default now();
alter table public.time_entries add column if not exists updated_at timestamptz not null default now();
alter table public.time_entries add column if not exists version integer not null default 1;
create unique index if not exists time_entries_assignment_uidx
  on public.time_entries(assignment_id);
create index if not exists time_entries_company_status_idx
  on public.time_entries(company_id,status);
create index if not exists time_entries_company_actual_start_idx
  on public.time_entries(company_id,actual_start);
create table if not exists public.time_account_settings (
  company_id uuid primary key,
  account_start_date date not null default current_date,
  credited_absence_types text[] not null default array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[],
  target_method text not null default 'WEEKDAYS_5',
  federal_state text not null default 'DE',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint time_account_target_method_chk check (target_method='WEEKDAYS_5'),
  constraint time_account_state_chk check (
    federal_state in ('DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV',
      'DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH')
  )
);
alter table public.time_account_settings add column if not exists account_start_date date not null default current_date;
alter table public.time_account_settings add column if not exists credited_absence_types text[] not null default array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[];
alter table public.time_account_settings add column if not exists target_method text not null default 'WEEKDAYS_5';
alter table public.time_account_settings add column if not exists federal_state text not null default 'DE';
alter table public.time_account_settings add column if not exists updated_at timestamptz not null default now();
alter table public.time_account_settings add column if not exists updated_by uuid;
create table if not exists public.time_account_openings (
  employee_id uuid primary key,
  company_id uuid not null,
  effective_date date not null,
  opening_balance_minutes integer not null default 0,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists time_account_openings_company_idx
  on public.time_account_openings(company_id,employee_id);
create table if not exists public.time_month_closures (
  company_id uuid not null,
  month_start date not null,
  status text not null default 'OPEN',
  revision integer not null default 0,
  closed_at timestamptz,
  closed_by uuid,
  close_note text not null default '',
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_note text not null default '',
  report_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(company_id,month_start),
  constraint time_month_start_chk check (month_start=date_trunc('month',month_start)::date),
  constraint time_month_status_chk check (status in ('OPEN','CLOSED')),
  constraint time_month_revision_chk check (revision >= 0)
);
alter table public.time_month_closures add column if not exists revision integer not null default 0;
alter table public.time_month_closures add column if not exists closed_at timestamptz;
alter table public.time_month_closures add column if not exists closed_by uuid;
alter table public.time_month_closures add column if not exists close_note text not null default '';
alter table public.time_month_closures add column if not exists reopened_at timestamptz;
alter table public.time_month_closures add column if not exists reopened_by uuid;
alter table public.time_month_closures add column if not exists reopen_note text not null default '';
alter table public.time_month_closures add column if not exists report_snapshot jsonb;
alter table public.time_month_closures add column if not exists created_at timestamptz not null default now();
alter table public.time_month_closures add column if not exists updated_at timestamptz not null default now();
create index if not exists time_month_closures_company_status_idx
  on public.time_month_closures(company_id,status,month_start desc);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.time_entries'::regclass and conname='time_entries_assignment_id_fkey') then
    alter table public.time_entries add constraint time_entries_assignment_id_fkey
      foreign key(assignment_id) references public.shift_assignments(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.time_entries'::regclass and conname='time_entries_company_id_fkey') then
    alter table public.time_entries add constraint time_entries_company_id_fkey
      foreign key(company_id) references public.companies(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.time_account_settings'::regclass and conname='time_account_settings_company_id_fkey') then
    alter table public.time_account_settings add constraint time_account_settings_company_id_fkey
      foreign key(company_id) references public.companies(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.time_account_openings'::regclass and conname='time_account_openings_employee_fk') then
    alter table public.time_account_openings add constraint time_account_openings_employee_fk
      foreign key(employee_id) references public.employees(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.time_month_closures'::regclass and conname='time_month_closures_company_id_fkey') then
    alter table public.time_month_closures add constraint time_month_closures_company_id_fkey
      foreign key(company_id) references public.companies(id) on delete cascade not valid;
  end if;
end $$;
alter table public.time_entries enable row level security;
alter table public.time_account_settings enable row level security;
alter table public.time_account_openings enable row level security;
alter table public.time_month_closures enable row level security;
-- Zentrale Berechtigungshelfer. SECURITY DEFINER umgeht rekursive RLS-Abfragen;
-- der leere search_path verhindert Objekt-Hijacking.
create or replace function private.sf_is_manager(
  p_company_id uuid,
  p_admin_only boolean default false
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
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
$$;
create or replace function private.sf_employee_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select e.id
  from public.employees e
  where e.auth_user_id=(select auth.uid()) and e.status='active'
  order by e.id
  limit 1;
$$;
create or replace function private.sf_easter_sunday(p_year integer)
returns date
language plpgsql
immutable
set search_path=''
as $$
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
$$;
create or replace function private.sf_public_holidays(p_year integer,p_state text)
returns table(holiday_date date,name text)
language sql
immutable
set search_path=''
as $$
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
      (make_date(p_year,10,31),'Reformationstag',array['BB','HB','HH','MV','NI','SN','ST','SH','TH']::text[]),
      (make_date(p_year,11,1),'Allerheiligen',array['BW','BY','NW','RP','SL']::text[])
  ), moving(d,n,states) as (
    select e.d-2,'Karfreitag',array['*']::text[] from e union all
    select e.d+1,'Ostermontag',array['*']::text[] from e union all
    select e.d+39,'Christi Himmelfahrt',array['*']::text[] from e union all
    select e.d+50,'Pfingstmontag',array['*']::text[] from e union all
    select e.d+60,'Fronleichnam',array['BW','BY','HE','NW','RP','SL']::text[] from e union all
    select make_date(p_year,11,23)-((extract(dow from make_date(p_year,11,23))::integer+4)%7),
           'Buss- und Bettag',array['SN']::text[]
  )
  select x.d,x.n from (
    select * from fixed union all select * from moving
  ) x
  where '*'=any(x.states)
     or regexp_replace(upper(coalesce(p_state,'DE')),'^DE-','')=any(x.states)
  order by x.d;
$$;
create or replace function private.sf_target_minutes(
  p_weekly_hours numeric,p_from date,p_to date,p_state text
) returns integer
language sql
stable
set search_path=''
as $$
  select coalesce(round(count(*) * greatest(coalesce(p_weekly_hours,0),0) * 60 / 5.0),0)::integer
  from generate_series(p_from,p_to,interval '1 day') g(day)
  where extract(isodow from g.day) between 1 and 5
    and not exists (
      select 1 from private.sf_public_holidays(extract(year from g.day)::integer,p_state) h
      where h.holiday_date=g.day::date
    );
$$;
create or replace function private.sf_confirmed_work_minutes(
  p_employee_id uuid,p_from date,p_to date
) returns integer
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(greatest(0,
    round(extract(epoch from (te.actual_end-te.actual_start))/60)::integer-te.break_minutes
  )),0)::integer
  from public.time_entries te
  join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id
  where sa.employee_id=p_employee_id and te.status='confirmed'
    and te.actual_start::date between p_from and p_to;
$$;
create or replace function private.sf_absence_credit_minutes(
  p_employee_id uuid,p_from date,p_to date,p_types text[],p_daily_minutes integer,p_state text
) returns integer
language sql
stable
security definer
set search_path=''
as $$
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
$$;
create or replace function private.sf_is_time_month_closed(p_company_id uuid,p_day date)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id
      and c.month_start=date_trunc('month',p_day)::date
      and c.status='CLOSED'
  );
$$;
drop policy if exists time_account_settings_manager on public.time_account_settings;
create policy time_account_settings_manager on public.time_account_settings
for select to authenticated using (private.sf_is_manager(company_id,false));
drop policy if exists time_account_openings_manager on public.time_account_openings;
create policy time_account_openings_manager on public.time_account_openings
for select to authenticated using (private.sf_is_manager(company_id,false));
drop policy if exists time_month_closures_manager on public.time_month_closures;
create policy time_month_closures_manager on public.time_month_closures
for select to authenticated using (private.sf_is_manager(company_id,false));
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
for select to authenticated using (
  private.sf_is_manager(company_id,false)
  or exists (
    select 1 from public.shift_assignments sa
    join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id
    where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id
      and e.auth_user_id=(select auth.uid()) and e.status='active'
  )
);
drop policy if exists time_entries_insert_manager on public.time_entries;
create policy time_entries_insert_manager on public.time_entries
for insert to authenticated with check (private.sf_is_manager(company_id,false));
drop policy if exists time_entries_update_manager on public.time_entries;
create policy time_entries_update_manager on public.time_entries
for update to authenticated
using (private.sf_is_manager(company_id,false))
with check (private.sf_is_manager(company_id,false));
grant select,insert,update on public.time_entries to authenticated;
grant select on public.time_account_settings,public.time_account_openings,public.time_month_closures to authenticated;
create or replace function private.sf_validate_time_values(
  p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer
) returns void
language plpgsql
stable
set search_path=''
as $$
declare v_minutes numeric;
begin
  if p_actual_start is null or p_actual_end is null then
    raise exception 'Beginn und Ende muessen angegeben werden';
  end if;
  if p_actual_end<=p_actual_start then
    raise exception 'Das Ende muss nach dem Beginn liegen';
  end if;
  if p_actual_end>now() then
    raise exception 'Das tatsaechliche Ende darf nicht in der Zukunft liegen';
  end if;
  v_minutes:=extract(epoch from (p_actual_end-p_actual_start))/60;
  if coalesce(p_break_minutes,-1)<0 or p_break_minutes>=v_minutes then
    raise exception 'Die Pause muss kuerzer als die Arbeitszeit sein';
  end if;
end;
$$;
-- Bestehende produktive Fassungen hatten teilweise andere Rueckgabetypen.
-- Ein explizites DROP innerhalb dieser Transaktion ermoeglicht die einheitliche,
-- versionierte Schnittstelle; bei einem Fehler wird alles gemeinsam zurueckgerollt.
drop function if exists public.manager_list_time_entries(uuid,date,date);
drop function if exists public.manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean);
drop function if exists public.manager_review_time_entry(uuid,text,text);
drop function if exists public.employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text);
drop function if exists public.manager_update_time_account_settings(uuid,date,text[]);
drop function if exists public.manager_update_time_account_settings_v2(uuid,date,text[],text);
drop function if exists public.manager_set_time_account_opening(uuid,date,integer,text);
drop function if exists public.manager_monthly_time_accounts(uuid,date);
drop function if exists public.employee_my_time_account_month(date);
drop function if exists public.manager_monthly_holidays(uuid,date);
drop function if exists public.manager_time_report_bundle(uuid,date,uuid);
drop function if exists public.manager_time_month_status(uuid,date);
drop function if exists public.manager_close_time_month(uuid,date,text);
drop function if exists public.manager_reopen_time_month(uuid,date,text);
create or replace function public.manager_list_time_entries(
  p_company_id uuid,p_start_date date,p_end_date date
) returns table(
  assignment_id uuid,employee_id uuid,employee_name text,personnel_no text,
  shift_code text,starts_at timestamptz,ends_at timestamptz,
  planned_break_minutes integer,actual_start timestamptz,actual_end timestamptz,
  actual_break_minutes integer,entry_status text,employee_note text,
  manager_note text,correction_note text,submitted_at timestamptz,
  confirmed_at timestamptz,version integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
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
$$;
create or replace function public.manager_save_time_entry(
  p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,
  p_break_minutes integer,p_note text,p_confirm boolean
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_assignment public.shift_assignments%rowtype; v_old jsonb; v_new jsonb;
begin
  select * into v_assignment from public.shift_assignments where id=p_assignment_id for update;
  if not found or not private.sf_is_manager(v_assignment.company_id,false) then raise exception 'Nicht berechtigt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  select to_jsonb(te) into v_old from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    case when p_confirm then 'confirmed' else 'recorded' end,coalesce(p_note,''),'MANAGER','',
    case when p_confirm then coalesce((select submitted_at from public.time_entries where assignment_id=p_assignment_id),now()) else null end,
    case when p_confirm then auth.uid() else null end,case when p_confirm then now() else null end,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,status=excluded.status,
    manager_note=excluded.manager_note,source='MANAGER',correction_note='',
    confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,updated_at=now(),updated_by=auth.uid(),
    version=public.time_entries.version+1;
  select to_jsonb(te) into v_new from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_assignment.company_id,case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_old,v_new,'{}'::jsonb);
  return v_new;
end;
$$;
create or replace function public.manager_review_time_entry(
  p_assignment_id uuid,p_decision text,p_comment text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_company uuid; v_result jsonb;
begin
  select sa.company_id into v_company from public.shift_assignments sa where sa.id=p_assignment_id;
  if v_company is null or not private.sf_is_manager(v_company,false) then raise exception 'Nicht berechtigt'; end if;
  if private.sf_is_time_month_closed(v_company,(select actual_start::date from public.time_entries where assignment_id=p_assignment_id)) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  if upper(coalesce(p_decision,'')) not in ('CONFIRM','CORRECTION') then raise exception 'Ungueltige Entscheidung'; end if;
  if upper(p_decision)='CORRECTION' and length(trim(coalesce(p_comment,'')))<3 then
    raise exception 'Bitte einen Korrekturhinweis angeben';
  end if;
  update public.time_entries set
    status=case when upper(p_decision)='CONFIRM' then 'confirmed' else 'correction_requested' end,
    manager_note=case when upper(p_decision)='CONFIRM' then coalesce(p_comment,'') else manager_note end,
    correction_note=case when upper(p_decision)='CORRECTION' then p_comment else '' end,
    confirmed_by=case when upper(p_decision)='CONFIRM' then auth.uid() else null end,
    confirmed_at=case when upper(p_decision)='CONFIRM' then now() else null end,
    correction_requested_by=case when upper(p_decision)='CORRECTION' then auth.uid() else null end,
    correction_requested_at=case when upper(p_decision)='CORRECTION' then now() else null end,
    updated_at=now(),updated_by=auth.uid(),version=version+1
  where assignment_id=p_assignment_id returning to_jsonb(time_entries.*) into v_result;
  if v_result is null then raise exception 'Zeiteintrag nicht gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,case when upper(p_decision)='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_result,jsonb_build_object('comment',coalesce(p_comment,'')));
  return v_result;
end;
$$;
create or replace function public.employee_submit_time_entry(
  p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,
  p_break_minutes integer,p_note text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  v_employee:=private.sf_employee_id();
  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and employee_id=v_employee and status='PUBLISHED' for update;
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
$$;
create or replace function public.manager_update_time_account_settings_v2(
  p_company_id uuid,p_account_start_date date,p_credited_absence_types text[],p_federal_state text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb; v_state text:=upper(coalesce(p_federal_state,'DE'));
begin
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren duerfen Einstellungen aendern'; end if;
  if p_account_start_date is null then raise exception 'Kontostart fehlt'; end if;
  if v_state not in ('DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV',
    'DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH') then
    raise exception 'Ungueltiges Bundesland';
  end if;
  insert into public.time_account_settings(company_id,account_start_date,credited_absence_types,federal_state,updated_at,updated_by)
  values(p_company_id,p_account_start_date,coalesce(p_credited_absence_types,array[]::text[]),v_state,now(),auth.uid())
  on conflict(company_id) do update set account_start_date=excluded.account_start_date,
    credited_absence_types=excluded.credited_absence_types,federal_state=excluded.federal_state,
    updated_at=now(),updated_by=auth.uid()
  returning to_jsonb(time_account_settings.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_ACCOUNT_SETTINGS_UPDATED','time_account_settings',p_company_id,auth.uid(),'ADMIN',v_result,'{}'::jsonb);
  return v_result;
end;
$$;
create or replace function public.manager_update_time_account_settings(
  p_company_id uuid,p_account_start_date date,p_credited_absence_types text[]
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_state text;
begin
  select s.federal_state into v_state from public.time_account_settings s where s.company_id=p_company_id;
  return public.manager_update_time_account_settings_v2(
    p_company_id,p_account_start_date,p_credited_absence_types,coalesce(v_state,'DE')
  );
end;
$$;
create or replace function public.manager_set_time_account_opening(
  p_employee_id uuid,p_effective_date date,p_opening_balance_minutes integer,p_note text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_company uuid; v_result jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id and e.status='active';
  if v_company is null or not private.sf_is_manager(v_company,true) then raise exception 'Nicht berechtigt'; end if;
  if p_effective_date is null then raise exception 'Stichtag fehlt'; end if;
  insert into public.time_account_openings(employee_id,company_id,effective_date,opening_balance_minutes,note,updated_at,updated_by)
  values(p_employee_id,v_company,p_effective_date,coalesce(p_opening_balance_minutes,0),left(coalesce(p_note,''),1000),now(),auth.uid())
  on conflict(employee_id) do update set company_id=excluded.company_id,effective_date=excluded.effective_date,
    opening_balance_minutes=excluded.opening_balance_minutes,note=excluded.note,updated_at=now(),updated_by=auth.uid()
  returning to_jsonb(time_account_openings.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,'TIME_ACCOUNT_OPENING_UPDATED','employee',p_employee_id,auth.uid(),'ADMIN',v_result,'{}'::jsonb);
  return v_result;
end;
$$;
create or replace function private.sf_time_account_rows(
  p_company_id uuid,p_month date,p_employee_id uuid default null
) returns table(
  employee_id uuid,employee_name text,personnel_no text,employment text,weekly_hours numeric,
  target_minutes integer,confirmed_work_minutes integer,absence_credit_minutes integer,
  credited_total_minutes integer,month_balance_minutes integer,account_balance_minutes integer,
  account_started boolean,effective_account_start date,pending_entries bigint,
  opening_balance_minutes integer,opening_effective_date date,opening_note text,holiday_minutes integer
)
language sql
stable
security definer
set search_path=''
as $$
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
$$;
create or replace function public.manager_monthly_time_accounts(p_company_id uuid,p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_rows jsonb; v_settings jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from private.sf_time_account_rows(p_company_id,v_month,null) r;
  select coalesce(
    (select to_jsonb(s) from public.time_account_settings s where s.company_id=p_company_id),
    jsonb_build_object('company_id',p_company_id,'account_start_date',v_month,
      'credited_absence_types',array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[],'federal_state','DE')
  ) into v_settings;
  return jsonb_build_object('month_start',v_month,'settings',v_settings,'rows',v_rows);
end;
$$;
create or replace function public.employee_my_time_account_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_employee uuid:=private.sf_employee_id(); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb;
begin
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  select e.company_id into v_company from public.employees e where e.id=v_employee;
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
$$;
create or replace function public.manager_monthly_holidays(p_company_id uuid,p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_state text; v_holidays jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name,
    'target_relevant',extract(isodow from h.holiday_date) between 1 and 5) order by h.holiday_date),'[]'::jsonb)
  into v_holidays from private.sf_public_holidays(extract(year from v_month)::integer,v_state) h
  where h.holiday_date>=v_month and h.holiday_date<(v_month+interval '1 month')::date;
  return jsonb_build_object('month_start',v_month,'federal_state',v_state,'holidays',v_holidays);
end;
$$;
create or replace function public.manager_time_report_bundle(
  p_company_id uuid,p_month date,p_employee_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_state text; v_employees jsonb; v_details jsonb; v_holidays jsonb; v_company jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
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
      coalesce(s.actual_times,'') actual_times,coalesce(s.confirmed_minutes,0) confirmed_actual_minutes,
      coalesce(a.absence_types,'') absence_types,
      private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state) absence_credit_minutes,
      coalesce(h.name,'') holiday_name,coalesce(s.time_statuses,'') time_statuses,
      coalesce(s.confirmed_minutes,0)+private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
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
$$;
create or replace function public.manager_time_month_status(p_company_id uuid,p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_status text:='OPEN'; v_closed_at timestamptz; v_revision integer:=0;
  v_missing bigint; v_absences bigint; v_entries bigint; v_past boolean;
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
  v_past:=v_end<current_date;
  return jsonb_build_object('month_start',v_month,'status',v_status,'closed_at',v_closed_at,'revision',v_revision,
    'missing_confirmed_assignments',v_missing,'pending_absence_requests',v_absences,'pending_time_entries',v_entries,
    'is_past_month',v_past,'can_close',v_past and v_status<>'CLOSED' and v_missing=0 and v_absences=0 and v_entries=0,
    'can_reopen',v_status='CLOSED');
end;
$$;
create or replace function public.manager_close_time_month(p_company_id uuid,p_month date,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
$$;
create or replace function public.manager_reopen_time_month(p_company_id uuid,p_month date,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren duerfen Monate oeffnen'; end if;
  if length(trim(coalesce(p_note,'')))<3 then raise exception 'Bitte einen Grund fuer die Wiedereroeffnung angeben'; end if;
  update public.time_month_closures set status='OPEN',revision=revision+1,reopen_note=left(p_note,1000),
    reopened_at=now(),reopened_by=auth.uid(),updated_at=now()
    where company_id=p_company_id and month_start=v_month and status='CLOSED'
  returning to_jsonb(time_month_closures.*) into v_result;
  if v_result is null then raise exception 'Kein abgeschlossener Monat gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_MONTH_REOPENED','time_month',p_company_id,auth.uid(),'ADMIN',v_result,jsonb_build_object('monthStart',v_month,'reason',p_note));
  return v_result;
end;
$$;
-- Auch direkte Legacy-Schreibvorgaenge duerfen keinen abgeschlossenen Monat veraendern.
create or replace function private.sf_guard_time_entry_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.time_entries%rowtype; v_day date;
begin
  if tg_op='DELETE' then v_row:=old; else v_row:=new; end if;
  v_day:=coalesce(v_row.actual_start::date,(select sa.starts_at::date from public.shift_assignments sa where sa.id=v_row.assignment_id));
  if private.sf_is_time_month_closed(v_row.company_id,v_day) then raise exception 'Der Monat ist abgeschlossen'; end if;
  if tg_op<>'DELETE' and v_row.actual_start is not null then
    perform private.sf_validate_time_values(v_row.actual_start,v_row.actual_end,v_row.break_minutes);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists time_entries_closed_month_guard on public.time_entries;
create trigger time_entries_closed_month_guard before insert or update or delete on public.time_entries
for each row execute function private.sf_guard_time_entry_write();
create or replace function private.sf_guard_shift_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op in ('UPDATE','DELETE') and private.sf_is_time_month_closed(old.company_id,old.starts_at::date) then
    raise exception 'Der Monat der bisherigen Schicht ist abgeschlossen';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.sf_is_time_month_closed(new.company_id,new.starts_at::date) then
    raise exception 'Der Monat der Schicht ist abgeschlossen';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists shift_assignments_closed_month_guard on public.shift_assignments;
create trigger shift_assignments_closed_month_guard before insert or update or delete on public.shift_assignments
for each row execute function private.sf_guard_shift_write();
create or replace function private.sf_guard_absence_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_company uuid; v_start date; v_end date;
begin
  if tg_op in ('UPDATE','DELETE') and exists (
    select 1 from public.time_month_closures c where c.company_id=old.company_id and c.status='CLOSED'
      and c.month_start<=old.end_date and (c.month_start+interval '1 month')::date>old.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op in ('INSERT','UPDATE') and exists (
    select 1 from public.time_month_closures c where c.company_id=new.company_id and c.status='CLOSED'
      and c.month_start<=new.end_date and (c.month_start+interval '1 month')::date>new.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists absences_closed_month_guard on public.absences;
create trigger absences_closed_month_guard before insert or update or delete on public.absences
for each row execute function private.sf_guard_absence_write();
-- Funktionsrechte werden explizit vergeben; PUBLIC und anon erhalten keinen RPC-Zugriff.
revoke all on function public.manager_list_time_entries(uuid,date,date) from public,anon;
revoke all on function public.manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean) from public,anon;
revoke all on function public.manager_review_time_entry(uuid,text,text) from public,anon;
revoke all on function public.employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text) from public,anon;
revoke all on function public.manager_update_time_account_settings(uuid,date,text[]) from public,anon;
revoke all on function public.manager_update_time_account_settings_v2(uuid,date,text[],text) from public,anon;
revoke all on function public.manager_set_time_account_opening(uuid,date,integer,text) from public,anon;
revoke all on function public.manager_monthly_time_accounts(uuid,date) from public,anon;
revoke all on function public.employee_my_time_account_month(date) from public,anon;
revoke all on function public.manager_monthly_holidays(uuid,date) from public,anon;
revoke all on function public.manager_time_report_bundle(uuid,date,uuid) from public,anon;
revoke all on function public.manager_time_month_status(uuid,date) from public,anon;
revoke all on function public.manager_close_time_month(uuid,date,text) from public,anon;
revoke all on function public.manager_reopen_time_month(uuid,date,text) from public,anon;
grant execute on function public.manager_list_time_entries(uuid,date,date) to authenticated;
grant execute on function public.manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.manager_review_time_entry(uuid,text,text) to authenticated;
grant execute on function public.employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text) to authenticated;
grant execute on function public.manager_update_time_account_settings(uuid,date,text[]) to authenticated;
grant execute on function public.manager_update_time_account_settings_v2(uuid,date,text[],text) to authenticated;
grant execute on function public.manager_set_time_account_opening(uuid,date,integer,text) to authenticated;
grant execute on function public.manager_monthly_time_accounts(uuid,date) to authenticated;
grant execute on function public.employee_my_time_account_month(date) to authenticated;
grant execute on function public.manager_monthly_holidays(uuid,date) to authenticated;
grant execute on function public.manager_time_report_bundle(uuid,date,uuid) to authenticated;
grant execute on function public.manager_time_month_status(uuid,date) to authenticated;
grant execute on function public.manager_close_time_month(uuid,date,text) to authenticated;
grant execute on function public.manager_reopen_time_month(uuid,date,text) to authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
