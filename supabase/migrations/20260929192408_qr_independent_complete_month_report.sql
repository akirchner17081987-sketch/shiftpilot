-- Return every attendance row in the selected month.
create or replace function public.manager_qr_independent_report(
  p_company_id uuid,p_start_date date,p_end_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_timezone text;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
     or p_end_date-p_start_date>62 then raise exception 'Bitte einen Zeitraum bis 63 Tage wählen'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]'::jsonb)
  into v_result from (
    select s.id, btrim(e.first_name||' '||e.last_name) employee_name,e.personnel_no,
      s.started_at,s.ended_at,t.name terminal_name,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at)
        order by b.ordinal) from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      case when s.ended_at is not null then round(extract(epoch from (s.ended_at-s.started_at))/60)::integer end paid_minutes,
      (select coalesce(round(sum(extract(epoch from (coalesce(b.ended_at,clock_timestamp())-b.started_at)))/60),0)::integer
       from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id
    join public.time_qr_terminals t on t.id=s.terminal_id
    where s.company_id=p_company_id
      and (s.started_at at time zone v_timezone)::date between p_start_date and p_end_date
    order by s.started_at desc
  ) x;
  return v_result;
end;$$;
