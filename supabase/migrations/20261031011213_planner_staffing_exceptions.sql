-- Planner-authorized staffing exceptions apply to one company, day and shift only.
CREATE OR REPLACE FUNCTION private.sf_staffing_exception(company_ uuid, day_ date, code_ text)
RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (solid_planning_rules->'staffingExceptions'->day_::text->code_->>'required')::integer
 FROM public.company_compliance_policy WHERE company_id=company_
$$;
REVOKE ALL ON FUNCTION private.sf_staffing_exception(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_staffing_exception(uuid,date,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.set_planning_staffing_exception(
 p_company_id uuid,p_date date,p_code text,p_required integer,p_reason text,
 p_first_month date DEFAULT NULL,p_month_count integer DEFAULT 1,p_snapshot_mode text DEFAULT 'none'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_ uuid:=auth.uid();role_ text;rules_ jsonb;entries_ jsonb;old_ jsonb;entry_ jsonb;
 codes_ text[];code_ text;group_ text;before_ jsonb;after_ jsonb;daily_ integer;out_ jsonb:='[]';
BEGIN
 IF actor_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Anmeldung erforderlich.'; END IF;
 SELECT role INTO role_ FROM public.company_members WHERE company_id=p_company_id AND user_id=actor_ AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF role_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Aktive Planungsrechte für dieses Unternehmen erforderlich.'; END IF;
 PERFORM private.sf_assert_aal2('Tagesbesetzung ändern');
 IF p_date IS NULL OR p_code IS NULL OR p_required NOT BETWEEN 0 AND 99 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'Bitte Datum, SOLL 0–99 und eine Begründung mit 3–500 Zeichen angeben.';
 END IF;
 IF p_snapshot_mode IS NULL OR p_snapshot_mode NOT IN('none','period','month') OR p_month_count IS NULL OR p_month_count NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Ungültiger Prüfzeitraum.'; END IF;
 IF p_snapshot_mode<>'none' AND (p_first_month IS NULL OR p_date<p_first_month OR p_date>=(p_first_month+make_interval(months=>p_month_count))::date) THEN RAISE EXCEPTION 'Tag liegt außerhalb der Vorplanung.'; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=p_company_id AND week_start=(p_date-(extract(isodow FROM p_date)::int-1)) AND published_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.companies c ON c.id=a.company_id WHERE a.company_id=p_company_id AND a.status='PUBLISHED' AND (a.starts_at AT TIME ZONE c.timezone)::date=p_date) THEN RAISE EXCEPTION 'Veröffentlichte Wochen können hier nicht geändert werden.'; END IF;
 SELECT nullif(coverage_group,'') INTO group_ FROM public.shift_templates WHERE company_id=p_company_id AND code=p_code AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aktive Schicht dieses Unternehmens erforderlich.'; END IF;
 SELECT array_agg(code ORDER BY code) INTO codes_ FROM public.shift_templates WHERE company_id=p_company_id AND active AND (code=p_code OR group_ IS NOT NULL AND coverage_group=group_);
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 SELECT solid_planning_rules INTO rules_ FROM public.company_compliance_policy WHERE company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unternehmensregeln sind noch nicht verfügbar.'; END IF;
 IF p_snapshot_mode='period' THEN before_:=public.preview_planning_period(p_company_id,p_first_month,p_month_count);
 ELSIF p_snapshot_mode='month' THEN before_:=public.preview_month_optimization(p_company_id,p_first_month);END IF;
 entries_:=coalesce(rules_->'staffingExceptions','{}');
 FOREACH code_ IN ARRAY codes_ LOOP
  old_:=entries_->p_date::text->code_;
  IF p_required IS NULL THEN
   IF old_ IS NULL THEN CONTINUE;END IF;
   daily_:=(old_->>'originalDaily')::int;
   entries_:=entries_ #- ARRAY[p_date::text,code_];
   IF daily_ IS NULL THEN DELETE FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND work_date=p_date AND shift_code=code_;
   ELSE INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count) VALUES(p_company_id,p_date,code_,daily_) ON CONFLICT(company_id,work_date,shift_code) DO UPDATE SET required_count=excluded.required_count;END IF;
  ELSE
   SELECT required_count INTO daily_ FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND work_date=p_date AND shift_code=code_;
   entry_:=jsonb_build_object('required',p_required,'reason',btrim(p_reason),'actor',actor_,'changedAt',clock_timestamp(),'originalDaily',CASE WHEN old_ IS NULL THEN to_jsonb(daily_) ELSE old_->'originalDaily' END);
   entries_:=jsonb_set(entries_,ARRAY[p_date::text],coalesce(entries_->p_date::text,'{}')||jsonb_build_object(code_,entry_),true);
   INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count) VALUES(p_company_id,p_date,code_,p_required) ON CONFLICT(company_id,work_date,shift_code) DO UPDATE SET required_count=excluded.required_count;
   daily_:=p_required;
  END IF;
  out_:=out_||jsonb_build_array(jsonb_build_object('date',p_date,'code',code_,'required',daily_));
 END LOOP;
 PERFORM set_config('sf.planning_rule_change_reason',btrim(p_reason),true);
 PERFORM set_config('sf.staffing_exception_write','on',true);
 rules_:=jsonb_set(coalesce(rules_,'{}'),'{staffingExceptions}',entries_,true);
 UPDATE public.company_compliance_policy SET solid_planning_rules=rules_ WHERE company_id=p_company_id;
 IF p_snapshot_mode='period' THEN after_:=public.preview_planning_period(p_company_id,p_first_month,p_month_count);
 ELSIF p_snapshot_mode='month' THEN after_:=public.preview_month_optimization(p_company_id,p_first_month);END IF;
 RETURN jsonb_build_object('rules',rules_,'daily',out_,'oldFingerprint',before_->>'fingerprint','newFingerprint',after_->>'fingerprint');
END $$;
REVOKE ALL ON FUNCTION private.set_planning_staffing_exception(uuid,date,text,integer,text,date,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.set_planning_staffing_exception(uuid,date,text,integer,text,date,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_planning_staffing_exception(
 p_company_id uuid,p_date date,p_code text,p_required integer,p_reason text,
 p_first_month date DEFAULT NULL,p_month_count integer DEFAULT 1,p_snapshot_mode text DEFAULT 'none'
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.set_planning_staffing_exception(p_company_id,p_date,p_code,p_required,p_reason,p_first_month,p_month_count,p_snapshot_mode)
$$;
REVOKE ALL ON FUNCTION public.set_planning_staffing_exception(uuid,date,text,integer,text,date,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_planning_staffing_exception(uuid,date,text,integer,text,date,integer,text) TO authenticated;

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
   need_:=CASE WHEN coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) THEN greatest(1,least(jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds'),coalesce((rules_->'otWeekdayRoster'->>'minimumDailyStaff')::int,jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')))) ELSE jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds') END;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(rules_->'staffingExceptions'->d_::text,'{}')) c WHERE c IN('OT1','OT2','OT3')) THEN
    need_:=least(need_,coalesce(private.sf_solid_conditional_required(company_,d_,'OT1'),0)+coalesce(private.sf_solid_conditional_required(company_,d_,'OT2'),0)+coalesce(private.sf_solid_conditional_required(company_,d_,'OT3'),0));
   END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED'
    AND shift_code IN('OT1','OT2','OT3') AND (starts_at AT TIME ZONE tz_)::date=d_
    AND rules_->'otWeekdayRoster'->'employeeIds' @> jsonb_build_array(employee_id::text);
   IF count_<need_ THEN RAISE EXCEPTION 'Feste OT-Tagdienstgruppe am % unvollständig: % von % Mitarbeitern. Abwesenheiten und persönliche Sperren im Vorschlag prüfen.',d_,count_,need_; END IF;
   FOR group_ IN SELECT unnest(ARRAY['OT1','OT2','OT3']) LOOP
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=group_ AND (starts_at AT TIME ZONE tz_)::date=d_;
    need_:=private.sf_solid_conditional_required(company_,d_,group_);
    IF (count_<>need_ AND NOT (group_='OT2' AND coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) AND count_<need_ AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT1'),0)=0 AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT3'),0)=0)) THEN RAISE EXCEPTION 'OT-Verteilung am % entspricht nicht der Nachtabdeckung: % ist % statt %.',d_,group_,count_,need_; END IF;
   END LOOP;
  END IF;
  FOR group_ IN SELECT jsonb_array_elements_text(coalesce(rules_->'criticalCoverageGroups','[]')) LOOP
   SELECT coalesce(max(private.sf_staffing_exception(company_,d_,code)),max(coverage_required)) INTO need_ FROM public.shift_templates WHERE company_id=company_ AND active AND coverage_group=group_;
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
  need_:=private.sf_ot_weekend_minimum(company_,d_);
  IF need_>0 THEN
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a
   JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code='OT' AND t.active
   WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.shift_code='OT' AND (a.starts_at AT TIME ZONE tz_)::date=d_
    AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_
    AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF count_<need_ THEN RAISE EXCEPTION 'OT-Pflichtbesetzung am % unvollständig: % von mindestens % Mitarbeitern. Der bestehende Plan bleibt erhalten.',d_,count_,need_; END IF;
  END IF;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'criticalShifts','[]')) LOOP
   IF r_->>'code' IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,d_) THEN CONTINUE; END IF;
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   need_:=coalesce(private.sf_staffing_exception(company_,d_,r_->>'code'),(r_->>'minimum')::int);
   IF count_<need_ OR (coalesce((r_->>'exact')::boolean,false) AND count_<>need_) THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION private.sf_audit_planning_rule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role_ text;
BEGIN
 IF NEW.solid_planning_rules IS NOT DISTINCT FROM OLD.solid_planning_rules THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT cm.role INTO role_ FROM public.company_members cm WHERE cm.company_id=NEW.company_id AND cm.user_id=auth.uid() AND cm.status='ACTIVE' AND cm.role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF role_ IS NULL OR (role_ IN('PLANNER','DISPATCHER') AND (current_setting('sf.staffing_exception_write',true) IS DISTINCT FROM 'on' OR (NEW.solid_planning_rules-'staffingExceptions') IS DISTINCT FROM (OLD.solid_planning_rules-'staffingExceptions'))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln dürfen nur Inhaber und Administratoren dieses Unternehmens ändern.'; END IF;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 VALUES(NEW.company_id,'PLANNING_RULES_UPDATED','company_compliance_policy',NEW.company_id,auth.uid(),role_,OLD.solid_planning_rules,NEW.solid_planning_rules,jsonb_build_object('backendCaptured',true,'reason',left(coalesce(current_setting('sf.planning_rule_change_reason',true),''),500)));
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION private.sf_ot_weekend_minimum(company_ uuid, day_ date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(private.sf_staffing_exception(company_,day_,'OT'),greatest(coalesce((SELECT CASE WHEN coalesce((solid_planning_rules->>'enabled')::boolean,false) THEN coalesce((solid_planning_rules->>'otDailyMinimumStaffing')::int,0) ELSE 0 END FROM public.company_compliance_policy WHERE company_id=company_),0),CASE WHEN extract(isodow FROM day_) IN (6,7) THEN coalesce((
  SELECT max((r->>'minimum')::int)
  FROM public.company_compliance_policy p
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.solid_planning_rules->'criticalShifts','[]')) r
  WHERE p.company_id=company_ AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
   AND r->>'code'='OT' AND coalesce(r->'weekdays','[1,2,3,4,5,6,7]') @> '[6,7]'::jsonb
 ),0) ELSE 0 END));
$function$
;

CREATE OR REPLACE FUNCTION private.sf_solid_conditional_required(company_ uuid, day_ date, code_ text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;r_ jsonb;tz_ text;count_ int;
BEGIN
 count_:=private.sf_staffing_exception(company_,day_,code_);IF count_ IS NOT NULL THEN RETURN count_; END IF;
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF rules_->'exactStaffing'->>code_ IS NOT NULL THEN RETURN (rules_->'exactStaffing'->>code_)::int; END IF;
 IF code_='OT' AND coalesce((rules_->>'enabled')::boolean,false) AND coalesce((rules_->>'otDailyMinimumStaffing')::int,0)>0 THEN
  SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code='OT'),(SELECT required_count FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT'),0) INTO count_;
  RETURN greatest(count_,(rules_->>'otDailyMinimumStaffing')::int);
 END IF;
 IF code_='OT' AND private.sf_ot_weekend_minimum(company_,day_)>0 THEN
  SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code='OT'),
   (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT'),0) INTO count_;
  RETURN greatest(count_,private.sf_ot_weekend_minimum(company_,day_));
 END IF;
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
