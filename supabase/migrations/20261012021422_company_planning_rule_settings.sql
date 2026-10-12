CREATE OR REPLACE FUNCTION private.sf_confirmed_rule_errors(rows_ jsonb,tz_ text,rules_ jsonb,affected_ date[] DEFAULT NULL,weekly_ numeric DEFAULT 40)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE out_ text[]:=ARRAY[]::text[];b_ record;prev_ record;next_ record;has_prev_ boolean:=false;touch_ boolean;w_ date;hours_ numeric;cap_ numeric:=least(coalesce((rules_->>'maxCalendarWeekHours')::numeric,40),CASE WHEN weekly_>0 THEN weekly_ ELSE 40 END);free_ int;
BEGIN
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN out_; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveShifts')::int,4)=4 THEN 'Höchstens vier Dienste am Stück.' ELSE format('Höchstens %s Dienste am Stück.',rules_->>'maxConsecutiveShifts') END); END IF;
  IF NOT has_prev_ THEN prev_:=b_; END IF;
  IF has_prev_ AND (touch_ OR affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN prev_.first_day AND prev_.last_day)) THEN
   free_:=b_.first_day-((prev_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   IF free_<coalesce((rules_->>'minFreeCalendarDays')::int,2) OR extract(epoch FROM b_.start_at-prev_.end_at)/3600<coalesce((rules_->>'minBlockRestHours')::numeric,48)-.000001 THEN out_:=array_append(out_,format('Zwischen Arbeitsblöcken mindestens %s vollständig freie Kalendertage und %s Stunden Ruhe.',coalesce(rules_->>'minFreeCalendarDays','2'),coalesce(rules_->>'minBlockRestHours','48'))); END IF;
  END IF;
  prev_:=b_;has_prev_:=true;
 END LOOP;
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
  WHERE upper(shift_code) IN('ND','O1','O2','O3','O1S','O2S','TL','TL-LE','TL-RE','TEAMLEITER','QA') OR (starts_at AT TIME ZONE tz_)::time>=time '18:00'),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveNightShifts')::int,3) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveNightShifts')::int,3)=3 THEN 'Höchstens drei Nachtdienste am Stück.' ELSE format('Höchstens %s Nachtdienste am Stück.',rules_->>'maxConsecutiveNightShifts') END); END IF;
  SELECT x.starts_at,x.ends_at,(x.starts_at AT TIME ZONE tz_)::date d INTO next_ FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
   WHERE x.starts_at>=b_.end_at AND (x.starts_at AT TIME ZONE tz_)::date>b_.last_day ORDER BY x.starts_at LIMIT 1;
  IF FOUND AND (touch_ OR affected_ IS NULL OR next_.d=ANY(affected_)) THEN
   free_:=next_.d-((b_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   IF free_<coalesce((rules_->>'minNightRecoveryCalendarDays')::int,3) THEN out_:=array_append(out_,format('Nach einem Nachtblock mindestens %s vollständig freie Kalendertage.',coalesce(rules_->>'minNightRecoveryCalendarDays','3'))); END IF;
  END IF;
 END LOOP;
 IF EXISTS(WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(ends_at) OVER(ORDER BY starts_at) prior_end,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date) OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text))
  SELECT 1 FROM r WHERE (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)) AND prior_end IS NOT NULL AND extract(epoch FROM starts_at-prior_end)/3600<11-.000001)
 THEN out_:=array_append(out_,'Mindestens 11 Stunden Ruhezeit.'); END IF;
 IF EXISTS(WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date) OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text))
  SELECT 1 FROM r WHERE (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)) AND d=prior_day+1 AND prior_code='O3' AND shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'))
 THEN out_:=array_append(out_,'Nach O3 kein früherer Nachtdienst am Folgetag.'); END IF;
 FOR w_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 candidates AS(SELECT date_trunc('week',starts_at AT TIME ZONE tz_)::date w FROM r WHERE affected_ IS NULL OR d=ANY(affected_)
  UNION SELECT date_trunc('week',(ends_at-interval '1 microsecond') AT TIME ZONE tz_)::date FROM r WHERE affected_ IS NULL OR d=ANY(affected_)
  UNION SELECT date_trunc('week',d::timestamp)::date FROM unnest(affected_) d)
 SELECT DISTINCT w FROM candidates LOOP
  SELECT coalesce(sum(extract(epoch FROM least(x.ends_at,(w_+7)::timestamp AT TIME ZONE tz_)-greatest(x.starts_at,w_::timestamp AT TIME ZONE tz_))/3600),0) INTO hours_
   FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
   WHERE x.starts_at<(w_+7)::timestamp AT TIME ZONE tz_ AND x.ends_at>w_::timestamp AT TIME ZONE tz_;
  IF hours_>cap_+.000001 THEN out_:=array_append(out_,format('Höchstens %s Stunden pro Kalenderwoche; Nachtdienste zählen zeitanteilig.',cap_)); END IF;
 END LOOP;
 RETURN ARRAY(SELECT DISTINCT x FROM unnest(out_) x);
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_rule_errors(jsonb,text,jsonb,date[],numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_rule_errors(jsonb,text,jsonb,date[],numeric) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_confirmed_month_error(rows_ jsonb,month_ date,tz_ text,full_ boolean,target_ numeric,eight_ boolean,incoming_ boolean,rules_ jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ timestamptz:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;b_ timestamptz:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 count_ int;hours_ numeric;auto_hours_ numeric;calendar_ numeric;limit_ numeric:=CASE WHEN full_ THEN coalesce((rules_->>'monthlyMaxHours')::numeric,190) ELSE least(coalesce((rules_->>'monthlyMaxHours')::numeric,190),coalesce(target_,180)) END;max_count_ int:=CASE WHEN eight_ THEN coalesce((rules_->>'eightHourMaxShifts')::int,23) ELSE coalesce((rules_->>'tenHourMaxShifts')::int,18) END;
BEGIN
 SELECT count(*) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),
 coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600) FILTER(WHERE starts_at>=a_),0),
 coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),0),
 coalesce(sum(extract(epoch FROM least(ends_at,b_)-greatest(starts_at,a_))/3600),0)
 INTO count_,hours_,auto_hours_,calendar_
 FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,market_approved boolean) WHERE starts_at<b_ AND ends_at>a_;
 IF NOT incoming_ AND count_>max_count_ THEN RETURN format('Maximal %s automatische Schichten pro Monat; Zusatzdienste benötigen eine Marktplatzfreigabe.',max_count_); END IF;
 IF hours_>limit_+.000001 OR calendar_>limit_+.000001 THEN RETURN format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten.',limit_); END IF;
 IF NOT incoming_ AND full_ AND eight_ AND auto_hours_>least(limit_,coalesce((rules_->>'eightHourAutoMaxHours')::numeric,184))+.000001 THEN RETURN format('Im 8-Stunden-Modell höchstens %s automatisch geplante Stunden.',least(limit_,coalesce((rules_->>'eightHourAutoMaxHours')::numeric,184))); END IF;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean,jsonb) TO authenticated,service_role;

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
  err_:=private.sf_confirmed_month_error(rows_,month_,tz_,(e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180),target_,eight_,start_ IS NOT NULL,policy_.solid_planning_rules);
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
END $function$
;
-- Atomic, company-authorized settings update. No company defaults are copied or seeded.
CREATE OR REPLACE FUNCTION public.manager_save_planning_rules(p_company_id uuid,p_patch jsonb,p_expected jsonb,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
   ('monthlyMaxHours',1,190),('eightHourAutoMaxHours',1,190),('eightHourMaxShifts',1,31),('tenHourMaxShifts',1,31),('otOnlyMonthlyMaxHours',1,220),
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
 UPDATE public.company_compliance_policy SET solid_planning_rules=solid_planning_rules||p_patch,
  monthly_planning_max_hours=coalesce((p_patch->>'monthlyMaxHours')::numeric,monthly_planning_max_hours),updated_at=now()
 WHERE company_id=p_company_id RETURNING * INTO after_;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln konnten für dieses Unternehmen nicht gespeichert werden.'; END IF;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 VALUES(p_company_id,'PLANNING_RULES_UPDATED','company_compliance_policy',p_company_id,auth.uid(),role_,before_.solid_planning_rules,after_.solid_planning_rules,jsonb_build_object('backendCaptured',true,'reason',left(coalesce(p_reason,''),500),'changed_keys',(SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)));
 RETURN jsonb_build_object('company_id',p_company_id,'solid_planning_rules',after_.solid_planning_rules,'monthly_planning_max_hours',after_.monthly_planning_max_hours,'monthly_planning_max_shifts',after_.monthly_planning_max_shifts,'updated_at',after_.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.manager_save_planning_rules(uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_save_planning_rules(uuid,jsonb,jsonb,text) TO authenticated;
