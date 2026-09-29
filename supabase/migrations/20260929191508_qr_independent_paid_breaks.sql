-- Independent QR attendance. A paid pause is still separately recorded so
-- attendance/pay duration and work duration can be reviewed independently.
create table public.time_qr_independent_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  terminal_id uuid not null references public.time_qr_terminals(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (ended_at is null or ended_at > started_at)
);
create unique index time_qr_independent_one_open on public.time_qr_independent_shifts(employee_id) where ended_at is null;
create index time_qr_independent_company_start on public.time_qr_independent_shifts(company_id,started_at desc);

create table public.time_qr_independent_breaks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.time_qr_independent_shifts(id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 5),
  started_at timestamptz not null,
  ended_at timestamptz,
  unique(shift_id,ordinal),
  check (ended_at is null or ended_at > started_at)
);
create unique index time_qr_independent_one_open_break on public.time_qr_independent_breaks(shift_id) where ended_at is null;

create table public.time_qr_independent_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.time_qr_independent_shifts(id) on delete cascade,
  action text not null check (action in ('CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')),
  punched_at timestamptz not null
);
create index time_qr_independent_events_shift on public.time_qr_independent_events(shift_id,punched_at);

create table public.time_qr_independent_sessions (
  token_hash bytea primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  terminal_id uuid not null references public.time_qr_terminals(id) on delete cascade,
  expires_at timestamptz not null
);
create index time_qr_independent_sessions_expiry on public.time_qr_independent_sessions(expires_at);

create table public.time_qr_independent_login_limits (
  key_hash bytea primary key,
  failed_count integer not null default 0,
  reset_at timestamptz not null
);
create index time_qr_independent_login_limits_expiry on public.time_qr_independent_login_limits(reset_at);

alter table public.time_qr_independent_shifts enable row level security;
alter table public.time_qr_independent_breaks enable row level security;
alter table public.time_qr_independent_events enable row level security;
alter table public.time_qr_independent_sessions enable row level security;
alter table public.time_qr_independent_login_limits enable row level security;
revoke all on public.time_qr_independent_shifts,public.time_qr_independent_breaks,
  public.time_qr_independent_events,public.time_qr_independent_sessions,
  public.time_qr_independent_login_limits from public,anon,authenticated;

-- Called by the Edge Function with its service credential. Only a hash of
-- the short-lived random session token is stored. Attempts are persistent
-- across Edge instances and do not reveal whether a personnel number exists.
create function public.qr_independent_login(
  p_terminal_token text,p_personnel_no text,p_start_date date,p_session_token text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_terminal public.time_qr_terminals%rowtype;
  v_employee public.employees%rowtype;
  v_key bytea;
  v_limit public.time_qr_independent_login_limits%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_terminal_token !~ '^[0-9a-fA-F]{64}$' or p_session_token !~ '^[0-9a-fA-F]{64}$'
    or length(btrim(coalesce(p_personnel_no,''))) not between 1 and 100
  then raise exception 'Ungültige Anmeldung'; end if;
  select * into v_terminal from public.time_qr_terminals
  where token_hash=extensions.digest(lower(p_terminal_token),'sha256') and is_active=true;
  if not found then raise exception 'QR-Code ist ungültig oder deaktiviert'; end if;
  v_key:=extensions.digest(v_terminal.id::text||':'||lower(btrim(p_personnel_no)),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(v_key,'hex'),0));
  select * into v_limit from public.time_qr_independent_login_limits
    where key_hash=v_key for update;
  if found and v_limit.reset_at>v_now and v_limit.failed_count>=5 then
    raise exception 'Zu viele Versuche. Bitte in 15 Minuten erneut anmelden';
  end if;
  select * into v_employee from public.employees
  where company_id=v_terminal.company_id and lower(personnel_no)=lower(btrim(p_personnel_no))
    and start_date=p_start_date and status='active' and access_status<>'DISABLED';
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
end;$$;
revoke all on function public.qr_independent_login(text,text,date,text) from public,anon,authenticated;
grant execute on function public.qr_independent_login(text,text,date,text) to service_role;

create function public.qr_independent_action(
  p_terminal_token text,p_session_token text,p_action text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_session public.time_qr_independent_sessions%rowtype;
  v_shift public.time_qr_independent_shifts%rowtype;
  v_break public.time_qr_independent_breaks%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_action text:=upper(coalesce(p_action,''));
  v_name text;
  v_ordinal integer;
  v_breaks jsonb;
begin
  if p_terminal_token !~ '^[0-9a-fA-F]{64}$' or p_session_token !~ '^[0-9a-fA-F]{64}$'
    or v_action not in ('STATUS','CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')
  then raise exception 'Ungültige Anfrage'; end if;
  select s.* into v_session from public.time_qr_independent_sessions s
  join public.time_qr_terminals t on t.id=s.terminal_id and t.is_active
  join public.employees e on e.id=s.employee_id and e.status='active' and e.access_status<>'DISABLED'
  where s.token_hash=extensions.digest(lower(p_session_token),'sha256')
    and s.expires_at>v_now and t.token_hash=extensions.digest(lower(p_terminal_token),'sha256');
  if not found then raise exception 'Anmeldung abgelaufen. Bitte erneut anmelden'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session.employee_id::text,0));
  select btrim(first_name||' '||last_name) into v_name from public.employees where id=v_session.employee_id;
  select * into v_shift from public.time_qr_independent_shifts
  where employee_id=v_session.employee_id and ended_at is null for update;
  if found and v_shift.company_id<>v_session.company_id then
    raise exception 'Eine Buchung an einem anderen Standort ist noch offen'; end if;
  if v_action='CLOCK_IN' then
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
      if v_ordinal>5 then raise exception 'Maximal fünf Pausen pro Buchung'; end if;
      insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at)
      values(v_shift.id,v_ordinal,v_now);
    elsif v_action='BREAK_END' then
      if v_break.id is null then raise exception 'Keine laufende Pause gefunden'; end if;
      update public.time_qr_independent_breaks set ended_at=v_now where id=v_break.id;
    elsif v_action='CLOCK_OUT' then
      if v_break.id is not null then raise exception 'Bitte zuerst die Pause beenden'; end if;
      update public.time_qr_independent_shifts set ended_at=v_now where id=v_shift.id;
      v_shift.ended_at:=v_now;
    end if;
  end if;
  if v_action<>'STATUS' then
    insert into public.time_qr_independent_events(shift_id,action,punched_at)
    values(v_shift.id,v_action,v_now);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('number',b.ordinal,
    'started_at',b.started_at,'ended_at',b.ended_at) order by b.ordinal),'[]'::jsonb)
    into v_breaks from public.time_qr_independent_breaks b where b.shift_id=v_shift.id;
  return jsonb_build_object('ok',true,'name',v_name,'state',
    case when v_shift.id is null or v_shift.ended_at is not null then 'READY'
         when exists(select 1 from public.time_qr_independent_breaks b where b.shift_id=v_shift.id and b.ended_at is null) then 'BREAK'
         else 'RUNNING' end,
    'started_at',v_shift.started_at,'ended_at',v_shift.ended_at,
    'breaks',v_breaks,'punched_at',case when v_action='STATUS' then null else v_now end);
end;$$;
revoke all on function public.qr_independent_action(text,text,text) from public,anon,authenticated;
grant execute on function public.qr_independent_action(text,text,text) to service_role;

-- Manager report, one row per attendance period and five separate pause pairs.
create function public.manager_qr_independent_report(
  p_company_id uuid,p_start_date date,p_end_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_timezone text;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
     or p_end_date-p_start_date>62 then raise exception 'Bitte einen Zeitraum bis 63 Tage wählen'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]'::jsonb)
  into v_result from (
    select s.id, btrim(e.first_name||' '||e.last_name) employee_name,e.personnel_no,
      s.started_at,s.ended_at,t.name terminal_name,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at)
        order by b.ordinal) from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      case when s.ended_at is not null then round(extract(epoch from (s.ended_at-s.started_at))/60)::integer end paid_minutes,
      (select coalesce(round(sum(extract(epoch from (coalesce(b.ended_at,clock_timestamp())-b.started_at)))/60),0)::integer
       from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id
    join public.time_qr_terminals t on t.id=s.terminal_id
    where s.company_id=p_company_id
      and (s.started_at at time zone v_timezone)::date between p_start_date and p_end_date
    order by s.started_at desc limit 500
  ) x;
  return v_result;
end;$$;
revoke all on function public.manager_qr_independent_report(uuid,date,date) from public,anon;
grant execute on function public.manager_qr_independent_report(uuid,date,date) to authenticated;

-- Independent attendance also prevents deletion of a terminal with records.
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

revoke all on function public.manager_delete_time_qr_terminal(uuid) from public,anon;
grant execute on function public.manager_delete_time_qr_terminal(uuid) to authenticated,service_role;
