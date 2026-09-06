create or replace function public.assert_standard_shift_rules(
  p_company_id uuid,
  p_employee_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_assignment_id uuid default null
)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_min_rest numeric(5,2):=11;
  v_max_shift numeric(5,2):=10;
  v_prev_end timestamptz;
  v_next_start timestamptz;
  v_duration numeric;
  v_timezone text := 'Europe/Berlin';
begin
  if p_ends_at<=p_starts_at then raise exception 'Invalid shift interval'; end if;

  select c.timezone into v_timezone
  from public.companies c
  where c.id=p_company_id;
  v_timezone:=coalesce(v_timezone,'Europe/Berlin');

  select standard_min_rest_hours,standard_max_shift_hours
    into v_min_rest,v_max_shift
  from public.company_compliance_policy
  where company_id=p_company_id;
  v_min_rest:=coalesce(v_min_rest,11);
  v_max_shift:=coalesce(v_max_shift,10);
  v_duration:=extract(epoch from(p_ends_at-p_starts_at))/3600.0;

  if v_duration>v_max_shift then raise exception 'Standard maximum shift duration exceeded'; end if;

  if exists(
    select 1
    from public.shift_assignments s
    where s.company_id=p_company_id
      and s.employee_id=p_employee_id
      and s.status<>'CANCELLED'
      and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
      and tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(p_starts_at,p_ends_at,'[)')
  ) then
    raise exception 'Shift overlaps another assignment';
  end if;

  -- Nur tatsächlich wirksame Abwesenheiten blockieren die Planung.
  -- Beantragte oder abgelehnte Abwesenheiten sind bewusst nicht enthalten.
  if exists(
    select 1
    from public.absences a
    where a.company_id=p_company_id
      and a.employee_id=p_employee_id
      and a.status in ('Genehmigt','Erfasst')
      and (
        (
          a.full_day
          and tstzrange(
            (a.start_date::timestamp at time zone v_timezone),
            ((a.end_date + 1)::timestamp at time zone v_timezone),
            '[)'
          ) && tstzrange(p_starts_at,p_ends_at,'[)')
        )
        or
        (
          not a.full_day
          and a.start_time is not null
          and a.end_time is not null
          and exists(
            select 1
            from generate_series(a.start_date,a.end_date,interval '1 day') g(day)
            where tstzrange(
              ((g.day::date + a.start_time)::timestamp at time zone v_timezone),
              (
                case
                  when a.end_time <= a.start_time
                    then ((g.day::date + 1 + a.end_time)::timestamp at time zone v_timezone)
                  else ((g.day::date + a.end_time)::timestamp at time zone v_timezone)
                end
              ),
              '[)'
            ) && tstzrange(p_starts_at,p_ends_at,'[)')
          )
        )
      )
  ) then
    raise exception 'Shift overlaps an approved absence';
  end if;

  select max(s.ends_at) into v_prev_end
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.ends_at<=p_starts_at;
  if v_prev_end is not null and extract(epoch from(p_starts_at-v_prev_end))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met before shift';
  end if;

  select min(s.starts_at) into v_next_start
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.starts_at>=p_ends_at;
  if v_next_start is not null and extract(epoch from(v_next_start-p_ends_at))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met after shift';
  end if;
end
$function$;;
