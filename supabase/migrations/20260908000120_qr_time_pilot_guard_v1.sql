alter table public.time_qr_terminals
  add column if not exists pilot_mode boolean not null default true,
  add column if not exists pilot_employee_id uuid references public.employees(id) on delete set null;
alter table public.time_qr_terminals alter column is_active set default false;
alter table public.time_qr_terminals drop constraint if exists time_qr_terminals_pilot_activation_check;
alter table public.time_qr_terminals add constraint time_qr_terminals_pilot_activation_check check (not is_active or pilot_employee_id is not null);
create index if not exists time_qr_terminals_pilot_employee_idx on public.time_qr_terminals(company_id,pilot_employee_id) where pilot_employee_id is not null;

create or replace function private.sf_assert_qr_pilot_access(p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare v_employee_id uuid; v_terminal public.time_qr_terminals%rowtype; v_pilot public.employees%rowtype;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst mit dem persönlichen Mitarbeiterkonto anmelden'; end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Ungültiger QR-Code'; end if;
  v_employee_id:=private.sf_employee_id();
  if v_employee_id is null then raise exception 'Kein aktives Mitarbeiterkonto zugeordnet'; end if;
  select t.* into v_terminal from public.time_qr_terminals t where t.token_hash=extensions.digest(lower(p_token),'sha256') and t.is_active=true limit 1;
  if not found then raise exception 'QR-Terminal ist ungültig oder deaktiviert'; end if;
  if v_terminal.pilot_mode is not true then raise exception 'Die QR-Zeiterfassung ist noch nicht für den allgemeinen Betrieb freigegeben'; end if;
  if v_terminal.pilot_employee_id is null then raise exception 'Der QR-Pilot ist für dieses Terminal noch nicht freigegeben'; end if;
  select e.* into v_pilot from public.employees e where e.id=v_terminal.pilot_employee_id and e.company_id=v_terminal.company_id and e.status='active' and e.auth_user_id is not null;
  if not found then raise exception 'Der freigegebene Pilot-Mitarbeiter besitzt keinen aktiven, verknüpften Zugang'; end if;
  if v_pilot.id<>v_employee_id then raise exception 'Dieses QR-Terminal ist aktuell nur für den freigegebenen Pilot-Mitarbeiter nutzbar'; end if;
end;$$;
revoke all on function private.sf_assert_qr_pilot_access(text) from public,anon,authenticated;

create or replace function public.employee_qr_time_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ctx jsonb;
begin
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  return jsonb_build_object('terminal_name',v_ctx->>'terminal_name','location_note',v_ctx->>'location_note','assignment_id',v_ctx->>'assignment_id','shift_code',v_ctx->>'shift_code','planned_start',v_ctx->>'planned_start','planned_end',v_ctx->>'planned_end','planned_break_minutes',(v_ctx->>'planned_break_minutes')::integer,'action',v_ctx->>'action','state',v_ctx->>'state','clocked_in_at',v_ctx->>'clocked_in_at');
end;$$;
revoke all on function public.employee_qr_time_status(text) from public,anon;
grant execute on function public.employee_qr_time_status(text) to authenticated;

alter function public.employee_clock_from_qr(text,text) rename to employee_clock_from_qr_unchecked;
revoke all on function public.employee_clock_from_qr_unchecked(text,text) from public,anon,authenticated;
create function public.employee_clock_from_qr(p_token text,p_expected_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.sf_assert_qr_pilot_access(p_token);
  return public.employee_clock_from_qr_unchecked(p_token,p_expected_action);
end;$$;
revoke all on function public.employee_clock_from_qr(text,text) from public,anon;
grant execute on function public.employee_clock_from_qr(text,text) to authenticated;

create or replace function private.sf_enforce_qr_punch_pilot()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_employee public.employees%rowtype;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=new.terminal_id and t.company_id=new.company_id and t.is_active=true;
  if not found or v_terminal.pilot_mode is not true or v_terminal.pilot_employee_id is null then raise exception 'QR-Pilotfreigabe fehlt'; end if;
  if v_terminal.pilot_employee_id<>new.employee_id then raise exception 'Mitarbeiter ist für dieses QR-Terminal nicht freigegeben'; end if;
  select e.* into v_employee from public.employees e where e.id=new.employee_id and e.company_id=new.company_id and e.status='active' and e.auth_user_id is not null;
  if not found then raise exception 'Pilot-Mitarbeiter besitzt keinen aktiven, verknüpften Zugang'; end if;
  return new;
end;$$;
revoke all on function private.sf_enforce_qr_punch_pilot() from public,anon,authenticated;
drop trigger if exists time_qr_punches_pilot_guard on public.time_qr_punches;
create trigger time_qr_punches_pilot_guard before insert on public.time_qr_punches for each row execute function private.sf_enforce_qr_punch_pilot();

create or replace function public.manager_create_time_qr_terminal(p_company_id uuid,p_name text,p_location_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text; v_terminal public.time_qr_terminals%rowtype;
begin
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Keine Berechtigung'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Terminalname fehlt'; end if;
  v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into public.time_qr_terminals(company_id,name,location_note,token_hash,is_active,pilot_mode,pilot_employee_id,created_by,updated_by)
  values(p_company_id,left(btrim(p_name),120),left(btrim(coalesce(p_location_note,'')),300),extensions.digest(v_token,'sha256'),false,true,null,auth.uid(),auth.uid()) returning * into v_terminal;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_QR_TERMINAL_CREATED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',jsonb_build_object('name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',false,'pilot_mode',true),'{}'::jsonb);
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',false,'pilot_mode',true,'token',v_token,'qr_path','/qr-time.html?t='||v_token);
end;$$;
revoke all on function public.manager_create_time_qr_terminal(uuid,text,text) from public,anon;
grant execute on function public.manager_create_time_qr_terminal(uuid,text,text) to authenticated;

create or replace function public.manager_list_time_qr_terminals(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'location_note',t.location_note,'is_active',t.is_active,'start_window_minutes',t.start_window_minutes,'end_window_minutes',t.end_window_minutes,'pilot_mode',t.pilot_mode,'pilot_employee_id',t.pilot_employee_id,'pilot_employee_name',case when e.id is null then null else btrim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) end,'created_at',t.created_at,'updated_at',t.updated_at,'rotated_at',t.rotated_at,'disabled_at',t.disabled_at) order by t.name),'[]'::jsonb) into v_result
  from public.time_qr_terminals t left join public.employees e on e.id=t.pilot_employee_id and e.company_id=t.company_id where t.company_id=p_company_id;
  return v_result;
end;$$;
revoke all on function public.manager_list_time_qr_terminals(uuid) from public,anon;
grant execute on function public.manager_list_time_qr_terminals(uuid) to authenticated;

create or replace function public.manager_list_time_qr_pilot_candidates(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'display_name',btrim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),'personnel_no',e.personnel_no) order by e.last_name,e.first_name,e.personnel_no),'[]'::jsonb) into v_result
  from public.employees e where e.company_id=p_company_id and e.status='active' and e.auth_user_id is not null;
  return v_result;
end;$$;
revoke all on function public.manager_list_time_qr_pilot_candidates(uuid) from public,anon;
grant execute on function public.manager_list_time_qr_pilot_candidates(uuid) to authenticated;

create or replace function public.manager_set_time_qr_terminal_pilot_employee(p_terminal_id uuid,p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_employee public.employees%rowtype;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  if p_employee_id is null then
    if v_terminal.is_active then raise exception 'Aktives Pilot-Terminal kann nicht ohne Pilot-Mitarbeiter gespeichert werden'; end if;
  else
    select e.* into v_employee from public.employees e where e.id=p_employee_id and e.company_id=v_terminal.company_id and e.status='active' and e.auth_user_id is not null;
    if not found then raise exception 'Pilot-Mitarbeiter muss aktiv sein und einen verknüpften SchichtFunk-Zugang besitzen'; end if;
  end if;
  update public.time_qr_terminals set pilot_mode=true,pilot_employee_id=p_employee_id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_terminal_id returning * into v_terminal;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_terminal.company_id,'TIME_QR_TERMINAL_PILOT_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',jsonb_build_object('name',v_terminal.name,'pilot_mode',true,'pilot_employee_id',v_terminal.pilot_employee_id),'{}'::jsonb);
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'pilot_mode',true,'pilot_employee_id',v_terminal.pilot_employee_id);
end;$$;
revoke all on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) from public,anon;
grant execute on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) to authenticated;

create or replace function public.manager_set_time_qr_terminal_active(p_terminal_id uuid,p_is_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_employee public.employees%rowtype;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  if p_is_active then
    if v_terminal.pilot_mode is not true then raise exception 'Allgemeine QR-Produktivfreigabe ist noch nicht aktiviert'; end if;
    if v_terminal.pilot_employee_id is null then raise exception 'Bitte zuerst einen Pilot-Mitarbeiter freigeben'; end if;
    select e.* into v_employee from public.employees e where e.id=v_terminal.pilot_employee_id and e.company_id=v_terminal.company_id and e.status='active' and e.auth_user_id is not null;
    if not found then raise exception 'Der Pilot-Mitarbeiter ist nicht mehr aktiv oder besitzt keinen verknüpften Zugang'; end if;
  end if;
  update public.time_qr_terminals set is_active=p_is_active,disabled_at=case when p_is_active then null else clock_timestamp() end,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_terminal_id returning * into v_terminal;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_terminal.company_id,'TIME_QR_TERMINAL_STATUS_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active,'pilot_mode',v_terminal.pilot_mode,'pilot_employee_id',v_terminal.pilot_employee_id),'{}'::jsonb);
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'is_active',v_terminal.is_active,'pilot_mode',v_terminal.pilot_mode,'pilot_employee_id',v_terminal.pilot_employee_id);
end;$$;
revoke all on function public.manager_set_time_qr_terminal_active(uuid,boolean) from public,anon;
grant execute on function public.manager_set_time_qr_terminal_active(uuid,boolean) to authenticated;
comment on column public.time_qr_terminals.pilot_mode is 'True while QR time tracking is restricted to a specifically assigned pilot employee.';
comment on column public.time_qr_terminals.pilot_employee_id is 'Single employee allowed to use this QR terminal during controlled pilot rollout.';;
