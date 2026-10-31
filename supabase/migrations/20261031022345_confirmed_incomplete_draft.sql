-- Only a deliberate, scoped planner action may keep staffing gaps in a draft.
CREATE OR REPLACE FUNCTION private.apply_confirmed_incomplete_draft(
 p_company_id uuid,p_first_month date,p_month_count integer,p_fingerprint text,p_replace_ids uuid[],p_assignments jsonb,
 p_confirmation text,p_open_positions integer,p_respect_weekly boolean DEFAULT true,p_mode text DEFAULT 'period',p_individual_employee_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='60s' AS $$
DECLARE actor_ uuid:=auth.uid();role_ text;result_ jsonb;
BEGIN
 IF actor_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Anmeldung erforderlich.'; END IF;
 SELECT role INTO role_ FROM public.company_members WHERE company_id=p_company_id AND user_id=actor_ AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF role_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Aktive Planungsrechte für dieses Unternehmen erforderlich.'; END IF;
 PERFORM private.sf_assert_aal2('Unvollständigen Plan als Entwurf übernehmen');
 IF p_confirmation IS DISTINCT FROM 'OFFEN ÜBERNEHMEN' OR p_open_positions IS NULL OR p_open_positions NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Die offenen Positionen müssen ausdrücklich mit OFFEN ÜBERNEHMEN bestätigt werden.'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN('period','month','individual') OR p_month_count IS NULL OR p_month_count NOT BETWEEN 1 AND 12 OR (p_mode<>'period' AND p_month_count<>1) THEN RAISE EXCEPTION 'Ungültiger Planungszeitraum.'; END IF;
 PERFORM set_config('sf.incomplete_draft_company',p_company_id::text,true);
 PERFORM set_config('sf.incomplete_draft_confirmation',p_confirmation,true);
 IF p_mode='period' THEN result_:=private.sf_apply_planning_period(p_company_id,p_first_month,p_month_count,p_fingerprint,p_replace_ids,p_assignments,p_respect_weekly);
 ELSIF p_mode='individual' THEN result_:=public.apply_individual_month_optimization(p_company_id,p_first_month,p_fingerprint,p_replace_ids,p_assignments,p_respect_weekly,p_individual_employee_ids);
 ELSE result_:=private.sf_apply_month_optimization(p_company_id,p_first_month,p_fingerprint,p_replace_ids,p_assignments,p_respect_weekly);END IF;
 PERFORM set_config('sf.incomplete_draft_company','',true);
 PERFORM set_config('sf.incomplete_draft_confirmation','',true);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 VALUES(p_company_id,'INCOMPLETE_DRAFT_ACCEPTED','planning_period',p_company_id,actor_,role_,jsonb_build_object('firstMonth',p_first_month,'monthCount',p_month_count,'acknowledgedOpenPositions',p_open_positions,'confirmation',p_confirmation,'staffingRequirementsUnchanged',true));
 RETURN result_||jsonb_build_object('incompleteDraftConfirmed',true);
END $$;
REVOKE ALL ON FUNCTION private.apply_confirmed_incomplete_draft(uuid,date,integer,text,uuid[],jsonb,text,integer,boolean,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.apply_confirmed_incomplete_draft(uuid,date,integer,text,uuid[],jsonb,text,integer,boolean,text,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_confirmed_incomplete_draft(
 p_company_id uuid,p_first_month date,p_month_count integer,p_fingerprint text,p_replace_ids uuid[],p_assignments jsonb,
 p_confirmation text,p_open_positions integer,p_respect_weekly boolean DEFAULT true,p_mode text DEFAULT 'period',p_individual_employee_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' SET statement_timeout='60s' AS $$
 SELECT private.apply_confirmed_incomplete_draft(p_company_id,p_first_month,p_month_count,p_fingerprint,p_replace_ids,p_assignments,p_confirmation,p_open_positions,p_respect_weekly,p_mode,p_individual_employee_ids)
$$;
REVOKE ALL ON FUNCTION public.apply_confirmed_incomplete_draft(uuid,date,integer,text,uuid[],jsonb,text,integer,boolean,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_confirmed_incomplete_draft(uuid,date,integer,text,uuid[],jsonb,text,integer,boolean,text,uuid[]) TO authenticated;
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
   IF r_->>'code' IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,d_) THEN CONTINUE; END IF;
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   need_:=coalesce(private.sf_staffing_exception(company_,d_,r_->>'code'),(r_->>'minimum')::int);
   IF (count_<need_ AND NOT accept_open_) OR (coalesce((r_->>'exact')::boolean,false) AND count_>need_) THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $function$;
