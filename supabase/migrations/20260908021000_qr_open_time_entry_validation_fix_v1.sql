-- SchichtFunk – QR open time entry validation fix V1
-- QR CLOCK_IN creates a legitimate running time entry with actual_end = NULL.
-- The generic time-entry guard must allow that state only while status = 'open'.

create or replace function private.sf_guard_time_entry_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.time_entries%rowtype;
  v_day date;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  v_day := coalesce(
    v_row.actual_start::date,
    (
      select sa.starts_at::date
      from public.shift_assignments sa
      where sa.id = v_row.assignment_id
    )
  );

  if private.sf_is_time_month_closed(v_row.company_id, v_day) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;

  if tg_op <> 'DELETE' then
    if v_row.actual_end is null then
      if v_row.status <> 'open' then
        raise exception 'Ein fehlendes Ende ist nur fuer eine laufende Zeitbuchung zulaessig';
      end if;
    else
      perform private.sf_validate_time_values(
        v_row.actual_start,
        v_row.actual_end,
        v_row.break_minutes
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
