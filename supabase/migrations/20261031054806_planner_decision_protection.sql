-- Explicit planner decisions remain in all automatic planning paths.
ALTER TABLE public.shift_assignments ADD COLUMN planner_locked boolean NOT NULL DEFAULT false;
CREATE INDEX shift_assignments_planner_locked_idx ON public.shift_assignments(company_id,starts_at) WHERE planner_locked AND status<>'CANCELLED';

CREATE FUNCTION private.sf_guard_planner_assignment_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE controlled boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.planner_locked AND NOT private.sf_erasure_row_allowed(OLD.company_id,to_jsonb(OLD)) AND current_setting('app.schichtfunk_full_plan_reset',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Dieser Dienst ist durch eine Planerentscheidung fixiert. Bitte zuerst entsperren.' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 controlled:=current_setting('sf.planner_lock_company',true)=NEW.company_id::text AND current_setting('sf.planner_lock_assignment',true)=NEW.id::text;
 IF TG_OP='INSERT' THEN
  IF NEW.planner_locked AND NOT coalesce(controlled,false) THEN RAISE EXCEPTION 'Fixierung erfordert die bestätigte Planeraktion.' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
 IF NEW.planner_locked IS DISTINCT FROM OLD.planner_locked AND NOT coalesce(controlled,false) THEN
  RAISE EXCEPTION 'Fixierung erfordert die bestätigte Planeraktion.' USING ERRCODE='42501';
 END IF;
 IF OLD.planner_locked AND (ROW(NEW.company_id,NEW.employee_id,NEW.shift_code,NEW.starts_at,NEW.ends_at,NEW.break_minutes,NEW.note,NEW.rhythm_override) IS DISTINCT FROM ROW(OLD.company_id,OLD.employee_id,OLD.shift_code,OLD.starts_at,OLD.ends_at,OLD.break_minutes,OLD.note,OLD.rhythm_override) OR NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='DRAFT' AND NEW.status='PUBLISHED')) THEN
  IF NOT private.sf_erasure_row_allowed(OLD.company_id,to_jsonb(OLD)) AND current_setting('app.schichtfunk_full_plan_reset',true) IS DISTINCT FROM 'on' AND NOT(NEW.status='CANCELLED' AND OLD.starts_at>=now() AND current_setting('app.schichtfunk_employee_removal',true)=OLD.employee_id::text AND EXISTS(SELECT 1 FROM public.company_members WHERE company_id=OLD.company_id AND user_id=auth.uid() AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER'))) THEN
   RAISE EXCEPTION 'Dieser Dienst ist durch eine Planerentscheidung fixiert. Bitte zuerst entsperren.' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sf_guard_planner_assignment_lock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a03_planner_assignment_lock BEFORE INSERT OR UPDATE OR DELETE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION private.sf_guard_planner_assignment_lock();

CREATE FUNCTION private.sf_set_planner_assignment_lock(p_company_id uuid,p_assignment_id uuid,p_locked boolean,p_expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='15s' AS $$
DECLARE actor uuid:=auth.uid(); a public.shift_assignments%rowtype;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=p_company_id AND user_id=actor AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER') AND NOT('read_only'=ANY(coalesce(extra_permissions,ARRAY[]::text[])))) THEN RAISE EXCEPTION 'Aktive schreibende Planungsrechte erforderlich.' USING ERRCODE='42501';END IF;
 PERFORM private.sf_assert_aal2('planner_assignment_lock');
 IF p_locked IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Fixierung und aktueller Versionsstand erforderlich.';END IF;
 SELECT * INTO a FROM public.shift_assignments WHERE id=p_assignment_id AND company_id=p_company_id AND status<>'CANCELLED' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Der Dienst ist nicht mehr verfügbar.';END IF;
 IF a.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Der Dienst wurde geändert. Bitte neu laden.' USING ERRCODE='40001';END IF;
 IF a.planner_locked IS NOT DISTINCT FROM p_locked THEN RETURN jsonb_build_object('id',a.id,'planner_locked',a.planner_locked,'version',a.version);END IF;
 PERFORM set_config('sf.planner_lock_company',p_company_id::text,true);
 PERFORM set_config('sf.planner_lock_assignment',a.id::text,true);
 UPDATE public.shift_assignments SET planner_locked=p_locked,version=version+1 WHERE id=a.id RETURNING * INTO a;
 PERFORM set_config('sf.planner_lock_company','',true);PERFORM set_config('sf.planner_lock_assignment','',true);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,metadata) VALUES(p_company_id,CASE WHEN p_locked THEN 'PLANNER_ASSIGNMENT_LOCKED' ELSE 'PLANNER_ASSIGNMENT_UNLOCKED' END,'shift_assignment',a.id,actor,jsonb_build_object('version',a.version));
 RETURN jsonb_build_object('id',a.id,'planner_locked',a.planner_locked,'version',a.version);
END $$;
CREATE FUNCTION public.set_planner_assignment_lock(p_company_id uuid,p_assignment_id uuid,p_locked boolean,p_expected_version integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sf_set_planner_assignment_lock(p_company_id,p_assignment_id,p_locked,p_expected_version) $$;
REVOKE ALL ON FUNCTION private.sf_set_planner_assignment_lock(uuid,uuid,boolean,integer),public.set_planner_assignment_lock(uuid,uuid,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_set_planner_assignment_lock(uuid,uuid,boolean,integer),public.set_planner_assignment_lock(uuid,uuid,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.sf_month_optimization_snapshot(company_ uuid, month_ date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_ uuid:=auth.uid();tz_ text;last_ date;rows_ jsonb;fingerprint_ text;protected_ jsonb;
BEGIN
 IF actor_ IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=company_ AND user_id=actor_
  AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF month_ IS NULL OR extract(day FROM month_)<>1 THEN RAISE EXCEPTION 'Bitte einen Kalendermonat auswählen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 last_:=(month_+interval '1 month')::date;
 IF EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=company_ AND month_start=month_ AND status='CLOSED')
 THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen.'; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=company_
  AND week_start<=last_-1 AND week_start+6>=month_ AND published_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND status='PUBLISHED'
  AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_)
 THEN RAISE EXCEPTION 'Der Monat enthält veröffentlichte Dienste oder Wochen.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) INTO rows_ FROM public.shift_assignments a
  WHERE company_id=company_ AND status<>'CANCELLED' AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_
  AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_;
 SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb) INTO protected_ FROM public.shift_assignments a
  JOIN public.employees e ON e.id=a.employee_id AND e.company_id=company_
  WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.starts_at>=month_::timestamp AT TIME ZONE tz_
   AND a.starts_at<last_::timestamp AT TIME ZONE tz_ AND (
   a.planner_locked OR a.status<>'DRAFT' OR a.rhythm_override IS NOT NULL OR coalesce(a.note,'')~*'(markt|market|freiwill|tausch)'
   OR ((private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'mode')='required'
    AND (private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'expected') NOT IN('ALLE','FREI'))
   OR EXISTS(SELECT 1 FROM public.time_entries t WHERE t.assignment_id=a.id AND
    (t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.status<>'open' OR t.confirmed_at IS NOT NULL OR t.submitted_at IS NOT NULL
     OR coalesce(t.employee_note,'')<>'' OR coalesce(t.manager_note,'')<>''))
   OR EXISTS(SELECT 1 FROM public.time_qr_punches q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.time_qr_breaks q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.open_shift_market_claims q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_swap_requests q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_change_requests q WHERE q.assignment_id=a.id));
 SELECT md5(jsonb_build_object('assignments',rows_,'protected',protected_,
  'planningPolicy',(SELECT to_jsonb(p) FROM public.company_compliance_policy p WHERE company_id=company_),
  'employees',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.employees e WHERE company_id=company_),
  'absences',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.absences a WHERE company_id=company_),
  'templates',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM public.shift_templates t WHERE company_id=company_),
  'soll',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.shift_code),'[]'::jsonb) FROM public.global_staffing_requirements g WHERE company_id=company_),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.work_date,g.shift_code),'[]'::jsonb) FROM public.daily_staffing_overrides g WHERE company_id=company_),
  'wishes',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id),'[]'::jsonb) FROM public.planning_wishes w WHERE w.company_id=company_ AND w.start_date<=last_+1 AND w.end_date>=month_-1),
  'teams',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_code),'[]'::jsonb) FROM public.company_planning_teams t WHERE company_id=company_))::text) INTO fingerprint_;
 RETURN jsonb_build_object('fingerprint',fingerprint_,'protectedIds',protected_,'month',month_);
END $function$

