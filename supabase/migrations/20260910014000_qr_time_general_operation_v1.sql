-- SchichtFunk: QR-Zeiterfassung vom kontrollierten Pilotbetrieb in einen wählbaren
-- Pilot-/Allgemeinbetrieb überführen. Bestehende Pilot-Terminals bleiben Pilot.

create or replace function private.sf_assert_qr_pilot_access(p_token text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
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

  select e.id into v_employee_id
  from public.employees e
  where e.company_id=v_terminal.company_id
    and e.auth_user_id=(select auth.uid())
    and e.status='active'
  order by e.id
  limit 1;
  if v_employee_id is null then
    raise exception 'Kein aktives Mitarbeiterkonto für dieses Unternehmen zugeordnet';
  end if;

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
$function$;

create or replace function private.sf_enforce_qr_punch_pilot()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
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
$function$;

create or replace function public.manager_create_time_qr_terminal(
  p_company_id uuid,
  p_name text,
  p_location_note text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_terminal public.time_qr_terminals%rowtype;
begin
  if not private.sf_is_manager(p_company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;
  if btrim(coalesce(p_name,''))='' then
    raise exception 'Terminalname fehlt';
  end if;

  v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into public.time_qr_terminals(
    company_id,name,location_note,token_hash,is_active,pilot_mode,pilot_employee_id,created_by,updated_by
  ) values(
    p_company_id,left(btrim(p_name),120),left(btrim(coalesce(p_location_note,'')),300),
    extensions.digest(v_token,'sha256'),false,false,null,auth.uid(),auth.uid()
  ) returning * into v_terminal;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    p_company_id,'TIME_QR_TERMINAL_CREATED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',false,'pilot_mode',false),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,'name',v_terminal.name,'location_note',v_terminal.location_note,
    'is_active',false,'pilot_mode',false,'token',v_token,'qr_path','/qr-time.html?t='||v_token
  );
end;
$function$;

create or replace function public.manager_set_time_qr_terminal_active(
  p_terminal_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_pilot_count integer;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=p_terminal_id
  for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;

  if p_is_active and v_terminal.pilot_mode is true then
    select count(*) into v_pilot_count
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id=p.employee_id
     and e.company_id=p.company_id
     and e.status='active'
     and e.auth_user_id is not null
    where p.terminal_id=v_terminal.id
      and p.company_id=v_terminal.company_id;
    if v_pilot_count<1 then
      raise exception 'Bitte zuerst mindestens einen Pilot-Mitarbeiter freigeben';
    end if;
  end if;

  update public.time_qr_terminals
  set is_active=p_is_active,
      disabled_at=case when p_is_active then null else clock_timestamp() end,
      updated_at=clock_timestamp(),
      updated_by=auth.uid()
  where id=p_terminal_id
  returning * into v_terminal;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    v_terminal.company_id,'TIME_QR_TERMINAL_STATUS_CHANGED','time_qr_terminal',v_terminal.id,
    auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active,'pilot_mode',v_terminal.pilot_mode),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,'name',v_terminal.name,'is_active',v_terminal.is_active,'pilot_mode',v_terminal.pilot_mode
  );
end;
$function$;

create or replace function public.manager_set_time_qr_terminal_mode(
  p_terminal_id uuid,
  p_pilot_mode boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=p_terminal_id
  for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_terminal.is_active then
    raise exception 'Betriebsart kann nur bei deaktiviertem QR-Terminal geändert werden';
  end if;

  update public.time_qr_terminals
  set pilot_mode=coalesce(p_pilot_mode,false),
      updated_at=clock_timestamp(),
      updated_by=auth.uid()
  where id=p_terminal_id
  returning * into v_terminal;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    v_terminal.company_id,'TIME_QR_TERMINAL_MODE_CHANGED','time_qr_terminal',v_terminal.id,
    auth.uid(),'MANAGER',
    jsonb_build_object(
      'name',v_terminal.name,
      'pilot_mode',v_terminal.pilot_mode,
      'mode',case when v_terminal.pilot_mode then 'PILOT' else 'GENERAL' end
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,'name',v_terminal.name,'pilot_mode',v_terminal.pilot_mode,
    'mode',case when v_terminal.pilot_mode then 'PILOT' else 'GENERAL' end
  );
end;
$function$;

revoke all on function public.manager_set_time_qr_terminal_mode(uuid,boolean) from public;
revoke all on function public.manager_set_time_qr_terminal_mode(uuid,boolean) from anon;
grant execute on function public.manager_set_time_qr_terminal_mode(uuid,boolean) to authenticated;
grant execute on function public.manager_set_time_qr_terminal_mode(uuid,boolean) to service_role;

revoke all on function public.manager_create_time_qr_terminal(uuid,text,text) from public;
revoke all on function public.manager_create_time_qr_terminal(uuid,text,text) from anon;
grant execute on function public.manager_create_time_qr_terminal(uuid,text,text) to authenticated;
grant execute on function public.manager_create_time_qr_terminal(uuid,text,text) to service_role;

revoke all on function public.manager_set_time_qr_terminal_active(uuid,boolean) from public;
revoke all on function public.manager_set_time_qr_terminal_active(uuid,boolean) from anon;
grant execute on function public.manager_set_time_qr_terminal_active(uuid,boolean) to authenticated;
grant execute on function public.manager_set_time_qr_terminal_active(uuid,boolean) to service_role;
