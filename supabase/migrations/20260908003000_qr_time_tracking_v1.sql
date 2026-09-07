-- SchichtFunk – QR-Zeiterfassung V1
-- Security model: QR identifies a terminal; employee identity and timestamps are resolved server-side.

create table if not exists public.time_qr_terminals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  location_note text not null default '',
  token_hash bytea not null unique,
  is_active boolean not null default true,
  start_window_minutes integer not null default 120 check (start_window_minutes between 0 and 720),
  end_window_minutes integer not null default 360 check (end_window_minutes between 0 and 1440),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  disabled_at timestamptz
);

create index if not exists time_qr_terminals_company_idx
  on public.time_qr_terminals(company_id, is_active, name);

create table if not exists public.time_qr_punches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  terminal_id uuid not null references public.time_qr_terminals(id) on delete restrict,
  assignment_id uuid not null references public.shift_assignments(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  punch_type text not null check (punch_type in ('CLOCK_IN','CLOCK_OUT')),
  punched_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists time_qr_punches_assignment_idx
  on public.time_qr_punches(assignment_id, punched_at desc);
create index if not exists time_qr_punches_employee_idx
  on public.time_qr_punches(employee_id, punched_at desc);

alter table public.time_qr_terminals enable row level security;
alter table public.time_qr_punches enable row level security;
revoke all on table public.time_qr_terminals from public, anon, authenticated;
revoke all on table public.time_qr_punches from public, anon, authenticated;

create or replace function private.sf_qr_time_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Ungültiger QR-Code';
  end if;

  v_employee := private.sf_employee_id();
  if v_employee is null then
    raise exception 'Kein aktives Mitarbeiterkonto zugeordnet';
  end if;

  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.token_hash = extensions.digest(lower(p_token), 'sha256')
    and t.is_active = true
  limit 1;

  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  select p.* into v_open_punch
  from public.time_qr_punches p
  join public.shift_assignments a on a.id = p.assignment_id
  where p.employee_id = v_employee
    and p.terminal_id = v_terminal.id
    and p.company_id = v_terminal.company_id
    and p.punch_type = 'CLOCK_IN'
    and a.company_id = v_terminal.company_id
    and not exists (
      select 1 from public.time_qr_punches o
      where o.assignment_id = p.assignment_id
        and o.employee_id = p.employee_id
        and o.punch_type = 'CLOCK_OUT'
        and o.punched_at > p.punched_at
    )
  order by p.punched_at desc
  limit 1;

  if found then
    select a.* into v_assignment
    from public.shift_assignments a
    where a.id = v_open_punch.assignment_id
      and a.employee_id = v_employee
      and a.company_id = v_terminal.company_id
      and a.status = 'PUBLISHED'
      and a.published_at is not null;

    if not found then
      raise exception 'Die zugehörige veröffentlichte Schicht wurde nicht gefunden';
    end if;

    if v_now > v_assignment.ends_at + pg_catalog.make_interval(mins => v_terminal.end_window_minutes) then
      raise exception 'Das Zeitfenster zum Ausstempeln ist abgelaufen. Bitte Korrektur durch die Einsatzleitung anfordern';
    end if;

    select c.timezone into v_company_timezone
    from public.companies c where c.id = v_terminal.company_id;

    if private.sf_is_time_month_closed(
      v_terminal.company_id,
      (v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date
    ) then
      raise exception 'Der Monat ist abgeschlossen';
    end if;

    return jsonb_build_object(
      'company_id', v_terminal.company_id,
      'employee_id', v_employee,
      'terminal_id', v_terminal.id,
      'terminal_name', v_terminal.name,
      'location_note', v_terminal.location_note,
      'assignment_id', v_assignment.id,
      'shift_code', v_assignment.shift_code,
      'planned_start', v_assignment.starts_at,
      'planned_end', v_assignment.ends_at,
      'planned_break_minutes', v_assignment.break_minutes,
      'action', 'CLOCK_OUT',
      'state', 'RUNNING',
      'clocked_in_at', v_open_punch.punched_at
    );
  end if;

  select count(*) into v_candidate_count
  from public.shift_assignments a
  where a.employee_id = v_employee
    and a.company_id = v_terminal.company_id
    and a.status = 'PUBLISHED'
    and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes)
    and v_now <= a.ends_at;

  if v_candidate_count = 0 then
    raise exception 'Aktuell gibt es an diesem Terminal keine passende veröffentlichte Schicht';
  elsif v_candidate_count > 1 then
    raise exception 'Mehrere passende Schichten gefunden. Bitte Einsatzleitung kontaktieren';
  end if;

  select a.* into v_assignment
  from public.shift_assignments a
  where a.employee_id = v_employee
    and a.company_id = v_terminal.company_id
    and a.status = 'PUBLISHED'
    and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes)
    and v_now <= a.ends_at
  limit 1;

  select c.timezone into v_company_timezone
  from public.companies c where c.id = v_terminal.company_id;

  if private.sf_is_time_month_closed(
    v_terminal.company_id,
    (v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date
  ) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;

  if exists (
    select 1 from public.time_qr_punches p
    where p.assignment_id = v_assignment.id
      and p.employee_id = v_employee
      and p.punch_type = 'CLOCK_OUT'
  ) then
    return jsonb_build_object(
      'company_id', v_terminal.company_id,
      'employee_id', v_employee,
      'terminal_id', v_terminal.id,
      'terminal_name', v_terminal.name,
      'location_note', v_terminal.location_note,
      'assignment_id', v_assignment.id,
      'shift_code', v_assignment.shift_code,
      'planned_start', v_assignment.starts_at,
      'planned_end', v_assignment.ends_at,
      'planned_break_minutes', v_assignment.break_minutes,
      'action', null,
      'state', 'COMPLETED'
    );
  end if;

  select te.status into v_entry_status
  from public.time_entries te
  where te.assignment_id = v_assignment.id;

  if found then
    if v_entry_status = 'open' then
      raise exception 'Für diese Schicht existiert bereits eine offene Zeitbuchung ohne passenden QR-Start. Bitte Einsatzleitung kontaktieren';
    end if;
    return jsonb_build_object(
      'company_id', v_terminal.company_id,
      'employee_id', v_employee,
      'terminal_id', v_terminal.id,
      'terminal_name', v_terminal.name,
      'location_note', v_terminal.location_note,
      'assignment_id', v_assignment.id,
      'shift_code', v_assignment.shift_code,
      'planned_start', v_assignment.starts_at,
      'planned_end', v_assignment.ends_at,
      'planned_break_minutes', v_assignment.break_minutes,
      'action', null,
      'state', 'COMPLETED'
    );
  end if;

  return jsonb_build_object(
    'company_id', v_terminal.company_id,
    'employee_id', v_employee,
    'terminal_id', v_terminal.id,
    'terminal_name', v_terminal.name,
    'location_note', v_terminal.location_note,
    'assignment_id', v_assignment.id,
    'shift_code', v_assignment.shift_code,
    'planned_start', v_assignment.starts_at,
    'planned_end', v_assignment.ends_at,
    'planned_break_minutes', v_assignment.break_minutes,
    'action', 'CLOCK_IN',
    'state', 'READY'
  );
end;
$$;

revoke all on function private.sf_qr_time_context(text) from public, anon, authenticated;

create or replace function public.employee_qr_time_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ctx jsonb;
begin
  v_ctx := private.sf_qr_time_context(p_token);
  return jsonb_build_object(
    'terminal_name', v_ctx->>'terminal_name',
    'location_note', v_ctx->>'location_note',
    'assignment_id', v_ctx->>'assignment_id',
    'shift_code', v_ctx->>'shift_code',
    'planned_start', v_ctx->>'planned_start',
    'planned_end', v_ctx->>'planned_end',
    'planned_break_minutes', (v_ctx->>'planned_break_minutes')::integer,
    'action', v_ctx->>'action',
    'state', v_ctx->>'state',
    'clocked_in_at', v_ctx->>'clocked_in_at'
  );
end;
$$;

revoke all on function public.employee_qr_time_status(text) from public, anon;
grant execute on function public.employee_qr_time_status(text) to authenticated;

create or replace function public.employee_clock_from_qr(p_token text, p_expected_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_company_id uuid;
  v_employee_id uuid;
  v_terminal_id uuid;
  v_assignment_id uuid;
  v_assignment public.shift_assignments%rowtype;
  v_entry public.time_entries%rowtype;
  v_result jsonb;
  v_last_punch timestamptz;
begin
  v_ctx := private.sf_qr_time_context(p_token);
  v_company_id := (v_ctx->>'company_id')::uuid;
  v_employee_id := (v_ctx->>'employee_id')::uuid;
  v_terminal_id := (v_ctx->>'terminal_id')::uuid;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;
  v_action := upper(coalesce(v_ctx->>'action', ''));

  if v_action not in ('CLOCK_IN','CLOCK_OUT') then
    raise exception 'Diese Schicht ist bereits vollständig gebucht';
  end if;
  if upper(coalesce(p_expected_action, '')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_employee_id::text || ':' || v_terminal_id::text, 0)
  );

  v_ctx := private.sf_qr_time_context(p_token);
  v_action := upper(coalesce(v_ctx->>'action', ''));
  if upper(coalesce(p_expected_action, '')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;

  select max(p.punched_at) into v_last_punch
  from public.time_qr_punches p
  where p.employee_id = v_employee_id and p.terminal_id = v_terminal_id;
  if v_last_punch is not null and v_now - v_last_punch < interval '20 seconds' then
    raise exception 'QR-Code wurde gerade bereits gebucht. Bitte kurz warten';
  end if;

  select a.* into v_assignment
  from public.shift_assignments a
  where a.id = v_assignment_id
    and a.employee_id = v_employee_id
    and a.company_id = v_company_id
    and a.status = 'PUBLISHED'
    and a.published_at is not null
  for update;
  if not found then raise exception 'Veröffentlichte Schicht wurde nicht gefunden'; end if;

  if v_action = 'CLOCK_IN' then
    select te.* into v_entry
    from public.time_entries te
    where te.assignment_id = v_assignment_id
    for update;
    if found then raise exception 'Für diese Schicht existiert bereits eine Zeitbuchung'; end if;

    insert into public.time_qr_punches(
      company_id, terminal_id, assignment_id, employee_id, auth_user_id, punch_type, punched_at
    ) values(
      v_company_id, v_terminal_id, v_assignment_id, v_employee_id, auth.uid(), 'CLOCK_IN', v_now
    );

    insert into public.time_entries(
      assignment_id, company_id, actual_start, actual_end, break_minutes, status,
      employee_note, manager_note, source, correction_note, submitted_at,
      confirmed_by, confirmed_at, correction_requested_by, correction_requested_at,
      updated_at, updated_by, version
    ) values(
      v_assignment_id, v_company_id, v_now, null, v_assignment.break_minutes, 'open',
      'QR-Zeiterfassung', '', 'EMPLOYEE', '', null,
      null, null, null, null, v_now, auth.uid(), 1
    ) returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(
      company_id, event_type, entity_type, entity_id, actor_id, actor_role, new_values, metadata
    ) values(
      v_company_id, 'TIME_QR_CLOCK_IN', 'time_entry', v_assignment_id, auth.uid(), 'EMPLOYEE',
      v_result, jsonb_build_object('terminal_id', v_terminal_id, 'terminal_name', v_ctx->>'terminal_name')
    );
  else
    select te.* into v_entry
    from public.time_entries te
    where te.assignment_id = v_assignment_id
    for update;
    if not found or v_entry.status <> 'open' or v_entry.actual_start is null or v_entry.actual_end is not null then
      raise exception 'Keine offene QR-Zeitbuchung für diese Schicht gefunden';
    end if;

    perform private.sf_validate_time_values(v_entry.actual_start, v_now, v_assignment.break_minutes);

    insert into public.time_qr_punches(
      company_id, terminal_id, assignment_id, employee_id, auth_user_id, punch_type, punched_at
    ) values(
      v_company_id, v_terminal_id, v_assignment_id, v_employee_id, auth.uid(), 'CLOCK_OUT', v_now
    );

    update public.time_entries
    set actual_end = v_now,
        break_minutes = v_assignment.break_minutes,
        status = 'recorded',
        employee_note = case when btrim(coalesce(employee_note,'')) = '' then 'QR-Zeiterfassung' else employee_note end,
        source = 'EMPLOYEE',
        correction_note = '',
        submitted_at = v_now,
        confirmed_by = null,
        confirmed_at = null,
        correction_requested_by = null,
        correction_requested_at = null,
        updated_at = v_now,
        updated_by = auth.uid(),
        version = version + 1
    where assignment_id = v_assignment_id
    returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(
      company_id, event_type, entity_type, entity_id, actor_id, actor_role, new_values, metadata
    ) values(
      v_company_id, 'TIME_QR_CLOCK_OUT', 'time_entry', v_assignment_id, auth.uid(), 'EMPLOYEE',
      v_result, jsonb_build_object('terminal_id', v_terminal_id, 'terminal_name', v_ctx->>'terminal_name')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'action', v_action, 'punched_at', v_now,
    'terminal_name', v_ctx->>'terminal_name', 'assignment_id', v_assignment_id,
    'shift_code', v_assignment.shift_code, 'time_entry', v_result
  );
end;
$$;

revoke all on function public.employee_clock_from_qr(text,text) from public, anon;
grant execute on function public.employee_clock_from_qr(text,text) to authenticated;

create or replace function public.manager_create_time_qr_terminal(
  p_company_id uuid, p_name text, p_location_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_terminal public.time_qr_terminals%rowtype;
begin
  if not private.sf_is_manager(p_company_id, true) then raise exception 'Keine Berechtigung'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'Terminalname fehlt'; end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.time_qr_terminals(
    company_id, name, location_note, token_hash, created_by, updated_by
  ) values(
    p_company_id, left(btrim(p_name),120), left(btrim(coalesce(p_location_note,'')),300),
    extensions.digest(v_token,'sha256'), auth.uid(), auth.uid()
  ) returning * into v_terminal;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    p_company_id,'TIME_QR_TERMINAL_CREATED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',true),'{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,'name',v_terminal.name,'location_note',v_terminal.location_note,
    'token',v_token,'qr_path','/qr-time.html?t='||v_token
  );
end;
$$;

revoke all on function public.manager_create_time_qr_terminal(uuid,text,text) from public, anon;
grant execute on function public.manager_create_time_qr_terminal(uuid,text,text) to authenticated;

create or replace function public.manager_list_time_qr_terminals(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id, false) then raise exception 'Keine Berechtigung'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'location_note',t.location_note,'is_active',t.is_active,
    'start_window_minutes',t.start_window_minutes,'end_window_minutes',t.end_window_minutes,
    'created_at',t.created_at,'updated_at',t.updated_at,'rotated_at',t.rotated_at,'disabled_at',t.disabled_at
  ) order by t.name),'[]'::jsonb)
  into v_result
  from public.time_qr_terminals t
  where t.company_id = p_company_id;
  return v_result;
end;
$$;

revoke all on function public.manager_list_time_qr_terminals(uuid) from public, anon;
grant execute on function public.manager_list_time_qr_terminals(uuid) to authenticated;

create or replace function public.manager_rotate_time_qr_terminal(p_terminal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_token text;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  update public.time_qr_terminals
  set token_hash=extensions.digest(v_token,'sha256'),rotated_at=clock_timestamp(),
      updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_terminal_id returning * into v_terminal;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_terminal.company_id,'TIME_QR_TERMINAL_ROTATED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active),'{}'::jsonb
  );
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'token',v_token,'qr_path','/qr-time.html?t='||v_token);
end;
$$;

revoke all on function public.manager_rotate_time_qr_terminal(uuid) from public, anon;
grant execute on function public.manager_rotate_time_qr_terminal(uuid) to authenticated;

create or replace function public.manager_set_time_qr_terminal_active(p_terminal_id uuid,p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  update public.time_qr_terminals
  set is_active=p_is_active,
      disabled_at=case when p_is_active then null else clock_timestamp() end,
      updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_terminal_id returning * into v_terminal;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_terminal.company_id,'TIME_QR_TERMINAL_STATUS_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active),'{}'::jsonb
  );
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'is_active',v_terminal.is_active);
end;
$$;

revoke all on function public.manager_set_time_qr_terminal_active(uuid,boolean) from public, anon;
grant execute on function public.manager_set_time_qr_terminal_active(uuid,boolean) to authenticated;

comment on table public.time_qr_terminals is
  'Fixed QR terminals for employee time tracking. Only SHA-256 token hashes are stored.';
comment on table public.time_qr_punches is
  'Append-only raw CLOCK_IN/CLOCK_OUT audit events from QR time tracking.';
