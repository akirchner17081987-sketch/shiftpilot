create or replace function public.manager_set_time_qr_terminal_pilot_employee(
  p_terminal_id uuid, p_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_employee public.employees%rowtype;
begin
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  if v_terminal.is_active and p_employee_id is distinct from v_terminal.pilot_employee_id then
    raise exception 'Pilot-Mitarbeiter kann nur bei deaktiviertem QR-Terminal geändert werden';
  end if;
  if p_employee_id is not null then
    select e.* into v_employee from public.employees e
    where e.id=p_employee_id and e.company_id=v_terminal.company_id and e.status='active' and e.auth_user_id is not null;
    if not found then raise exception 'Pilot-Mitarbeiter muss aktiv sein und einen verknüpften SchichtFunk-Zugang besitzen'; end if;
  end if;
  update public.time_qr_terminals
  set pilot_mode=true,pilot_employee_id=p_employee_id,updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_terminal_id returning * into v_terminal;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_terminal.company_id,'TIME_QR_TERMINAL_PILOT_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',jsonb_build_object('name',v_terminal.name,'pilot_mode',true,'pilot_employee_id',v_terminal.pilot_employee_id),'{}'::jsonb);
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'pilot_mode',true,'pilot_employee_id',v_terminal.pilot_employee_id);
end;
$$;
revoke all on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) from public,anon;
grant execute on function public.manager_set_time_qr_terminal_pilot_employee(uuid,uuid) to authenticated;;
