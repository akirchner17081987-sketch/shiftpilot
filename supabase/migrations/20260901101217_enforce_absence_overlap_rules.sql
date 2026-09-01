create or replace function private.enforce_absence_no_overlap()
returns trigger
language plpgsql
set search_path = 'public', 'private', 'pg_temp'
as $function$
declare
  v_new_start timestamp without time zone;
  v_new_end timestamp without time zone;
  v_new_lock bigint;
  v_old_lock bigint;
begin
  if new.start_date is null or new.end_date is null or new.end_date < new.start_date then
    raise exception using
      errcode = '23514',
      message = 'Bitte einen gültigen Abwesenheitszeitraum wählen';
  end if;

  if not coalesce(new.full_day, true)
     and (new.start_time is null or new.end_time is null) then
    raise exception using
      errcode = '23514',
      message = 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  v_new_start := new.start_date::timestamp
    + case when coalesce(new.full_day, true) then time '00:00' else new.start_time end;
  v_new_end := case
    when coalesce(new.full_day, true) then new.end_date::timestamp + interval '1 day'
    else new.end_date::timestamp + new.end_time
  end;

  if v_new_end <= v_new_start then
    raise exception using
      errcode = '23514',
      message = 'Das Ende der Teilabwesenheit muss nach dem Beginn liegen';
  end if;

  if new.status not in ('Beantragt', 'Genehmigt', 'Erfasst') then
    return new;
  end if;

  v_new_lock := hashtextextended('absence-request:' || new.employee_id::text, 0);
  if tg_op = 'UPDATE' and old.employee_id is distinct from new.employee_id then
    v_old_lock := hashtextextended('absence-request:' || old.employee_id::text, 0);
    perform pg_advisory_xact_lock(least(v_old_lock, v_new_lock));
    perform pg_advisory_xact_lock(greatest(v_old_lock, v_new_lock));
  else
    perform pg_advisory_xact_lock(v_new_lock);
  end if;

  if exists (
    select 1
    from public.absences a
    where a.employee_id = new.employee_id
      and a.id is distinct from new.id
      and a.status in ('Beantragt', 'Genehmigt', 'Erfasst')
      and tsrange(
        a.start_date::timestamp
          + case when coalesce(a.full_day, true) then time '00:00' else a.start_time end,
        case
          when coalesce(a.full_day, true) then a.end_date::timestamp + interval '1 day'
          else a.end_date::timestamp + a.end_time
        end,
        '[)'
      ) && tsrange(v_new_start, v_new_end, '[)')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_absence_no_overlap() from public, anon, authenticated;

drop trigger if exists enforce_absence_no_overlap on public.absences;
create trigger enforce_absence_no_overlap
before insert or update of employee_id, start_date, end_date, full_day, start_time, end_time, status
on public.absences
for each row
execute function private.enforce_absence_no_overlap();
