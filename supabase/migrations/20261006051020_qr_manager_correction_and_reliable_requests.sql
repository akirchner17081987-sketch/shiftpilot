begin;

-- A request identifier belongs to the immutable punch event. Existing retention
-- and shift deletion therefore also remove its deduplication record.
alter table public.time_qr_independent_events add column request_id text;
alter table public.time_qr_independent_events add constraint time_qr_request_format
  check (request_id is null or request_id ~ '^[0-9a-f]{64}$');
create unique index time_qr_independent_request_once
  on public.time_qr_independent_events(request_id) where request_id is not null;

-- Internal snapshot: invoked only by authorized functions, never by the Data API.
create function private.sf_qr_independent_snapshot(p_shift_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select x.value||jsonb_build_object('revision',md5(x.value::text)) from (
    select jsonb_build_object('id',s.id,'company_id',s.company_id,'employee_id',s.employee_id,
      'terminal_id',s.terminal_id,'started_at',s.started_at,'ended_at',s.ended_at,
      'breaks',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.ordinal,
        'started_at',b.started_at,'ended_at',b.ended_at) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb)) value
    from public.time_qr_independent_shifts s where s.id=p_shift_id
  ) x;
$$;
revoke all on function private.sf_qr_independent_snapshot(uuid) from public,anon,authenticated;

create function private.sf_manager_qr_independent_detail(p_company_id uuid,p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berechtigung'; end if;
  select private.sf_qr_independent_snapshot(s.id)||jsonb_build_object(
    'employee_name',btrim(concat_ws(' ',e.first_name,e.last_name)),'personnel_no',e.personnel_no,
    'terminal_name',t.name,'timezone',coalesce(c.timezone,'Europe/Berlin'),
    'history',coalesce((select jsonb_agg(jsonb_build_object('created_at',a.created_at,
      'actor_role',a.actor_role,'actor_name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,a.actor_role),
      'reason',a.metadata->>'reason','metadata',a.metadata,'old_values',a.old_values,'new_values',a.new_values)
      order by a.created_at desc,a.id)
      from public.audit_events a left join auth.users u on u.id=a.actor_id
      where a.company_id=p_company_id and a.entity_id=s.id and a.event_type='QR_SHIFT_CORRECTED'),'[]'::jsonb))
    into v_result
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
    join public.companies c on c.id=s.company_id
    where s.id=p_shift_id and s.company_id=p_company_id;
  if v_result is null then raise exception 'QR-Buchung nicht gefunden'; end if;
  return v_result;
end;$$;
revoke all on function private.sf_manager_qr_independent_detail(uuid,uuid) from public,anon;
grant execute on function private.sf_manager_qr_independent_detail(uuid,uuid) to authenticated;

create function public.manager_qr_independent_detail(p_company_id uuid,p_shift_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.sf_manager_qr_independent_detail(p_company_id,p_shift_id);
$$;
revoke all on function public.manager_qr_independent_detail(uuid,uuid) from public,anon;
grant execute on function public.manager_qr_independent_detail(uuid,uuid) to authenticated;

create function private.sf_manager_correct_qr_independent_shift(
  p_company_id uuid,p_shift_id uuid,p_started_at timestamptz,p_ended_at timestamptz,
  p_reason text,p_expected_revision text,p_breaks jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_shift public.time_qr_independent_shifts%rowtype;
  v_old jsonb;v_new jsonb;v_pauses jsonb;v_prepared jsonb:='[]'::jsonb;v_pause jsonb;
  v_start timestamptz;v_end timestamptz;v_last_end timestamptz;v_number integer;
  v_month date;v_timezone text;v_role text;
begin
  if auth.uid() is null or not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berechtigung'; end if;
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
end;$$;
revoke all on function private.sf_manager_correct_qr_independent_shift(uuid,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function private.sf_manager_correct_qr_independent_shift(uuid,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

create function public.manager_correct_qr_independent_shift(
  p_company_id uuid,p_shift_id uuid,p_started_at timestamptz,p_ended_at timestamptz,
  p_reason text,p_expected_revision text,p_breaks jsonb default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.sf_manager_correct_qr_independent_shift(p_company_id,p_shift_id,p_started_at,p_ended_at,p_reason,p_expected_revision,p_breaks);
$$;
revoke all on function public.manager_correct_qr_independent_shift(uuid,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.manager_correct_qr_independent_shift(uuid,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

-- Inherit the existing staged authentication policy for time management.
insert into private.sf_mfa_protected_rpcs(function_name,rollout_stage,control_area,enabled)
select name,p.rollout_stage,p.control_area,p.enabled from private.sf_mfa_protected_rpcs p
cross join (values('manager_qr_independent_detail'),('manager_correct_qr_independent_shift')) f(name)
where p.function_name='manager_list_time_entries' on conflict(function_name) do nothing;

-- Add the booking location and server snapshot time to the existing QR response.
-- Retain all session, tenant, locking, ten-break and clock-out behavior.
create or replace function public.qr_independent_action(
  p_terminal_token text,p_session_token text,p_action text,p_request_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
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
end;$$;


revoke all on function public.qr_independent_action(text,text,text,text) from public,anon,authenticated;
grant execute on function public.qr_independent_action(text,text,text,text) to service_role;
-- Preserve the original signature for already-open clients and existing callers.
create or replace function public.qr_independent_action(p_terminal_token text,p_session_token text,p_action text)
returns jsonb language sql security definer set search_path='' as $$
  select public.qr_independent_action(p_terminal_token,p_session_token,p_action,null);
$$;
revoke all on function public.qr_independent_action(text,text,text) from public,anon,authenticated;
grant execute on function public.qr_independent_action(text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
