create table if not exists public.time_account_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  account_start_date date not null default (date_trunc('month', current_date + interval '1 month')::date),
  target_method text not null default 'WEEKDAYS_5' check (target_method in ('WEEKDAYS_5')),
  credited_absence_types text[] not null default array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_time_account_openings (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  effective_date date not null,
  opening_balance_minutes integer not null default 0,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(company_id, employee_id)
);

insert into public.time_account_settings(company_id, account_start_date)
select c.id, date_trunc('month', current_date + interval '1 month')::date
from public.companies c
on conflict (company_id) do nothing;

alter table public.time_account_settings enable row level security;
alter table public.employee_time_account_openings enable row level security;

revoke all on public.time_account_settings from anon, authenticated;
revoke all on public.employee_time_account_openings from anon, authenticated;
grant select on public.time_account_settings to authenticated;
grant select on public.employee_time_account_openings to authenticated;

create policy time_account_settings_select on public.time_account_settings
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = time_account_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id = time_account_settings.company_id
      and e.auth_user_id = (select auth.uid())
      and e.access_status = 'ACTIVE'
  )
);

create policy employee_time_account_openings_select on public.employee_time_account_openings
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = employee_time_account_openings.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id = employee_time_account_openings.employee_id
      and e.auth_user_id = (select auth.uid())
      and e.access_status = 'ACTIVE'
  )
);

create or replace function private.time_account_row_v1(p_employee_id uuid, p_month date)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
with emp as (
  select e.*
  from public.employees e
  where e.id = p_employee_id
), cfg as (
  select
    e.*,
    coalesce(s.account_start_date, date_trunc('month', current_date + interval '1 month')::date) as company_account_start,
    coalesce(s.credited_absence_types, array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) as credited_types,
    o.effective_date as opening_effective_date,
    coalesce(o.opening_balance_minutes,0) as opening_balance_minutes,
    coalesce(o.note,'') as opening_note
  from emp e
  left join public.time_account_settings s on s.company_id=e.company_id
  left join public.employee_time_account_openings o on o.employee_id=e.id and o.company_id=e.company_id
), b as (
  select c.*,
    date_trunc('month', coalesce(p_month,current_date))::date as month_start,
    (date_trunc('month', coalesce(p_month,current_date)) + interval '1 month - 1 day')::date as month_end,
    round(c.weekly_hours * 60 / 5.0)::int as daily_target_minutes,
    coalesce(c.opening_effective_date,c.company_account_start) as account_start
  from cfg c
), month_target as (
  select b.id,
    coalesce(sum(case
      when extract(isodow from d)::int between 1 and 5
       and d::date >= coalesce(b.start_date,b.month_start)
       and d::date <= coalesce(b.contract_end,b.month_end)
      then b.daily_target_minutes else 0 end),0)::int as minutes
  from b
  cross join lateral generate_series(b.month_start,b.month_end,interval '1 day') d
  group by b.id
), month_work as (
  select b.id,
    coalesce(sum(greatest(0, round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int - te.break_minutes)),0)::int as minutes,
    count(*)::int as confirmed_entries
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id
    and (timezone('Europe/Berlin',sa.starts_at))::date between b.month_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  group by b.id
), month_pending as (
  select b.id, count(te.assignment_id)::int as pending_entries
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id
    and (timezone('Europe/Berlin',sa.starts_at))::date between b.month_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status in ('recorded','correction_requested')
  group by b.id
), month_absence_raw as (
  select b.id, d::date as absence_date,
    b.daily_target_minutes,
    case
      when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time > a.start_time
        then least(b.daily_target_minutes, greatest(0, round(extract(epoch from (a.end_time-a.start_time))/60.0)::int))
      else 0
    end as credit_minutes
  from b
  join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst')
    and a.absence_type=any(b.credited_types)
    and a.end_date >= b.month_start and a.start_date <= b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.month_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date >= coalesce(b.start_date,b.month_start)
    and d::date <= coalesce(b.contract_end,b.month_end)
), month_absence as (
  select b.id,
    coalesce(sum(x.credit_minutes),0)::int as minutes,
    coalesce(count(x.absence_date),0)::int as credited_days
  from b
  left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from month_absence_raw group by id,absence_date
  ) x on x.id=b.id
  group by b.id
), account_target as (
  select b.id,
    case when b.month_end < b.account_start then 0 else coalesce(sum(case
      when extract(isodow from d)::int between 1 and 5
       and d::date >= greatest(b.account_start,coalesce(b.start_date,b.account_start))
       and d::date <= coalesce(b.contract_end,b.month_end)
      then b.daily_target_minutes else 0 end),0)::int end as minutes
  from b
  left join lateral generate_series(b.account_start,b.month_end,interval '1 day') d on b.month_end >= b.account_start
  group by b.id,b.month_end,b.account_start
), account_work as (
  select b.id,
    case when b.month_end < b.account_start then 0 else coalesce(sum(greatest(0, round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int - te.break_minutes)),0)::int end as minutes
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id
    and (timezone('Europe/Berlin',sa.starts_at))::date between b.account_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  group by b.id,b.month_end,b.account_start
), account_absence_raw as (
  select b.id,d::date as absence_date,b.daily_target_minutes,
    case
      when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time > a.start_time
        then least(b.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int))
      else 0
    end as credit_minutes
  from b
  join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst')
    and a.absence_type=any(b.credited_types)
    and b.month_end >= b.account_start
    and a.end_date >= b.account_start and a.start_date <= b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.account_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date >= greatest(b.account_start,coalesce(b.start_date,b.account_start))
    and d::date <= coalesce(b.contract_end,b.month_end)
), account_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes
  from b
  left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from account_absence_raw group by id,absence_date
  ) x on x.id=b.id
  group by b.id
)
select jsonb_build_object(
  'employee_id',b.id,
  'employee_name',trim(b.first_name||' '||b.last_name),
  'personnel_no',b.personnel_no,
  'employment',b.employment,
  'weekly_hours',b.weekly_hours,
  'month_start',b.month_start,
  'month_end',b.month_end,
  'daily_target_minutes',b.daily_target_minutes,
  'target_minutes',mt.minutes,
  'confirmed_work_minutes',mw.minutes,
  'absence_credit_minutes',ma.minutes,
  'credited_total_minutes',(mw.minutes+ma.minutes),
  'month_balance_minutes',(mw.minutes+ma.minutes-mt.minutes),
  'confirmed_entries',mw.confirmed_entries,
  'pending_entries',mp.pending_entries,
  'credited_absence_days',ma.credited_days,
  'company_account_start',b.company_account_start,
  'opening_effective_date',b.opening_effective_date,
  'effective_account_start',b.account_start,
  'opening_balance_minutes',b.opening_balance_minutes,
  'opening_note',b.opening_note,
  'account_started',(b.month_end>=b.account_start),
  'account_balance_minutes',(b.opening_balance_minutes + aw.minutes + aa.minutes - at.minutes)
)
from b
join month_target mt on mt.id=b.id
join month_work mw on mw.id=b.id
join month_pending mp on mp.id=b.id
join month_absence ma on ma.id=b.id
join account_target at on at.id=b.id
join account_work aw on aw.id=b.id
join account_absence aa on aa.id=b.id;
$$;

grant usage on schema private to authenticated;
grant execute on function private.time_account_row_v1(uuid,date) to authenticated;

create or replace function public.manager_monthly_time_accounts(p_company_id uuid, p_month date)
returns setof jsonb
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
declare r record;
begin
  if not exists (
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
      and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Nicht berechtigt'; end if;

  for r in
    select e.id from public.employees e
    where e.company_id=p_company_id
      and (e.start_date is null or e.start_date <= (date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date)
      and (e.contract_end is null or e.contract_end >= date_trunc('month',coalesce(p_month,current_date))::date)
    order by e.last_name,e.first_name
  loop
    return next private.time_account_row_v1(r.id,p_month);
  end loop;
  return;
end;
$$;

grant execute on function public.manager_monthly_time_accounts(uuid,date) to authenticated;

create or replace function public.employee_my_time_account_month(p_month date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
declare v_employee_id uuid;
begin
  select e.id into v_employee_id
  from public.employees e
  where e.auth_user_id=auth.uid() and e.access_status='ACTIVE'
  order by e.updated_at desc limit 1;
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang'; end if;
  return private.time_account_row_v1(v_employee_id,p_month);
end;
$$;

grant execute on function public.employee_my_time_account_month(date) to authenticated;

create or replace function private.manager_set_time_account_opening_impl(
  p_employee_id uuid,p_effective_date date,p_opening_balance_minutes integer,p_note text
) returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_company uuid; v_role text; v_old jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
   where cm.company_id=v_company and cm.user_id=auth.uid() and cm.status='ACTIVE';
  if v_role not in ('OWNER','ADMIN') then raise exception 'Nur OWNER/ADMIN dürfen Startsaldos ändern'; end if;
  if p_effective_date is null then raise exception 'Stichtag fehlt'; end if;
  if abs(coalesce(p_opening_balance_minutes,0)) > 600000 then raise exception 'Startsaldo außerhalb des erlaubten Bereichs'; end if;

  select to_jsonb(o) into v_old from public.employee_time_account_openings o where o.employee_id=p_employee_id;
  insert into public.employee_time_account_openings(employee_id,company_id,effective_date,opening_balance_minutes,note,updated_by,updated_at)
  values(p_employee_id,v_company,p_effective_date,coalesce(p_opening_balance_minutes,0),left(coalesce(p_note,''),1000),auth.uid(),now())
  on conflict(employee_id) do update set
    company_id=excluded.company_id,effective_date=excluded.effective_date,
    opening_balance_minutes=excluded.opening_balance_minutes,note=excluded.note,
    updated_by=auth.uid(),updated_at=now();

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_company,'TIME_ACCOUNT_OPENING_SET','EMPLOYEE',p_employee_id,auth.uid(),v_role,v_old,
    jsonb_build_object('effective_date',p_effective_date,'opening_balance_minutes',coalesce(p_opening_balance_minutes,0),'note',left(coalesce(p_note,''),1000)),
    '{}'::jsonb);
end;
$$;
revoke all on function private.manager_set_time_account_opening_impl(uuid,date,integer,text) from public,anon;
grant execute on function private.manager_set_time_account_opening_impl(uuid,date,integer,text) to authenticated;

create or replace function public.manager_set_time_account_opening(
  p_employee_id uuid,p_effective_date date,p_opening_balance_minutes integer,p_note text default ''
) returns void
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.manager_set_time_account_opening_impl(p_employee_id,p_effective_date,p_opening_balance_minutes,p_note); $$;
grant execute on function public.manager_set_time_account_opening(uuid,date,integer,text) to authenticated;

create or replace function private.manager_update_time_account_settings_impl(
  p_company_id uuid,p_account_start_date date,p_credited_absence_types text[]
) returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_role text; v_old jsonb;
begin
  select cm.role into v_role from public.company_members cm
   where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE';
  if v_role not in ('OWNER','ADMIN') then raise exception 'Nur OWNER/ADMIN dürfen Stundenkonto-Einstellungen ändern'; end if;
  if p_account_start_date is null then raise exception 'Kontostart fehlt'; end if;
  select to_jsonb(s) into v_old from public.time_account_settings s where s.company_id=p_company_id;
  insert into public.time_account_settings(company_id,account_start_date,credited_absence_types,updated_by,updated_at)
  values(p_company_id,p_account_start_date,coalesce(p_credited_absence_types,array[]::text[]),auth.uid(),now())
  on conflict(company_id) do update set account_start_date=excluded.account_start_date,
    credited_absence_types=excluded.credited_absence_types,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(p_company_id,'TIME_ACCOUNT_SETTINGS_UPDATED','COMPANY',p_company_id,auth.uid(),v_role,v_old,
    jsonb_build_object('account_start_date',p_account_start_date,'credited_absence_types',coalesce(p_credited_absence_types,array[]::text[])),'{}'::jsonb);
end;
$$;
revoke all on function private.manager_update_time_account_settings_impl(uuid,date,text[]) from public,anon;
grant execute on function private.manager_update_time_account_settings_impl(uuid,date,text[]) to authenticated;

create or replace function public.manager_update_time_account_settings(
  p_company_id uuid,p_account_start_date date,p_credited_absence_types text[]
) returns void
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.manager_update_time_account_settings_impl(p_company_id,p_account_start_date,p_credited_absence_types); $$;
grant execute on function public.manager_update_time_account_settings(uuid,date,text[]) to authenticated;;
