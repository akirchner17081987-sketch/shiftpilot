-- Personal QR secrets stay outside the Data API and employee payloads.
-- Rollout is deliberate: configured employees cannot use their joining date;
-- company-wide enforcement is irreversible through this API and requires readiness.
create table private.qr_pin_credentials (
 employee_id uuid primary key references public.employees(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 pin_hash text,
 legacy_disabled boolean not null default false,
 setup_hash bytea,
 setup_expires_at timestamptz,
 configured_at timestamptz,
 updated_at timestamptz not null default now()
);
create index qr_pin_credentials_company on private.qr_pin_credentials(company_id);
alter table private.qr_pin_credentials enable row level security;
revoke all on private.qr_pin_credentials from public,anon,authenticated;
create table private.qr_pin_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 pin_required boolean not null default false,
 enforced_at timestamptz
);
alter table private.qr_pin_settings enable row level security;
revoke all on private.qr_pin_settings from public,anon,authenticated;
-- Deactivation/privacy erasure removes secrets and sessions. Retain only the
-- no-date-fallback marker, so reactivation cannot silently weaken authentication.
create function private.qr_pin_employee_access_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.company_id is distinct from old.company_id then
  delete from private.qr_pin_credentials where employee_id=new.id;
  delete from public.time_qr_independent_sessions where employee_id=new.id;
 elsif new.deleted_at is not null or new.status is distinct from 'active' or new.access_status='DISABLED' then
  update private.qr_pin_credentials set pin_hash=null,setup_hash=null,setup_expires_at=null,
   legacy_disabled=legacy_disabled or pin_hash is not null,updated_at=clock_timestamp() where employee_id=new.id;
  delete from public.time_qr_independent_sessions where employee_id=new.id;
 end if;
 return new;
end $$;
revoke all on function private.qr_pin_employee_access_changed() from public,anon,authenticated;
create trigger qr_pin_employee_access_changed after update of company_id,status,access_status,deleted_at
on public.employees for each row execute function private.qr_pin_employee_access_changed();
alter table public.time_qr_independent_sessions add column auth_method text not null default 'LEGACY';
alter table public.time_qr_independent_sessions add constraint qr_session_auth_method check(auth_method in ('LEGACY','PIN'));

create function private.manager_qr_pin_admin(p_company_id uuid,p_action text,p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_action text:=upper(coalesce(p_action,'STATUS'));
 v_code text; v_required boolean; v_rows jsonb; v_missing integer; v_total integer;
 v_employee public.employees%rowtype; v_role text;
begin
 perform private.sf_assert_company_admin_mfa(p_company_id,'manage_qr_personal_pins');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text,8101));
 select role into v_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
 if v_action='ISSUE_CODE' then
  select * into v_employee from public.employees where id=p_employee_id and company_id=p_company_id
   and status='active' and access_status<>'DISABLED' and deleted_at is null;
  if not found or nullif(btrim(v_employee.personnel_no),'') is null then raise exception 'Aktiver Mitarbeiter mit Personalnummer erforderlich'; end if;
  if (select count(*) from public.employees where company_id=p_company_id and lower(btrim(personnel_no))=lower(btrim(v_employee.personnel_no))
   and status='active' and access_status<>'DISABLED' and deleted_at is null)<>1 then raise exception 'Personalnummer muss im Unternehmen eindeutig sein'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_employee_id::text,0));
  -- Twelve random decimal digits (~40 bits), only a SHA-256 hash is stored.
  v_code:=lpad((((('x'||encode(extensions.gen_random_bytes(8),'hex'))::bit(64)::bigint & 9223372036854775807) % 1000000000000))::text,12,'0');
  insert into private.qr_pin_credentials(employee_id,company_id,setup_hash,setup_expires_at)
   values(p_employee_id,p_company_id,extensions.digest(v_code,'sha256'),clock_timestamp()+interval '24 hours')
   on conflict(employee_id) do update set pin_hash=null,
    legacy_disabled=qr_pin_credentials.legacy_disabled or qr_pin_credentials.pin_hash is not null,
    setup_hash=excluded.setup_hash,setup_expires_at=excluded.setup_expires_at,updated_at=clock_timestamp();
  delete from public.time_qr_independent_sessions where company_id=p_company_id and employee_id=p_employee_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
   values(p_company_id,'QR_PIN_SETUP_CODE_ISSUED','employee',p_employee_id,auth.uid(),v_role,'{"expiresInHours":24}'::jsonb);
  return jsonb_build_object('ok',true,'setup_code',v_code,'expires_at',clock_timestamp()+interval '24 hours');
 elsif v_action='ENABLE_REQUIRED' then
  select count(*),count(*) filter(where c.pin_hash is null or nullif(btrim(e.personnel_no),'') is null)
   into v_total,v_missing from public.employees e left join private.qr_pin_credentials c on c.employee_id=e.id and c.company_id=e.company_id
   where e.company_id=p_company_id and e.status='active' and e.access_status<>'DISABLED' and e.deleted_at is null;
  if v_total=0 or v_missing>0 then raise exception 'PIN-Pflicht erst aktivieren, wenn alle aktiven Mitarbeiter eine PIN eingerichtet haben'; end if;
  if exists(select 1 from public.employees where company_id=p_company_id and status='active' and access_status<>'DISABLED' and deleted_at is null
   group by lower(btrim(personnel_no)) having count(*)>1) then raise exception 'Personalnummern müssen eindeutig sein'; end if;
  insert into private.qr_pin_settings(company_id,pin_required,enforced_at) values(p_company_id,true,clock_timestamp())
   on conflict(company_id) do update set pin_required=true,enforced_at=coalesce(qr_pin_settings.enforced_at,excluded.enforced_at);
  delete from public.time_qr_independent_sessions where company_id=p_company_id and auth_method='LEGACY';
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
   values(p_company_id,'QR_PIN_REQUIRED_ENABLED','company',p_company_id,auth.uid(),v_role,jsonb_build_object('employeesReady',v_total));
 elsif v_action<>'STATUS' then raise exception 'Ungültige Aktion'; end if;
 select coalesce((select pin_required from private.qr_pin_settings where company_id=p_company_id),false) into v_required;
 select coalesce(jsonb_agg(jsonb_build_object('employee_id',e.id,'name',btrim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),
  'personnel_no',e.personnel_no,'pin_ready',c.pin_hash is not null,
  'setup_pending',c.setup_hash is not null and c.setup_expires_at>clock_timestamp(),
  'legacy_allowed',not v_required and not coalesce(c.legacy_disabled,false)) order by e.last_name,e.first_name),'[]'::jsonb)
  into v_rows from public.employees e left join private.qr_pin_credentials c on c.employee_id=e.id and c.company_id=e.company_id
  where e.company_id=p_company_id and e.status='active' and e.access_status<>'DISABLED' and e.deleted_at is null;
 return jsonb_build_object('ok',true,'pin_required',v_required,'employees',v_rows);
end $$;
revoke all on function private.manager_qr_pin_admin(uuid,text,uuid) from public,anon;
grant execute on function private.manager_qr_pin_admin(uuid,text,uuid) to authenticated;
create function public.manager_qr_pin_admin(p_company_id uuid,p_action text default 'STATUS',p_employee_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.manager_qr_pin_admin(p_company_id,p_action,p_employee_id);
$$;
revoke all on function public.manager_qr_pin_admin(uuid,text,uuid) from public,anon;
grant execute on function public.manager_qr_pin_admin(uuid,text,uuid) to authenticated;
insert into private.sf_mfa_protected_rpcs(function_name,rollout_stage,control_area,enabled)
 values('manager_qr_pin_admin',2,'qr_personal_pins',true) on conflict(function_name) do update set enabled=true;

-- Service-only entrypoint: the public Edge Function validates the request first.
create function public.qr_independent_pin_login(p_terminal_token text,p_personnel_no text,p_pin text,p_session_token text,p_setup_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_terminal public.time_qr_terminals%rowtype; v_employee public.employees%rowtype;
 v_credential private.qr_pin_credentials%rowtype; v_key bytea; v_limit public.time_qr_independent_login_limits%rowtype;
 v_now timestamptz; v_valid boolean:=false; v_hash text;
begin
 if coalesce(p_terminal_token,'') !~ '^[0-9a-fA-F]{64}$' or coalesce(p_session_token,'') !~ '^[0-9a-fA-F]{64}$'
  or length(btrim(coalesce(p_personnel_no,''))) not between 1 and 100 then raise exception 'Ungültige Anmeldung'; end if;
 select * into v_terminal from public.time_qr_terminals where token_hash=extensions.digest(lower(p_terminal_token),'sha256') and is_active;
 if not found then return jsonb_build_object('ok',false,'error','Anmeldung nicht möglich. Bitte Angaben und QR-Code prüfen.'); end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_terminal.company_id::text,8101));
 v_key:=extensions.digest(v_terminal.company_id::text||':qr-auth:'||lower(btrim(p_personnel_no)),'sha256');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(encode(v_key,'hex'),8102));
 v_now:=clock_timestamp();
 select * into v_limit from public.time_qr_independent_login_limits where key_hash=v_key for update;
 if found and v_limit.reset_at>v_now and v_limit.failed_count>=5 then
  return jsonb_build_object('ok',false,'rate_limited',true,'retry_after_seconds',ceil(extract(epoch from v_limit.reset_at-v_now)),
   'error','Zu viele Versuche. Bitte in 15 Minuten erneut versuchen oder die Leitung kontaktieren.'); end if;
 select * into v_employee from public.employees where company_id=v_terminal.company_id and lower(btrim(personnel_no))=lower(btrim(p_personnel_no))
  and status='active' and access_status<>'DISABLED' and deleted_at is null;
 if found and (select count(*) from public.employees where company_id=v_terminal.company_id and lower(btrim(personnel_no))=lower(btrim(p_personnel_no))
  and status='active' and access_status<>'DISABLED' and deleted_at is null)=1 then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee.id::text,0));
  select * into v_credential from private.qr_pin_credentials where employee_id=v_employee.id and company_id=v_terminal.company_id for update;
 end if;
 if p_setup_code is not null then
  v_valid:=coalesce(p_setup_code ~ '^[0-9]{12}$' and p_pin ~ '^[0-9]{6,8}$'
   and p_pin<>regexp_replace(coalesce(v_employee.personnel_no,''),'[^0-9]','','g')
   and p_pin<>all(array[coalesce(to_char(v_employee.start_date,'DDMMYYYY'),''),coalesce(to_char(v_employee.start_date,'YYYYMMDD'),''),coalesce(to_char(v_employee.start_date,'DDMMYY'),''),coalesce(to_char(v_employee.start_date,'YYMMDD'),'')])
   and p_pin<>all(array[coalesce(to_char(v_employee.birth_date,'DDMMYYYY'),''),coalesce(to_char(v_employee.birth_date,'YYYYMMDD'),''),coalesce(to_char(v_employee.birth_date,'DDMMYY'),''),coalesce(to_char(v_employee.birth_date,'YYMMDD'),'')])
   and p_pin !~ '^([0-9])\1+$' and p_pin not in ('123456','654321','012345','1234567','7654321','12345678','87654321')
   and v_credential.setup_hash=extensions.digest(p_setup_code,'sha256') and v_credential.setup_expires_at>v_now,false);
  if v_valid then
   update private.qr_pin_credentials set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',12)),legacy_disabled=true,
    setup_hash=null,setup_expires_at=null,configured_at=clock_timestamp(),updated_at=clock_timestamp() where employee_id=v_employee.id;
   delete from public.time_qr_independent_sessions where employee_id=v_employee.id and company_id=v_terminal.company_id;
   insert into public.audit_events(company_id,event_type,entity_type,entity_id,metadata)
    values(v_terminal.company_id,'QR_PIN_CONFIGURED','employee',v_employee.id,'{"method":"oneTimeSetupCode"}'::jsonb);
  end if;
 else
  -- A fixed valid dummy salt equalizes expensive verification for unknown users.
  v_hash:=coalesce(v_credential.pin_hash,'$2a$12$abcdefghijklmnopqrstuuXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  if coalesce(p_pin,'') ~ '^[0-9]{6,8}$' then
   v_valid:=extensions.crypt(p_pin,v_hash)=v_hash and v_credential.pin_hash is not null;
  end if;
 end if;
 if not coalesce(v_valid,false) then
  insert into public.time_qr_independent_login_limits(key_hash,failed_count,reset_at) values(v_key,1,v_now+interval '15 minutes')
   on conflict(key_hash) do update set failed_count=case when time_qr_independent_login_limits.reset_at<=v_now then 1 else time_qr_independent_login_limits.failed_count+1 end,
    reset_at=case when time_qr_independent_login_limits.reset_at<=v_now then v_now+interval '15 minutes' else time_qr_independent_login_limits.reset_at end;
  return jsonb_build_object('ok',false,'error','Anmeldung nicht möglich. Bitte Angaben und QR-Code prüfen oder die Leitung kontaktieren.');
 end if;
 delete from public.time_qr_independent_login_limits where key_hash=v_key;
 delete from public.time_qr_independent_sessions where expires_at<v_now-interval '1 day';
 delete from public.time_qr_independent_login_limits where reset_at<v_now-interval '1 day';
 insert into public.time_qr_independent_sessions(token_hash,company_id,employee_id,terminal_id,expires_at,auth_method)
  values(extensions.digest(lower(p_session_token),'sha256'),v_terminal.company_id,v_employee.id,v_terminal.id,clock_timestamp()+interval '30 minutes','PIN');
 return jsonb_build_object('ok',true,'expires_at',clock_timestamp()+interval '30 minutes');
end $$;
revoke all on function public.qr_independent_pin_login(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.qr_independent_pin_login(text,text,text,text,text) to service_role;


-- Compatibility entrypoint: no date fallback after personal or company activation.
CREATE OR REPLACE FUNCTION public.qr_independent_login(p_terminal_token text, p_personnel_no text, p_start_date date, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_employee public.employees%rowtype;
  v_key bytea;
  v_limit public.time_qr_independent_login_limits%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  delete from public.time_qr_independent_sessions where expires_at<v_now-interval '1 day';
  delete from public.time_qr_independent_login_limits where reset_at<v_now-interval '1 day';
  if p_terminal_token !~ '^[0-9a-fA-F]{64}$' or p_session_token !~ '^[0-9a-fA-F]{64}$'
    or p_terminal_token is null or p_session_token is null
    or length(btrim(coalesce(p_personnel_no,''))) not between 1 and 100
  then raise exception 'Ungültige Anmeldung'; end if;
  select * into v_terminal from public.time_qr_terminals
  where token_hash=extensions.digest(lower(p_terminal_token),'sha256') and is_active=true;
  if not found then raise exception 'QR-Code ist ungültig oder deaktiviert'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_terminal.company_id::text,8101));
  if exists(select 1 from private.qr_pin_settings where company_id=v_terminal.company_id and pin_required)
   or exists(select 1 from private.qr_pin_credentials c join public.employees e on e.id=c.employee_id and e.company_id=c.company_id
    where c.company_id=v_terminal.company_id and lower(btrim(e.personnel_no))=lower(btrim(p_personnel_no)) and c.legacy_disabled)
  then return jsonb_build_object('ok',false,'error','Bitte mit persönlicher PIN anmelden oder einen Einrichtungscode bei der Leitung anfordern.'); end if;
  v_key:=extensions.digest(v_terminal.id::text||':'||lower(btrim(p_personnel_no)),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(v_key,'hex'),0));
  select * into v_limit from public.time_qr_independent_login_limits
    where key_hash=v_key for update;
  if found and v_limit.reset_at>v_now and v_limit.failed_count>=5 then
    raise exception 'Zu viele Versuche. Bitte in 15 Minuten erneut anmelden';
  end if;
  select * into v_employee from public.employees
  where company_id=v_terminal.company_id and lower(personnel_no)=lower(btrim(p_personnel_no))
    and deleted_at is null and start_date=p_start_date and status='active' and access_status<>'DISABLED';
  if not found then
    insert into public.time_qr_independent_login_limits(key_hash,failed_count,reset_at)
    values(v_key,1,v_now+interval '15 minutes')
    on conflict(key_hash) do update set
      failed_count=case when time_qr_independent_login_limits.reset_at<=v_now then 1
                        else time_qr_independent_login_limits.failed_count+1 end,
      reset_at=case when time_qr_independent_login_limits.reset_at<=v_now then v_now+interval '15 minutes'
                    else time_qr_independent_login_limits.reset_at end;
    -- Returning an error object preserves the failed-attempt update.
    return jsonb_build_object('ok',false,'error','Personalnummer oder Eintrittsdatum stimmt nicht');
  end if;
  delete from public.time_qr_independent_login_limits where key_hash=v_key;
  insert into public.time_qr_independent_sessions(token_hash,company_id,employee_id,terminal_id,expires_at)
  values(extensions.digest(lower(p_session_token),'sha256'),
    v_terminal.company_id,v_employee.id,v_terminal.id,v_now+interval '30 minutes');
  return jsonb_build_object('ok',true,'employee_name',btrim(v_employee.first_name||' '||v_employee.last_name),
    'expires_at',v_now+interval '30 minutes');
end;$function$;

-- Session revocation also applies to an in-flight booking after its employee lock.
CREATE OR REPLACE FUNCTION public.qr_independent_action(p_terminal_token text, p_session_token text, p_action text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.time_qr_independent_sessions%rowtype;
  v_shift public.time_qr_independent_shifts%rowtype;
  v_break public.time_qr_independent_breaks%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_action text:=upper(coalesce(p_action,''));
  v_name text;
  v_terminal_name text;
  v_location_note text;
  v_timezone text;
  v_ordinal integer;
  v_breaks jsonb;
  v_pause_closed boolean:=false;
  v_saved public.time_qr_independent_events%rowtype;
  v_replay boolean:=false;
  v_result jsonb;
begin
  if p_terminal_token !~ '^[0-9a-fA-F]{64}$' or p_session_token !~ '^[0-9a-fA-F]{64}$'
    or (p_request_id is not null and p_request_id !~ '^[0-9a-f]{64}$')
    or v_action not in ('STATUS','CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')
  then raise exception 'Ungültige Anfrage'; end if;
  select s.* into v_session from public.time_qr_independent_sessions s
  join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id and t.is_active
  join public.employees e on e.id=s.employee_id and e.company_id=s.company_id and e.status='active' and e.access_status<>'DISABLED'
  where s.token_hash=extensions.digest(lower(p_session_token),'sha256')
    and s.expires_at>v_now and t.token_hash=extensions.digest(lower(p_terminal_token),'sha256');
  if not found then raise exception 'Anmeldung abgelaufen. Bitte erneut anmelden'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session.employee_id::text,0));
  -- Recheck after the employee lock: a concurrent reset may have revoked this session.
  if not exists(select 1 from public.time_qr_independent_sessions s where s.token_hash=extensions.digest(lower(p_session_token),'sha256')
   and s.employee_id=v_session.employee_id and s.company_id=v_session.company_id and s.expires_at>clock_timestamp()
   and (s.auth_method='PIN' or (not exists(select 1 from private.qr_pin_settings where company_id=s.company_id and pin_required)
    and not exists(select 1 from private.qr_pin_credentials c where c.employee_id=s.employee_id and c.company_id=s.company_id and c.legacy_disabled))))
  then raise exception 'Anmeldung abgelaufen. Bitte erneut anmelden'; end if;
  v_now:=clock_timestamp(); -- Stamp after serializing concurrent employee actions.
  if p_request_id is not null then
    select ev.* into v_saved from public.time_qr_independent_events ev
      join public.time_qr_independent_shifts sh on sh.id=ev.shift_id
      where ev.request_id=p_request_id and sh.employee_id=v_session.employee_id and sh.company_id=v_session.company_id;
    if found and v_action<>'STATUS' and v_saved.action<>v_action then raise exception 'Ungültige Anfragekennung'; end if;
    v_replay:=v_saved.id is not null and v_action<>'STATUS';
  end if;
  select btrim(first_name||' '||last_name) into v_name from public.employees where id=v_session.employee_id;
  select * into v_shift from public.time_qr_independent_shifts
  where employee_id=v_session.employee_id and ended_at is null for update;
  if found and v_shift.company_id<>v_session.company_id then
    raise exception 'Eine Buchung an einem anderen Standort ist noch offen'; end if;
  if v_shift.id is null and v_saved.id is not null then
    select * into v_shift from public.time_qr_independent_shifts where id=v_saved.shift_id and company_id=v_session.company_id;
  end if;
  if v_replay then
    null; -- A retry reads the current state; it never repeats its original punch.
  elsif v_action='CLOCK_IN' then
    if v_shift.id is not null then raise exception 'Arbeitszeit läuft bereits'; end if;
    insert into public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at)
    values(v_session.company_id,v_session.employee_id,v_session.terminal_id,v_now) returning * into v_shift;
  elsif v_action<>'STATUS' then
    if v_shift.id is null then raise exception 'Keine offene Arbeitszeit gefunden'; end if;
    if v_now-v_shift.started_at>interval '24 hours' then raise exception 'Buchung älter als 24 Stunden. Bitte die Leitung kontaktieren'; end if;
    select * into v_break from public.time_qr_independent_breaks
    where shift_id=v_shift.id and ended_at is null for update;
    if v_action='BREAK_START' then
      if v_break.id is not null then raise exception 'Pause läuft bereits'; end if;
      select count(*)+1 into v_ordinal from public.time_qr_independent_breaks where shift_id=v_shift.id;
      if v_ordinal>10 then raise exception 'Maximal zehn Pausen pro Buchung'; end if;
      insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at)
      values(v_shift.id,v_ordinal,v_now);
    elsif v_action='BREAK_END' then
      if v_break.id is null then raise exception 'Keine laufende Pause gefunden'; end if;
      update public.time_qr_independent_breaks set ended_at=v_now where id=v_break.id;
    elsif v_action='CLOCK_OUT' then
      if v_break.id is not null then
        update public.time_qr_independent_breaks set ended_at=v_now where id=v_break.id;
        insert into public.time_qr_independent_events(shift_id,action,punched_at)
          values(v_shift.id,'BREAK_END',v_now);
        v_pause_closed:=true;
      end if;
      update public.time_qr_independent_shifts set ended_at=v_now where id=v_shift.id;
      v_shift.ended_at:=v_now;
    end if;
  end if;
  if v_action<>'STATUS' and not v_replay then
    insert into public.time_qr_independent_events(shift_id,action,punched_at,request_id)
    values(v_shift.id,v_action,v_now,p_request_id) returning * into v_saved;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('number',b.ordinal,
    'started_at',b.started_at,'ended_at',b.ended_at) order by b.ordinal),'[]'::jsonb)
    into v_breaks from public.time_qr_independent_breaks b where b.shift_id=v_shift.id;
  -- A running booking keeps its original location even when another same-company
  -- terminal is scanned. Before clock-in, show the authenticated terminal.
  select t.name,t.location_note,coalesce(c.timezone,'Europe/Berlin')
    into v_terminal_name,v_location_note,v_timezone
    from public.time_qr_terminals t join public.companies c on c.id=t.company_id
    where t.id=coalesce(v_shift.terminal_id,v_session.terminal_id)
      and t.company_id=v_session.company_id;
  v_result:=jsonb_build_object('ok',true,'name',v_name,
    'terminal_name',v_terminal_name,'location_note',v_location_note,
    'timezone',coalesce(v_timezone,'Europe/Berlin'),'as_of',v_now,'state',
    case when v_shift.id is null or v_shift.ended_at is not null then 'READY'
         when exists(select 1 from public.time_qr_independent_breaks b where b.shift_id=v_shift.id and b.ended_at is null) then 'BREAK'
         else 'RUNNING' end,
    'started_at',v_shift.started_at,'ended_at',v_shift.ended_at,
    'breaks',v_breaks,'pause_automatically_closed',v_pause_closed,'punched_at',case when v_action='STATUS' then null else coalesce(v_saved.punched_at,v_now) end,
    'request_processed',v_saved.id is not null,'processed_action',v_saved.action,
    'processed_at',v_saved.punched_at,'replayed',v_replay);
  return v_result;
end;$function$;

notify pgrst,'reload schema';
