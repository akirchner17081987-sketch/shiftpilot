-- Read-only wage basis. No hourly rate is accepted or stored by the server.
-- Union paid intervals before day/premium splitting to prevent double payment.
create or replace function private.employee_my_wage_month_impl(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  select * into v_employee from public.employees where auth_user_id=auth.uid()
    and status='active' and access_status='ACTIVE' order by id limit 1;
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
end;$$;
revoke all on function private.employee_my_wage_month_impl(date) from public,anon,authenticated;
grant execute on function private.employee_my_wage_month_impl(date) to authenticated;
create or replace function public.employee_my_wage_month(p_month date default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.employee_my_wage_month_impl(p_month);
$$;
revoke all on function public.employee_my_wage_month(date) from public,anon,authenticated;
grant execute on function public.employee_my_wage_month(date) to authenticated;
comment on function public.employee_my_wage_month(date) is 'Own paid work and exclusive premium seconds per calendar day; private hourly rate stays on the device.';
