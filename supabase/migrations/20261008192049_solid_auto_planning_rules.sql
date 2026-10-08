-- Opt-in rules; existing companies keep their current planning behavior.
ALTER TABLE public.company_compliance_policy ADD COLUMN solid_planning_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(solid_planning_rules)='object');

CREATE OR REPLACE FUNCTION private.sf_assert_solid_recovery(company_ uuid,employee_ uuid,anchor_ date)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;tz_ text;pn_ text;b_ record;prev_ record;has_prev_ boolean:=false;short_ boolean;related_ boolean;
BEGIN
 SELECT p.solid_planning_rules,c.timezone,e.personnel_no INTO rules_,tz_,pn_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id JOIN public.employees e ON e.company_id=c.id AND e.id=employee_ WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 FOR b_ IN WITH dates AS(
  SELECT (starts_at AT TIME ZONE tz_)::date d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(shift_code IN('OT1','OT2','OT3')) ot
  FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
   AND starts_at >= (anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at < (anchor_+15)::timestamp AT TIME ZONE tz_ GROUP BY 1
 ),islands AS(SELECT *,d-(row_number() OVER(ORDER BY d))::int g FROM dates)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n)::int duties,bool_and(ot) only_ot FROM islands GROUP BY g ORDER BY min(d) LOOP
  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments c ON c.company_id=a.company_id AND c.employee_id=a.employee_id AND (c.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1 WHERE a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND c.status<>'CANCELLED' AND a.shift_code='O3' AND c.shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER') AND anchor_ IN((a.starts_at AT TIME ZONE tz_)::date,(c.starts_at AT TIME ZONE tz_)::date)) THEN RAISE EXCEPTION 'Nach O3 kein früherer Nachtdienst am Folgetag.'; END IF;
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
END $f$;
REVOKE ALL ON FUNCTION private.sf_assert_solid_recovery(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_assert_solid_recovery(uuid,uuid,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_guard_solid_recovery() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ public.shift_assignments;tz_ text;
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.employee_id,OLD.starts_at,OLD.ends_at,OLD.shift_code,OLD.status) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.employee_id,NEW.starts_at,NEW.ends_at,NEW.shift_code,NEW.status) THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN
  SELECT timezone INTO tz_ FROM public.companies WHERE id=OLD.company_id;
  PERFORM private.sf_assert_solid_recovery(OLD.company_id,OLD.employee_id,(OLD.starts_at AT TIME ZONE coalesce(tz_,'Europe/Berlin'))::date);
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT * INTO a_ FROM public.shift_assignments WHERE id=NEW.id AND status<>'CANCELLED';
  IF FOUND THEN SELECT timezone INTO tz_ FROM public.companies WHERE id=a_.company_id;
   PERFORM private.sf_assert_solid_recovery(a_.company_id,a_.employee_id,(a_.starts_at AT TIME ZONE coalesce(tz_,'Europe/Berlin'))::date);
  END IF;
 END IF;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_guard_solid_recovery() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_solid_recovery() TO authenticated,service_role;
CREATE CONSTRAINT TRIGGER shift_assignments_solid_recovery AFTER INSERT OR UPDATE OR DELETE ON public.shift_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sf_guard_solid_recovery();

CREATE OR REPLACE FUNCTION private.sf_solid_conditional_required(company_ uuid,day_ date,code_ text) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;r_ jsonb;tz_ text;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN NULL; END IF;
 SELECT v INTO r_ FROM jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) v WHERE v->>'shift'=code_ LIMIT 1;
 IF r_ IS NULL THEN RETURN NULL; END IF;
 IF extract(isodow FROM day_)>5 THEN RETURN 0; END IF;
 SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'sourceShift'
  AND (starts_at AT TIME ZONE tz_)::date=day_+(r_->>'sourceDayOffset')::int
  AND starts_at <= (day_+(r_->>'coverageStart')::time) AT TIME ZONE tz_ AND ends_at >= (day_+(r_->>'coverageEnd')::time) AT TIME ZONE tz_;
 RETURN CASE WHEN count_ >= (r_->>'minimum')::int THEN 0 ELSE (r_->>'fallbackCount')::int END;
END $f$;
REVOKE ALL ON FUNCTION private.sf_solid_conditional_required(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_solid_conditional_required(uuid,date,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_assert_solid_critical_coverage(company_ uuid,month_ date) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;tz_ text;d_ date;r_ jsonb;group_ text;need_ int;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 FOR d_ IN SELECT generate_series(month_,month_+interval '1 month'-interval '1 day',interval '1 day')::date LOOP
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
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_<(r_->>'minimum')::int THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $f$;
REVOKE ALL ON FUNCTION private.sf_assert_solid_critical_coverage(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_assert_solid_critical_coverage(uuid,date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION private.sf_apply_month_optimization(company_ uuid, month_ date, fingerprint_ text, replace_ uuid[], rows_ jsonb, respect_weekly_ boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_ uuid:=auth.uid();role_ text;snapshot_ jsonb;tz_ text;last_ date;ids_ uuid[]:=ARRAY[]::uuid[];protected_ uuid[];
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
 FOR row_ IN SELECT * FROM jsonb_to_recordset(rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND deleted_at IS NULL AND status='active';
  IF NOT FOUND OR NOT row_.shift_code=ANY(e_.shift_permissions) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF day_<month_ OR day_>=last_ OR row_.starts_at IS NULL OR row_.ends_at IS NULL OR row_.legacy_id IS NULL
   OR row_.ends_at<=row_.starts_at OR row_.ends_at-row_.starts_at>interval '10 hours'
   OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger Dienst im Monatsvorschlag.'; END IF;
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active;
  IF NOT FOUND OR (row_.starts_at AT TIME ZONE tz_)::time<>model_.default_start OR (row_.ends_at AT TIME ZONE tz_)::time<>model_.default_end
  THEN RAISE EXCEPTION 'Der Dienst entspricht nicht mehr dem aktiven Schichtmodell.'; END IF;
  IF NOT extract(isodow FROM day_)::int=ANY(model_.optional_weekdays) AND NOT EXISTS(
   SELECT 1 FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code=row_.shift_code)
  THEN RAISE EXCEPTION 'Das Schichtmodell ist an diesem Wochentag nicht vorgesehen.'; END IF;
  rhythm_:=private.sf_month_rhythm(e_,day_);expected_:=rhythm_->>'expected';
  IF rhythm_->>'mode'='required' AND NOT (coalesce((rhythm_->>'exemptOt')::boolean,false) AND row_.shift_code IN('OT1','OT2','OT3'))
   AND expected_<>'ALLE' AND NOT upper(row_.shift_code)=ANY(regexp_split_to_array(expected_,'[+|/]'))
  THEN RAISE EXCEPTION 'Eine verbindliche Rhythmusvorgabe wird verletzt.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,'Monatsoptimierung') RETURNING id INTO new_id_;
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
   SELECT 1 FROM islands GROUP BY k HAVING count(*)>maximum_ AND bool_or(d IN(SELECT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id))) THEN RAISE EXCEPTION 'Das Maximum aufeinanderfolgender Dienste wird überschritten.'; END IF;
  -- Every used ALLE/FREI work block must be complete inside this month (approved absences excluded).
  FOR day_ IN SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
   AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_ AND shift_code NOT IN('OT1','OT2','OT3') LOOP
   rhythm_:=private.sf_month_rhythm(e_,day_);
   SELECT array_agg(value) INTO pattern_ FROM jsonb_array_elements_text(coalesce(rhythm_->'pattern','[]'::jsonb));
   IF rhythm_->>'mode'='required' AND rhythm_->>'expected'='ALLE' AND 'FREI'=ANY(pattern_) AND NOT EXISTS(SELECT 1 FROM unnest(pattern_) x WHERE trim(x) NOT IN('ALLE','FREI')) THEN
    index_:=(rhythm_->>'index')::int;pattern_n_:=cardinality(pattern_);before_:=0;after_:=0;
    WHILE before_<pattern_n_-1 AND trim(pattern_[((index_-before_-1+pattern_n_)%pattern_n_)+1])='ALLE' LOOP before_:=before_+1; END LOOP;
    WHILE after_<pattern_n_-1 AND trim(pattern_[((index_+after_+1)%pattern_n_)+1])='ALLE' LOOP after_:=after_+1; END LOOP;
    FOR d_ IN SELECT g::date FROM generate_series(greatest(month_,day_-before_),least(last_-1,day_+after_),interval '1 day') g LOOP
     IF NOT EXISTS(SELECT 1 FROM public.absences WHERE company_id=company_ AND employee_id=e_.id AND status IN('Genehmigt','Erfasst') AND full_day AND start_date<=d_ AND end_date>=d_)
      AND NOT EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
       AND (starts_at AT TIME ZONE tz_)::date=d_ AND shift_code NOT IN('OT1','OT2','OT3')) THEN RAISE EXCEPTION 'Ein Arbeitsblock ist unvollständig.'; END IF;
    END LOOP;
   END IF;
  END LOOP;
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
  target_count_:=coalesce(private.sf_solid_conditional_required(company_,row_.d,row_.shift_code),target_count_);
  IF count_>coalesce(target_count_,0) THEN RAISE EXCEPTION 'Der tatsächliche Besetzungsbedarf wird überschritten.'; END IF;
 END LOOP;
 PERFORM private.sf_assert_solid_critical_coverage(company_,month_);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(company_,'MONTH_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('month',month_,'replaced',cancelled_,'created',cardinality(ids_),'weeklyLimits',respect_weekly_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',cardinality(ids_),'month',month_);
END $function$
;

-- Multi-month operations need privileges for audited cancellations and retain explicit tenant authorization.
CREATE OR REPLACE FUNCTION private.sf_preview_planning_period(company_ uuid,first_ date,months_ int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE snapshots_ jsonb:='[]';s_ jsonb;i_ int;
BEGIN
 IF months_ IS NULL OR months_<1 OR months_>6 OR first_ IS NULL OR extract(day FROM first_)<>1 THEN RAISE EXCEPTION 'Bitte ein bis sechs Kalendermonate auswählen.'; END IF;
 FOR i_ IN 0..months_-1 LOOP s_:=private.sf_month_optimization_snapshot(company_,(first_+make_interval(months=>i_))::date);snapshots_:=snapshots_||jsonb_build_array(s_); END LOOP;
 RETURN jsonb_build_object('fingerprint',md5(snapshots_::text),'months',snapshots_,'protectedIds',(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb) FROM jsonb_array_elements(snapshots_) s CROSS JOIN LATERAL jsonb_array_elements(s->'protectedIds') v));
END $f$;
CREATE OR REPLACE FUNCTION private.sf_apply_planning_period(company_ uuid,first_ date,months_ int,fingerprint_ text,replace_ uuid[],rows_ jsonb,respect_weekly_ boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE actor_ uuid:=auth.uid();role_ text;snapshot_ jsonb;protected_ uuid[];tz_ text;finish_ date;i_ int;month_ date;part_ jsonb;fp_ text;result_ jsonb;created_ int:=0;cancelled_ int;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=company_ AND user_id=actor_ AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF actor_ IS NULL OR role_ IS NULL THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF rows_ IS NULL OR jsonb_typeof(rows_)<>'array' OR jsonb_array_length(rows_)<1 OR jsonb_array_length(rows_)>10000 OR replace_ IS NULL OR respect_weekly_ IS NULL THEN RAISE EXCEPTION 'Ungültige Zeitraumvorschläge.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
 snapshot_:=private.sf_preview_planning_period(company_,first_,months_);
 IF fingerprint_ IS NULL OR snapshot_->>'fingerprint'<>fingerprint_ THEN RAISE EXCEPTION 'Die Planungsdaten wurden geändert. Bitte den Zeitraum erneut optimieren.'; END IF;
 SELECT timezone INTO tz_ FROM public.companies WHERE id=company_;finish_:=(first_+make_interval(months=>months_))::date;
 SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO protected_ FROM jsonb_array_elements_text(snapshot_->'protectedIds') v;
 IF cardinality(replace_)<>(SELECT count(DISTINCT x) FROM unnest(replace_) x) OR EXISTS(SELECT 1 FROM unnest(replace_) id_ LEFT JOIN public.shift_assignments a ON a.id=id_ WHERE a.id IS NULL OR a.company_id<>company_ OR a.status<>'DRAFT' OR a.id=ANY(protected_) OR (a.starts_at AT TIME ZONE tz_)::date<first_ OR (a.starts_at AT TIME ZONE tz_)::date>=finish_) THEN RAISE EXCEPTION 'Ein zu ersetzender Dienst ist geschützt oder gehört nicht zu diesem Zeitraum.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(rows_) AS x(starts_at timestamptz) WHERE starts_at IS NULL OR (starts_at AT TIME ZONE tz_)::date<first_ OR (starts_at AT TIME ZONE tz_)::date>=finish_) THEN RAISE EXCEPTION 'Ein Vorschlag liegt außerhalb des Zeitraums.'; END IF;
 PERFORM 1 FROM public.shift_assignments WHERE company_id=company_ AND id=ANY(replace_) ORDER BY id FOR UPDATE;
 UPDATE public.shift_assignments SET status='CANCELLED',version=version+1 WHERE company_id=company_ AND id=ANY(replace_);GET DIAGNOSTICS cancelled_=ROW_COUNT;
 FOR i_ IN 0..months_-1 LOOP
  month_:=(first_+make_interval(months=>i_))::date;
  SELECT coalesce(jsonb_agg(v),'[]') INTO part_ FROM jsonb_array_elements(rows_) v WHERE (v->>'starts_at')::timestamptz AT TIME ZONE tz_ >= month_::timestamp AND (v->>'starts_at')::timestamptz AT TIME ZONE tz_ < month_+interval '1 month';
  IF jsonb_array_length(part_)>0 THEN
   fp_:=private.sf_month_optimization_snapshot(company_,month_)->>'fingerprint';
   result_:=private.sf_apply_month_optimization(company_,month_,fp_,ARRAY[]::uuid[],part_,respect_weekly_);created_:=created_+(result_->>'created')::int;
  ELSE PERFORM private.sf_assert_solid_critical_coverage(company_,month_); END IF;
 END LOOP;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata) VALUES(company_,'PLANNING_PERIOD_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('firstMonth',first_,'months',months_,'replaced',cancelled_,'created',created_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',created_,'months',months_);
END $f$;
CREATE OR REPLACE FUNCTION public.preview_planning_period(p_company_id uuid,p_first_month date,p_month_count int) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sf_preview_planning_period(p_company_id,p_first_month,p_month_count) $$;
CREATE OR REPLACE FUNCTION public.apply_planning_period(p_company_id uuid,p_first_month date,p_month_count int,p_fingerprint text,p_replace_ids uuid[],p_assignments jsonb,p_respect_weekly boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sf_apply_planning_period(p_company_id,p_first_month,p_month_count,p_fingerprint,p_replace_ids,p_assignments,p_respect_weekly) $$;
REVOKE ALL ON FUNCTION private.sf_preview_planning_period(uuid,date,int),private.sf_apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean),public.preview_planning_period(uuid,date,int),public.apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_preview_planning_period(uuid,date,int),private.sf_apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean),public.preview_planning_period(uuid,date,int),public.apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
