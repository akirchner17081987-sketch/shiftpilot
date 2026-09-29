alter table public.time_qr_terminals
  add column if not exists vault_secret_id uuid;

comment on column public.time_qr_terminals.vault_secret_id is
  'Reference to encrypted QR terminal token stored in Supabase Vault. Normal terminal table keeps only token_hash.';

create or replace function public.manager_create_time_qr_terminal(
  p_company_id uuid,
  p_name text,
  p_location_note text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  v_secret_id uuid;
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

  v_secret_id:=vault.create_secret(
    v_token,
    'schichtfunk-qr-terminal-'||v_terminal.id::text,
    'Encrypted SchichtFunk QR terminal token for terminal '||v_terminal.id::text
  );

  update public.time_qr_terminals
  set vault_secret_id=v_secret_id,
      updated_at=clock_timestamp(),
      updated_by=auth.uid()
  where id=v_terminal.id
  returning * into v_terminal;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    p_company_id,'TIME_QR_TERMINAL_CREATED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',
    jsonb_build_object('name',v_terminal.name,'location_note',v_terminal.location_note,'is_active',false,'pilot_mode',false,'qr_recoverable',true),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,
    'name',v_terminal.name,
    'location_note',v_terminal.location_note,
    'is_active',false,
    'pilot_mode',false,
    'qr_path','/qr-time.html?t='||v_token
  );
end;
$function$;

create or replace function public.manager_rotate_time_qr_terminal(p_terminal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_token text;
  v_secret_id uuid;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=p_terminal_id
  for update;

  if not found or not private.sf_is_manager(v_terminal.company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;

  v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_secret_id:=v_terminal.vault_secret_id;

  if v_secret_id is null then
    v_secret_id:=vault.create_secret(
      v_token,
      'schichtfunk-qr-terminal-'||v_terminal.id::text,
      'Encrypted SchichtFunk QR terminal token for terminal '||v_terminal.id::text
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_token,
      'schichtfunk-qr-terminal-'||v_terminal.id::text,
      'Encrypted SchichtFunk QR terminal token for terminal '||v_terminal.id::text
    );
  end if;

  update public.time_qr_terminals
  set token_hash=extensions.digest(v_token,'sha256'),
      vault_secret_id=v_secret_id,
      rotated_at=clock_timestamp(),
      updated_at=clock_timestamp(),
      updated_by=auth.uid()
  where id=p_terminal_id
  returning * into v_terminal;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(
    v_terminal.company_id,
    'TIME_QR_TERMINAL_ROTATED',
    'time_qr_terminal',
    v_terminal.id,
    auth.uid(),
    'MANAGER',
    jsonb_build_object('name',v_terminal.name,'is_active',v_terminal.is_active,'qr_recoverable',true),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_terminal.id,
    'name',v_terminal.name,
    'qr_path','/qr-time.html?t='||v_token
  );
end;
$function$;

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

  if not v_terminal.is_active then
    raise exception 'QR-Terminal ist deaktiviert';
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

revoke all on function public.manager_get_time_qr_terminal_qr_path(uuid) from public, anon;
grant execute on function public.manager_get_time_qr_terminal_qr_path(uuid) to authenticated, service_role;

revoke all on function public.manager_create_time_qr_terminal(uuid,text,text) from public, anon;
grant execute on function public.manager_create_time_qr_terminal(uuid,text,text) to authenticated, service_role;

revoke all on function public.manager_rotate_time_qr_terminal(uuid) from public, anon;
grant execute on function public.manager_rotate_time_qr_terminal(uuid) to authenticated, service_role;