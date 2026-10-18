-- Desktop uses the same PIN/session/shift engine as the QR clock. Terminal
-- bearer secrets stay inside PostgreSQL; public callers see only opted-in names.
alter table public.time_qr_terminals add column desktop_enabled boolean not null default false;

create function private.qr_desktop_terminals() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'terminals',coalesce(jsonb_agg(
   jsonb_build_object('id',t.id,'company_name',c.name,'terminal_name',t.name)
   order by c.name,t.name,t.id),'[]'::jsonb))
 from public.time_qr_terminals t join public.companies c on c.id=t.company_id
 where t.desktop_enabled and t.is_active and not t.pilot_mode and t.vault_secret_id is not null;
$$;
create function public.qr_desktop_terminals() returns jsonb
language sql security invoker set search_path='' as $$select private.qr_desktop_terminals()$$;
revoke all on function private.qr_desktop_terminals(),public.qr_desktop_terminals() from public,anon,authenticated;
grant execute on function private.qr_desktop_terminals(),public.qr_desktop_terminals() to service_role;
grant usage on schema private to service_role;

create function private.qr_desktop_request(
 p_terminal_id uuid,p_action text,p_personnel_no text,p_pin text,
 p_session_token text,p_setup_code text,p_request_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_token text; v_action text:=upper(coalesce(p_action,''));
begin
 -- Recheck the opt-in on EVERY request, including already signed-in sessions.
 select * into v_terminal from public.time_qr_terminals t
 where t.id=p_terminal_id and t.desktop_enabled and t.is_active and not t.pilot_mode for share;
 if not found then raise exception 'PC-Zugang nicht verfügbar. Bitte den aktuellen Standort-QR-Code nutzen'; end if;
 select ds.decrypted_secret into v_token from vault.decrypted_secrets ds where ds.id=v_terminal.vault_secret_id;
 if v_token is null or v_token !~ '^[0-9a-fA-F]{64}$'
    or extensions.digest(lower(v_token),'sha256')<>v_terminal.token_hash then
   raise exception 'PC-Zugang derzeit nicht verfügbar';
 end if;
 if v_action in ('LOGIN','SET_PIN') then
   if p_pin is null or p_pin !~ '^[0-9]{6,8}$' or
      (v_action='SET_PIN' and (p_setup_code is null or p_setup_code !~ '^[0-9]{12}$')) then
     raise exception 'Bitte mit persönlicher PIN anmelden';
   end if;
   return public.qr_independent_pin_login(v_token,p_personnel_no,p_pin,p_session_token,
     case when v_action='SET_PIN' then p_setup_code else null end);
 end if;
 if v_action not in ('STATUS','CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT') then raise exception 'Ungültige Aktion'; end if;
 -- Desktop never accepts a legacy date-authenticated session, even if that
 -- temporary migration path is still enabled on the physical QR terminal.
 if not exists(select 1 from public.time_qr_independent_sessions s
   where s.token_hash=extensions.digest(lower(p_session_token),'sha256')
   and s.terminal_id=v_terminal.id and s.company_id=v_terminal.company_id and s.auth_method='PIN') then
   raise exception 'Anmeldung abgelaufen. Bitte erneut anmelden';
 end if;
 return public.qr_independent_action(v_token,p_session_token,v_action,p_request_id);
end$$;
create function public.qr_desktop_request(
 p_terminal_id uuid,p_action text,p_personnel_no text,p_pin text,
 p_session_token text,p_setup_code text,p_request_id text
) returns jsonb language sql security invoker set search_path='' as $$
 select private.qr_desktop_request(p_terminal_id,p_action,p_personnel_no,p_pin,p_session_token,p_setup_code,p_request_id)
$$;
revoke all on function private.qr_desktop_request(uuid,text,text,text,text,text,text),public.qr_desktop_request(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.qr_desktop_request(uuid,text,text,text,text,text,text),public.qr_desktop_request(uuid,text,text,text,text,text,text) to service_role;

create function private.manager_qr_desktop_access(p_company_id uuid,p_terminal_id uuid,p_enabled boolean,p_expected_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_role text;
begin
 if not coalesce(private.sf_company_profile_can_write(p_company_id),false) then raise exception 'Nicht berechtigt'; end if;
 if p_terminal_id is not null then
   perform private.sf_assert_company_admin_mfa(p_company_id,'manage_qr_desktop_access');
   select * into v_terminal from public.time_qr_terminals where id=p_terminal_id and company_id=p_company_id for update;
   if not found then raise exception 'Terminal nicht gefunden'; end if;
   if p_enabled is null or p_expected_enabled is null or v_terminal.desktop_enabled<>p_expected_enabled then
     raise exception 'Einstellung wurde zwischenzeitlich geändert. Bitte neu laden';
   end if;
   if p_enabled and (not v_terminal.is_active or v_terminal.pilot_mode or v_terminal.vault_secret_id is null) then
     raise exception 'Nur aktive reguläre QR-Terminals können am PC freigegeben werden';
   end if;
   update public.time_qr_terminals set desktop_enabled=p_enabled,updated_at=clock_timestamp(),updated_by=auth.uid() where id=v_terminal.id;
   select role into v_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
   insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
   values(p_company_id,'QR_DESKTOP_ACCESS_CHANGED','time_qr_terminals',v_terminal.id,auth.uid(),v_role,
    jsonb_build_object('desktop_enabled',p_enabled));
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'desktop_enabled',desktop_enabled) order by id)
   from public.time_qr_terminals where company_id=p_company_id),'[]'::jsonb);
end$$;
create function public.manager_qr_desktop_access(p_company_id uuid,p_terminal_id uuid default null,p_enabled boolean default null,p_expected_enabled boolean default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.manager_qr_desktop_access(p_company_id,p_terminal_id,p_enabled,p_expected_enabled)
$$;
revoke all on function private.manager_qr_desktop_access(uuid,uuid,boolean,boolean),public.manager_qr_desktop_access(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function private.manager_qr_desktop_access(uuid,uuid,boolean,boolean),public.manager_qr_desktop_access(uuid,uuid,boolean,boolean) to authenticated;

notify pgrst,'reload schema';
