-- QR pause events are recorded against the existing published shift and QR terminal.
-- Legacy open shifts retain their previous planned-break behavior at clock-out.
alter table public.time_qr_punches drop constraint if exists time_qr_punches_punch_type_check;
alter table public.time_qr_punches add constraint time_qr_punches_punch_type_check
  check (punch_type in ('CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT'));
alter table public.time_qr_punches add column if not exists break_tracking_enabled boolean not null default false;

create table if not exists public.time_qr_breaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  terminal_id uuid not null references public.time_qr_terminals(id) on delete restrict,
  assignment_id uuid not null references public.shift_assignments(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  check (ended_at is null or ended_at > started_at)
);
create unique index if not exists time_qr_one_open_break on public.time_qr_breaks(assignment_id,employee_id) where ended_at is null;
create index if not exists time_qr_breaks_assignment on public.time_qr_breaks(assignment_id,started_at);
alter table public.time_qr_breaks enable row level security;
revoke all on table public.time_qr_breaks from public,anon,authenticated;
comment on table public.time_qr_breaks is 'Actual QR pause intervals; only authenticated, checked RPCs may write them.';

create or replace function private.employee_clock_from_qr_unchecked(p_token text, p_expected_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ctx jsonb;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_company_id uuid;
  v_employee_id uuid;
  v_terminal_id uuid;
  v_assignment_id uuid;
  v_assignment public.shift_assignments%rowtype;
  v_entry public.time_entries%rowtype;
  v_result jsonb;
  v_last_punch timestamptz;
  v_elapsed_minutes numeric;
  v_break_minutes integer;
  v_break_tracking boolean;
begin
  v_ctx := private.sf_qr_time_context(p_token);
  v_company_id := (v_ctx->>'company_id')::uuid;
  v_employee_id := (v_ctx->>'employee_id')::uuid;
  v_terminal_id := (v_ctx->>'terminal_id')::uuid;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;
  v_action := upper(coalesce(v_ctx->>'action',''));

  if v_action not in ('CLOCK_IN','CLOCK_OUT') then
    raise exception 'Diese Schicht ist bereits vollständig gebucht';
  end if;
  if upper(coalesce(p_expected_action,'')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text || ':' || v_terminal_id::text,0));
  v_ctx := private.sf_qr_time_context(p_token);
  v_action := upper(coalesce(v_ctx->>'action',''));
  if upper(coalesce(p_expected_action,'')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;

  select max(p.punched_at) into v_last_punch
  from public.time_qr_punches p
  where p.employee_id=v_employee_id and p.terminal_id=v_terminal_id;
  if v_last_punch is not null and v_now-v_last_punch < interval '20 seconds' then
    raise exception 'QR-Code wurde gerade bereits gebucht. Bitte kurz warten';
  end if;

  select a.* into v_assignment
  from public.shift_assignments a
  where a.id=v_assignment_id
    and a.employee_id=v_employee_id
    and a.company_id=v_company_id
    and a.status='PUBLISHED'
    and a.published_at is not null
  for update;
  if not found then raise exception 'Veröffentlichte Schicht wurde nicht gefunden'; end if;

  if v_action='CLOCK_IN' then
    select te.* into v_entry from public.time_entries te where te.assignment_id=v_assignment_id for update;
    if found then raise exception 'Für diese Schicht existiert bereits eine Zeitbuchung'; end if;

    insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at,break_tracking_enabled)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),'CLOCK_IN',v_now,true);

    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      employee_note,manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      correction_requested_by,correction_requested_at,updated_at,updated_by,version
    ) values(
      v_assignment_id,v_company_id,v_now,null,v_assignment.break_minutes,'open',
      'QR-Zeiterfassung','','EMPLOYEE','',null,null,null,null,null,v_now,auth.uid(),1
    ) returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    values(v_company_id,'TIME_QR_CLOCK_IN','time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',v_result,
      jsonb_build_object('terminal_id',v_terminal_id,'terminal_name',v_ctx->>'terminal_name'));
  else
    select te.* into v_entry from public.time_entries te where te.assignment_id=v_assignment_id for update;
    if not found or v_entry.status <> 'open' or v_entry.actual_start is null or v_entry.actual_end is not null then
      raise exception 'Keine offene QR-Zeitbuchung für diese Schicht gefunden';
    end if;

    if exists (select 1 from public.time_qr_breaks b where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is null) then
      raise exception 'Bitte zuerst die laufende Pause beenden';
    end if;
    select coalesce(bool_or(p.break_tracking_enabled),false) into v_break_tracking
    from public.time_qr_punches p
    where p.assignment_id=v_assignment_id and p.employee_id=v_employee_id and p.punch_type='CLOCK_IN';
    v_elapsed_minutes := extract(epoch from (v_now - v_entry.actual_start))/60.0;
    if v_break_tracking then
      select coalesce(round(sum(extract(epoch from (b.ended_at-b.started_at)))/60),0)::integer
      into v_break_minutes from public.time_qr_breaks b
      where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is not null;
    else
      -- Preserve the planned pause for a QR shift already running before this rollout.
      v_break_minutes := case when v_elapsed_minutes <= 0 or coalesce(v_assignment.break_minutes,0) >= v_elapsed_minutes
        then 0 else coalesce(v_assignment.break_minutes,0) end;
    end if;

    perform private.sf_validate_time_values(v_entry.actual_start,v_now,v_break_minutes);

    insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),'CLOCK_OUT',v_now);

    update public.time_entries
    set actual_end=v_now,
        break_minutes=v_break_minutes,
        status='recorded',
        employee_note=case when btrim(coalesce(employee_note,''))='' then 'QR-Zeiterfassung' else employee_note end,
        source='EMPLOYEE',
        correction_note='',
        submitted_at=v_now,
        confirmed_by=null,
        confirmed_at=null,
        correction_requested_by=null,
        correction_requested_at=null,
        updated_at=v_now,
        updated_by=auth.uid(),
        version=version+1
    where assignment_id=v_assignment_id
    returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    values(v_company_id,'TIME_QR_CLOCK_OUT','time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',v_result,
      jsonb_build_object(
        'terminal_id',v_terminal_id,
        'terminal_name',v_ctx->>'terminal_name',
        'planned_break_minutes',coalesce(v_assignment.break_minutes,0),
        'applied_break_minutes',v_break_minutes,
        'short_test_adjustment',v_break_minutes <> coalesce(v_assignment.break_minutes,0)
      ));
  end if;

  return jsonb_build_object(
    'ok',true,
    'action',v_action,
    'punched_at',v_now,
    'terminal_name',v_ctx->>'terminal_name',
    'assignment_id',v_assignment_id,
    'shift_code',v_assignment.shift_code,
    'time_entry',v_result
  );
end;
$$;

-- The public status contains no employee or company identifiers. Pilot/general
-- access is checked before resolving the shift, exactly as for the existing RPC.
create or replace function public.employee_qr_time_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ctx jsonb;
  v_break_start timestamptz;
  v_break_seconds numeric;
  v_tracking boolean;
begin
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  select coalesce(bool_or(p.break_tracking_enabled),false) into v_tracking
  from public.time_qr_punches p
  where p.assignment_id=(v_ctx->>'assignment_id')::uuid
    and p.employee_id=(v_ctx->>'employee_id')::uuid
    and p.punch_type='CLOCK_IN';
  if v_tracking and v_ctx->>'state'='RUNNING' then
    select b.started_at into v_break_start from public.time_qr_breaks b
    where b.assignment_id=(v_ctx->>'assignment_id')::uuid
      and b.employee_id=(v_ctx->>'employee_id')::uuid and b.ended_at is null
    limit 1;
    select coalesce(sum(extract(epoch from (coalesce(b.ended_at,clock_timestamp())-b.started_at))),0)
    into v_break_seconds from public.time_qr_breaks b
    where b.assignment_id=(v_ctx->>'assignment_id')::uuid
      and b.employee_id=(v_ctx->>'employee_id')::uuid;
  end if;
  return jsonb_build_object(
    'terminal_name',v_ctx->>'terminal_name','location_note',v_ctx->>'location_note',
    'assignment_id',v_ctx->>'assignment_id','shift_code',v_ctx->>'shift_code',
    'planned_start',v_ctx->>'planned_start','planned_end',v_ctx->>'planned_end',
    'planned_break_minutes',(v_ctx->>'planned_break_minutes')::integer,
    'action',v_ctx->>'action','state',v_ctx->>'state','clocked_in_at',v_ctx->>'clocked_in_at',
    'break_tracking_enabled',coalesce(v_tracking,false),
    'break_started_at',v_break_start,'break_seconds',coalesce(round(v_break_seconds),0)
  );
end;$$;
revoke all on function public.employee_qr_time_status(text) from public,anon;
grant execute on function public.employee_qr_time_status(text) to authenticated;

create or replace function public.employee_qr_break_from_qr(p_token text,p_expected_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ctx jsonb;
  v_now timestamptz;
  v_action text:=upper(coalesce(p_expected_action,''));
  v_company_id uuid;
  v_employee_id uuid;
  v_terminal_id uuid;
  v_assignment_id uuid;
  v_last_punch timestamptz;
  v_break public.time_qr_breaks%rowtype;
  v_entry public.time_entries%rowtype;
  v_tracking boolean;
begin
  if v_action not in ('BREAK_START','BREAK_END') then raise exception 'Ungültige Pausenbuchung'; end if;
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  if v_ctx->>'state'<>'RUNNING' then raise exception 'Keine laufende QR-Arbeitszeit gefunden'; end if;
  v_employee_id:=(v_ctx->>'employee_id')::uuid;
  v_terminal_id:=(v_ctx->>'terminal_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text||':'||v_terminal_id::text,0));
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  if v_ctx->>'state'<>'RUNNING' then raise exception 'Buchungsstatus hat sich geändert'; end if;
  v_now:=clock_timestamp();
  v_company_id:=(v_ctx->>'company_id')::uuid;
  v_assignment_id:=(v_ctx->>'assignment_id')::uuid;

  select te.* into v_entry from public.time_entries te
  where te.assignment_id=v_assignment_id for update;
  if not found or v_entry.status<>'open' or v_entry.actual_start is null or v_entry.actual_end is not null then
    raise exception 'Keine offene QR-Zeitbuchung gefunden';
  end if;
  select coalesce(bool_or(p.break_tracking_enabled),false) into v_tracking
  from public.time_qr_punches p where p.assignment_id=v_assignment_id
    and p.employee_id=v_employee_id and p.punch_type='CLOCK_IN';
  if not v_tracking then raise exception 'Pausenbuchung für diese bereits laufende Schicht noch nicht verfügbar'; end if;
  select max(p.punched_at) into v_last_punch from public.time_qr_punches p
  where p.employee_id=v_employee_id and p.terminal_id=v_terminal_id;
  if v_last_punch is not null and v_now-v_last_punch < interval '20 seconds' then
    raise exception 'QR-Code wurde gerade bereits gebucht. Bitte kurz warten';
  end if;
  select b.* into v_break from public.time_qr_breaks b
  where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is null
  for update;
  if v_action='BREAK_START' then
    if found then raise exception 'Eine Pause läuft bereits'; end if;
    insert into public.time_qr_breaks(company_id,terminal_id,assignment_id,employee_id,started_at)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,v_now);
  else
    if not found then raise exception 'Keine laufende Pause gefunden'; end if;
    update public.time_qr_breaks set ended_at=v_now where id=v_break.id;
  end if;
  insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at)
  values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),v_action,v_now);
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company_id,'TIME_QR_'||v_action,'time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',
    jsonb_build_object('action',v_action,'punched_at',v_now),
    jsonb_build_object('terminal_id',v_terminal_id,'terminal_name',v_ctx->>'terminal_name'));
  return jsonb_build_object('ok',true,'action',v_action,'punched_at',v_now);
end;$$;
revoke all on function public.employee_qr_break_from_qr(text,text) from public,anon;
grant execute on function public.employee_qr_break_from_qr(text,text) to authenticated;
