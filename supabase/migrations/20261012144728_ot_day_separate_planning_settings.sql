-- Separate OT1/OT2/OT3 day-duty limits; ordinary OT and other companies retain their rules.
CREATE OR REPLACE FUNCTION private.sf_employee_planning_rules(company_ uuid,employee_ uuid,rules_ jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE e_ public.employees; target_ numeric; explicit_week_ numeric; result_ jsonb:=rules_; pair_ record;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RETURN rules_; END IF;
 target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
 IF NOT coalesce((e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180 AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[]),false) THEN RETURN rules_; END IF;
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
END $f$;
REVOKE ALL ON FUNCTION private.sf_employee_planning_rules(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_planning_rules(uuid,uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_assert_solid_recovery(company_ uuid, employee_ uuid, anchor_ date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;pn_ text;b_ record;prev_ record;has_prev_ boolean:=false;short_ boolean;related_ boolean; rows_ jsonb;errors_ text[];weekly_ numeric;
BEGIN
 SELECT p.solid_planning_rules,c.timezone,e.personnel_no INTO rules_,tz_,pn_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id JOIN public.employees e ON e.company_id=c.id AND e.id=employee_ WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 IF coalesce((rules_->>'confirmedRulesVersion')::int,0)>=2 THEN
  SELECT coalesce(nullif(private.sf_month_meta(e.qualifications,'maxWeekly'),'')::numeric,e.weekly_hours,40) INTO weekly_ FROM public.employees e WHERE e.id=employee_ AND e.company_id=company_;
  SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code)),'[]') INTO rows_ FROM public.shift_assignments
   WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(anchor_-14)::timestamp AT TIME ZONE tz_;
  rules_:=private.sf_employee_planning_rules(company_,employee_,rules_);
  weekly_:=coalesce((rules_->>'_otDayWeeklyLimit')::numeric,weekly_);
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[anchor_],weekly_);
  IF cardinality(errors_)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=errors_[1]; END IF;
  RETURN;
 END IF;

  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments c ON c.company_id=a.company_id AND c.employee_id=a.employee_id AND (c.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1 WHERE a.starts_at>=(anchor_-1)::timestamp AT TIME ZONE tz_ AND a.starts_at<(anchor_+1)::timestamp AT TIME ZONE tz_ AND c.starts_at>=anchor_::timestamp AT TIME ZONE tz_ AND c.starts_at<(anchor_+2)::timestamp AT TIME ZONE tz_ AND a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND c.status<>'CANCELLED' AND a.shift_code='O3' AND c.shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER') AND anchor_ IN((a.starts_at AT TIME ZONE tz_)::date,(c.starts_at AT TIME ZONE tz_)::date)) THEN RAISE EXCEPTION 'Nach O3 kein früherer Nachtdienst am Folgetag.'; END IF;
 FOR b_ IN WITH dates AS(
  SELECT (starts_at AT TIME ZONE tz_)::date d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(shift_code IN('OT1','OT2','OT3')) ot
  FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
   AND starts_at >= (anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at < (anchor_+15)::timestamp AT TIME ZONE tz_ GROUP BY 1
 ),islands AS(SELECT *,d-(row_number() OVER(ORDER BY d))::int g FROM dates)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n)::int duties,bool_and(ot) only_ot FROM islands GROUP BY g ORDER BY min(d) LOOP
  related_:=anchor_ BETWEEN b_.first_day-1 AND b_.last_day+1;
  IF related_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) THEN RAISE EXCEPTION 'Höchstens vier Dienste am Stück (%).',pn_; END IF;
  IF NOT has_prev_ THEN prev_:=b_; END IF;
  IF has_prev_ AND (related_ OR anchor_ BETWEEN prev_.first_day-1 AND prev_.last_day+1) THEN
   short_:=coalesce(rules_->'shortBlockRecoveryPersonnelNos','[]') ? coalesce(pn_,'') AND prev_.duties<=coalesce((rules_->>'shortBlockMaximum')::int,2) AND prev_.only_ot;
   IF b_.first_day-prev_.last_day-1 < (CASE WHEN short_ THEN 1 ELSE coalesce((rules_->>'minFreeStartDays')::int,2) END)
    OR extract(epoch FROM b_.start_at-prev_.end_at)/3600 < (CASE WHEN short_ THEN 11 ELSE coalesce((rules_->>'minBlockRestHours')::numeric,48) END) THEN
    RAISE EXCEPTION 'Erholung für %: zwischen Arbeitsblöcken mindestens % freie Starttage und % Stunden Ruhe.',pn_,CASE WHEN short_ THEN 1 ELSE 2 END,CASE WHEN short_ THEN 11 ELSE 48 END;
   END IF;
  END IF;
  prev_:=b_;has_prev_:=true;
 END LOOP;
END $function$
;
CREATE OR REPLACE FUNCTION private.sf_confirmed_candidate_error(company_ uuid, employee_ uuid, start_ timestamp with time zone, end_ timestamp with time zone, code_ text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;d_ date;rows_ jsonb;errors_ text[];weekly_ numeric;m_ date;err_ text;
BEGIN
 SELECT p.solid_planning_rules,coalesce(c.timezone,'Europe/Berlin') INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN NULL; END IF;
 d_:=(start_ AT TIME ZONE tz_)::date;
 SELECT coalesce(nullif(private.sf_month_meta(e.qualifications,'maxWeekly'),'')::numeric,e.weekly_hours,40) INTO weekly_ FROM public.employees e WHERE e.id=employee_ AND e.company_id=company_;
 WITH r AS(SELECT starts_at,ends_at,shift_code FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
  AND starts_at<(d_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(d_-14)::timestamp AT TIME ZONE tz_ UNION ALL SELECT start_,end_,code_)
 SELECT jsonb_agg(to_jsonb(r)) INTO rows_ FROM r;
 rules_:=private.sf_employee_planning_rules(company_,employee_,rules_);
  weekly_:=coalesce((rules_->>'_otDayWeeklyLimit')::numeric,weekly_);
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[d_],weekly_);
 IF cardinality(errors_)>0 THEN RETURN errors_[1]; END IF;
 BEGIN
  FOR m_ IN SELECT generate_series(date_trunc('month',start_ AT TIME ZONE tz_),date_trunc('month',(end_-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
   PERFORM private.sf_assert_month_planning_limits(company_,employee_,m_,NULL,start_,end_);
  END LOOP;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err_=MESSAGE_TEXT;RETURN err_; END;
 RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.manager_save_planning_rules(p_company_id uuid, p_patch jsonb, p_expected jsonb, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE before_ public.company_compliance_policy; after_ public.company_compliance_policy; key_ text; value_ jsonb; n_ numeric; min_ numeric; max_ numeric; rule_ jsonb; role_ text;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=p_company_id AND user_id=auth.uid() AND status='ACTIVE' AND role IN('OWNER','ADMIN');
 IF auth.uid() IS NULL OR role_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Nur Inhaber und Administratoren dieses Unternehmens dürfen Planungsregeln ändern.'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ungültige Planungsregeln.'; END IF;
 SELECT * INTO before_ FROM public.company_compliance_policy WHERE company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Keine zugänglichen Planungseinstellungen für dieses Unternehmen.'; END IF;
 IF before_.solid_planning_rules IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Die Planungsregeln wurden zwischenzeitlich geändert. Bitte neu laden und erneut bearbeiten.'; END IF;
 IF NOT coalesce((before_.solid_planning_rules->>'enabled')::boolean,false) OR coalesce((before_.solid_planning_rules->>'confirmedRulesVersion')::int,0)<2 THEN RAISE EXCEPTION 'Dieses Unternehmen verwendet noch kein bestätigtes Regelwerk. Schichtmodelle und Teamregeln können unter Planung bearbeitet werden.'; END IF;
 FOR key_,value_ IN SELECT * FROM jsonb_each(p_patch) LOOP
  IF key_='conditionalStaffing' THEN
   IF jsonb_typeof(value_) IS DISTINCT FROM 'array' OR jsonb_array_length(value_)>20 THEN RAISE EXCEPTION 'Ungültige bedingte Besetzung.'; END IF;
   FOR rule_ IN SELECT * FROM jsonb_array_elements(value_) LOOP
    IF jsonb_typeof(rule_) IS DISTINCT FROM 'object' OR NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=p_company_id AND code=rule_->>'shift' AND active) OR NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=p_company_id AND code=rule_->>'sourceShift' AND active) OR rule_->>'shift'=rule_->>'sourceShift' THEN RAISE EXCEPTION 'Bedingte Besetzung muss aktive unterschiedliche Schichtmodelle dieses Unternehmens verwenden.'; END IF;
    IF NOT coalesce((rule_->>'coverageStart')~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false) OR NOT coalesce((rule_->>'coverageEnd')~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false) OR (rule_->>'coverageEnd')::time<=(rule_->>'coverageStart')::time THEN RAISE EXCEPTION 'Bitte ein gültiges Abdeckungszeitfenster am selben Tag angeben.'; END IF;
    IF jsonb_typeof(rule_->'minimum') IS DISTINCT FROM 'number' OR (rule_->>'minimum')::numeric NOT BETWEEN 1 AND 99 OR (rule_->>'minimum')::numeric<>trunc((rule_->>'minimum')::numeric) OR jsonb_typeof(rule_->'fallbackCount') IS DISTINCT FROM 'number' OR (rule_->>'fallbackCount')::numeric NOT BETWEEN 0 AND 99 OR (rule_->>'fallbackCount')::numeric<>trunc((rule_->>'fallbackCount')::numeric) OR jsonb_typeof(rule_->'sourceDayOffset') IS DISTINCT FROM 'number' OR (rule_->>'sourceDayOffset')::numeric NOT IN(-1,0) THEN RAISE EXCEPTION 'Ungültige Besetzungsanzahl oder Bezugstag.'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(value_) r GROUP BY r->>'shift' HAVING count(*)>1) THEN RAISE EXCEPTION 'Pro Schicht ist nur eine bedingte Besetzungsregel erlaubt.'; END IF;
   CONTINUE;
  END IF;
  SELECT lo,hi INTO min_,max_ FROM (VALUES
   ('monthlyMaxHours',1,190),('eightHourAutoMaxHours',1,190),('eightHourMaxShifts',1,31),('tenHourMaxShifts',1,31),('otOnlyMonthlyMaxHours',1,220),('otOnlyMaxCalendarWeekHours',1,50),('otOnlyMaxConsecutiveShifts',1,5),('otOnlyMinFreeCalendarDays',0,14),('otOnlyMinBlockRestHours',11,336),
   ('maxConsecutiveShifts',1,7),('maxConsecutiveNightShifts',1,7),('minFreeCalendarDays',0,14),('minNightRecoveryCalendarDays',0,14),('minBlockRestHours',11,336),('maxCalendarWeekHours',1,40),
   ('preferredNightBlockLength',1,7),('minFreeWeekendsPerMonth',0,5),('rollingWeekTargetHours',1,40)
  ) bounds(k,lo,hi) WHERE k=key_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Planungsregel ist nicht direkt bearbeitbar: %',key_; END IF;
  IF jsonb_typeof(value_) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Planungswerte müssen Zahlen sein.'; END IF;
  n_:=(value_#>>'{}')::numeric;
  IF n_<min_ OR n_>max_ OR n_<>trunc(n_) THEN RAISE EXCEPTION 'Der Wert für % muss ganzzahlig zwischen % und % liegen.',key_,min_,max_; END IF;
 END LOOP;
 after_.solid_planning_rules:=before_.solid_planning_rules||p_patch;
 IF coalesce((after_.solid_planning_rules->>'maxConsecutiveNightShifts')::int,3)>coalesce((after_.solid_planning_rules->>'maxConsecutiveShifts')::int,4) THEN RAISE EXCEPTION 'Die maximale Nachtblocklänge darf die Arbeitsblocklänge nicht überschreiten.'; END IF;
 IF coalesce((after_.solid_planning_rules->>'eightHourAutoMaxHours')::numeric,184)>coalesce((after_.solid_planning_rules->>'monthlyMaxHours')::numeric,190) AND p_patch ? 'eightHourAutoMaxHours' THEN RAISE EXCEPTION 'Die automatischen Monatsstunden dürfen die allgemeine Monatsobergrenze nicht überschreiten.'; END IF;
 PERFORM set_config('sf.planning_rule_change_reason',left(coalesce(p_reason,''),500),true);
 UPDATE public.company_compliance_policy SET solid_planning_rules=solid_planning_rules||p_patch,
  monthly_planning_max_hours=coalesce((p_patch->>'monthlyMaxHours')::numeric,monthly_planning_max_hours),updated_at=now()
 WHERE company_id=p_company_id RETURNING * INTO after_;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln konnten für dieses Unternehmen nicht gespeichert werden.'; END IF;
 RETURN jsonb_build_object('company_id',p_company_id,'solid_planning_rules',after_.solid_planning_rules,'monthly_planning_max_hours',after_.monthly_planning_max_hours,'monthly_planning_max_shifts',after_.monthly_planning_max_shifts,'updated_at',after_.updated_at);
END $function$
;
-- Apply the requested five-day day-duty model only to the named company with the existing OT scope.
UPDATE public.company_compliance_policy p SET solid_planning_rules=p.solid_planning_rules||jsonb_build_object(
 'otOnlyMaxCalendarWeekHours',coalesce((p.solid_planning_rules->>'otOnlyMaxCalendarWeekHours')::int,50),
 'otOnlyMaxConsecutiveShifts',coalesce((p.solid_planning_rules->>'otOnlyMaxConsecutiveShifts')::int,5),
 'otOnlyMinFreeCalendarDays',coalesce((p.solid_planning_rules->>'otOnlyMinFreeCalendarDays')::int,(p.solid_planning_rules->>'minFreeCalendarDays')::int,2),
 'otOnlyMinBlockRestHours',coalesce((p.solid_planning_rules->>'otOnlyMinBlockRestHours')::int,(p.solid_planning_rules->>'minBlockRestHours')::int,48)),updated_at=now()
FROM public.companies c WHERE c.id=p.company_id AND c.name='SchichtFunk' AND p.solid_planning_rules->>'otOnlyMonthlyMaxHours'='220';
