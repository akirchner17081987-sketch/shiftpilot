-- Enforce the reviewed access matrix at database function and table boundaries.
-- Ordinary employee submissions and browser-independent QR punches keep their own authorization.
create or replace function private.sf_assert_company_admin_mfa(p_company_id uuid,p_action text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.company_members m
  where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='ACTIVE'
  and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')
  and not 'read_only'=any(m.extra_permissions)) then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2(p_action);
end $$;
revoke all on function private.sf_assert_company_admin_mfa(uuid,text) from public,anon,authenticated;

create or replace function private.can_manage_company_users(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.company_members m
  where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='ACTIVE'
  and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')) then return false; end if;
 perform private.sf_assert_aal2('manage_company_users');
 return true;
end $$;

-- Protect old direct Data API paths too. Claim RPCs run with their separately checked definer.
create policy sf_invite_admin_mfa on public.employee_access_invites as restrictive
for all to authenticated using(private.can_manage_company_users(company_id))
with check(private.can_manage_company_users(company_id));
-- Administrators cannot bypass protected admin invitations through direct DELETE.
create policy sf_admin_invite_delete_protected on public.company_member_invites as restrictive
for delete to authenticated using(
 not (access_role='ADMIN' or role='ADMIN') or exists(select 1 from public.company_members m
 where m.company_id=company_member_invites.company_id and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='OWNER'));
create policy sf_datev_settings_mfa on public.datev_lodas_settings as restrictive
for all to authenticated using(private.can_manage_company_users(company_id))
with check(private.can_manage_company_users(company_id));
create policy sf_datev_rules_mfa on public.datev_lodas_rules as restrictive
for all to authenticated using(private.can_manage_company_users(company_id))
with check(private.can_manage_company_users(company_id));

create or replace function private.sf_authorize_sensitive_report(p_company_id uuid,p_month date,p_employee_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare r text;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,p_action);
 if p_employee_id is not null and not exists(select 1 from public.employees e where e.company_id=p_company_id and e.id=p_employee_id) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;
 select role into r from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 values(p_company_id,'SENSITIVE_REPORT_AUTHORIZED','time_report',coalesce(p_employee_id,p_company_id),auth.uid(),r,
 jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,'employeeId',p_employee_id,'action',p_action,'serverAuthorized',true));
end $$;
revoke all on function private.sf_authorize_sensitive_report(uuid,date,uuid,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.manager_create_time_qr_terminal(p_company_id uuid, p_name text, p_location_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_secret_id uuid;
  v_terminal public.time_qr_terminals%rowtype;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'manager_create_time_qr_terminal');
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

CREATE OR REPLACE FUNCTION public.manager_rotate_time_qr_terminal(p_terminal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_token text;
  v_secret_id uuid;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_rotate_time_qr_terminal');
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

CREATE OR REPLACE FUNCTION public.manager_set_time_qr_terminal_active(p_terminal_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_pilot_count integer;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_set_time_qr_terminal_active');
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

CREATE OR REPLACE FUNCTION public.manager_set_time_qr_terminal_mode(p_terminal_id uuid, p_pilot_mode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_set_time_qr_terminal_mode');
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

CREATE OR REPLACE FUNCTION public.manager_set_time_qr_terminal_pilot_employees(p_terminal_id uuid, p_employee_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_terminal public.time_qr_terminals%rowtype; v_ids uuid[]; v_current_ids uuid[]; v_valid_count integer; v_expected_count integer;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_set_time_qr_terminal_pilot_employees');
  select t.* into v_terminal from public.time_qr_terminals t where t.id=p_terminal_id for update;
  if not found or not private.sf_is_manager(v_terminal.company_id,true) then raise exception 'Keine Berechtigung'; end if;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_ids from unnest(coalesce(p_employee_ids,'{}'::uuid[])) as x;
  select coalesce(array_agg(p.employee_id order by p.employee_id),'{}'::uuid[]) into v_current_ids from public.time_qr_pilot_employees p where p.terminal_id=v_terminal.id and p.company_id=v_terminal.company_id;
  if v_terminal.is_active and v_ids is distinct from v_current_ids then raise exception 'Pilot-Mitarbeiter können bei aktivem Terminal nicht geändert werden. Terminal zuerst deaktivieren.'; end if;
  v_expected_count:=coalesce(array_length(v_ids,1),0);
  if v_expected_count>10 then raise exception 'Maximal 10 Pilot-Mitarbeiter je Terminal sind zulässig'; end if;
  if v_expected_count>0 then
    select count(*) into v_valid_count from public.employees e where e.id=any(v_ids) and e.company_id=v_terminal.company_id and e.status='active' and e.auth_user_id is not null;
    if v_valid_count<>v_expected_count then raise exception 'Alle Pilot-Mitarbeiter müssen aktiv sein, zum Unternehmen gehören und einen verknüpften SchichtFunk-Zugang besitzen'; end if;
  end if;
  delete from public.time_qr_pilot_employees where terminal_id=v_terminal.id and company_id=v_terminal.company_id;
  if v_expected_count>0 then
    insert into public.time_qr_pilot_employees(terminal_id,employee_id,company_id,created_by)
    select v_terminal.id,x,v_terminal.company_id,auth.uid() from unnest(v_ids) as x;
  end if;
  update public.time_qr_terminals set pilot_mode=true,pilot_employee_id=case when v_expected_count>0 then v_ids[1] else null end,updated_at=clock_timestamp(),updated_by=auth.uid() where id=v_terminal.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_terminal.company_id,'TIME_QR_TERMINAL_PILOT_CHANGED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',jsonb_build_object('name',v_terminal.name,'pilot_mode',true,'pilot_employee_ids',to_jsonb(v_ids)),'{}'::jsonb);
  return jsonb_build_object('id',v_terminal.id,'name',v_terminal.name,'pilot_mode',true,'pilot_employee_ids',to_jsonb(v_ids));
end;$function$;

CREATE OR REPLACE FUNCTION public.manager_delete_time_qr_terminal(p_terminal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_deleted integer;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_delete_time_qr_terminal');
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
  if exists(select 1 from public.time_qr_punches p where p.terminal_id=v_terminal.id)
    or exists(select 1 from public.time_qr_independent_shifts s where s.terminal_id=v_terminal.id) then
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

CREATE OR REPLACE FUNCTION public.manager_get_time_qr_terminal_qr_path(p_terminal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_token text;
begin
 perform private.sf_assert_company_admin_mfa((select company_id from public.time_qr_terminals where id=p_terminal_id),'manager_get_time_qr_terminal_qr_path');
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
  values(v_terminal.company_id,'TIME_QR_TERMINAL_VIEWED','time_qr_terminal',v_terminal.id,auth.uid(),'MANAGER',null,jsonb_build_object('name',v_terminal.name,'source','vault'));
  return jsonb_build_object(
    'id',v_terminal.id,'name',v_terminal.name,
    'location_note',v_terminal.location_note,
    'is_active',v_terminal.is_active,
    'rotated_at',v_terminal.rotated_at,
    'qr_path','/qr-time.html?t='||v_token
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.manager_create_time_qr_terminal_at_site(p_company_id uuid, p_name text, p_location_note text, p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'manager_create_time_qr_terminal_at_site');
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Keine Berechtigung zur Terminalverwaltung.'; end if;
 if p_site_id is not null and not exists(select 1 from public.company_locations where company_id=p_company_id and id=p_site_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
 result:=public.manager_create_time_qr_terminal(p_company_id,p_name,p_location_note);
 update public.time_qr_terminals set site_id=p_site_id where id=(result->>'id')::uuid and company_id=p_company_id;
 return result||jsonb_build_object('site_id',p_site_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.manager_set_time_qr_terminal_site(p_company_id uuid, p_terminal_id uuid, p_site_id uuid, p_expected_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.time_qr_terminals%rowtype; oldv jsonb;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'manager_set_time_qr_terminal_site');
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Keine Berechtigung zur Terminalverwaltung.'; end if;
 select * into t from public.time_qr_terminals where company_id=p_company_id and id=p_terminal_id for update;
 if not found then raise exception using errcode='42501',message='Terminal nicht gefunden.'; end if;
 if t.site_id is distinct from p_expected_site_id then raise exception using errcode='40001',message='Die Standortzuordnung wurde inzwischen geändert. Bitte neu laden.'; end if;
 if p_site_id is not null and p_site_id is distinct from t.site_id and not exists(select 1 from public.company_locations where company_id=p_company_id and id=p_site_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
 oldv:=jsonb_build_object('name',t.name,'site_id',t.site_id);
 update public.time_qr_terminals set site_id=p_site_id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=t.id and company_id=p_company_id;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) select p_company_id,'COMPANY_QR_LOCATION_UPDATED','time_qr_terminal',t.id,auth.uid(),cm.role,oldv,jsonb_build_object('name',t.name,'site_id',p_site_id),jsonb_build_object('backendCaptured',true) from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
 return jsonb_build_object('id',t.id,'site_id',p_site_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.authorize_datev_lodas_export(p_company_id uuid, p_month date, p_row_count integer, p_content_sha256 text, p_expected_closure_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_revision integer;
  v_event_id uuid;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'authorize_datev_lodas_export');
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  if p_company_id is null then
    raise exception 'Mandant fehlt';
  end if;

  if p_month is null or p_month <> v_month then
    raise exception 'Ungueltiger Abrechnungsmonat';
  end if;

  if coalesce(p_row_count, 0) < 1 or p_row_count > 100000 then
    raise exception 'Der DATEV-Export muss zwischen 1 und 100000 Bewegungszeilen enthalten';
  end if;

  if coalesce(p_content_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungueltige DATEV-Dateipruefsumme';
  end if;

  if coalesce(p_expected_closure_revision, 0) < 1 then
    raise exception 'Ungueltige Monatsabschluss-Revision';
  end if;

  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = v_uid
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'ADMIN')
  limit 1;

  if v_role is null then
    raise exception 'Nicht berechtigt';
  end if;

  select c.revision
    into v_revision
  from public.time_month_closures c
  where c.company_id = p_company_id
    and c.month_start = v_month
    and c.status = 'CLOSED';

  if v_revision is null then
    raise exception 'DATEV-Export ist nur fuer abgeschlossene Monate zulaessig';
  end if;

  if v_revision <> p_expected_closure_revision then
    raise exception 'Der Monatsabschluss wurde seit der Vorpruefung geaendert';
  end if;

  insert into public.audit_events(
    company_id,
    event_type,
    entity_type,
    entity_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    metadata
  )
  values (
    p_company_id,
    'DATEV_LODAS_EXPORTED',
    'TIME_MONTH',
    p_company_id,
    v_uid,
    v_role,
    '{}'::jsonb,
    jsonb_build_object(
      'monthStart', v_month,
      'rowCount', p_row_count,
      'closureRevision', v_revision
    ),
    jsonb_build_object(
      'format', 'LODAS',
      'versionSst', '1.0',
      'manualEdition', '94/2026-06',
      'sha256', p_content_sha256,
      'serverAuthorized', true
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_log_datev_lodas_export(p_company_id uuid, p_month date, p_row_count integer, p_content_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_revision integer:=0;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'manager_log_datev_lodas_export');
  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN') limit 1;
  if v_role is null then raise exception 'Nicht berechtigt'; end if;

  if not exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED'
  ) then raise exception 'DATEV-Export ist nur für abgeschlossene Monate zulässig'; end if;

  select c.revision into v_revision from public.time_month_closures c
  where c.company_id=p_company_id and c.month_start=v_month;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(
    p_company_id,'DATEV_LODAS_EXPORTED','TIME_MONTH',p_company_id,auth.uid(),v_role,
    '{}'::jsonb,
    jsonb_build_object('monthStart',v_month,'rowCount',greatest(coalesce(p_row_count,0),0),'closureRevision',coalesce(v_revision,0)),
    jsonb_build_object('format','LODAS','versionSst','1.0','manualEdition','94/2026-06','sha256',left(coalesce(p_content_sha256,''),64))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_time_report_bundle(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_snapshot jsonb; v_tz text; v_state text; v_employees jsonb; v_details jsonb; v_holidays jsonb; v_company jsonb;
begin
 perform private.sf_authorize_sensitive_report(p_company_id,p_month,p_employee_id,'manager_time_report_bundle');
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  if p_employee_id is not null and not exists(select 1 from public.employees where id=p_employee_id and company_id=p_company_id) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED';
  if v_snapshot is not null then
    v_snapshot:=coalesce(v_snapshot->'report',v_snapshot);
    if p_employee_id is not null then
      v_snapshot:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
      v_snapshot:=jsonb_set(v_snapshot,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
    end if;
    return private.sf_absence_payload_for_role(p_company_id, v_snapshot);
  end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=p_company_id;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_employees
    from private.sf_time_account_rows(p_company_id,v_month,p_employee_id) r;
  select coalesce(to_jsonb(c),'{}'::jsonb) into v_company from public.companies c where c.id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.employee_name,x.work_date),'[]'::jsonb) into v_details
  from (
    select e.id employee_id,trim(concat_ws(' ',e.first_name,e.last_name)) employee_name,
      coalesce(e.personnel_no,'') personnel_no,g.day::date work_date,
      coalesce(s.shift_codes,'') shift_codes,coalesce(s.planned_times,'') planned_times,
      case when extract(isodow from g.day) between 1 and 5 and h.name is null
        then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end target_minutes,
      coalesce((select string_agg(to_char(lower(x.paid_range) at time zone v_tz,'HH24:MI')||'–'||to_char(upper(x.paid_range) at time zone v_tz,'HH24:MI'),', ' order by lower(x.paid_range)) from private.sf_paid_time_ranges(p_company_id,e.id,g.day::date::timestamp at time zone v_tz,(g.day::date+1)::timestamp at time zone v_tz) x),s.actual_times,'') actual_times,private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date) confirmed_actual_minutes,
      coalesce(a.absence_types,'') absence_types,
      private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state) absence_credit_minutes,
      coalesce(h.name,'') holiday_name,concat_ws(', ',nullif(s.time_statuses,''),case when exists(select 1 from public.time_qr_independent_shifts q where q.company_id=p_company_id and q.employee_id=e.id and q.started_at<(g.day::date+1)::timestamp at time zone v_tz and coalesce(q.ended_at,statement_timestamp())>g.day::date::timestamp at time zone v_tz) then 'QR' end) time_statuses,
      private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date)+private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state)-
        case when extract(isodow from g.day) between 1 and 5 and h.name is null
          then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end day_balance_minutes
    from public.employees e
    cross join generate_series(v_month,v_end,interval '1 day') g(day)
    left join public.time_account_settings cfg on cfg.company_id=e.company_id
    left join private.sf_public_holidays(extract(year from v_month)::integer,v_state) h on h.holiday_date=g.day::date
    left join lateral (
      select string_agg(distinct sa.shift_code,', ' order by sa.shift_code) shift_codes,
        string_agg(to_char(sa.starts_at,'HH24:MI')||'-'||to_char(sa.ends_at,'HH24:MI'),', ' order by to_char(sa.starts_at,'HH24:MI')) planned_times,
        string_agg(case when te.actual_start is not null then to_char(te.actual_start,'HH24:MI')||'-'||to_char(te.actual_end,'HH24:MI') end,', ' order by to_char(te.actual_start,'HH24:MI')) actual_times,
        string_agg(distinct coalesce(te.status,'open'),', ' order by coalesce(te.status,'open')) time_statuses,
        coalesce(sum(case when te.status='confirmed' then greatest(0,
          round(extract(epoch from (te.actual_end-te.actual_start))/60)::integer-te.break_minutes) else 0 end),0)::integer confirmed_minutes
      from public.shift_assignments sa left join public.time_entries te on te.assignment_id=sa.id
      where sa.employee_id=e.id and sa.company_id=e.company_id and sa.status<>'CANCELLED' and sa.starts_at::date=g.day::date
    ) s on true
    left join lateral (
      select string_agg(distinct ab.absence_type,', ' order by ab.absence_type) absence_types
      from public.absences ab where ab.employee_id=e.id and ab.company_id=e.company_id
        and ab.status in ('Genehmigt','Erfasst','APPROVED') and g.day::date between ab.start_date and ab.end_date
    ) a on true
    where e.company_id=p_company_id and e.status='active'
      and (p_employee_id is null or e.id=p_employee_id)
      and g.day::date>=coalesce(e.start_date,g.day::date)
      and g.day::date<=coalesce(e.contract_end,g.day::date)
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from v_month)::integer,v_state) h
    where h.holiday_date between v_month and v_end;
  return private.sf_absence_payload_for_role(p_company_id, jsonb_build_object('company',v_company,'month_start',v_month,'federal_state',v_state,
    'employees',v_employees,'details',v_details,'holidays',v_holidays));
end;
$function$;

CREATE OR REPLACE FUNCTION private.manager_time_report_bundle_snapshot_impl(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_result jsonb;
begin
 perform private.sf_authorize_sensitive_report(p_company_id,p_month,p_employee_id,'manager_time_report_bundle_snapshot_impl');
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_employee_id is not null and not exists(select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id) then
    raise exception 'Mitarbeiter gehört nicht zum Unternehmen';
  end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is null then
    return private.sf_absence_payload_for_role(p_company_id, public.manager_time_report_bundle_live(p_company_id,v_month,p_employee_id));
  end if;
  if p_employee_id is null then
    return private.sf_absence_payload_for_role(p_company_id, v_snapshot || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED')));
  end if;
  v_result:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  v_result:=jsonb_set(v_result,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  return private.sf_absence_payload_for_role(p_company_id, v_result || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED')));
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_save_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_old jsonb; v_new jsonb;
begin
  select * into v_assignment from public.shift_assignments where id=p_assignment_id for update;
  if not found or not private.sf_can_manage_time(v_assignment.company_id) then raise exception 'Nicht berechtigt'; end if;
if not private.sf_has_access_permission(v_assignment.company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
 perform private.sf_assert_aal2('manager_save_time_entry');
 if p_confirm and not private.sf_has_access_permission(v_assignment.company_id,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  select to_jsonb(te) into v_old from public.time_entries te where te.assignment_id=p_assignment_id;
  if v_old is not null and (v_old->>'actual_start' is not null)
    and ((v_old->>'actual_start')::timestamptz,(v_old->>'actual_end')::timestamptz,coalesce((v_old->>'break_minutes')::integer,0))
      is distinct from (p_actual_start,p_actual_end,p_break_minutes)
    and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Bitte die Zeitkorrektur mit mindestens drei Zeichen begründen'; end if;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    case when p_confirm then 'confirmed' else 'recorded' end,coalesce(p_note,''),'MANAGER','',
    case when p_confirm then coalesce((select submitted_at from public.time_entries where assignment_id=p_assignment_id),now()) else null end,
    case when p_confirm then auth.uid() else null end,case when p_confirm then now() else null end,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,status=excluded.status,
    manager_note=excluded.manager_note,source='MANAGER',correction_note='',
    confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,updated_at=now(),updated_by=auth.uid(),
    version=public.time_entries.version+1;
  select to_jsonb(te) into v_new from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_assignment.company_id,case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_old,v_new,jsonb_build_object('reason',btrim(coalesce(p_note,''))));
  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_review_time_entry(p_assignment_id uuid, p_decision text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_result jsonb;
begin
  select sa.company_id into v_company from public.shift_assignments sa where sa.id=p_assignment_id;
  if v_company is null or not private.sf_can_manage_time(v_company) then raise exception 'Nicht berechtigt'; end if;
if not private.sf_has_access_permission(v_company,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
 perform private.sf_assert_aal2('manager_review_time_entry');
  if private.sf_is_time_month_closed(v_company,(select actual_start::date from public.time_entries where assignment_id=p_assignment_id)) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  if upper(coalesce(p_decision,'')) not in ('CONFIRM','CORRECTION') then raise exception 'Ungueltige Entscheidung'; end if;
  if upper(p_decision)='CORRECTION' and length(trim(coalesce(p_comment,'')))<3 then
    raise exception 'Bitte einen Korrekturhinweis angeben';
  end if;
  update public.time_entries set
    status=case when upper(p_decision)='CONFIRM' then 'confirmed' else 'correction_requested' end,
    manager_note=case when upper(p_decision)='CONFIRM' then coalesce(p_comment,'') else manager_note end,
    correction_note=case when upper(p_decision)='CORRECTION' then p_comment else '' end,
    confirmed_by=case when upper(p_decision)='CONFIRM' then auth.uid() else null end,
    confirmed_at=case when upper(p_decision)='CONFIRM' then now() else null end,
    correction_requested_by=case when upper(p_decision)='CORRECTION' then auth.uid() else null end,
    correction_requested_at=case when upper(p_decision)='CORRECTION' then now() else null end,
    updated_at=now(),updated_by=auth.uid(),version=version+1
  where assignment_id=p_assignment_id returning to_jsonb(time_entries.*) into v_result;
  if v_result is null then raise exception 'Zeiteintrag nicht gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,case when upper(p_decision)='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_result,jsonb_build_object('comment',coalesce(p_comment,'')));
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_manager_correct_qr_independent_shift(p_company_id uuid, p_shift_id uuid, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_reason text, p_expected_revision text, p_breaks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shift public.time_qr_independent_shifts%rowtype;
  v_old jsonb;v_new jsonb;v_pauses jsonb;v_prepared jsonb:='[]'::jsonb;v_pause jsonb;
  v_start timestamptz;v_end timestamptz;v_last_end timestamptz;v_number integer;
  v_month date;v_timezone text;v_role text;
begin
  if auth.uid() is null or not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berechtigung'; end if;
if not private.sf_has_access_permission(p_company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
 perform private.sf_assert_aal2('sf_manager_correct_qr_independent_shift');
  if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Bitte eine Begründung mit 3 bis 1.000 Zeichen angeben'; end if;
  if p_started_at is null or p_ended_at is null or not isfinite(p_started_at) or not isfinite(p_ended_at)
     or p_ended_at<=p_started_at or p_ended_at>clock_timestamp() then
    raise exception 'Bitte einen tatsächlichen Beginn und ein späteres, bereits vergangenes Dienstende angeben';
  end if;
  select * into v_shift from public.time_qr_independent_shifts where id=p_shift_id and company_id=p_company_id;
  if not found then raise exception 'QR-Buchung nicht gefunden'; end if;
  -- Same lock as employee punches: a simultaneous pause or clock-out cannot be lost.
  perform pg_advisory_xact_lock(hashtextextended(v_shift.employee_id::text,0));
  select * into v_shift from public.time_qr_independent_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found then raise exception 'QR-Buchung nicht gefunden'; end if;
  v_old:=private.sf_qr_independent_snapshot(p_shift_id);
  if p_expected_revision is null or p_expected_revision<>v_old->>'revision' then
    raise exception 'Die Buchung wurde inzwischen geändert. Bitte schließen und erneut öffnen';
  end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=p_company_id;
  -- Protect every month touched by either the old or the corrected interval.
  -- Use the same month lock as manager_close_time_month; do not silently reopen.
  for v_month in
    select distinct date_trunc('month',g)::date from (
      select generate_series(date_trunc('month',v_shift.started_at at time zone v_timezone),
        date_trunc('month',(coalesce(v_shift.ended_at,p_ended_at)-interval '1 microsecond') at time zone v_timezone),interval '1 month') g
      union all
      select generate_series(date_trunc('month',p_started_at at time zone v_timezone),
        date_trunc('month',(p_ended_at-interval '1 microsecond') at time zone v_timezone),interval '1 month')
    ) months order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||v_month::text,0));
    if exists(select 1 from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED') then
      raise exception 'Der Zeitmonat % ist abgeschlossen. Bitte zuerst durch Inhaber oder Administratoren wieder öffnen',to_char(v_month,'MM/YYYY');
    end if;
  end loop;
  if exists(select 1 from public.time_qr_independent_shifts s where s.employee_id=v_shift.employee_id and s.id<>p_shift_id
    and tstzrange(s.started_at,s.ended_at,'[)')&&tstzrange(p_started_at,p_ended_at,'[)')) then
    raise exception 'Die korrigierte Zeit überschneidet sich mit einer anderen QR-Buchung';
  end if;
  v_pauses:=coalesce(p_breaks,v_old->'breaks');
  if jsonb_typeof(v_pauses)<>'array' or jsonb_array_length(v_pauses)<>jsonb_array_length(v_old->'breaks') then
    raise exception 'Bitte alle vorhandenen Pausen vollständig übergeben';
  end if;
  if exists(select 1 from jsonb_array_elements(v_pauses) x where jsonb_typeof(x)<>'object'
    or coalesce(x->>'number','')!~'^(10|[1-9])$') then raise exception 'Ungültige Pause'; end if;
  if (select count(distinct (x->>'number')::integer) from jsonb_array_elements(v_pauses) x)<>jsonb_array_length(v_pauses) then
    raise exception 'Eine Pause wurde doppelt übergeben';
  end if;
  for v_pause in select x from jsonb_array_elements(v_pauses) x order by (x->>'number')::integer loop
    v_number:=(v_pause->>'number')::integer;
    if not exists(select 1 from public.time_qr_independent_breaks where shift_id=p_shift_id and ordinal=v_number) then raise exception 'Unbekannte Pause'; end if;
    v_start:=nullif(v_pause->>'started_at','')::timestamptz;
    v_end:=coalesce(nullif(v_pause->>'ended_at','')::timestamptz,p_ended_at);
    if v_start is null or not isfinite(v_start) or not isfinite(v_end) or v_end<=v_start
       or v_start<p_started_at or v_end>p_ended_at or (v_last_end is not null and v_start<v_last_end) then
      raise exception 'Pausen müssen innerhalb des Dienstes liegen, ein späteres Ende haben und dürfen sich nicht überschneiden';
    end if;
    v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('number',v_number,'started_at',v_start,'ended_at',v_end));
    v_last_end:=v_end;
  end loop;
  update public.time_qr_independent_shifts set started_at=p_started_at,ended_at=p_ended_at where id=p_shift_id;
  update public.time_qr_independent_breaks b set started_at=(x->>'started_at')::timestamptz,ended_at=(x->>'ended_at')::timestamptz
    from jsonb_array_elements(v_prepared) x where b.shift_id=p_shift_id and b.ordinal=(x->>'number')::integer;
  v_new:=private.sf_qr_independent_snapshot(p_shift_id);
  if v_new->>'revision'=v_old->>'revision' then raise exception 'Es wurde keine Zeitänderung eingegeben'; end if;
  select role into v_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
    values(p_company_id,'QR_SHIFT_CORRECTED','qr_independent_shift',p_shift_id,auth.uid(),v_role,v_old,v_new,
      jsonb_build_object('reason',btrim(p_reason),'expectedRevision',p_expected_revision,'paidBreaks',true));
  return private.sf_manager_qr_independent_detail(p_company_id,p_shift_id);
end;$function$;

CREATE OR REPLACE FUNCTION private.manager_bulk_record_time_entries(p_company_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer:=0;
  v_updated integer:=0;
  v_skipped_existing integer:=0;
  v_skipped_future integer:=0;
  v_skipped_invalid integer:=0;
  v_reopened_months integer:=0;
  v_month date;
begin
  if not private.sf_can_manage_time(p_company_id) then
    raise exception 'Nicht berechtigt';
  end if;
if not private.sf_has_access_permission(p_company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
 perform private.sf_assert_aal2('manager_bulk_record_time_entries');
 if p_confirm and not private.sf_has_access_permission(p_company_id,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  if p_end_date-p_start_date>366 then
    raise exception 'Der Zeitraum darf hoechstens 366 Tage umfassen';
  end if;
  if length(coalesce(p_note,''))>1000 then
    raise exception 'Die Bemerkung darf hoechstens 1.000 Zeichen enthalten';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text||p_start_date::text||p_end_date::text,0
  ));

  select count(*) into v_total
  from public.shift_assignments sa
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_existing
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_future
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at>now();

  select count(*) into v_skipped_invalid
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
    and (
      sa.ends_at<=sa.starts_at or sa.ends_at-sa.starts_at>interval '24 hours'
      or coalesce(sa.break_minutes,0)<0
      or coalesce(sa.break_minutes,0)>=extract(epoch from(sa.ends_at-sa.starts_at))/60
    );

  -- Eine Sammeluebernahme ist die ausdrueckliche Entscheidung, dass Plan = Ist gilt.
  -- Falls der Zeitraum bereits abgeschlossen war, wird nur fuer wirklich uebernehmbare
  -- fehlende Eintraege kontrolliert wieder geoeffnet. Die bestehende RPC protokolliert
  -- jede Wiedereroeffnung und beschraenkt sie auf OWNER/ADMIN.
  for v_month in
    select distinct date_trunc('month',sa.starts_at)::date
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    join public.time_month_closures c
      on c.company_id=sa.company_id
     and c.month_start=date_trunc('month',sa.starts_at)::date
     and c.status='CLOSED'
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
    order by 1
  loop
    if not private.sf_is_manager(p_company_id,true) then
      raise exception 'Der Monat ist abgeschlossen. Nur Inhaber und Administratoren duerfen ihn fuer die Sammeluebernahme oeffnen.';
    end if;
    perform public.manager_reopen_time_month(
      p_company_id,
      v_month,
      'Automatisch fuer die Sammeluebernahme unveraenderter Planzeiten geoeffnet'
    );
    v_reopened_months:=v_reopened_months+1;
  end loop;

  with candidates as (
    select sa.id,sa.company_id,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0) as break_minutes
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
  ), inserted as (
    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      updated_at,updated_by,version
    )
    select id,company_id,starts_at,ends_at,break_minutes,
      case when p_confirm then 'confirmed' else 'recorded' end,
      left(coalesce(p_note,''),1000),'MANAGER','',
      case when p_confirm then now() else null end,
      case when p_confirm then auth.uid() else null end,
      case when p_confirm then now() else null end,
      now(),auth.uid(),1
    from candidates
    on conflict(assignment_id) do nothing
    returning assignment_id,company_id,actual_start,actual_end,break_minutes,status,version
  ), audited as (
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    )
    select company_id,
      case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
      'time_entry',assignment_id,auth.uid(),'MANAGER',
      jsonb_build_object(
        'actualStart',actual_start,'actualEnd',actual_end,'breakMinutes',break_minutes,
        'status',status,'version',version
      ),
      jsonb_build_object('bulk',true,'planEqualsActual',true,'comment',left(coalesce(p_note,''),1000))
    from inserted
    returning 1
  )
  select count(*) into v_updated from audited;

  return jsonb_build_object(
    'total',v_total,
    'updated',v_updated,
    'status',case when p_confirm then 'confirmed' else 'recorded' end,
    'reopenedMonths',v_reopened_months,
    'skippedExisting',v_skipped_existing,
    'skippedQr',(select count(*) from public.shift_assignments sa where sa.company_id=p_company_id and sa.status<>'CANCELLED' and sa.starts_at::date between p_start_date and p_end_date and exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)),
    'skippedFuture',v_skipped_future,
    'skippedClosed',0,
    'skippedUnpublished',0,
    'skippedInvalid',v_skipped_invalid
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_access_time_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; m boolean;
begin
 if tg_op='DELETE' then cid:=old.company_id; else cid:=new.company_id; end if;
 if auth.uid() is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op in ('UPDATE','DELETE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then if tg_op='DELETE' then return old; else return new; end if; end if;
 select exists(select 1 from public.company_members where company_id=cid and user_id=auth.uid()) into m;
 -- Personal employee submissions remain controlled by their existing RPC/RLS.
 if m then
  if not private.sf_can_manage_time(cid) then raise exception 'Zusatzrecht Zeiterfassung fehlt'; end if;
  perform private.sf_assert_aal2('time_management_write');
  if tg_op='UPDATE' and old.actual_start is not null and (new.actual_start,new.actual_end,new.break_minutes) is distinct from (old.actual_start,old.actual_end,old.break_minutes) and length(btrim(coalesce(new.manager_note,'')))<3 then raise exception 'Bitte die Zeitkorrektur mit mindestens drei Zeichen begründen'; end if;
  if tg_op in ('INSERT','DELETE') or (new.actual_start,new.actual_end,new.break_minutes) is distinct from (old.actual_start,old.actual_end,old.break_minutes) or
   (tg_op='UPDATE' and new.status not in ('confirmed','correction_requested') and (new.manager_note,new.employee_note,new.source) is distinct from (old.manager_note,old.employee_note,old.source)) then
   if not private.sf_has_access_permission(cid,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
  end if;
  if tg_op='DELETE' and old.status in ('confirmed','correction_requested') and not private.sf_has_access_permission(cid,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  if (tg_op='INSERT' and new.status in ('confirmed','correction_requested')) or
   (tg_op='UPDATE' and ((new.status,new.confirmed_by,new.confirmed_at,new.correction_requested_by,new.correction_requested_at) is distinct from (old.status,old.confirmed_by,old.confirmed_at,old.correction_requested_by,old.correction_requested_at))) then
   -- Editing an unconfirmed record does not constitute a review.
   if (new.status in ('confirmed','correction_requested') or old.status in ('confirmed','correction_requested')) and not private.sf_has_access_permission(cid,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $function$;


-- Keep the central request inventory consistent with internal checks.
insert into private.sf_mfa_protected_rpcs(function_name,rollout_stage,control_area,enabled) values
 ('manager_list_company_users',2,'Benutzer und Rechte',true),
 ('manager_revoke_company_invite',2,'Benutzer und Rechte',true),
 ('manager_list_access_users',2,'Benutzer und Rechte',true),
 ('manager_set_access_profile',2,'Benutzer und Rechte',true),
 ('manager_set_access_profile_with_personnel',2,'Benutzer und Rechte',true),
 ('manager_create_access_invite',2,'Benutzer und Rechte',true),
 ('manager_revoke_access_invite',2,'Benutzer und Rechte',true),
 ('manager_save_time_entry',4,'Zeitkorrekturen und Freigaben',true),
 ('manager_review_time_entry',4,'Zeitkorrekturen und Freigaben',true),
 ('manager_bulk_record_time_entries',4,'Zeitkorrekturen und Freigaben',true),
 ('manager_correct_qr_independent_shift',4,'Zeitkorrekturen und Freigaben',true),
 ('manager_time_report_bundle',4,'Sensible Exporte',true),
 ('manager_time_report_bundle_v2',4,'Sensible Exporte',true),
 ('manager_create_time_qr_terminal_at_site',5,'QR-Sicherheitskonfiguration',true),
 ('manager_set_time_qr_terminal_site',5,'QR-Sicherheitskonfiguration',true),
 ('manager_delete_time_qr_terminal',5,'QR-Sicherheitskonfiguration',true),
 ('manager_get_time_qr_terminal_qr_path',5,'QR-Sicherheitskonfiguration',true)
on conflict(function_name) do update set enabled=true,control_area=excluded.control_area,updated_at=now();
notify pgrst,'reload schema';
