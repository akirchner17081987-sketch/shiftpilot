CREATE OR REPLACE FUNCTION private.sf_employee_planning_rules(company_ uuid, employee_ uuid, rules_ jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees; target_ numeric; explicit_week_ numeric; result_ jsonb:=rules_; pair_ record;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RETURN rules_; END IF;
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
   ('monthlyMaxHours',1,190),('eightHourAutoMaxHours',1,190),('eightHourMaxShifts',1,31),('tenHourMaxShifts',1,31),('otOnlyMonthlyMaxHours',1,220),('otOnlyMaxCalendarWeekHours',1,55),('otOnlyMaxConsecutiveShifts',1,5),('otOnlyMinFreeCalendarDays',0,14),('otOnlyMinBlockRestHours',11,336),
   ('maxConsecutiveShifts',1,7),('maxConsecutiveNightShifts',1,7),('minFreeCalendarDays',0,14),('minNightRecoveryCalendarDays',0,14),('minBlockRestHours',11,336),('maxCalendarWeekHours',1,55),
   ('teamLeaderMaxConsecutiveNightShifts',1,4),('teamLeaderPreferredNightBlockLength',1,4),('teamLeaderMinNightRecoveryCalendarDays',2,14),('teamLeaderMinimumMonthlyHours',0,180),('preferredNightBlockLength',1,7),('minFreeWeekendsPerMonth',0,5),('rollingWeekTargetHours',1,40)
  ) bounds(k,lo,hi) WHERE k=key_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Planungsregel ist nicht direkt bearbeitbar: %',key_; END IF;
  IF jsonb_typeof(value_) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Planungswerte müssen Zahlen sein.'; END IF;
  n_:=(value_#>>'{}')::numeric;
  IF n_<min_ OR n_>max_ OR n_<>trunc(n_) THEN RAISE EXCEPTION 'Der Wert für % muss ganzzahlig zwischen % und % liegen.',key_,min_,max_; END IF;
 END LOOP;
 after_.solid_planning_rules:=before_.solid_planning_rules||p_patch;
 IF coalesce((after_.solid_planning_rules->>'teamLeaderPreferredNightBlockLength')::int,1)>least(coalesce((after_.solid_planning_rules->>'teamLeaderMaxConsecutiveNightShifts')::int,4),coalesce((after_.solid_planning_rules->>'maxConsecutiveShifts')::int,4)) THEN RAISE EXCEPTION 'Bevorzugter Teamleiterblock darf das Nacht- oder Arbeitsblockmaximum nicht überschreiten.'; END IF;
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
