-- Explicitly extend the existing QR date-to-PIN transition to desktop login.
-- Keep terminal secrets internal and all employee/PIN rollout decisions in the
-- existing login and booking functions (including session revocation).
create function private.qr_desktop_terminal_token(p_terminal_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_terminal public.time_qr_terminals%rowtype; v_token text;
begin
 select * into v_terminal from public.time_qr_terminals t
 where t.id=p_terminal_id and t.desktop_enabled and t.is_active and not t.pilot_mode for share;
 if not found then raise exception 'PC-Zugang nicht verfügbar. Bitte den aktuellen Standort-QR-Code nutzen'; end if;
 select ds.decrypted_secret into v_token from vault.decrypted_secrets ds where ds.id=v_terminal.vault_secret_id;
 if v_token is null or v_token !~ '^[0-9a-fA-F]{64}$'
    or extensions.digest(lower(v_token),'sha256')<>v_terminal.token_hash then
   raise exception 'PC-Zugang derzeit nicht verfügbar';
 end if;
 return v_token;
end$$;
revoke all on function private.qr_desktop_terminal_token(uuid) from public,anon,authenticated,service_role;

create or replace function private.qr_desktop_request(
 p_terminal_id uuid,p_action text,p_personnel_no text,p_pin text,
 p_session_token text,p_setup_code text,p_request_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text; v_action text:=upper(coalesce(p_action,''));
begin
 v_token:=private.qr_desktop_terminal_token(p_terminal_id);
 if v_action in ('LOGIN','SET_PIN') then
   if p_pin is null or p_pin !~ '^[0-9]{6,8}$' or
      (v_action='SET_PIN' and (p_setup_code is null or p_setup_code !~ '^[0-9]{12}$')) then
     raise exception 'Bitte mit persönlicher PIN anmelden';
   end if;
   return public.qr_independent_pin_login(v_token,p_personnel_no,p_pin,p_session_token,
     case when v_action='SET_PIN' then p_setup_code else null end);
 end if;
 if v_action not in ('STATUS','CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT') then raise exception 'Ungültige Aktion'; end if;
 -- The shared booking engine verifies terminal/company/session scope, expiry,
 -- employee status and that a legacy session is still allowed after the lock.
 return public.qr_independent_action(v_token,p_session_token,v_action,p_request_id);
end$$;

create function private.qr_desktop_legacy_login(
 p_terminal_id uuid,p_personnel_no text,p_start_date date,p_session_token text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 v_token:=private.qr_desktop_terminal_token(p_terminal_id);
 if p_start_date is null then raise exception 'Bitte ein gültiges Eintrittsdatum eingeben'; end if;
 return public.qr_independent_login(v_token,p_personnel_no,p_start_date,p_session_token);
end$$;
create function public.qr_desktop_legacy_login(
 p_terminal_id uuid,p_personnel_no text,p_start_date date,p_session_token text
) returns jsonb language sql security invoker set search_path='' as $$
 select private.qr_desktop_legacy_login(p_terminal_id,p_personnel_no,p_start_date,p_session_token)
$$;
revoke all on function private.qr_desktop_legacy_login(uuid,text,date,text),public.qr_desktop_legacy_login(uuid,text,date,text) from public,anon,authenticated;
grant execute on function private.qr_desktop_legacy_login(uuid,text,date,text),public.qr_desktop_legacy_login(uuid,text,date,text) to service_role;
notify pgrst,'reload schema';
