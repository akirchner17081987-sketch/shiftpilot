-- SchichtFunk – QR-Pilot: mehrere ausdrücklich freigegebene Test-Mitarbeiter
-- Ersetzt die Einzelauswahl je Terminal durch eine serverseitige Whitelist.
-- Bestehende Einzelzuordnungen werden kompatibel übernommen.

create table if not exists public.time_qr_pilot_employees (
  terminal_id uuid not null references public.time_qr_terminals(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (terminal_id, employee_id)
);

create index if not exists time_qr_pilot_employees_company_idx
  on public.time_qr_pilot_employees(company_id, employee_id);

alter table public.time_qr_pilot_employees enable row level security;
revoke all on table public.time_qr_pilot_employees from public, anon, authenticated;

insert into public.time_qr_pilot_employees(terminal_id, employee_id, company_id, created_by)
select t.id, t.pilot_employee_id, t.company_id, t.updated_by
from public.time_qr_terminals t
where t.pilot_employee_id is not null
on conflict (terminal_id, employee_id) do nothing;

create or replace function private.sf_validate_qr_pilot_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal_company uuid;
  v_employee public.employees%rowtype;
begin
  select t.company_id into v_terminal_company
  from public.time_qr_terminals t
  where t.id = new.terminal_id;

  if v_terminal_company is null or v_terminal_company <> new.company_id then
    raise exception 'QR-Terminal gehört nicht zum angegebenen Unternehmen';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.id = new.employee_id
    and e.company_id = new.company_id
    and e.status = 'active'
    and e.auth_user_id is not null;

  if not found then
    raise exception 'Pilot-Mitarbeiter muss aktiv sein und einen verknüpften SchichtFunk-Zugang besitzen';
  end if;

  return new;
end;
$$;
revoke all on function private.sf_validate_qr_pilot_member() from public, anon, authenticated;

drop trigger if exists time_qr_pilot_employees_validate on public.time_qr_pilot_employees;
create trigger time_qr_pilot_employees_validate
before insert or update on public.time_qr_pilot_employees
for each row execute function private.sf_validate_qr_pilot_member();

create or replace function private.sf_assert_qr_pilot_access(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  v_employee_id := private.sf_employee_id();
  if v_employee_id is null then
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

  if v_terminal.pilot_mode is not true then
    raise exception 'Die QR-Zeiterfassung ist noch nicht für den allgemeinen Betrieb freigegeben';
  end if;

  if not exists (
    select 1
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id = p.employee_id
     and e.company_id = p.company_id
     and e.status = 'active'
     and e.auth_user_id is not null
    where p.terminal_id = v_terminal.id
      and p.company_id = v_terminal.company_id
      and p.employee_id = v_employee_id
  ) then
    raise exception 'Dieses QR-Terminal ist aktuell nur für ausdrücklich freigegebene Pilot-Mitarbeiter nutzbar';
  end if;
end;
$$;
revoke all on function private.sf_assert_qr_pilot_access(text) from public, anon, authenticated;

create or replace function private.sf_enforce_qr_punch_pilot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id = new.terminal_id
    and t.company_id = new.company_id
    and t.is_active = true;

  if not found or v_terminal.pilot_mode is not true then
    raise exception 'QR-Pilotfreigabe fehlt';
  end if;

  if not exists (
    select 1
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id = p.employee_id
     and e.company_id = p.company_id
     and e.status = 'active'
     and e.auth_user_id is not null
    where p.terminal_id = new.terminal_id
      and p.company_id = new.company_id
      and p.employee_id = new.employee_id
  ) then
    raise exception 'Mitarbeiter ist für dieses QR-Terminal nicht freigegeben';
  end if;

  return new;
end;
$$;
revoke all on function private.sf_enforce_qr_punch_pilot() from public, anon, authenticated;

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
    'id',t.id,
    'name',t.name,
    'location_note',t.location_note,
    'is_active',t.is_active,
    'start_window_minutes',t.start_window_minutes,
    'end_window_minutes',t.end_window_minutes,
    'pilot_mode',t.pilot_mode,
    'pilot_employee_id',t.pilot_employee_id,
    'pilot_employee_ids',coalesce((
      select jsonb_agg(p.employee_id order by e.last_name,e.first_name,e.personnel_no)
      from public.time_qr_pilot_employees p
      join public.employees e on e.id=p.employee_id and e.company_id=p.company_id
      where p.terminal_id=t.id and p.company_id=t.company_id
    ),'[]'::jsonb),
    'pilot_employee_names',coalesce((
      select jsonb_agg(btrim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) order by e.last_name,e.first_name,e.personnel_no)
      from public.time_qr_pilot_employees p
      join public.employees e on e.id=p.employee_id and e.company_id=p.company_id
      where p.terminal_id=t.id and p.company_id=t.company_id
    ),'[]'::jsonb),
    'created_at',t.created_at,
    'updated_at',t.updated_at,
    'rotated_at',t.rotated_at,
    'disabled_at',t.disabled_at
  ) order by t.name),'[]'::jsonb)
  into v_result
  from public.time_qr_terminals t
  where t.company_id = p_company_id;

  return v_result;
end;
$$;
revoke all on function public.manager_list_time_qr_terminals(uuid) from public, anon;
grant execute on function public.manager_list_time_qr_terminals(uuid) to authenticated;

create or replace function public.manager_set_time_qr_terminal_pilot_employees(
  p_terminal_id uuid, p_employee_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_ids uuid[];
  v_current_ids uuid[];
  v_valid_count integer;
  v_expected_count integer;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id = p_terminal_id
  for update;

  if not found or not private.sf_is_manager(v_terminal.company_id, true) then
    raise exception 'Keine Berechtigung';
  end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_employee_ids,'{}'::uuid[])) as x;

  select coalesce(array_agg(p.employee_id order by p.employee_id),'{}'::uuid[])
  into v_current_ids
  from public.time_qr_pilot_employees p
  where p.terminal_id=v_terminal.id and p.company_id=v_terminal.company_id;

  if v_terminal.is_active and v_ids is distinct from v_current_ids then
    raise exception 'Pilot-Mitarbeiter können bei aktivem Terminal nicht geändert werden. Terminal zuerst deaktivieren.';
  end if;

  v_expected_count := coalesce(array_length(v_ids,1),0);
  if v_expected_count > 10 then
    raise exception 'Maximal 10 Pilot-Mitarbeiter je Terminal sind zulässig';
  end if;

  if v_expected_count > 0 then
    select count(*) into v_valid_count
    from public.employees e
    where e.id = any(v_ids)
      and e.company_id = v_terminal.company_id
      and e.status = 'active'
      and e.auth_user_id is not null;

    if v_valid_count <> v_expected_count then
      raise exception 'Alle Pilot-Mitarbeiter müssen aktiv sein, zum Unternehmen gehören und einen verknüpften SchichtFunk-Zugang besitzen';
    end if;
  end if;

  delete from public.time_qr_pilot_employees
  where terminal_id=v_terminal.id and company_id=v_terminal.company_id;

  if v_expected_count > 0 then
    insert into public.time_qr_pilot_employees(terminal_id,employee_id,company_id,created_by)
    select v_terminal.id, x, v_terminal.company_id, auth.uid()
    from unnest(v_ids) as x;
  end if;

  update public.time_qr_terminals
  set pilot_mode=true,
      pilot_employee_id=case when v_expected_count>0 then v_ids[1] else null end,
      updated_at=clock_timestamp(),
      updated_by=auth.uid()
  where id=v_terminal.id;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_terminal.company_id,'TIME_QR_TERMINAL_PILOT_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'pilot_mode',true,'pilot_employee_ids',to_jsonb(v_ids)),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,
    'name',v_terminal.name,
    'pilot_mode',true,
    'pilot_employee_ids',to_jsonb(v_ids)
  );
end;
$$;
revoke all on function public.manager_set_time_qr_terminal_pilot_employees(uuid,uuid[]) from public, anon;
grant execute on function public.manager_set_time_qr_terminal_pilot_employees(uuid,uuid[]) to authenticated;

-- Kompatibilitäts-Wrapper für vorhandene Oberflächen/Clients.
create or replace function public.manager_set_time_qr_terminal_pilot_employee(
  p_terminal_id uuid, p_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.manager_set_time_qr_terminal_pilot_employees(
    p_terminal_id,
    case when p_employee_id is null then '{}'::uuid[] else array[p_employee_id]::uuid[] end
  );
end;
$$;
revoke all on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) from public, anon;
grant execute on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) to authenticated;

create or replace function public.manager_set_time_qr_terminal_active(
  p_terminal_id uuid, p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_pilot_count integer;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id = p_terminal_id
  for update;

  if not found or not private.sf_is_manager(v_terminal.company_id, true) then
    raise exception 'Keine Berechtigung';
  end if;

  if p_is_active then
    if v_terminal.pilot_mode is not true then
      raise exception 'Allgemeine QR-Produktivfreigabe ist noch nicht aktiviert';
    end if;

    select count(*) into v_pilot_count
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id=p.employee_id
     and e.company_id=p.company_id
     and e.status='active'
     and e.auth_user_id is not null
    where p.terminal_id=v_terminal.id
      and p.company_id=v_terminal.company_id;

    if v_pilot_count < 1 then
      raise exception 'Bitte zuerst mindestens einen Pilot-Mitarbeiter freigeben';
    end if;
  end if;

  update public.time_qr_terminals
  set is_active = p_is_active,
      disabled_at = case when p_is_active then null else clock_timestamp() end,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
  where id = p_terminal_id
  returning * into v_terminal;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_terminal.company_id,'TIME_QR_TERMINAL_STATUS_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active,'pilot_mode',v_terminal.pilot_mode),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,
    'name',v_terminal.name,
    'is_active',v_terminal.is_active,
    'pilot_mode',v_terminal.pilot_mode
  );
end;
$$;
revoke all on function public.manager_set_time_qr_terminal_active(uuid,boolean) from public, anon;
grant execute on function public.manager_set_time_qr_terminal_active(uuid,boolean) to authenticated;

comment on table public.time_qr_pilot_employees is
  'Serverseitige Whitelist der ausdrücklich freigegebenen Mitarbeiter je QR-Pilotterminal.';
