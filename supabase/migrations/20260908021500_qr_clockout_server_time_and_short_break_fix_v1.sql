create or replace function private.sf_validate_time_values(
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_minutes numeric;
begin
  if p_actual_start is null or p_actual_end is null then
    raise exception 'Beginn und Ende muessen angegeben werden';
  end if;
  if p_actual_end <= p_actual_start then
    raise exception 'Das Ende muss nach dem Beginn liegen';
  end if;
  if p_actual_end > clock_timestamp() + interval '5 seconds' then
    raise exception 'Das tatsaechliche Ende darf nicht in der Zukunft liegen';
  end if;
  v_minutes := extract(epoch from (p_actual_end - p_actual_start))/60;
  if coalesce(p_break_minutes,-1) < 0 or p_break_minutes >= v_minutes then
    raise exception 'Die Pause muss kuerzer als die Arbeitszeit sein';
  end if;
end;
$function$;

create or replace function private.employee_clock_from_qr_unchecked(
  p_token text,
  p_expected_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

    insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),'CLOCK_IN',v_now);

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

    v_elapsed_minutes := extract(epoch from (v_now - v_entry.actual_start))/60.0;
    v_break_minutes := case
      when v_elapsed_minutes <= 0 then 0
      when coalesce(v_assignment.break_minutes,0) >= v_elapsed_minutes then 0
      else coalesce(v_assignment.break_minutes,0)
    end;

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
$function$;
