create or replace function private.time_account_row_v1(p_employee_id uuid, p_month date)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
with emp as (
  select e.* from public.employees e where e.id=p_employee_id
), cfg as (
  select e.*,
    coalesce(s.account_start_date,date_trunc('month',current_date+interval '1 month')::date) as company_account_start,
    coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) as credited_types,
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
), month_target as (
  select b.id,coalesce(sum(case when extract(isodow from d)::int between 1 and 5
    and d::date>=coalesce(b.start_date,b.month_start) and d::date<=coalesce(b.contract_end,b.month_end)
    then b.daily_target_minutes else 0 end),0)::int as minutes
  from b cross join lateral generate_series(b.month_start,b.month_end,interval '1 day') d group by b.id
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
), month_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes,coalesce(count(x.absence_date),0)::int as credited_days
  from b left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from month_absence_raw group by id,absence_date
  ) x on x.id=b.id group by b.id
), account_target as (
  select b.id,case when b.month_end<b.account_start then 0 else coalesce(sum(case
    when extract(isodow from d)::int between 1 and 5
      and d::date>=greatest(b.account_start,coalesce(b.start_date,b.account_start))
      and d::date<=coalesce(b.contract_end,b.month_end)
    then b.daily_target_minutes else 0 end),0)::int end as minutes
  from b left join lateral generate_series(b.account_start,b.month_end,interval '1 day') d on b.month_end>=b.account_start
  group by b.id,b.month_end,b.account_start
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
  'company_account_start',b.company_account_start,'opening_effective_date',b.opening_effective_date,
  'effective_account_start',b.account_start,'opening_balance_minutes',b.opening_balance_minutes,'opening_note',b.opening_note,
  'account_started',(b.month_end>=b.account_start),'account_balance_minutes',(b.opening_balance_minutes+aw.minutes+aa.minutes-at.minutes)
)
from b join month_target mt on mt.id=b.id join month_work mw on mw.id=b.id join month_pending mp on mp.id=b.id
join month_absence ma on ma.id=b.id join account_target at on at.id=b.id join account_work aw on aw.id=b.id join account_absence aa on aa.id=b.id;
$$;;
