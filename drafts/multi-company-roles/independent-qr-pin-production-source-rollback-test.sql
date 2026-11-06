begin;
-- Temporary QA reconciliation of missing production columns/tables; rollback at end.
create table private.qr_pin_settings(company_id uuid primary key references public.companies(id) on delete cascade,pin_required boolean not null default false,enforced_at timestamptz);
create table private.qr_pin_credentials(employee_id uuid primary key references public.employees(id) on delete cascade,company_id uuid not null references public.companies(id) on delete cascade,pin_hash text,legacy_disabled boolean not null default false,setup_hash bytea,setup_expires_at timestamptz,configured_at timestamptz,updated_at timestamptz not null default now());
alter table public.time_qr_independent_sessions add column auth_method text not null default 'LEGACY' check(auth_method in ('LEGACY','PIN'));
alter table public.time_qr_independent_events add column request_id text check(request_id is null or request_id ~ '^[0-9a-f]{64}$');
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
end;$function$
;
CREATE OR REPLACE FUNCTION public.qr_independent_action(p_terminal_token text, p_session_token text, p_action text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.qr_independent_action(p_terminal_token,p_session_token,p_action,null);
$function$
;
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
end;$function$
;
CREATE OR REPLACE FUNCTION public.qr_independent_pin_login(p_terminal_token text, p_personnel_no text, p_pin text, p_session_token text, p_setup_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
create temporary table sf_independent_qr_test(owner_id uuid,uid uuid,a uuid,b uuid,ea uuid,eb uuid,ta uuid,tb uuid);
insert into sf_independent_qr_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_independent_qr_test to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select owner_id,'qri-owner-'||owner_id::text||'@example.invalid',now(),'{}'::jsonb from sf_independent_qr_test
union all select uid,'qri-user-'||uid::text||'@example.invalid',now(),'{}'::jsonb from sf_independent_qr_test;
insert into public.companies(id,name,created_by) select a,'Independent QR A',owner_id from sf_independent_qr_test union all select b,'Independent QR B',owner_id from sf_independent_qr_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,start_date,auth_user_id,access_status)
select ea,a,'QA','A','9999',date '2025-01-01',uid,'ACTIVE' from sf_independent_qr_test union all
select eb,b,'QA','B','9999',date '2025-01-01',uid,'ACTIVE' from sf_independent_qr_test;
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active,pilot_mode)
select ta,a,'Independent A',extensions.digest(repeat('a',64),'sha256'),true,false from sf_independent_qr_test
union all select tb,b,'Independent B',extensions.digest(repeat('b',64),'sha256'),true,false from sf_independent_qr_test;
insert into private.qr_pin_settings(company_id,pin_required) select a,true from sf_independent_qr_test union all select b,true from sf_independent_qr_test;
insert into private.qr_pin_credentials(employee_id,company_id,pin_hash,legacy_disabled)
select ea,a,extensions.crypt('859201',extensions.gen_salt('bf',12)),true from sf_independent_qr_test union all
select eb,b,extensions.crypt('492863',extensions.gen_salt('bf',12)),true from sf_independent_qr_test;
set local role anon;
do $test$ declare result jsonb; rejected boolean; begin
 result:=public.qr_independent_pin_login(repeat('a',64),'9999','859201',repeat('e',64),null);
 if (result->>'ok')::boolean is not true then raise exception 'PIN login A failed';end if;
 result:=public.qr_independent_pin_login(repeat('b',64),'9999','492863',repeat('f',64),null);
 if (result->>'ok')::boolean is not true then raise exception 'PIN login B failed';end if;
 result:=public.qr_independent_pin_login(repeat('b',64),'9999','859201',repeat('d',64),null);
 if (result->>'ok')::boolean is not false then raise exception 'wrong company PIN accepted';end if;
 rejected:=false;begin perform public.qr_independent_action(repeat('b',64),repeat('e',64),'STATUS',null);exception when others then rejected:=true;end;
 if not rejected then raise exception 'session accepted on another company terminal';end if;
 result:=public.qr_independent_action(repeat('a',64),repeat('e',64),'CLOCK_IN',repeat('1',64));
 if result->>'state'<>'RUNNING' then raise exception 'clock in A failed';end if;
 result:=public.qr_independent_action(repeat('a',64),repeat('e',64),'CLOCK_IN',repeat('1',64));
 if (result->>'replayed')::boolean is not true then raise exception 'request replay not detected';end if;
 result:=public.qr_independent_action(repeat('a',64),repeat('e',64),'BREAK_START',repeat('2',64));
 if result->>'state'<>'BREAK' then raise exception 'break start A failed';end if;
 result:=public.qr_independent_action(repeat('a',64),repeat('e',64),'BREAK_END',repeat('3',64));
 if result->>'state'<>'RUNNING' then raise exception 'break end A failed';end if;
 result:=public.qr_independent_action(repeat('a',64),repeat('e',64),'CLOCK_OUT',repeat('4',64));
 if result->>'state'<>'READY' then raise exception 'clock out A failed';end if;
 result:=public.qr_independent_action(repeat('b',64),repeat('f',64),'CLOCK_IN',repeat('5',64));
 if result->>'state'<>'RUNNING' then raise exception 'clock in B failed';end if;
end $test$;
reset role;
update public.employees set access_status='DISABLED' where id=(select ea from sf_independent_qr_test);
set local role anon;
do $test$ declare rejected boolean:=false; result jsonb; begin
 begin perform public.qr_independent_action(repeat('a',64),repeat('e',64),'STATUS',null);exception when others then rejected:=true;end;
 if not rejected then raise exception 'revoked independent QR session accepted';end if;
 result:=public.qr_independent_action(repeat('b',64),repeat('f',64),'STATUS',null);
 if result->>'state'<>'RUNNING' then raise exception 'other company session stopped';end if;
end $test$;
reset role;
rollback;