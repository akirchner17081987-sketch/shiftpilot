-- Only an owner or admin can remove an inactive terminal without time punches.
-- The audit trail survives; the terminal token is removed from Vault.
create or replace function public.manager_delete_time_qr_terminal(p_terminal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_deleted integer;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=p_terminal_id
  for update;

  if not found or not private.sf_is_manager(v_terminal.company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_terminal.is_active then
    raise exception 'Bitte das QR-Terminal zuerst deaktivieren';
  end if;
  if exists(select 1 from public.time_qr_punches p where p.terminal_id=v_terminal.id) then
    raise exception 'Dieses Terminal hat Zeitbuchungen und kann nicht gelöscht werden';
  end if;
  if v_terminal.vault_secret_id is not null and exists(
    select 1 from public.time_qr_terminals t
    where t.vault_secret_id=v_terminal.vault_secret_id and t.id<>v_terminal.id
  ) then
    raise exception 'QR-Schlüssel ist einem weiteren Terminal zugeordnet';
  end if;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,metadata)
  values(
    v_terminal.company_id,'TIME_QR_TERMINAL_DELETED','time_qr_terminal',v_terminal.id,
    auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',false),
    jsonb_build_object('source','manager_terminal_admin')
  );

  delete from public.time_qr_terminals where id=v_terminal.id;
  get diagnostics v_deleted=row_count;
  if v_deleted<>1 then raise exception 'QR-Terminal konnte nicht gelöscht werden'; end if;

  if v_terminal.vault_secret_id is not null then
    delete from vault.secrets
    where id=v_terminal.vault_secret_id
      and name='schichtfunk-qr-terminal-'||v_terminal.id::text;
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'QR-Schlüssel konnte nicht entfernt werden'; end if;
  end if;

  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'deleted',true);
end;
$function$;

revoke all on function public.manager_delete_time_qr_terminal(uuid) from public,anon;
grant execute on function public.manager_delete_time_qr_terminal(uuid) to authenticated,service_role;
