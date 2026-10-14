CREATE OR REPLACE FUNCTION private.sf_fixed_weekly_roster(company_ uuid, employee_ uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $function$
 SELECT solid_planning_rules->'fixedWeeklyRoster'
 FROM public.company_compliance_policy
 WHERE company_id=company_
 AND (solid_planning_rules->'fixedWeeklyRoster'->'employeeIds') ? employee_::text
$function$;
REVOKE ALL ON FUNCTION private.sf_fixed_weekly_roster(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_fixed_weekly_roster(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_month_rhythm(e public.employees, d date)
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

CREATE OR REPLACE FUNCTION private.sf_employee_planning_rules(company_ uuid, employee_ uuid, rules_ jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees; target_ numeric; explicit_week_ numeric; result_ jsonb:=rules_; pair_ record;fixed_ jsonb;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RETURN rules_; END IF;
 fixed_:=private.sf_fixed_weekly_roster(company_,employee_);
 IF fixed_ IS NOT NULL THEN
  result_:=result_||jsonb_build_object('monthlyMaxHours',(fixed_->>'monthlyMaxHours')::numeric,'tenHourMaxShifts',(fixed_->>'maxMonthlyShifts')::int);
 END IF;
 IF e_.role='Teamleiter' THEN
  FOR pair_ IN SELECT * FROM (VALUES
   ('teamLeaderMaxConsecutiveNightShifts','maxConsecutiveNightShifts'),
   ('teamLeaderMinNightRecoveryCalendarDays','minNightRecoveryCalendarDays'),
   ('teamLeaderPreferredNightBlockLength','preferredNightBlockLength')) keys(source,target) LOOP
   IF rules_->pair_.source IS NOT NULL AND rules_->pair_.source<>'null'::jsonb THEN result_:=jsonb_set(result_,ARRAY[pair_.target],rules_->pair_.source); END IF;
  END LOOP;
  RETURN result_;
 END IF;
 target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
 IF NOT coalesce((e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180 AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[]),false) THEN RETURN result_; END IF;
 FOR pair_ IN SELECT * FROM (VALUES
 ('otOnlyMaxConsecutiveShifts','maxConsecutiveShifts'),('otOnlyMaxCalendarWeekHours','maxCalendarWeekHours'),
 ('otOnlyMinFreeCalendarDays','minFreeCalendarDays'),('otOnlyMinBlockRestHours','minBlockRestHours')) keys(source,target) LOOP
  IF rules_->pair_.source IS NOT NULL AND rules_->pair_.source<>'null'::jsonb THEN result_:=jsonb_set(result_,ARRAY[pair_.target],rules_->pair_.source); END IF;
 END LOOP;
 IF rules_->>'otOnlyMaxCalendarWeekHours' IS NOT NULL THEN
  explicit_week_:=nullif(private.sf_month_meta(e_.qualifications,'maxWeekly'),'')::numeric;
  result_:=result_||jsonb_build_object('_otDayWeeklyLimit',least((rules_->>'otOnlyMaxCalendarWeekHours')::numeric,CASE WHEN explicit_week_>0 THEN explicit_week_ ELSE (rules_->>'otOnlyMaxCalendarWeekHours')::numeric END));
 END IF;
 RETURN result_;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits(company_ uuid, employee_ uuid, month_ date, exclude_ uuid DEFAULT NULL::uuid, start_ timestamp with time zone DEFAULT NULL::timestamp with time zone, end_ timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE policy_ public.company_compliance_policy; e_ public.employees; tz_ text; a_ timestamptz; b_ timestamptz;
 hours_ numeric; calendar_ numeric; count_ integer; target_ numeric; limit_ numeric; rows_ jsonb;eight_ boolean;err_ text;ot_max_ numeric;
BEGIN
 SELECT * INTO policy_ FROM public.company_compliance_policy WHERE company_id=company_;

 IF coalesce((policy_.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2 AND coalesce((policy_.solid_planning_rules->>'enabled')::boolean,false) THEN
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
  a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
  target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
  SELECT count(*)>0 AND bool_and(extract(epoch FROM(t.default_end-t.default_start+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END))/3600<=8) INTO eight_
   FROM public.shift_templates t WHERE t.company_id=company_ AND t.active AND t.code=ANY(e_.shift_permissions);
  WITH duties AS (
   SELECT a.starts_at,a.ends_at,EXISTS(SELECT 1 FROM public.open_shift_market_claims c WHERE c.assignment_id=a.id AND c.employee_id=employee_ AND c.company_id=company_ AND c.status='APPLIED') market_approved
    FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND a.id IS DISTINCT FROM exclude_ AND a.starts_at<b_ AND a.ends_at>a_
   UNION ALL SELECT start_,end_,false WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
  ) SELECT coalesce(jsonb_agg(to_jsonb(duties)),'[]') INTO rows_ FROM duties;
  ot_max_:=nullif(policy_.solid_planning_rules->>'otOnlyMonthlyMaxHours','')::numeric;
  IF ot_max_>0 AND ot_max_<=220 AND e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
   AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[] THEN
   err_:=private.sf_ot_only_month_error(rows_,month_,tz_,ot_max_,start_ IS NOT NULL);
  ELSE
  err_:=private.sf_confirmed_month_error(rows_,month_,tz_,(e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180),target_,eight_,start_ IS NOT NULL,private.sf_employee_planning_rules(company_,employee_,policy_.solid_planning_rules));
  END IF;
  IF err_ IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=err_;END IF;
  RETURN;
 END IF;
 IF policy_.monthly_planning_max_hours IS NULL AND policy_.monthly_planning_max_shifts IS NULL THEN RETURN; END IF;
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;
 b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 SELECT coalesce((SELECT nullif(substr(q,19),'')::numeric FROM unnest(e_.qualifications) q WHERE q LIKE '__sp:monthlyHours=%' LIMIT 1),e_.weekly_hours*4.348) INTO target_;
 limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
  THEN coalesce(policy_.monthly_planning_max_hours,220) ELSE least(coalesce(policy_.monthly_planning_max_hours,180),target_) END;
 WITH duties AS (
  SELECT starts_at s,ends_at e FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_
   AND status<>'CANCELLED' AND id IS DISTINCT FROM exclude_ AND starts_at<b_ AND ends_at>a_
  UNION ALL SELECT start_,end_ WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
 ) SELECT count(*) FILTER(WHERE s>=a_),coalesce(sum(extract(epoch FROM e-s)/3600) FILTER(WHERE s>=a_),0),
   coalesce(sum(extract(epoch FROM least(e,b_)-greatest(s,a_))/3600),0) INTO count_,hours_,calendar_ FROM duties;
 IF policy_.monthly_planning_max_shifts IS NOT NULL AND count_>policy_.monthly_planning_max_shifts THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Maximal %s Schichten pro Monat (Personalnummer %s).',policy_.monthly_planning_max_shifts,e_.personnel_no);
 END IF;
 IF hours_>limit_+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden überschritten (Personalnummer %s).',limit_,e_.personnel_no);
 END IF;
 IF policy_.monthly_planning_max_hours IS NOT NULL AND calendar_>policy_.monthly_planning_max_hours+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten (Personalnummer %s).',policy_.monthly_planning_max_hours,e_.personnel_no);
 END IF;
END $function$;

-- Personal fixed weekly rules outrank the general rotating work/rest cycle.
DO $data$
DECLARE company_ uuid;employee_ uuid;
BEGIN
 SELECT id INTO STRICT company_ FROM public.companies WHERE name='Secontec Services';
 SELECT id INTO STRICT employee_ FROM public.employees WHERE company_id=company_ AND personnel_no='115' AND deleted_at IS NULL AND status='active';
 UPDATE public.company_compliance_policy SET solid_planning_rules=solid_planning_rules||
  jsonb_build_object('fixedWeeklyRoster',jsonb_build_object('employeeIds',jsonb_build_array(employee_),'weekdays',jsonb_build_array(1,2,3,4),'code','O3','monthlyMaxHours',190,'maxMonthlyShifts',19))
 WHERE company_id=company_;
 IF NOT FOUND THEN RAISE EXCEPTION 'Planning policy missing'; END IF;
 UPDATE public.employees SET qualifications=coalesce((
  SELECT array_agg(q ORDER BY n) FROM unnest(qualifications) WITH ORDINALITY a(q,n)
  WHERE q !~ '^__sp:(planningTeam|rhythmMode|rhythmStart|rhythmPattern|rhythmKind|rhythmExemptOt|maxConsecutive)='
 ),ARRAY[]::text[])||ARRAY['__sp:planningTeam=','__sp:rhythmMode=required','__sp:rhythmStart=2026-10-12',
 '__sp:rhythmPattern=O3, O3, O3, O3, FREI, FREI, FREI','__sp:rhythmKind=week','__sp:rhythmExemptOt=false','__sp:maxConsecutive=4']
 WHERE id=employee_ AND company_id=company_;
END $data$;
