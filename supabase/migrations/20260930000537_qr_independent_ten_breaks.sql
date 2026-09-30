-- Increase only the independent QR pause limit; retain existing tenant/session checks.
alter table public.time_qr_independent_breaks
  drop constraint time_qr_independent_breaks_ordinal_check,
  add constraint time_qr_independent_breaks_ordinal_check check (ordinal between 1 and 10);

create or replace function public.qr_independent_action(
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
  join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id and t.is_active
  join public.employees e on e.id=s.employee_id and e.company_id=s.company_id and e.status='active' and e.access_status<>'DISABLED'
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
      if v_ordinal>10 then raise exception 'Maximal zehn Pausen pro Buchung'; end if;
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
