CREATE OR REPLACE FUNCTION private.sf_regional_day_is_code(company_ uuid, code_ text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$ SELECT coalesce((solid_planning_rules->'regionalDayStaffing'->'weekdayCodes') ? code_ OR (solid_planning_rules->'regionalDayStaffing'->'specialCodes') ? code_,false) FROM public.company_compliance_policy WHERE company_id=company_ $f$;
REVOKE ALL ON FUNCTION private.sf_regional_day_is_code(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sf_ot_weekend_minimum(company_ uuid, day_ date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=company_ AND solid_planning_rules ? 'regionalDayStaffing') THEN 0 ELSE coalesce(private.sf_staffing_exception(company_,day_,'OT'),greatest(coalesce((SELECT CASE WHEN coalesce((solid_planning_rules->>'enabled')::boolean,false) THEN coalesce((solid_planning_rules->>'otDailyMinimumStaffing')::int,0) ELSE 0 END FROM public.company_compliance_policy WHERE company_id=company_),0),CASE WHEN extract(isodow FROM day_) IN (6,7) THEN coalesce((
  SELECT max((r->>'minimum')::int)
  FROM public.company_compliance_policy p
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.solid_planning_rules->'criticalShifts','[]')) r
  WHERE p.company_id=company_ AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
   AND r->>'code'='OT' AND coalesce(r->'weekdays','[1,2,3,4,5,6,7]') @> '[6,7]'::jsonb
 ),0) ELSE 0 END)) END;
$function$;

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
 IF NOT coalesce(private.sf_regional_day_is_code(company_,code_),false) AND code_ IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,day_) THEN RETURN 'An Feiertagen entfällt OT1 / OT2 / OT3; bitte die normale OT-Schicht prüfen.'; END IF;
 IF NOT coalesce(private.sf_regional_day_is_code(company_,code_),false) AND code_='OT' AND EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=company_ AND solid_planning_rules ? 'otHolidayStatesBySite') AND NOT private.sf_ot_day(company_,day_,employee_) THEN RETURN 'OT ist nur am Wochenende oder an einem Feiertag am Einsatzort zulässig.'; END IF;
 IF NOT coalesce(private.sf_regional_day_is_code(company_,code_),false) AND t_.strict_weekdays AND NOT extract(isodow FROM day_)::int=ANY(t_.optional_weekdays) THEN RETURN code_||' ist an diesem Wochentag nicht zulässig.'; END IF;
 IF t_.strict_times AND (starts_ IS DISTINCT FROM ((day_+t_.default_start) AT TIME ZONE tz_)
   OR ends_ IS DISTINCT FROM (((day_+CASE WHEN t_.default_end<=t_.default_start THEN 1 ELSE 0 END)+t_.default_end) AT TIME ZONE tz_))
 THEN RETURN code_||' darf nur zu den festgelegten Schichtzeiten geplant werden.'; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_open_market_slot(p_company uuid, p_date date, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.shift_templates%rowtype; tz text; target integer; filled integer; st timestamptz; en timestamptz;
BEGIN
 SELECT * INTO t FROM public.shift_templates WHERE company_id=p_company AND code=p_code AND active;
 IF t.id IS NULL THEN RETURN jsonb_build_object('missing',0); END IF;
 IF coalesce(private.sf_regional_day_is_code(p_company,p_code),false) THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
  st:=(p_date+t.default_start) AT TIME ZONE tz;
  en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
  SELECT (solid_planning_rules->'regionalDayStaffing'->>'target')::int INTO target FROM public.company_compliance_policy WHERE company_id=p_company;
  filled:=private.sf_regional_day_filled(p_company,p_date);
  RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
 END IF;
 IF t.strict_weekdays AND NOT extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays) AND NOT (p_code='OT' AND private.sf_ot_weekend_minimum(p_company,p_date)>0) THEN RETURN jsonb_build_object('missing',0,'target',0,'filled',0); END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
 st:=(p_date+t.default_start) AT TIME ZONE tz;
 en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
 IF p_code IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(p_company,p_date) THEN
  IF p_code='OT' THEN target:=greatest(coalesce(target,0),private.sf_ot_weekend_minimum(p_company,p_date)); END IF;
 IF p_code='OT' AND private.sf_ot_weekend_minimum(p_company,p_date)>0 THEN
  SELECT count(DISTINCT employee_id) INTO filled FROM public.shift_assignments
  WHERE company_id=p_company AND shift_code='OT' AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date AND starts_at<=st AND ends_at>=en;
 ELSE
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 END IF;
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
 IF p_code='OT' THEN target:=greatest(coalesce(target,0),private.sf_ot_weekend_minimum(p_company,p_date)); END IF;
 IF p_code='OT' AND private.sf_ot_weekend_minimum(p_company,p_date)>0 THEN
  SELECT count(DISTINCT employee_id) INTO filled FROM public.shift_assignments
  WHERE company_id=p_company AND shift_code='OT' AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date AND starts_at<=st AND ends_at>=en;
 ELSE
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 END IF;
 RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
END $function$;

CREATE OR REPLACE FUNCTION private.sf_open_market_candidate(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; ctx jsonb; err text; selected_code text; 
BEGIN
 SELECT * INTO o FROM public.open_shift_market_offers WHERE id=p_offer;
 IF o.id IS NULL OR o.status<>'MARKET_OPEN' OR o.remaining_count=0 OR o.starts_at<=now() THEN RETURN 'Dieses Angebot ist nicht mehr verfügbar'; END IF;
 ctx:=private.sf_open_market_slot(o.company_id,o.work_date,o.shift_code);
 IF (ctx->>'missing')::integer=0 THEN RETURN 'Der Bedarf wurde inzwischen vollständig besetzt'; END IF;
 IF o.starts_at<>(ctx->>'starts_at')::timestamptz OR o.ends_at<>(ctx->>'ends_at')::timestamptz THEN RETURN 'Die Schichtzeiten wurden inzwischen geändert'; END IF;
 IF private.time_month_is_closed(o.company_id,o.work_date) THEN RETURN 'Der Planungsmonat ist abgeschlossen'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=o.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.deleted_at IS NOT NULL OR e.auth_user_id IS NULL THEN RETURN 'Kein aktiver Mitarbeiterzugang'; END IF;
 IF (e.start_date IS NOT NULL AND o.work_date<e.start_date) OR (e.contract_end IS NOT NULL AND o.work_date>e.contract_end) THEN RETURN 'Schicht liegt außerhalb des Beschäftigungszeitraums'; END IF;
 selected_code:=private.sf_shared_coverage_shift(o.company_id,o.shift_code,e.id,o.work_date);
 IF selected_code IS NULL THEN RETURN 'Keine Freigabe für diese Schichtart'; END IF;
 IF private.sf_regional_day_allowed(o.company_id,e.id,o.work_date,selected_code) IS FALSE THEN RETURN 'Die Schicht passt nicht zum Feiertag am Standort'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=o.company_id AND code=selected_code AND responsible_only AND responsible_employee_id IS DISTINCT FROM e.id) THEN RETURN 'Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet'; END IF;
 err:=private.sf_shift_scope_error(o.company_id,e.id,selected_code,o.starts_at,o.ends_at);
 IF err IS NOT NULL THEN RETURN err; END IF;
 BEGIN
  PERFORM public.assert_standard_shift_rules(o.company_id,e.id,o.starts_at,o.ends_at,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  RETURN CASE err WHEN 'Shift overlaps another assignment' THEN 'Bereits andere Schicht im Zeitraum' WHEN 'Shift overlaps an approved absence' THEN 'Genehmigte Abwesenheit im Zeitraum' WHEN 'Standard minimum rest period not met before shift' THEN 'Ruhezeit vor der Schicht nicht ausreichend' WHEN 'Standard minimum rest period not met after shift' THEN 'Ruhezeit nach der Schicht nicht ausreichend' WHEN 'Standard maximum shift duration exceeded' THEN 'Schicht überschreitet die zulässige Dauer' ELSE err END;
 END;
 err:=private.sf_confirmed_candidate_error(o.company_id,e.id,o.starts_at,o.ends_at,selected_code);
 IF err IS NOT NULL THEN RETURN err; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_apply_month_optimization(company_ uuid, month_ date, fingerprint_ text, replace_ uuid[], rows_ jsonb, respect_weekly_ boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE manual_rows_ jsonb; manual_ids_ uuid[]:=ARRAY[]::uuid[]; actor_ uuid:=auth.uid();role_ text;snapshot_ jsonb;tz_ text;last_ date;ids_ uuid[]:=ARRAY[]::uuid[];protected_ uuid[];
 row_ record;e_ public.employees;model_ public.shift_templates;day_ date;rhythm_ jsonb;expected_ text;
 target_ numeric;limit_ numeric;weekly_ numeric;hours_ numeric;count_ int;maximum_ int;start_ date;end_ date;d_ date;
 pattern_ text[];index_ int;before_ int;after_ int;pattern_n_ int;cancelled_ int;new_id_ uuid;new_count_ int;target_count_ int;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=company_ AND user_id=actor_ AND status='ACTIVE'
  AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF actor_ IS NULL OR role_ IS NULL THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF coalesce((SELECT (solid_planning_rules->>'enabled')::boolean FROM public.company_compliance_policy WHERE company_id=company_),false) THEN respect_weekly_:=true; END IF;
 IF rows_ IS NULL OR jsonb_typeof(rows_)<>'array' OR jsonb_array_length(rows_)<1 OR jsonb_array_length(rows_)>10000
  OR replace_ IS NULL OR respect_weekly_ IS NULL THEN RAISE EXCEPTION 'Ungültige Monatsvorschläge.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
 snapshot_:=private.sf_month_optimization_snapshot(company_,month_);
 IF fingerprint_ IS NULL OR snapshot_->>'fingerprint'<>fingerprint_ THEN RAISE EXCEPTION 'Die Planungsdaten wurden geändert. Bitte den Monat erneut optimieren.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;last_:=(month_+interval '1 month')::date;
 SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO protected_ FROM jsonb_array_elements_text(snapshot_->'protectedIds') v;
 IF cardinality(replace_)<>(SELECT count(DISTINCT x) FROM unnest(replace_) x) OR EXISTS(
  SELECT 1 FROM unnest(replace_) id_ LEFT JOIN public.shift_assignments s ON s.id=id_
  WHERE s.id IS NULL OR s.company_id<>company_ OR s.status<>'DRAFT' OR s.id=ANY(protected_)
   OR s.starts_at<month_::timestamp AT TIME ZONE tz_ OR s.starts_at>=last_::timestamp AT TIME ZONE tz_)
 THEN RAISE EXCEPTION 'Ein zu ersetzender Dienst ist geschützt oder gehört nicht zu diesem Monatsentwurf.'; END IF;
 PERFORM 1 FROM public.shift_assignments WHERE company_id=company_ AND id=ANY(replace_) ORDER BY id FOR UPDATE;
 UPDATE public.shift_assignments SET status='CANCELLED',version=version+1 WHERE company_id=company_ AND id=ANY(replace_);
 GET DIAGNOSTICS cancelled_=ROW_COUNT;
 SELECT coalesce(jsonb_agg(v) FILTER(WHERE v->'rhythm_override'->'manualPlanning'='true'::jsonb),'[]'),
  coalesce(jsonb_agg(v) FILTER(WHERE v->'rhythm_override'->'manualPlanning' IS DISTINCT FROM 'true'::jsonb),'[]') INTO manual_rows_,rows_ FROM jsonb_array_elements(rows_) v;
 FOR row_ IN SELECT * FROM jsonb_to_recordset(rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text,note text,break_minutes int,rhythm_override jsonb) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND deleted_at IS NULL AND status='active';
  IF NOT FOUND OR NOT row_.shift_code=ANY(e_.shift_permissions) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF private.sf_regional_day_allowed(company_,e_.id,day_,row_.shift_code) IS FALSE THEN RAISE EXCEPTION 'Die Schicht passt nicht zum Feiertag am Standort.'; END IF;
  IF day_<month_ OR day_>=last_ OR row_.starts_at IS NULL OR row_.ends_at IS NULL OR row_.legacy_id IS NULL
   OR row_.ends_at<=row_.starts_at OR row_.ends_at-row_.starts_at>make_interval(secs => (3600*coalesce((select standard_max_shift_hours from public.company_compliance_policy where company_id=company_),10))::double precision)
   OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger Dienst im Monatsvorschlag.'; END IF;
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active;
  IF NOT FOUND OR (row_.starts_at AT TIME ZONE tz_)::time<>model_.default_start OR (row_.ends_at AT TIME ZONE tz_)::time<>model_.default_end
  THEN RAISE EXCEPTION 'Der Dienst entspricht nicht mehr dem aktiven Schichtmodell.'; END IF;
  IF NOT extract(isodow FROM day_)::int=ANY(model_.optional_weekdays) AND private.sf_regional_day_allowed(company_,e_.id,day_,row_.shift_code) IS DISTINCT FROM true AND NOT (row_.shift_code='OT' AND private.sf_ot_day(company_,day_,row_.employee_id)) AND NOT EXISTS(
   SELECT 1 FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code=row_.shift_code)
  THEN RAISE EXCEPTION 'Das Schichtmodell ist an diesem Wochentag nicht vorgesehen.'; END IF;
  rhythm_:=private.sf_month_rhythm(e_,day_);expected_:=rhythm_->>'expected';
  IF nullif(row_.rhythm_override,'null'::jsonb) IS NULL AND rhythm_->>'mode'='required' AND NOT (coalesce((rhythm_->>'exemptOt')::boolean,false) AND row_.shift_code IN('OT1','OT2','OT3'))
   AND expected_<>'ALLE' AND NOT upper(row_.shift_code)=ANY(regexp_split_to_array(expected_,'[+|/]'))
  THEN RAISE EXCEPTION 'Eine verbindliche Rhythmusvorgabe wird verletzt.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note,break_minutes,rhythm_override)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,coalesce(row_.note,'Monatsoptimierung'),coalesce(row_.break_minutes,0),nullif(row_.rhythm_override,'null'::jsonb)) RETURNING id INTO new_id_;
  ids_:=array_append(ids_,new_id_);
 END LOOP;
 -- Transition rule supplements the existing overlap, absence and eleven-hour server guards.
 IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments b ON a.employee_id=b.employee_id AND a.company_id=b.company_id
  AND (b.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1
  WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND b.status<>'CANCELLED' AND (a.id=ANY(ids_) OR b.id=ANY(ids_))
   AND upper(a.shift_code)='O3' AND upper(b.shift_code) IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'))
 THEN RAISE EXCEPTION 'Nach O3 ist O1, O2 oder TL am Folgetag gesperrt.'; END IF;
 FOR e_ IN SELECT DISTINCT e.* FROM public.employees e JOIN public.shift_assignments a ON a.employee_id=e.id WHERE a.id=ANY(ids_) LOOP
  target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,180);
  limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180 THEN coalesce((SELECT monthly_planning_max_hours FROM public.company_compliance_policy WHERE company_id=company_),220) ELSE least(180,target_) END;
  -- The confirmed OT-only limit also applies to this legacy final guard.
  IF e_.employment ~* '^Vollzeit([[:space:]]+180)?$' AND target_>=180
   AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[] THEN
   SELECT coalesce(nullif(solid_planning_rules->>'otOnlyMonthlyMaxHours','')::numeric,limit_) INTO limit_
    FROM public.company_compliance_policy WHERE company_id=company_;
  END IF;
  PERFORM private.sf_assert_month_planning_limits(company_,e_.id,month_);
  SELECT sum(extract(epoch FROM(ends_at-starts_at))/3600) INTO hours_ FROM public.shift_assignments
   WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_;
  IF hours_>limit_+.000001 THEN RAISE EXCEPTION 'Das persönliche Monatsmaximum wird überschritten (Personalnummer %).',e_.personnel_no; END IF;
  weekly_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'maxWeekly'),'')::numeric,e_.weekly_hours);
  IF respect_weekly_ AND weekly_>0 AND EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
   AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_
   AND date_trunc('week',starts_at AT TIME ZONE tz_) IN(SELECT date_trunc('week',starts_at AT TIME ZONE tz_) FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id)
   GROUP BY date_trunc('week',starts_at AT TIME ZONE tz_) HAVING sum(extract(epoch FROM(ends_at-starts_at))/3600)>weekly_+.000001)
  THEN RAISE EXCEPTION 'Das persönliche Wochenmaximum wird überschritten.'; END IF;
  maximum_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'maxConsecutive'),'')::int,0);
  IF maximum_>0 AND EXISTS(WITH days AS (SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
    AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
   SELECT 1 FROM islands GROUP BY k HAVING count(*)>maximum_ AND NOT private.sf_manual_five_day_block((SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'shift_code',a.shift_code,'rhythm_override',a.rhythm_override)),'[]') FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=e_.id AND a.status<>'CANCELLED' AND a.starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND a.starts_at<(last_+7)::timestamp AT TIME ZONE tz_),tz_,min(d),max(d),count(*)::int) AND bool_or(d IN(SELECT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id))) THEN RAISE EXCEPTION 'Das Maximum aufeinanderfolgender Dienste wird überschritten.'; END IF;
  -- Block length is a planning preference; a shorter block is valid.
 END LOOP;
 -- No generated duty may invent staffing beyond the real required/optional target.
 FOR row_ IN SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date d,shift_code FROM public.shift_assignments WHERE id=ANY(ids_) LOOP
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code;
  IF model_.coverage_group IS NOT NULL THEN
   SELECT coalesce(max(d.required_count),max(t.coverage_required)) INTO target_count_ FROM public.shift_templates t LEFT JOIN public.daily_staffing_overrides d
    ON d.company_id=t.company_id AND d.shift_code=t.code AND d.work_date=row_.d WHERE t.company_id=company_ AND t.coverage_group=model_.coverage_group AND t.active;
   SELECT count(*) INTO count_ FROM public.shift_assignments a JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code=a.shift_code WHERE a.company_id=company_ AND a.status<>'CANCELLED'
    AND (a.starts_at AT TIME ZONE tz_)::date=row_.d AND t.coverage_group=model_.coverage_group;
  ELSE
   SELECT required_count INTO target_count_ FROM public.daily_staffing_overrides WHERE company_id=company_ AND shift_code=row_.shift_code AND work_date=row_.d;
   IF NOT FOUND THEN
    IF model_.planning_mode='optional' THEN target_count_:=model_.optional_staffing;
    ELSE SELECT coalesce(max(required_count),0) INTO target_count_ FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code=row_.shift_code; END IF;
   END IF;
   IF row_.shift_code='OT2' AND private.sf_morning_ot_switch(company_,row_.d,tz_) THEN
    SELECT required_count INTO new_count_ FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT1';
    IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code='OT1' AND extract(isodow FROM row_.d)::int=ANY(optional_weekdays)) THEN new_count_:=0; END IF;
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code='OT1' AND (starts_at AT TIME ZONE tz_)::date=row_.d;
    target_count_:=coalesce(target_count_,0)+greatest(0,coalesce(new_count_,0)-count_);
   END IF;
   SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=row_.shift_code AND (starts_at AT TIME ZONE tz_)::date=row_.d;
  END IF;
  IF coalesce(private.sf_regional_day_is_code(company_,row_.shift_code),false) THEN
   SELECT (solid_planning_rules->'regionalDayStaffing'->>'target')::int INTO target_count_ FROM public.company_compliance_policy WHERE company_id=company_;
   count_:=private.sf_regional_day_filled(company_,row_.d);
  ELSE
  target_count_:=coalesce(private.sf_solid_conditional_required(company_,row_.d,row_.shift_code),target_count_);
  END IF;
  IF count_>coalesce(target_count_,0) THEN RAISE EXCEPTION 'Der tatsächliche Besetzungsbedarf wird überschritten.'; END IF;
 END LOOP;
 -- Insert conscious manual duties after all automatic limits and staffing caps were checked.
 FOR row_ IN SELECT * FROM jsonb_to_recordset(manual_rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text,note text,break_minutes int,rhythm_override jsonb) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND status='active' AND deleted_at IS NULL;
  IF NOT FOUND OR NOT coalesce(row_.shift_code=ANY(e_.shift_permissions),false) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF day_ IS NULL OR day_<month_ OR day_>=last_ OR row_.ends_at IS NULL OR row_.ends_at<=row_.starts_at
    OR row_.legacy_id IS NULL OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger manueller Dienst im Monatsvorschlag.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active) THEN RAISE EXCEPTION 'Das Schichtmodell ist nicht mehr aktiv.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note,break_minutes,rhythm_override)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,coalesce(row_.note,'Manuell in der Vorplanung eingeplant'),coalesce(row_.break_minutes,0),row_.rhythm_override) RETURNING id INTO new_id_;
  manual_ids_:=array_append(manual_ids_,new_id_);
 END LOOP;
 ids_:=ids_||manual_ids_;
 PERFORM private.sf_assert_solid_critical_coverage(company_,month_);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(company_,'MONTH_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('month',month_,'replaced',cancelled_,'created',cardinality(ids_),'weeklyLimits',respect_weekly_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',cardinality(ids_),'month',month_);
END $function$;

CREATE OR REPLACE FUNCTION private.sf_assert_solid_critical_coverage(company_ uuid, month_ date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;d_ date;r_ jsonb;group_ text;need_ int;count_ int;accept_open_ boolean:=coalesce(current_setting('sf.incomplete_draft_company',true)=company_::text AND current_setting('sf.incomplete_draft_confirmation',true)='OFFEN ÜBERNEHMEN',false);
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 FOR d_ IN SELECT generate_series(month_,month_+interval '1 month'-interval '1 day',interval '1 day')::date LOOP
  IF rules_ ? 'regionalDayStaffing' THEN
   need_:=(rules_->'regionalDayStaffing'->>'target')::int;
   count_:=private.sf_regional_day_filled(company_,d_);
   IF count_<need_ AND NOT accept_open_ THEN RAISE EXCEPTION 'Tagesbesetzung am % unvollständig: % von % Mitarbeitern.',d_,count_,need_; END IF;
  END IF;
  IF jsonb_typeof(rules_->'otWeekdayRoster'->'employeeIds')='array' AND jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')>0
   AND NOT private.sf_ot_day_holiday(company_,d_)
   AND coalesce(rules_->'otWeekdayRoster'->'weekdays','[1,2,3,4,5]'::jsonb) @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN
   need_:=CASE WHEN coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) THEN greatest(1,least(jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds'),coalesce((rules_->'otWeekdayRoster'->>'minimumDailyStaff')::int,jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')))) ELSE jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds') END;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(rules_->'staffingExceptions'->d_::text,'{}')) c WHERE c IN('OT1','OT2','OT3')) THEN
    need_:=least(need_,coalesce(private.sf_solid_conditional_required(company_,d_,'OT1'),0)+coalesce(private.sf_solid_conditional_required(company_,d_,'OT2'),0)+coalesce(private.sf_solid_conditional_required(company_,d_,'OT3'),0));
   END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED'
    AND shift_code IN('OT1','OT2','OT3') AND (starts_at AT TIME ZONE tz_)::date=d_
    AND rules_->'otWeekdayRoster'->'employeeIds' @> jsonb_build_array(employee_id::text);
   IF count_<need_ AND NOT accept_open_ THEN RAISE EXCEPTION 'Feste OT-Tagdienstgruppe am % unvollständig: % von % Mitarbeitern. Abwesenheiten und persönliche Sperren im Vorschlag prüfen.',d_,count_,need_; END IF;
   FOR group_ IN SELECT unnest(ARRAY['OT1','OT2','OT3']) LOOP
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=group_ AND (starts_at AT TIME ZONE tz_)::date=d_;
    need_:=private.sf_solid_conditional_required(company_,d_,group_);
    IF (count_<>need_ AND NOT (group_='OT2' AND coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) AND count_<need_ AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT1'),0)=0 AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT3'),0)=0)) AND NOT(accept_open_ AND count_<need_) THEN RAISE EXCEPTION 'OT-Verteilung am % entspricht nicht der Nachtabdeckung: % ist % statt %.',d_,group_,count_,need_; END IF;
   END LOOP;
  END IF;
  FOR group_ IN SELECT jsonb_array_elements_text(coalesce(rules_->'criticalCoverageGroups','[]')) LOOP
   SELECT coalesce(max(private.sf_staffing_exception(company_,d_,code)),max(coverage_required)) INTO need_ FROM public.shift_templates WHERE company_id=company_ AND active AND coverage_group=group_;
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code=a.shift_code AND t.active
    WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND (a.starts_at AT TIME ZONE tz_)::date=d_ AND t.coverage_group=group_
     AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_ AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF coalesce(count_,0)<coalesce(need_,1) AND NOT accept_open_ THEN RAISE EXCEPTION 'Pflichtleitung % fehlt am %. Der bestehende Plan bleibt erhalten.',group_,d_; END IF;
  END LOOP;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) LOOP
   IF rules_ ? 'regionalDayStaffing' AND private.sf_ot_day_holiday(company_,d_) AND private.sf_regional_day_is_code(company_,r_->>'shift') THEN CONTINUE; END IF;
   need_:=private.sf_solid_conditional_required(company_,d_,r_->>'shift');
   SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'shift' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_>need_ THEN RAISE EXCEPTION 'Der bedingte OT-Bedarf wird überschritten (% am %).',r_->>'shift',d_; END IF;
  END LOOP;
  need_:=private.sf_ot_weekend_minimum(company_,d_);
  IF need_>0 THEN
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a
   JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code='OT' AND t.active
   WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.shift_code='OT' AND (a.starts_at AT TIME ZONE tz_)::date=d_
    AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_
    AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF count_<need_ AND NOT accept_open_ THEN RAISE EXCEPTION 'OT-Pflichtbesetzung am % unvollständig: % von mindestens % Mitarbeitern. Der bestehende Plan bleibt erhalten.',d_,count_,need_; END IF;
  END IF;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'criticalShifts','[]')) LOOP
   IF rules_ ? 'regionalDayStaffing' AND private.sf_regional_day_is_code(company_,r_->>'code') THEN CONTINUE; END IF;
   IF r_->>'code' IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,d_) THEN CONTINUE; END IF;
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   need_:=coalesce(private.sf_staffing_exception(company_,d_,r_->>'code'),(r_->>'minimum')::int);
   IF (count_<need_ AND NOT accept_open_) OR (coalesce((r_->>'exact')::boolean,false) AND count_>need_) THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $function$;

