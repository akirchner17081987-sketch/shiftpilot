-- SchichtFunk – QR-Zeiterfassung V1
-- Vorbereitete, noch nicht produktiv angewendete Datenbankänderung.
-- Ziel: statischer, widerrufbarer QR-Code je Stempelstation; Zeitstempel ausschließlich serverseitig.
-- Vor Produktiv-Rollout mit `supabase migration new ...` in eine echte Migration übernehmen.

begin;

create extension if not exists pgcrypto;

-- SECURITY DEFINER-Implementierungen liegen absichtlich NICHT im exponierten public-Schema.
create schema if not exists qr_private;
revoke all on schema qr_private from public, anon, authenticated;
grant usage on schema qr_private to authenticated;

create table if not exists public.time_clock_stations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  token_hash bytea not null unique,
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_scan_at timestamptz,
  constraint time_clock_station_name_chk check (char_length(trim(name)) between 1 and 80)
);

create index if not exists time_clock_stations_company_idx
  on public.time_clock_stations(company_id,active,name);

create table if not exists public.time_clock_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  station_id uuid not null references public.time_clock_stations(id) on delete restrict,
  assignment_id uuid not null references public.shift_assignments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  actor_user_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint time_clock_event_type_chk check (event_type in ('CLOCK_IN','CLOCK_OUT'))
);

create index if not exists time_clock_events_employee_recent_idx
  on public.time_clock_events(employee_id,occurred_at desc);
create index if not exists time_clock_events_station_recent_idx
  on public.time_clock_events(station_id,occurred_at desc);
create index if not exists time_clock_events_assignment_idx
  on public.time_clock_events(assignment_id,occurred_at);

alter table public.time_entries
  add column if not exists capture_method text not null default 'MANUAL';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.time_entries'::regclass
      and conname='time_entries_capture_method_chk'
  ) then
    alter table public.time_entries
      add constraint time_entries_capture_method_chk
      check (capture_method in ('MANUAL','QR'));
  end if;
end $$;

alter table public.time_clock_stations enable row level security;
alter table public.time_clock_events enable row level security;

-- Kein direkter Browserzugriff auf Stationsschlüssel oder Scanereignisse.
revoke all on public.time_clock_stations from public, anon, authenticated;
revoke all on public.time_clock_events from public, anon, authenticated;

create or replace function qr_private.sf_qr_token_hash(p_token text)
returns bytea
language sql
immutable
set search_path=''
as $$
  select digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256');
$$;

create or replace function qr_private.manager_list_time_clock_stations_impl(p_company_id uuid)
returns table(
  id uuid,
  name text,
  active boolean,
  last_scan_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;

  return query
    select s.id,s.name,s.active,s.last_scan_at,s.created_at,s.updated_at
    from public.time_clock_stations s
    where s.company_id=p_company_id
    order by s.active desc,lower(s.name),s.created_at;
end;
$$;

create or replace function qr_private.manager_create_time_clock_station_impl(
  p_company_id uuid,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text;
  v_station public.time_clock_stations%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 80 then
    raise exception 'Bitte einen Stationsnamen mit 1 bis 80 Zeichen angeben';
  end if;

  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.time_clock_stations(company_id,name,token_hash,created_by)
  values(p_company_id,trim(p_name),qr_private.sf_qr_token_hash(v_token),v_user)
  returning * into v_station;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    p_company_id,'TIME_CLOCK_STATION_CREATED','time_clock_station',v_station.id,v_user,'MANAGER',
    jsonb_build_object('name',v_station.name,'active',v_station.active),
    jsonb_build_object('source','QR_TIME_CLOCK')
  );

  return jsonb_build_object(
    'id',v_station.id,
    'name',v_station.name,
    'active',v_station.active,
    'token',v_token
  );
end;
$$;

create or replace function qr_private.manager_rotate_time_clock_station_impl(p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text;
  v_station public.time_clock_stations%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_station
  from public.time_clock_stations
  where id=p_station_id
  for update;
  if not found then raise exception 'Stempelstation nicht gefunden'; end if;
  if not private.sf_is_manager(v_station.company_id,false) then raise exception 'Keine Berechtigung'; end if;

  v_token:=encode(gen_random_bytes(32),'hex');
  update public.time_clock_stations
  set token_hash=qr_private.sf_qr_token_hash(v_token),active=true,updated_at=now()
  where id=v_station.id
  returning * into v_station;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_station.company_id,'TIME_CLOCK_STATION_ROTATED','time_clock_station',v_station.id,v_user,'MANAGER',
    jsonb_build_object('name',v_station.name,'active',true),
    jsonb_build_object('source','QR_TIME_CLOCK')
  );

  return jsonb_build_object(
    'id',v_station.id,
    'name',v_station.name,
    'active',v_station.active,
    'token',v_token
  );
end;
$$;

create or replace function qr_private.manager_set_time_clock_station_active_impl(
  p_station_id uuid,
  p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_station public.time_clock_stations%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_station
  from public.time_clock_stations
  where id=p_station_id
  for update;
  if not found then raise exception 'Stempelstation nicht gefunden'; end if;
  if not private.sf_is_manager(v_station.company_id,false) then raise exception 'Keine Berechtigung'; end if;

  update public.time_clock_stations
  set active=coalesce(p_active,false),updated_at=now()
  where id=v_station.id
  returning * into v_station;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_station.company_id,'TIME_CLOCK_STATION_STATUS_CHANGED','time_clock_station',v_station.id,v_user,'MANAGER',
    jsonb_build_object('name',v_station.name,'active',v_station.active),
    jsonb_build_object('source','QR_TIME_CLOCK')
  );

  return jsonb_build_object('id',v_station.id,'name',v_station.name,'active',v_station.active);
end;
$$;

create or replace function qr_private.employee_qr_clock_state_impl(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_station public.time_clock_stations%rowtype;
  v_employee public.employees%rowtype;
  v_assignment public.shift_assignments%rowtype;
  v_entry public.time_entries%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'QR-Code ungültig'; end if;

  select * into v_station
  from public.time_clock_stations s
  where s.token_hash=qr_private.sf_qr_token_hash(p_token)
    and s.active=true
  limit 1;
  if not found then raise exception 'QR-Code ungültig oder deaktiviert'; end if;

  select * into v_employee
  from public.employees e
  where e.company_id=v_station.company_id
    and e.auth_user_id=v_user
    and e.status='active'
  order by e.id
  limit 1;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang für diese Stempelstation'; end if;

  -- Eine laufende QR-Buchung hat Vorrang: der nächste bestätigte Scan beendet sie.
  select sa.* into v_assignment
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id
  where sa.company_id=v_station.company_id
    and sa.employee_id=v_employee.id
    and te.status='open'
    and te.capture_method='QR'
    and te.actual_start is not null
    and te.actual_end is null
  order by te.actual_start desc
  limit 1;

  if found then
    select * into v_entry
    from public.time_entries
    where assignment_id=v_assignment.id;

    return jsonb_build_object(
      'stationName',v_station.name,
      'action','CLOCK_OUT',
      'assignmentId',v_assignment.id,
      'shiftCode',v_assignment.shift_code,
      'plannedStart',v_assignment.starts_at,
      'plannedEnd',v_assignment.ends_at,
      'actualStart',v_entry.actual_start,
      'serverTime',v_now
    );
  end if;

  -- Einstempeln nur in einem plausiblen Fenster um den geplanten Schichtbeginn.
  select sa.* into v_assignment
  from public.shift_assignments sa
  where sa.company_id=v_station.company_id
    and sa.employee_id=v_employee.id
    and (sa.status='PUBLISHED' or sa.published_at is not null)
    and v_now >= sa.starts_at - interval '2 hours'
    and v_now <= sa.starts_at + interval '4 hours'
    and not exists (
      select 1
      from public.time_entries te
      where te.assignment_id=sa.id
        and (te.actual_start is not null or te.status <> 'open')
    )
  order by abs(extract(epoch from (sa.starts_at-v_now))),sa.starts_at
  limit 1;

  if not found then
    return jsonb_build_object(
      'stationName',v_station.name,
      'action','NONE',
      'serverTime',v_now,
      'message','Keine passende veröffentlichte Schicht im Stempelfenster gefunden.'
    );
  end if;

  return jsonb_build_object(
    'stationName',v_station.name,
    'action','CLOCK_IN',
    'assignmentId',v_assignment.id,
    'shiftCode',v_assignment.shift_code,
    'plannedStart',v_assignment.starts_at,
    'plannedEnd',v_assignment.ends_at,
    'serverTime',v_now
  );
end;
$$;

create or replace function qr_private.employee_qr_clock_impl(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_station public.time_clock_stations%rowtype;
  v_employee public.employees%rowtype;
  v_assignment public.shift_assignments%rowtype;
  v_entry public.time_entries%rowtype;
  v_previous public.time_clock_events%rowtype;
  v_break integer := 0;
  v_duration_minutes integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'QR-Code ungültig'; end if;

  select * into v_station
  from public.time_clock_stations s
  where s.token_hash=qr_private.sf_qr_token_hash(p_token)
    and s.active=true
  limit 1;
  if not found then raise exception 'QR-Code ungültig oder deaktiviert'; end if;

  select * into v_employee
  from public.employees e
  where e.company_id=v_station.company_id
    and e.auth_user_id=v_user
    and e.status='active'
  order by e.id
  limit 1;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang für diese Stempelstation'; end if;

  -- Advisory Lock nur für diesen Mitarbeiter: parallele Doppelscans werden serialisiert,
  -- ohne alle Mitarbeitenden derselben Station gegenseitig zu blockieren.
  perform pg_advisory_xact_lock(hashtextextended(v_employee.id::text,0));
  v_now:=clock_timestamp();

  select * into v_previous
  from public.time_clock_events ev
  where ev.station_id=v_station.id
    and ev.employee_id=v_employee.id
  order by ev.occurred_at desc
  limit 1;

  if found and v_previous.occurred_at >= v_now - interval '20 seconds' then
    return jsonb_build_object(
      'event',v_previous.event_type,
      'duplicate',true,
      'occurredAt',v_previous.occurred_at,
      'assignmentId',v_previous.assignment_id,
      'stationName',v_station.name,
      'message','Dieser Scan wurde bereits verarbeitet.'
    );
  end if;

  -- CLOCK_OUT: nur von QR gestartete, noch offene Zeiterfassung übernehmen.
  select sa.* into v_assignment
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id
  where sa.company_id=v_station.company_id
    and sa.employee_id=v_employee.id
    and te.status='open'
    and te.capture_method='QR'
    and te.actual_start is not null
    and te.actual_end is null
  order by te.actual_start desc
  limit 1;

  if found then
    select * into v_entry
    from public.time_entries
    where assignment_id=v_assignment.id
    for update;

    if v_now <= v_entry.actual_start then raise exception 'Ungültige Zeitfolge'; end if;
    if v_now-v_entry.actual_start > interval '24 hours' then
      raise exception 'Die laufende Zeiterfassung ist älter als 24 Stunden. Bitte die Verwaltung kontaktieren.';
    end if;

    v_duration_minutes:=greatest(1,floor(extract(epoch from (v_now-v_entry.actual_start))/60)::integer);
    v_break:=least(greatest(coalesce(v_assignment.break_minutes,0),0),greatest(0,v_duration_minutes-1));

    update public.time_entries
    set actual_end=v_now,
        break_minutes=v_break,
        status='recorded',
        source='EMPLOYEE',
        capture_method='QR',
        submitted_at=v_now,
        confirmed_by=null,
        confirmed_at=null,
        correction_requested_by=null,
        correction_requested_at=null,
        correction_note='',
        updated_by=v_user,
        updated_at=v_now,
        version=version+1
    where assignment_id=v_assignment.id
    returning * into v_entry;

    insert into public.time_clock_events(
      company_id,station_id,assignment_id,employee_id,actor_user_id,event_type,occurred_at
    ) values(
      v_station.company_id,v_station.id,v_assignment.id,v_employee.id,v_user,'CLOCK_OUT',v_now
    );

    update public.time_clock_stations
    set last_scan_at=v_now,updated_at=v_now
    where id=v_station.id;

    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    ) values(
      v_station.company_id,'TIME_CLOCK_OUT','time_entry',v_assignment.id,v_user,'EMPLOYEE',
      jsonb_build_object(
        'actualStart',v_entry.actual_start,'actualEnd',v_entry.actual_end,
        'breakMinutes',v_entry.break_minutes,'status',v_entry.status,'version',v_entry.version
      ),
      jsonb_build_object(
        'stationId',v_station.id,'stationName',v_station.name,'captureMethod','QR'
      )
    );

    perform private.sf_notify_managers(
      v_station.company_id,'TIME_ENTRY_REVIEW','QR-Zeit wartet auf Prüfung',
      trim(coalesce(v_employee.first_name,'')||' '||coalesce(v_employee.last_name,''))||
        ' hat '||v_assignment.shift_code||' per QR beendet.',
      'time','time_entry',v_assignment.id,
      jsonb_build_object(
        'assignmentId',v_assignment.id,'employeeId',v_employee.id,
        'status','recorded','captureMethod','QR'
      )
    );

    return jsonb_build_object(
      'event','CLOCK_OUT',
      'duplicate',false,
      'occurredAt',v_now,
      'assignmentId',v_assignment.id,
      'shiftCode',v_assignment.shift_code,
      'stationName',v_station.name,
      'actualStart',v_entry.actual_start,
      'actualEnd',v_entry.actual_end,
      'message','Dienstende wurde erfasst und zur Prüfung gesendet.'
    );
  end if;

  -- CLOCK_IN: nächste veröffentlichte eigene Schicht im Stempelfenster wählen.
  select sa.* into v_assignment
  from public.shift_assignments sa
  where sa.company_id=v_station.company_id
    and sa.employee_id=v_employee.id
    and (sa.status='PUBLISHED' or sa.published_at is not null)
    and v_now >= sa.starts_at - interval '2 hours'
    and v_now <= sa.starts_at + interval '4 hours'
  order by abs(extract(epoch from (sa.starts_at-v_now))),sa.starts_at
  limit 1;
  if not found then raise exception 'Keine passende veröffentlichte Schicht im Stempelfenster gefunden'; end if;

  select * into v_entry
  from public.time_entries
  where assignment_id=v_assignment.id
  for update;

  if found and (v_entry.actual_start is not null or v_entry.status <> 'open') then
    raise exception 'Für diese Schicht existiert bereits eine Zeiterfassung';
  end if;

  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    updated_by,updated_at,employee_note,manager_note,source,capture_method,
    submitted_at,confirmed_by,confirmed_at,correction_requested_by,
    correction_requested_at,correction_note,version
  ) values(
    v_assignment.id,v_station.company_id,v_now,null,0,'open',
    v_user,v_now,'','','EMPLOYEE','QR',
    null,null,null,null,null,'',
    case when v_entry.assignment_id is null then 1 else v_entry.version+1 end
  )
  on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,
    actual_end=null,
    break_minutes=0,
    status='open',
    updated_by=v_user,
    updated_at=v_now,
    source='EMPLOYEE',
    capture_method='QR',
    submitted_at=null,
    confirmed_by=null,
    confirmed_at=null,
    correction_requested_by=null,
    correction_requested_at=null,
    correction_note='',
    version=public.time_entries.version+1
  returning * into v_entry;

  insert into public.time_clock_events(
    company_id,station_id,assignment_id,employee_id,actor_user_id,event_type,occurred_at
  ) values(
    v_station.company_id,v_station.id,v_assignment.id,v_employee.id,v_user,'CLOCK_IN',v_now
  );

  update public.time_clock_stations
  set last_scan_at=v_now,updated_at=v_now
  where id=v_station.id;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  ) values(
    v_station.company_id,'TIME_CLOCK_IN','time_entry',v_assignment.id,v_user,'EMPLOYEE',
    jsonb_build_object(
      'actualStart',v_entry.actual_start,'actualEnd',null,'status','open','version',v_entry.version
    ),
    jsonb_build_object(
      'stationId',v_station.id,'stationName',v_station.name,'captureMethod','QR'
    )
  );

  return jsonb_build_object(
    'event','CLOCK_IN',
    'duplicate',false,
    'occurredAt',v_now,
    'assignmentId',v_assignment.id,
    'shiftCode',v_assignment.shift_code,
    'stationName',v_station.name,
    'actualStart',v_entry.actual_start,
    'message','Dienstbeginn wurde erfasst.'
  );
end;
$$;

-- Exponierte RPCs bleiben SECURITY INVOKER. Privilegierte Logik liegt in qr_private.
create or replace function public.manager_list_time_clock_stations(p_company_id uuid)
returns table(id uuid,name text,active boolean,last_scan_at timestamptz,created_at timestamptz,updated_at timestamptz)
language sql
stable
security invoker
set search_path=''
as $$
  select * from qr_private.manager_list_time_clock_stations_impl(p_company_id);
$$;

create or replace function public.manager_create_time_clock_station(p_company_id uuid,p_name text)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select qr_private.manager_create_time_clock_station_impl(p_company_id,p_name);
$$;

create or replace function public.manager_rotate_time_clock_station(p_station_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select qr_private.manager_rotate_time_clock_station_impl(p_station_id);
$$;

create or replace function public.manager_set_time_clock_station_active(p_station_id uuid,p_active boolean)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select qr_private.manager_set_time_clock_station_active_impl(p_station_id,p_active);
$$;

create or replace function public.employee_qr_clock_state(p_token text)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select qr_private.employee_qr_clock_state_impl(p_token);
$$;

create or replace function public.employee_qr_clock(p_token text)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select qr_private.employee_qr_clock_impl(p_token);
$$;

-- Funktionen sind standardmäßig zu großzügig ausführbar: explizit einschränken.
revoke execute on all functions in schema qr_private from public, anon;
revoke execute on function public.manager_list_time_clock_stations(uuid) from public, anon;
revoke execute on function public.manager_create_time_clock_station(uuid,text) from public, anon;
revoke execute on function public.manager_rotate_time_clock_station(uuid) from public, anon;
revoke execute on function public.manager_set_time_clock_station_active(uuid,boolean) from public, anon;
revoke execute on function public.employee_qr_clock_state(text) from public, anon;
revoke execute on function public.employee_qr_clock(text) from public, anon;

grant execute on function qr_private.manager_list_time_clock_stations_impl(uuid) to authenticated;
grant execute on function qr_private.manager_create_time_clock_station_impl(uuid,text) to authenticated;
grant execute on function qr_private.manager_rotate_time_clock_station_impl(uuid) to authenticated;
grant execute on function qr_private.manager_set_time_clock_station_active_impl(uuid,boolean) to authenticated;
grant execute on function qr_private.employee_qr_clock_state_impl(text) to authenticated;
grant execute on function qr_private.employee_qr_clock_impl(text) to authenticated;

grant execute on function public.manager_list_time_clock_stations(uuid) to authenticated;
grant execute on function public.manager_create_time_clock_station(uuid,text) to authenticated;
grant execute on function public.manager_rotate_time_clock_station(uuid) to authenticated;
grant execute on function public.manager_set_time_clock_station_active(uuid,boolean) to authenticated;
grant execute on function public.employee_qr_clock_state(text) to authenticated;
grant execute on function public.employee_qr_clock(text) to authenticated;

commit;
