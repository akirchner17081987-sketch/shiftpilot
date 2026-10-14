-- Shared OT day crew switches to ordinary OT on national, Saxon or NRW holidays.
CREATE OR REPLACE FUNCTION private.sf_ot_day_holiday(company_ uuid,day_ date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;states_ jsonb;
BEGIN
 IF day_ IS NULL THEN RETURN false; END IF;
 SELECT solid_planning_rules INTO rules_ FROM public.company_compliance_policy WHERE company_id=company_;
 IF NOT coalesce((rules_->>'otDayHolidayExclusion')::boolean,false) THEN RETURN false; END IF;
 states_:=coalesce(rules_->'otDayHolidayStates','["DE","SN","NW"]'::jsonb);
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements_text(states_) x
  CROSS JOIN LATERAL private.sf_public_holidays(extract(year FROM day_)::int,x.value) h WHERE h.holiday_date=day_);
END $f$;
REVOKE ALL ON FUNCTION private.sf_ot_day_holiday(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_ot_day_holiday(uuid,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_solid_conditional_required(company_ uuid, day_ date, code_ text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;r_ jsonb;tz_ text;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF code_ IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,day_) THEN RETURN 0; END IF;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN NULL; END IF;
 IF code_='OT2' AND jsonb_typeof(rules_->'otWeekdayRoster'->'employeeIds')='array' AND jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')>0 THEN
  IF NOT coalesce(rules_->'otWeekdayRoster'->'weekdays','[1,2,3,4,5]'::jsonb) @> to_jsonb(ARRAY[extract(isodow FROM day_)::int]) THEN RETURN 0; END IF;
  RETURN greatest(0,jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')
    -coalesce(private.sf_solid_conditional_required(company_,day_,'OT1'),0)
    -coalesce(private.sf_solid_conditional_required(company_,day_,'OT3'),0));
 END IF;
 SELECT v INTO r_ FROM jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) v WHERE v->>'shift'=code_ LIMIT 1;
 IF r_ IS NULL THEN RETURN NULL; END IF;
 IF extract(isodow FROM day_)>5 THEN RETURN 0; END IF;
 SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'sourceShift'
  AND (starts_at AT TIME ZONE tz_)::date=day_+(r_->>'sourceDayOffset')::int
  AND starts_at <= (day_+(r_->>'coverageStart')::time) AT TIME ZONE tz_ AND ends_at >= (day_+(r_->>'coverageEnd')::time) AT TIME ZONE tz_;
 RETURN CASE WHEN count_ >= (r_->>'minimum')::int THEN 0 ELSE (r_->>'fallbackCount')::int END;
END $function$
;

CREATE OR REPLACE FUNCTION private.sf_assert_solid_critical_coverage(company_ uuid, month_ date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;d_ date;r_ jsonb;group_ text;need_ int;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 FOR d_ IN SELECT generate_series(month_,month_+interval '1 month'-interval '1 day',interval '1 day')::date LOOP
  IF jsonb_typeof(rules_->'otWeekdayRoster'->'employeeIds')='array' AND jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')>0
   AND NOT private.sf_ot_day_holiday(company_,d_)
   AND coalesce(rules_->'otWeekdayRoster'->'weekdays','[1,2,3,4,5]'::jsonb) @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN
   need_:=jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds');
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED'
    AND shift_code IN('OT1','OT2','OT3') AND (starts_at AT TIME ZONE tz_)::date=d_
    AND rules_->'otWeekdayRoster'->'employeeIds' @> jsonb_build_array(employee_id::text);
   IF count_<need_ THEN RAISE EXCEPTION 'Feste OT-Tagdienstgruppe am % unvollständig: % von % Mitarbeitern. Abwesenheiten und persönliche Sperren im Vorschlag prüfen.',d_,count_,need_; END IF;
   FOR group_ IN SELECT unnest(ARRAY['OT1','OT2','OT3']) LOOP
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=group_ AND (starts_at AT TIME ZONE tz_)::date=d_;
    need_:=private.sf_solid_conditional_required(company_,d_,group_);
    IF count_<>need_ THEN RAISE EXCEPTION 'OT-Verteilung am % entspricht nicht der Nachtabdeckung: % ist % statt %.',d_,group_,count_,need_; END IF;
   END LOOP;
  END IF;
  FOR group_ IN SELECT jsonb_array_elements_text(coalesce(rules_->'criticalCoverageGroups','[]')) LOOP
   SELECT max(coverage_required) INTO need_ FROM public.shift_templates WHERE company_id=company_ AND active AND coverage_group=group_;
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code=a.shift_code AND t.active
    WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND (a.starts_at AT TIME ZONE tz_)::date=d_ AND t.coverage_group=group_
     AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_ AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF coalesce(count_,0)<coalesce(need_,1) THEN RAISE EXCEPTION 'Pflichtleitung % fehlt am %. Der bestehende Plan bleibt erhalten.',group_,d_; END IF;
  END LOOP;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) LOOP
   need_:=private.sf_solid_conditional_required(company_,d_,r_->>'shift');
   SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'shift' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_>need_ THEN RAISE EXCEPTION 'Der bedingte OT-Bedarf wird überschritten (% am %).',r_->>'shift',d_; END IF;
  END LOOP;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'criticalShifts','[]')) LOOP
   IF r_->>'code' IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,d_) THEN CONTINUE; END IF;
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_<(r_->>'minimum')::int THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION private.sf_open_market_slot(p_company uuid, p_date date, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.shift_templates%rowtype; tz text; target integer; filled integer; st timestamptz; en timestamptz;
BEGIN
 SELECT * INTO t FROM public.shift_templates WHERE company_id=p_company AND code=p_code AND active;
 IF t.id IS NULL THEN RETURN jsonb_build_object('missing',0); END IF;
 IF t.strict_weekdays AND NOT extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays) THEN RETURN jsonb_build_object('missing',0,'target',0,'filled',0); END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
 st:=(p_date+t.default_start) AT TIME ZONE tz;
 en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
 IF p_code IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(p_company,p_date) THEN
  SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
  RETURN jsonb_build_object('missing',0,'target',0,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
 END IF;
 IF t.coverage_group IS NOT NULL THEN
  SELECT coalesce(
    (SELECT max(d.required_count) FROM public.daily_staffing_overrides d JOIN public.shift_templates m
      ON m.company_id=d.company_id AND m.code=d.shift_code
      WHERE d.company_id=p_company AND d.work_date=p_date AND m.active AND m.coverage_group=t.coverage_group),
    CASE WHEN EXISTS(SELECT 1 FROM public.shift_templates m WHERE m.company_id=p_company AND m.active
      AND m.coverage_group=t.coverage_group AND extract(isodow FROM p_date)::integer=ANY(m.optional_weekdays))
      THEN t.coverage_required ELSE 0 END) INTO target;
  SELECT count(DISTINCT a.employee_id) INTO filled FROM public.shift_assignments a
    JOIN public.shift_templates m ON m.company_id=a.company_id AND m.code=a.shift_code
    WHERE a.company_id=p_company AND m.coverage_group=t.coverage_group AND a.status<>'CANCELLED'
      AND (a.starts_at AT TIME ZONE tz)::date=p_date AND a.starts_at<=st AND a.ends_at>=en;
  RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,
    'starts_at',st,'ends_at',en,'timezone',tz,'coverage_group',t.coverage_group,
    'representative',(SELECT code FROM public.shift_templates m WHERE m.company_id=p_company
      AND m.coverage_group=t.coverage_group AND m.active ORDER BY m.sort_order,m.code LIMIT 1));
 END IF;
 SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=p_company AND work_date=p_date AND shift_code=p_code),
 CASE WHEN p_code='OT' AND EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=p_company AND solid_planning_rules ? 'otHolidayStatesBySite') THEN CASE WHEN t.planning_mode='optional' OR NOT private.sf_ot_day(p_company,p_date) THEN 0 ELSE (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=p_company AND shift_code=p_code) END WHEN t.planning_mode='optional' OR NOT (extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays)) THEN 0 ELSE (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=p_company AND shift_code=p_code) END,0) INTO target;
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
END $function$
;

CREATE OR REPLACE FUNCTION private.sf_shift_scope_error(company_ uuid, employee_ uuid, code_ text, starts_ timestamp with time zone, ends_ timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees%rowtype;t_ public.shift_templates%rowtype;exclusive_ text;tz_ text;day_ date;team_ text;
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

-- Enable within the existing per-company site calendars; no roster data is rewritten.
UPDATE public.company_compliance_policy
SET solid_planning_rules=solid_planning_rules||'{"otDayHolidayExclusion":true,"otDayHolidayStates":["DE","SN","NW"]}'::jsonb
WHERE solid_planning_rules ? 'otHolidayStatesBySite';
NOTIFY pgrst,'reload schema';

