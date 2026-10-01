-- Empty time rows for a midnight duty have the same local month as that duty.
CREATE OR REPLACE FUNCTION private.sf_guard_time_entry_write() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data public.time_entries%rowtype; work_day date; tz text;
BEGIN
 IF TG_OP='DELETE' THEN row_data:=old; ELSE row_data:=new; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=row_data.company_id;
 work_day:=coalesce((row_data.actual_start AT TIME ZONE tz)::date,
  (SELECT (a.starts_at AT TIME ZONE tz)::date FROM public.shift_assignments a WHERE a.id=row_data.assignment_id));
 IF private.sf_is_time_month_closed(row_data.company_id,work_day) THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF row_data.actual_end IS NULL THEN
   IF row_data.status<>'open' THEN RAISE EXCEPTION 'Ein fehlendes Ende ist nur fuer eine laufende Zeitbuchung zulaessig'; END IF;
  ELSE
   PERFORM private.sf_validate_time_values(row_data.actual_start,row_data.actual_end,row_data.break_minutes);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
