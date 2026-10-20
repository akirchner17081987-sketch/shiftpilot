-- Existing guard definitions used by the isolated integration test.

CREATE OR REPLACE FUNCTION public.enforce_shift_employee_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE err_ text;
BEGIN
 IF new.status='CANCELLED' THEN RETURN new; END IF;
 -- Allow unchanged historical records to synchronize; publishing is revalidated.
 IF TG_OP='UPDATE' AND ROW(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.status)
   IS NOT DISTINCT FROM ROW(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.status) THEN RETURN new; END IF;
 err_:=private.sf_shift_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at);
 IF err_ IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=err_; END IF;
 RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_shift_scope_error(company_ uuid, employee_ uuid, code_ text, starts_ timestamp with time zone, ends_ timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees%rowtype;t_ public.shift_templates%rowtype;exclusive_ text;tz_ text;day_ date;team_ text;fixed_ jsonb;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF e_.id IS NULL THEN RETURN 'Mitarbeiter dieses Unternehmens wurde nicht gefunden.'; END IF;
 fixed_:=private.sf_fixed_weekly_roster(company_,employee_);
 IF fixed_ IS NOT NULL THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
  day_:=(starts_ AT TIME ZONE tz_)::date;
  IF NOT ((fixed_->'weekdays') @> to_jsonb(extract(isodow FROM day_)::int)) THEN
   RETURN 'Verbindliche Wochenregel: an diesem Tag frei.';
  END IF;
  IF code_ IS DISTINCT FROM fixed_->>'code' THEN RETURN 'Verbindliche Wochenregel: ausschließlich '||(fixed_->>'code')||'.'; END IF;
 END IF;
 SELECT code INTO exclusive_ FROM public.shift_templates WHERE company_id=company_ AND active
  AND exclusive_employees AND e_.personnel_no=ANY(allowed_personnel_nos) ORDER BY sort_order,code LIMIT 1;
 IF exclusive_ IS NOT NULL AND exclusive_<>code_ THEN RETURN 'Dieser Mitarbeiter ist ausschließlich für '||exclusive_||' freigegeben.'; END IF;
 SELECT * INTO t_ FROM public.shift_templates WHERE company_id=company_ AND code=code_;
 IF t_.id IS NULL THEN RETURN NULL; END IF;
 IF t_.allowed_personnel_nos IS NOT NULL AND NOT coalesce(e_.personnel_no=ANY(t_.allowed_personnel_nos),false) THEN
  RETURN code_||' ist für diese Personalnummer nicht freigegeben.'; END IF;
 SELECT substr(x,19) INTO team_ FROM unnest(e_.qualifications) x WHERE x LIKE '__sp:planningTeam=%' LIMIT 1;
 IF t_.requires_planning_team AND coalesce(team_,'') NOT IN('A','B','C','D','E') THEN
  RETURN code_||' ist ausschließlich für Mitarbeiter in Teams A–E freigegeben.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 day_:=(starts_ AT TIME ZONE tz_)::date;
 IF code_ IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,day_) THEN RETURN 'An Feiertagen entfällt OT1 / OT2 / OT3; bitte die normale OT-Schicht prüfen.'; END IF;
 IF code_='OT' AND EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=company_ AND solid_planning_rules ? 'otHolidayStatesBySite') AND NOT private.sf_ot_day(company_,day_,employee_) THEN RETURN 'OT ist nur am Wochenende oder an einem Feiertag am Einsatzort zulässig.'; END IF;
 IF t_.strict_weekdays AND NOT extract(isodow FROM day_)::int=ANY(t_.optional_weekdays) THEN RETURN code_||' ist an diesem Wochentag nicht zulässig.'; END IF;
 IF t_.strict_times AND (starts_ IS DISTINCT FROM ((day_+t_.default_start) AT TIME ZONE tz_)
   OR ends_ IS DISTINCT FROM (((day_+CASE WHEN t_.default_end<=t_.default_start THEN 1 ELSE 0 END)+t_.default_end) AT TIME ZONE tz_))
 THEN RETURN code_||' darf nur zu den festgelegten Schichtzeiten geplant werden.'; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.assert_standard_shift_rules(p_company_id uuid, p_employee_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_ignore_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_min_rest numeric(5,2):=11;
  v_max_shift numeric(5,2):=10;
  v_prev_end timestamptz;
  v_next_start timestamptz;
  v_duration numeric;
  v_timezone text := 'Europe/Berlin';
begin
  if p_ends_at<=p_starts_at then raise exception 'Invalid shift interval'; end if;

  select c.timezone into v_timezone
  from public.companies c
  where c.id=p_company_id;
  v_timezone:=coalesce(v_timezone,'Europe/Berlin');

  select standard_min_rest_hours,standard_max_shift_hours
    into v_min_rest,v_max_shift
  from public.company_compliance_policy
  where company_id=p_company_id;
  v_min_rest:=coalesce(v_min_rest,11);
  v_max_shift:=coalesce(v_max_shift,10);
  v_duration:=extract(epoch from(p_ends_at-p_starts_at))/3600.0;

  if v_duration>v_max_shift then raise exception 'Standard maximum shift duration exceeded'; end if;

  if exists(
    select 1
    from public.shift_assignments s
    where s.company_id=p_company_id
      and s.employee_id=p_employee_id
      and s.status<>'CANCELLED'
      and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
      and tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(p_starts_at,p_ends_at,'[)')
  ) then
    raise exception 'Shift overlaps another assignment';
  end if;

  -- Nur tatsächlich wirksame Abwesenheiten blockieren die Planung.
  -- Beantragte oder abgelehnte Abwesenheiten sind bewusst nicht enthalten.
  if private.sf_approved_absence_overlaps(p_company_id,p_employee_id,p_starts_at,p_ends_at,v_timezone) then
    raise exception 'Shift overlaps an approved absence';
  end if;

  select max(s.ends_at) into v_prev_end
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.ends_at<=p_starts_at;
  if v_prev_end is not null and extract(epoch from(p_starts_at-v_prev_end))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met before shift';
  end if;

  select min(s.starts_at) into v_next_start
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.starts_at>=p_ends_at;
  if v_next_start is not null and extract(epoch from(v_next_start-p_ends_at))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met after shift';
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.apply_shift_change(p_change_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.shift_change_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_id uuid;
  v_employee uuid;
  v_type text;
  v_start timestamptz;
  v_end timestamptz;
  v_break integer;
  v_note text;
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_manager boolean := false;
  v_employee_owner boolean := false;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select * into r
  from public.shift_change_requests
  where id = p_change_id
  for update;
  if not found then raise exception 'Change request not found'; end if;

  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = r.company_id
    and cm.user_id = v_actor
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER')
  limit 1;
  v_manager := v_actor_role is not null;

  if not v_manager then
    select exists(
      select 1 from public.employees e
      where e.id = r.employee_id
        and e.auth_user_id = v_actor
        and e.status = 'active'
    ) into v_employee_owner;
    if v_employee_owner then v_actor_role := 'EMPLOYEE'; end if;
  end if;

  if not v_manager and not v_employee_owner then raise exception 'Not authorized'; end if;
  if r.status <> 'READY_TO_APPLY' then raise exception 'Change request is not READY_TO_APPLY'; end if;
  if r.compliance_status = 'BLOCK' then raise exception 'Blocked compliance request cannot be applied'; end if;

  if r.requires_employee_approval and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id = r.id and x.approval_type = 'EMPLOYEE' and x.status = 'APPROVED'
  ) then raise exception 'Employee approval missing'; end if;

  if r.requires_works_council and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id = r.id and x.approval_type = 'WORKS_COUNCIL' and x.status = 'APPROVED'
  ) then raise exception 'Works council approval missing'; end if;

  if exists(select 1 from public.compliance_findings f where f.change_request_id = r.id and f.status = 'BLOCK') then
    raise exception 'Blocking compliance finding exists';
  end if;

  if r.action in ('UPDATE','DELETE') then
    select * into a from public.shift_assignments where id = r.assignment_id for update;
    if not found then
      update public.shift_change_requests set status = 'SUPERSEDED' where id = r.id;
      raise exception 'Original assignment no longer exists';
    end if;
    if a.version <> r.base_version then
      update public.shift_change_requests set status = 'SUPERSEDED' where id = r.id;
      raise exception 'Assignment version changed';
    end if;
  end if;

  if r.action in ('CREATE','UPDATE') then
    v_employee := (r.proposed_snapshot->>'employeeId')::uuid;
    v_type := r.proposed_snapshot->>'type';
    v_start := (r.proposed_snapshot->>'startsAt')::timestamptz;
    v_end := (r.proposed_snapshot->>'endsAt')::timestamptz;
    v_break := coalesce((r.proposed_snapshot->>'breakMinutes')::integer,0);
    v_note := coalesce(r.proposed_snapshot->>'note','');
    perform public.assert_standard_shift_rules(r.company_id,v_employee,v_start,v_end,case when r.action='UPDATE' then r.assignment_id else null end);
  end if;

  if r.action = 'UPDATE' then
    update public.shift_assignments
      set employee_id=v_employee,shift_code=v_type,starts_at=v_start,ends_at=v_end,
          break_minutes=v_break,note=v_note,version=version+1,last_change_request_id=r.id
      where id=r.assignment_id returning id into v_id;
  elsif r.action = 'CREATE' then
    insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,status,published_at,version,last_change_request_id,created_by)
    values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,'PUBLISHED',now(),1,r.id,v_actor)
    returning id into v_id;
  else
    v_id := r.assignment_id;
    update public.shift_assignments
      set status='CANCELLED',version=version+1,last_change_request_id=r.id
      where id=r.assignment_id;
  end if;

  update public.shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(r.company_id,'SHIFT_CHANGE_APPLIED','shift_change_request',r.id,v_actor,v_actor_role,r.old_snapshot,r.proposed_snapshot,jsonb_build_object('assignment_id',v_id,'action',r.action));
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.enforce_assignment_standard_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_existing_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN v_existing_id:=old.id;
  ELSE
    SELECT a.id INTO v_existing_id FROM public.shift_assignments a
      WHERE a.company_id=new.company_id AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))
      LIMIT 1 FOR KEY SHARE;
  END IF;
  IF new.status<>'CANCELLED'
    AND coalesce(current_setting('schichtfunk.legacy_import',true),'off')<>'on'
    AND (TG_OP='INSERT' OR new.company_id IS DISTINCT FROM old.company_id
      OR new.employee_id IS DISTINCT FROM old.employee_id OR new.starts_at IS DISTINCT FROM old.starts_at
      OR new.ends_at IS DISTINCT FROM old.ends_at OR (old.status='CANCELLED' AND new.status<>'CANCELLED')) THEN
    PERFORM public.assert_standard_shift_rules(new.company_id,new.employee_id,new.starts_at,new.ends_at,v_existing_id);
  END IF;
  RETURN new;
END $function$;


create trigger assignments_employee_scope before insert or update on public.shift_assignments for each row execute function public.enforce_shift_employee_scope();

create trigger shift_assignments_standard_rules before insert or update on public.shift_assignments for each row execute function public.enforce_assignment_standard_rules();

