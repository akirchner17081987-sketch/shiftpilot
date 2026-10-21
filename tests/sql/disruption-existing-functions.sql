-- Current production guards loaded by isolated integration tests.
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
          break_minutes=v_break,note=v_note,rhythm_override=nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),version=version+1,last_change_request_id=r.id
      where id=r.assignment_id returning id into v_id;
  elsif r.action = 'CREATE' then
    insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,rhythm_override,status,published_at,version,last_change_request_id,created_by)
    values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),'PUBLISHED',now(),1,r.id,v_actor)
    returning id into v_id;
  else
    v_id := r.assignment_id;
    update public.shift_assignments
      set status='CANCELLED',version=version+1,last_change_request_id=r.id
      where id=r.assignment_id;
  end if;

  update public.shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  -- Assignment and APPLIED request changes are captured by existing audit triggers.
  return v_id;
end
$function$

;
CREATE OR REPLACE FUNCTION public.protect_published_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  -- Ausschließlich der streng geschützte administrative Komplett-Reset darf
  -- veröffentlichte Schichten physisch entfernen. Normale Browser-/RLS-Pfade
  -- können dieses transaktionslokale Flag nicht setzen.
  if current_setting('app.schichtfunk_full_plan_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Confirmed profile removal may cancel only this employee's future duties.
  if tg_op='UPDATE' and new.status='CANCELLED' and old.starts_at>=now()
     and current_setting('app.schichtfunk_employee_removal',true)=old.employee_id::text
     and exists(select 1 from public.company_members where company_id=old.company_id and user_id=auth.uid()
       and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER'))
     and new.company_id=old.company_id and new.employee_id=old.employee_id and new.shift_code=old.shift_code
     and new.starts_at=old.starts_at and new.ends_at=old.ends_at and new.break_minutes=old.break_minutes
     and new.note is not distinct from old.note then return new; end if;

  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then
      raise exception 'Published assignments are append/change-request controlled and cannot be deleted directly';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.status='PUBLISHED' then
    if new.employee_id is not distinct from old.employee_id
       and new.shift_code is not distinct from old.shift_code
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.break_minutes is not distinct from old.break_minutes
       and new.note is not distinct from old.note
       and new.status is not distinct from old.status then
      return new;
    end if;
    if new.last_change_request_id is null or not exists(
      select 1 from public.shift_change_requests r
      where r.id=new.last_change_request_id
        and r.company_id=old.company_id
        and r.assignment_id=old.id
        and r.status='READY_TO_APPLY'
        and ((r.action='UPDATE' and new.status='PUBLISHED') or (r.action='DELETE' and new.status='CANCELLED'))
    ) then
      raise exception 'Published assignment changes require a READY_TO_APPLY change request';
    end if;
  end if;
  return new;
end $function$

;
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
$function$

;
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
END $function$

;
CREATE OR REPLACE FUNCTION public.enforce_shift_employee_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare err_ text;
begin
 if new.status='CANCELLED' then return new; end if;
 if tg_op='UPDATE' and row(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.status)
  is not distinct from row(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.status) then return new; end if;
 if new.rhythm_override is not null then
  err_:=private.sf_manual_nonrhythm_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at);
 else err_:=private.sf_shift_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at); end if;
 if err_ is not null then raise exception using errcode='23514',message=err_; end if;
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION private.sf_normalize_manual_rhythm_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare role_ text; reason_ text; e_ public.employees; rhythm_ jsonb; tz_ text; expected_ text;
begin
 if new.rhythm_override='null'::jsonb then new.rhythm_override:=null; end if;
 if new.status='CANCELLED' then return new; end if;
 if tg_op='UPDATE' and row(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.rhythm_override)
  is not distinct from row(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.rhythm_override) then return new; end if;
 if new.rhythm_override is null then return new; end if;
 if new.rhythm_override ? 'actor_id' and (
  (new.rhythm_override->>'employee_id')::uuid is distinct from new.employee_id
  or new.rhythm_override->>'shift_code' is distinct from new.shift_code
  or (new.rhythm_override->>'starts_at')::timestamptz is distinct from new.starts_at
  or (new.rhythm_override->>'ends_at')::timestamptz is distinct from new.ends_at) then
  raise exception 'Die bestätigte Rhythmusausnahme gilt nur für den ursprünglichen Dienst. Bitte die Änderung neu bestätigen.';
 end if;
 select role into role_ from public.company_members where company_id=new.company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER');
 if auth.uid() is null or role_ is null then raise exception using errcode='42501',message='Nur Planungsberechtigte dürfen eine Rhythmusausnahme bestätigen.'; end if;
 reason_:=trim(new.rhythm_override->>'reason');
 if jsonb_typeof(new.rhythm_override)<>'object' or reason_ is null or length(reason_) not between 1 and 500 then raise exception 'Bitte eine Begründung mit 1 bis 500 Zeichen angeben.'; end if;
 select * into e_ from public.employees where company_id=new.company_id and id=new.employee_id and status='active' and deleted_at is null;
 if not found or not coalesce(new.shift_code=any(e_.shift_permissions),false) then raise exception 'Mitarbeiter oder Schichtfreigabe ist nicht gültig.'; end if;
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=new.company_id;
 if e_.start_date>(new.starts_at at time zone tz_)::date or e_.contract_end<(new.starts_at at time zone tz_)::date then raise exception 'Der Dienst liegt außerhalb der Vertragslaufzeit.'; end if;
 rhythm_:=private.sf_month_rhythm(e_,(new.starts_at at time zone tz_)::date);expected_:=rhythm_->>'expected';
 if rhythm_->>'mode' is distinct from 'required' or expected_ is null or expected_='ALLE'
  or (coalesce((rhythm_->>'exemptOt')::boolean,false) and new.shift_code in('OT1','OT2','OT3'))
  or upper(new.shift_code)=any(regexp_split_to_array(expected_,'[+|/]')) then raise exception 'Für diesen Dienst ist keine Rhythmusausnahme erforderlich. Bitte neu prüfen.'; end if;
 new.rhythm_override:=jsonb_build_object('reason',reason_,'expected',expected_,'actor_id',auth.uid(),'actor_role',role_,'confirmed_at',clock_timestamp(),'employee_id',new.employee_id,'shift_code',new.shift_code,'starts_at',new.starts_at,'ends_at',new.ends_at);
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION private.sf_manual_nonrhythm_scope_error(company_ uuid, employee_ uuid, code_ text, starts_ timestamp with time zone, ends_ timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees%rowtype;t_ public.shift_templates%rowtype;exclusive_ text;tz_ text;day_ date;team_ text;fixed_ jsonb;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF e_.id IS NULL THEN RETURN 'Mitarbeiter dieses Unternehmens wurde nicht gefunden.'; END IF;
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
END $function$

;
CREATE OR REPLACE FUNCTION private.sf_month_rhythm(e employees, d date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE mode_ text:=coalesce(private.sf_month_meta(e.qualifications,'rhythmMode'),'off');
 team_ text:=private.sf_month_meta(e.qualifications,'planningTeam');
 pattern_ text[]; start_ date; kind_ text; offset_ int:=0; index_ int; expected_ text; central_ record; fixed_ jsonb;
BEGIN
 fixed_:=private.sf_fixed_weekly_roster(e.company_id,e.id);
 IF fixed_ IS NOT NULL THEN
  SELECT array_agg(CASE WHEN (fixed_->'weekdays') @> to_jsonb(n) THEN fixed_->>'code' ELSE 'FREI' END ORDER BY n)
   INTO pattern_ FROM generate_series(1,7) n;
  index_:=extract(isodow FROM d)::int-1;
  RETURN jsonb_build_object('mode','required','expected',pattern_[index_+1],'index',index_,'pattern',pattern_,'exemptOt',false);
 END IF;
 pattern_:=regexp_split_to_array(upper(coalesce(private.sf_month_meta(e.qualifications,'rhythmPattern'),'')),'\s*[,;\n]\s*');
 kind_:=private.sf_month_meta(e.qualifications,'rhythmKind');
 start_:=nullif(private.sf_month_meta(e.qualifications,'rhythmStart'),'')::date;
 IF team_ IN('A','B','C','D','E') THEN
  SELECT * INTO central_ FROM public.company_planning_teams WHERE company_id=e.company_id AND team_code=team_;
  mode_:='required';
  IF FOUND THEN pattern_:=central_.pattern;start_:=central_.start_date;offset_:=central_.start_offset;
  ELSE offset_:=floor((strpos('ABCDE',team_)-1)*cardinality(pattern_)::numeric/5)::int; END IF;
  IF start_ IS NOT NULL AND d<start_ THEN mode_:='off'; END IF;
 END IF;
 IF mode_<>'required' OR start_ IS NULL OR coalesce(cardinality(pattern_),0)=0 OR pattern_=ARRAY['']::text[]
 THEN RETURN jsonb_build_object('mode','off','exemptOt',false); END IF;
 SELECT array_agg(CASE WHEN upper(trim(x)) IN('FREE','OFF','X') THEN 'FREI' WHEN upper(trim(x)) IN('ANY','BELIEBIG','*') THEN 'ALLE' ELSE upper(trim(x)) END ORDER BY n) INTO pattern_ FROM unnest(pattern_) WITH ORDINALITY a(x,n);
 IF team_ IN('A','B','C','D','E') THEN
 SELECT array_agg(coalesce((SELECT s.code FROM public.shift_templates s
   WHERE s.company_id=e.company_id AND s.active AND s.requires_planning_team AND s.rhythm_alias=upper(trim(a.x))
   ORDER BY s.sort_order,s.code LIMIT 1),a.x) ORDER BY a.n) INTO pattern_
 FROM unnest(pattern_) WITH ORDINALITY a(x,n);
 END IF;
 index_:=((d-start_+offset_)%cardinality(pattern_)+cardinality(pattern_))%cardinality(pattern_);
 expected_:=trim(upper(pattern_[index_+1]));
 IF expected_ IN('FREE','OFF','X') THEN expected_:='FREI'; END IF;
 IF expected_ IN('ANY','BELIEBIG','*') THEN expected_:='ALLE'; END IF;
 RETURN jsonb_build_object('mode',mode_,'expected',expected_,'index',index_,'pattern',pattern_,
  'exemptOt',coalesce(team_,'') NOT IN('A','B','C','D','E') AND private.sf_month_meta(e.qualifications,'rhythmExemptOt')='true');
END $function$

;
CREATE OR REPLACE FUNCTION private.sf_swap_candidate_reason(p_assignment_id uuid, p_target_employee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.shift_assignments%rowtype; e public.employees%rowtype;
 tz text; min_rest numeric:=11; max_shift numeric:=10; adjacent timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN 'Nicht angemeldet';END IF;
 SELECT * INTO a FROM public.shift_assignments WHERE id=p_assignment_id;
 IF a.id IS NULL THEN RETURN 'Schicht nicht gefunden';END IF;
 IF NOT private.sf_is_manager(a.company_id,false) AND NOT EXISTS(
  SELECT 1 FROM public.employees x WHERE x.company_id=a.company_id
  AND x.id IN (a.employee_id,p_target_employee_id) AND x.auth_user_id=auth.uid()
  AND x.status='active' AND x.access_status='ACTIVE' AND x.deleted_at IS NULL
 ) THEN RETURN 'Nicht berechtigt';END IF;
 IF a.status<>'PUBLISHED' OR a.published_at IS NULL THEN RETURN 'Nur veröffentlichte Schichten können getauscht werden';END IF;
 IF a.starts_at<=now() THEN RETURN 'Bereits begonnene Schichten können nicht getauscht werden';END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_target_employee_id AND company_id=a.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.access_status<>'ACTIVE' OR e.deleted_at IS NOT NULL THEN RETURN 'Mitarbeiter ist nicht aktiv';END IF;
 IF e.id=a.employee_id THEN RETURN 'Die Schicht gehört bereits diesem Mitarbeiter';END IF;
 IF e.auth_user_id IS NULL THEN RETURN 'Der Kollege hat noch keinen aktiven SchichtFunk-Zugang';END IF;
 IF NOT coalesce(a.shift_code=ANY(e.shift_permissions),false) THEN RETURN 'Keine Freigabe für diese Schichtart';END IF;
 SELECT coalesce(c.timezone,'Europe/Berlin') INTO tz FROM public.companies c WHERE c.id=a.company_id;
 SELECT coalesce(p.standard_min_rest_hours,11),coalesce(p.standard_max_shift_hours,10)
 INTO min_rest,max_shift FROM public.company_compliance_policy p WHERE p.company_id=a.company_id;
 min_rest:=coalesce(min_rest,11);max_shift:=coalesce(max_shift,10);
 -- Same interval, duration, absence and rest rules as assert_standard_shift_rules.
 IF a.ends_at<=a.starts_at THEN RETURN 'Ungültiger Schichtzeitraum';END IF;
 IF extract(epoch FROM(a.ends_at-a.starts_at))/3600.0>max_shift THEN RETURN 'Schicht überschreitet die Standard-Höchstdauer';END IF;
 IF EXISTS(SELECT 1 FROM public.shift_assignments s WHERE s.company_id=a.company_id
 AND s.employee_id=e.id AND s.id<>a.id AND s.status<>'CANCELLED'
 AND tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')) THEN RETURN 'Bereits andere Schicht im Zeitraum';END IF;
 IF EXISTS(SELECT 1 FROM public.absences b WHERE b.company_id=a.company_id AND b.employee_id=e.id
 AND b.status IN ('Genehmigt','Erfasst') AND (
 (b.full_day AND tstzrange(b.start_date::timestamp AT TIME ZONE tz,(b.end_date+1)::timestamp AT TIME ZONE tz,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)'))
 OR (NOT b.full_day AND b.start_time IS NOT NULL AND b.end_time IS NOT NULL AND EXISTS(
 SELECT 1 FROM generate_series(b.start_date,b.end_date,interval '1 day') g(day)
 WHERE tstzrange((g.day::date+b.start_time) AT TIME ZONE tz,
 (g.day::date+CASE WHEN b.end_time<=b.start_time THEN 1 ELSE 0 END+b.end_time) AT TIME ZONE tz,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')))
 )) THEN RETURN 'Kollege ist in diesem Zeitraum nicht verfügbar';END IF;
 SELECT max(s.ends_at) INTO adjacent FROM public.shift_assignments s WHERE s.company_id=a.company_id AND s.employee_id=e.id
 AND s.id<>a.id AND s.status<>'CANCELLED' AND s.ends_at<=a.starts_at;
 IF adjacent IS NOT NULL AND extract(epoch FROM(a.starts_at-adjacent))/3600.0<min_rest THEN RETURN 'Ruhezeit vor der Schicht nicht ausreichend';END IF;
 SELECT min(s.starts_at) INTO adjacent FROM public.shift_assignments s WHERE s.company_id=a.company_id AND s.employee_id=e.id
 AND s.id<>a.id AND s.status<>'CANCELLED' AND s.starts_at>=a.ends_at;
 IF adjacent IS NOT NULL AND extract(epoch FROM(adjacent-a.ends_at))/3600.0<min_rest THEN RETURN 'Ruhezeit nach der Schicht nicht ausreichend';END IF;
 RETURN NULL;
END $function$

;
CREATE OR REPLACE FUNCTION private.manager_list_disruptions_impl(p_company_id uuid)
 RETURNS TABLE(id uuid, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, original_employee_id uuid, original_employee text, incident_type text, note text, created_at timestamp with time zone, offer_count bigint, pending_count bigint, accepted_employee text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  return query select d.id,d.status,d.assignment_id,a.shift_code,a.starts_at,a.ends_at,d.original_employee_id,trim(o.first_name||' '||o.last_name),d.incident_type,d.note,d.created_at,
    count(x.id),count(x.id) filter(where x.status='OFFERED' and x.expires_at>now()),max(trim(e.first_name||' '||e.last_name)) filter(where x.status='ACCEPTED')
  from public.disruption_incidents d join public.shift_assignments a on a.id=d.assignment_id join public.employees o on o.id=d.original_employee_id
  left join public.disruption_offers x on x.incident_id=d.id left join public.employees e on e.id=x.employee_id
  where d.company_id=p_company_id and a.company_id=p_company_id and o.company_id=p_company_id and o.deleted_at is null
    and (d.status='OPEN' or d.id in (select h.id from public.disruption_incidents h where h.company_id=p_company_id and h.status<>'OPEN' order by h.created_at desc limit 100))
  group by d.id,a.id,o.id order by case when d.status='OPEN' then 0 else 1 end,d.created_at desc;
end $function$

;
