-- Draft: legacy QR terminal selects the active profile for its own company.
CREATE OR REPLACE FUNCTION private.sf_qr_time_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_employee uuid;
  v_terminal public.time_qr_terminals%rowtype;
  v_assignment public.shift_assignments%rowtype;
  v_open_punch public.time_qr_punches%rowtype;
  v_company_timezone text;
  v_candidate_count integer := 0;
  v_entry_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Ungültiger QR-Code'; end if;
  select t.* into v_terminal from public.time_qr_terminals t where t.token_hash = extensions.digest(lower(p_token), 'sha256') and t.is_active = true limit 1;
  if not found then raise exception 'QR-Terminal ist ungültig oder deaktiviert'; end if;
  v_employee := private.sf_employee_identity_for_company(v_terminal.company_id);
  select p.* into v_open_punch
  from public.time_qr_punches p join public.shift_assignments a on a.id = p.assignment_id
  where p.employee_id = v_employee and p.terminal_id = v_terminal.id and p.company_id = v_terminal.company_id
    and p.punch_type = 'CLOCK_IN' and a.company_id = v_terminal.company_id
    and not exists (select 1 from public.time_qr_punches o where o.assignment_id = p.assignment_id and o.employee_id = p.employee_id and o.punch_type = 'CLOCK_OUT' and o.punched_at > p.punched_at)
  order by p.punched_at desc limit 1;
  if found then
    select a.* into v_assignment from public.shift_assignments a
    where a.id = v_open_punch.assignment_id and a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null;
    if not found then raise exception 'Die zugehörige veröffentlichte Schicht wurde nicht gefunden'; end if;
    if v_now > v_assignment.ends_at + pg_catalog.make_interval(mins => v_terminal.end_window_minutes) then raise exception 'Das Zeitfenster zum Ausstempeln ist abgelaufen. Bitte Korrektur durch die Einsatzleitung anfordern'; end if;
    select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
    if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_OUT','state','RUNNING','clocked_in_at',v_open_punch.punched_at);
  end if;
  select count(*) into v_candidate_count from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at;
  if v_candidate_count = 0 then raise exception 'Aktuell gibt es an diesem Terminal keine passende veröffentlichte Schicht';
  elsif v_candidate_count > 1 then raise exception 'Mehrere passende Schichten gefunden. Bitte Einsatzleitung kontaktieren'; end if;
  select a.* into v_assignment from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at limit 1;
  select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
  if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
  if exists (select 1 from public.time_qr_punches p where p.assignment_id = v_assignment.id and p.employee_id = v_employee and p.punch_type = 'CLOCK_OUT') then
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  select te.status into v_entry_status from public.time_entries te where te.assignment_id = v_assignment.id;
  if found then
    if v_entry_status = 'open' then raise exception 'Für diese Schicht existiert bereits eine offene Zeitbuchung ohne passenden QR-Start. Bitte Einsatzleitung kontaktieren'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_IN','state','READY');
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_assert_qr_pilot_access(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee_id uuid;
  v_terminal public.time_qr_terminals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst mit dem persönlichen Mitarbeiterkonto anmelden';
  end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Ungültiger QR-Code';
  end if;

  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.token_hash=extensions.digest(lower(p_token),'sha256')
    and t.is_active=true
  limit 1;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  v_employee_id := private.sf_employee_identity_for_company(v_terminal.company_id);

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id=p.employee_id
     and e.company_id=p.company_id
     and e.status='active'
     and e.auth_user_id is not null
    where p.terminal_id=v_terminal.id
      and p.company_id=v_terminal.company_id
      and p.employee_id=v_employee_id
  ) then
    raise exception 'Dieses QR-Terminal ist aktuell nur für ausdrücklich freigegebene Pilot-Mitarbeiter nutzbar';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sf_enforce_qr_punch_pilot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=new.terminal_id
    and t.company_id=new.company_id
    and t.is_active=true;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id=new.employee_id
      and e.company_id=new.company_id
      and e.status='active'
      and e.auth_user_id=new.auth_user_id
      and new.auth_user_id=(select auth.uid())
  ) then
    raise exception 'Mitarbeiterkonto ist für diese QR-Buchung nicht berechtigt';
  end if;

  if private.sf_employee_identity_for_company(new.company_id)<>new.employee_id then
    raise exception 'Mitarbeiterkonto ist für dieses Unternehmen nicht aktiv' using errcode='42501';
  end if;

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    where p.terminal_id=new.terminal_id
      and p.company_id=new.company_id
      and p.employee_id=new.employee_id
  ) then
    raise exception 'Mitarbeiter ist für dieses QR-Pilot-Terminal nicht freigegeben';
  end if;

  return new;
end;
$function$
;
