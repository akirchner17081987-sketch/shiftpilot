-- Vollzeit: 180 h SOLL, 200 h automatisch; individuelle manuelle Planerüberschreitung.
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
 IF coalesce((rules_->>'monthlyHoursOnly')::boolean,false) THEN
  IF hours_>limit_+.000001 OR calendar_>limit_+.000001 THEN RETURN format('Automatische Monatsobergrenze %s Stunden einschließlich Monatsübertrag überschritten.',limit_); END IF;
  RETURN NULL;
 END IF;
 IF NOT incoming_ AND count_>max_count_ THEN RETURN format('Maximal %s automatische Schichten pro Monat; Zusatzdienste benötigen eine Marktplatzfreigabe.',max_count_); END IF;
 IF hours_>limit_+.000001 OR calendar_>limit_+.000001 THEN RETURN format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten.',limit_); END IF;
 IF NOT incoming_ AND full_ AND eight_ AND auto_hours_>least(limit_,coalesce((rules_->>'eightHourAutoMaxHours')::numeric,184))+.000001 THEN RETURN format('Im 8-Stunden-Modell höchstens %s automatisch geplante Stunden.',least(limit_,coalesce((rules_->>'eightHourAutoMaxHours')::numeric,184))); END IF;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean,jsonb) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION private.sf_planner_month_override(company_ uuid,employee_ uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT EXISTS(SELECT 1 FROM public.company_compliance_policy p
  JOIN public.employees e ON e.company_id=p.company_id AND e.id=employee_
  JOIN public.company_members m ON m.company_id=p.company_id AND m.user_id=auth.uid()
  WHERE p.company_id=company_ AND m.status='ACTIVE' AND m.role IN('OWNER','ADMIN','PLANNER','DISPATCHER')
  AND coalesce((p.solid_planning_rules->>'plannerMonthlyOverride')::boolean,false)
  AND e.employment~*'^Vollzeit(\s+180)?$'
  AND coalesce(nullif(private.sf_month_meta(e.qualifications,'monthlyHours'),'')::numeric,180)>=180);
$f$;
REVOKE ALL ON FUNCTION private.sf_planner_month_override(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_planner_month_override(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_guard_month_planning_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE tz_ text; month_ date; skip_ uuid;
BEGIN
 IF NEW.status='CANCELLED' THEN RETURN NEW; END IF;
 -- Only active planners may exceed full-time monthly hours through manual writes.
 -- Solver candidates and final automatic month validation still call the strict assertion.
 IF private.sf_planner_month_override(NEW.company_id,NEW.employee_id) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.company_id=OLD.company_id AND NEW.employee_id=OLD.employee_id
  AND NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at AND OLD.status<>'CANCELLED' THEN RETURN NEW; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=NEW.company_id;
 -- Normal company write locking already serializes these mutations; acquire the same lock for all entry paths.
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||NEW.company_id::text,0));
 skip_:=NEW.id;
 IF TG_OP='INSERT' AND NEW.legacy_id IS NOT NULL THEN
  SELECT id INTO skip_ FROM public.shift_assignments WHERE company_id=NEW.company_id AND legacy_id=NEW.legacy_id LIMIT 1;
  skip_:=coalesce(skip_,NEW.id);
 END IF;
 FOR month_ IN SELECT generate_series(date_trunc('month',NEW.starts_at AT TIME ZONE tz_),
  date_trunc('month',(NEW.ends_at-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
  PERFORM private.sf_assert_month_planning_limits(NEW.company_id,NEW.employee_id,month_,skip_,NEW.starts_at,NEW.ends_at);
 END LOOP;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.sf_guard_month_planning_limits() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_month_planning_limits() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_guard_confirmed_month_count()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ public.shift_assignments;tz_ text;m_ date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=NEW.company_id AND coalesce((solid_planning_rules->>'enabled')::boolean,false) AND coalesce((solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2) THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.employee_id,OLD.starts_at,OLD.ends_at) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.employee_id,NEW.starts_at,NEW.ends_at) AND OLD.status<>'CANCELLED' THEN RETURN NULL; END IF;
 SELECT * INTO a_ FROM public.shift_assignments WHERE id=NEW.id AND status<>'CANCELLED';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF private.sf_planner_month_override(a_.company_id,a_.employee_id) THEN RETURN NULL; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=a_.company_id;
 FOR m_ IN SELECT generate_series(date_trunc('month',a_.starts_at AT TIME ZONE tz_),date_trunc('month',(a_.ends_at-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
  PERFORM private.sf_assert_month_planning_limits(a_.company_id,a_.employee_id,m_);
 END LOOP;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_guard_confirmed_month_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_confirmed_month_count() TO authenticated,service_role;

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
  IF coalesce((before_.solid_planning_rules->>'monthlyHoursOnly')::boolean,false) AND key_ IN('eightHourAutoMaxHours','eightHourMaxShifts','tenHourMaxShifts') THEN RAISE EXCEPTION 'Für dieses Unternehmen gelten Stundenobergrenzen ohne zusätzliche feste Dienstanzahl.'; END IF;
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
   ('monthlyMaxHours',1,200),('eightHourAutoMaxHours',1,190),('eightHourMaxShifts',1,31),('tenHourMaxShifts',1,31),('otOnlyMonthlyMaxHours',1,220),('otOnlyMaxCalendarWeekHours',1,55),('otOnlyMaxConsecutiveShifts',1,5),('otOnlyMinFreeCalendarDays',0,14),('otOnlyMinBlockRestHours',11,336),
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
 IF NOT coalesce((after_.solid_planning_rules->>'monthlyHoursOnly')::boolean,false) AND coalesce((after_.solid_planning_rules->>'eightHourAutoMaxHours')::numeric,184)>coalesce((after_.solid_planning_rules->>'monthlyMaxHours')::numeric,190) AND p_patch ? 'eightHourAutoMaxHours' THEN RAISE EXCEPTION 'Die automatischen Monatsstunden dürfen die allgemeine Monatsobergrenze nicht überschreiten.'; END IF;
 PERFORM set_config('sf.planning_rule_change_reason',left(coalesce(p_reason,''),500),true);
 UPDATE public.company_compliance_policy SET solid_planning_rules=solid_planning_rules||p_patch,
  monthly_planning_max_hours=coalesce((p_patch->>'monthlyMaxHours')::numeric,monthly_planning_max_hours),updated_at=now()
 WHERE company_id=p_company_id RETURNING * INTO after_;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln konnten für dieses Unternehmen nicht gespeichert werden.'; END IF;
 RETURN jsonb_build_object('company_id',p_company_id,'solid_planning_rules',after_.solid_planning_rules,'monthly_planning_max_hours',after_.monthly_planning_max_hours,'monthly_planning_max_shifts',after_.monthly_planning_max_shifts,'updated_at',after_.updated_at);
END $function$
;


-- The operational company is currently named Secontec Services; SchichtFunk is the application name.
-- Select by existing business identity and confirmed rules, never by a generated UUID.
UPDATE public.company_compliance_policy p
SET solid_planning_rules=(p.solid_planning_rules - 'eightHourAutoMaxHours' - 'eightHourMaxShifts' - 'tenHourMaxShifts')
 || jsonb_build_object('monthlyHoursOnly',true,'fullTimeMonthlyTarget',180,'monthlyMaxHours',200,'plannerMonthlyOverride',true),
 monthly_planning_max_hours=200,monthly_planning_max_shifts=NULL,updated_at=now()
FROM public.companies c
WHERE c.id=p.company_id AND c.name IN('SchichtFunk','Secontec Services')
 AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
 AND coalesce((p.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2;

UPDATE public.company_compliance_policy p
SET solid_planning_rules=jsonb_set(p.solid_planning_rules,'{fixedWeeklyRoster,monthlyMaxHours}','200'::jsonb)
WHERE coalesce((p.solid_planning_rules->>'monthlyHoursOnly')::boolean,false)
 AND p.solid_planning_rules ? 'fixedWeeklyRoster';

-- Normalize full-time targets, including the former 220 h OT profiles; retain lower personal targets.
UPDATE public.employees e
SET qualifications=ARRAY(SELECT q FROM unnest(coalesce(e.qualifications,ARRAY[]::text[])) q
 WHERE q NOT LIKE '__sp:monthlyHours=%')||ARRAY['__sp:monthlyHours=180']
FROM public.company_compliance_policy p
WHERE p.company_id=e.company_id AND coalesce((p.solid_planning_rules->>'monthlyHoursOnly')::boolean,false)
 AND e.employment~*'^Vollzeit(\s+180)?$'
 AND coalesce(nullif(private.sf_month_meta(e.qualifications,'monthlyHours'),'')::numeric,180)>=180;
