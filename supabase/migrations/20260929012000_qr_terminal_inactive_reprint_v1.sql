-- Managers may reprint an inactive terminal before reactivating it.
-- The scan endpoint still rejects inactive terminals.
create or replace function public.manager_get_time_qr_terminal_qr_path(p_terminal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_token text;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=p_terminal_id;

  if not found or not private.sf_is_manager(v_terminal.company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;

  if v_terminal.vault_secret_id is null then
    raise exception 'Aktueller QR-Code ist nicht wiederherstellbar. Bitte QR erneuern';
  end if;

  select ds.decrypted_secret into v_token
  from vault.decrypted_secrets ds
  where ds.id=v_terminal.vault_secret_id;

  if v_token is null then
    raise exception 'QR-Schlüssel konnte nicht aus dem sicheren Speicher geladen werden';
  end if;

  if extensions.digest(v_token,'sha256') <> v_terminal.token_hash then
    raise exception 'QR-Schlüsselprüfung fehlgeschlagen';
  end if;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    v_terminal.company_id,
    'TIME_QR_TERMINAL_VIEWED',
    'time_qr_terminal',
    v_terminal.id,
    auth.uid(),
    'MANAGER',
    null,
    jsonb_build_object('name',v_terminal.name,'source','vault')
  );

  return jsonb_build_object(
    'id',v_terminal.id,
    'name',v_terminal.name,
    'location_note',v_terminal.location_note,
    'is_active',v_terminal.is_active,
    'rotated_at',v_terminal.rotated_at,
    'qr_path','/qr-time.html?t='||v_token
  );
end;
$function$;

