-- Owner/admin controlled deletion of a model, its duties and time entries.
-- Closed months, QR evidence and handover reports remain protected.
CREATE OR REPLACE FUNCTION private.sf_delete_shift_model_with_duties(
  p_company_id uuid, p_code text, p_confirmation text DEFAULT NULL, p_expected jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor_ uuid := auth.uid(); role_ text; model_ public.shift_templates%rowtype;
  ids_ uuid[]; weeks_ date[]; tz_ text; total_ integer; draft_ integer; published_ integer;
  recorded_ integer; qr_ integer; closed_ integer; handovers_ integer; teams_ integer;
  individual_rhythms_ integer; policy_refs_ integer;
  entries_ integer; requests_ integer; offers_ integer; wishes_ integer; employees_ integer;
  summary_ jsonb; removed_ integer; previous_flag_ text;
BEGIN
  SELECT role INTO role_ FROM public.company_members WHERE company_id=p_company_id
    AND user_id=actor_ AND status='ACTIVE' AND role IN ('OWNER','ADMIN') LIMIT 1;
  IF actor_ IS NULL OR role_ IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Nur Inhaber und Administratoren dieses Unternehmens dürfen belegte Schichtmodelle endgültig löschen.';
  END IF;
  IF p_code IS NULL OR p_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültiges Schichtkürzel.';
  END IF;
  -- Use the same company locks as model edits and market/assignment writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  IF p_confirmation IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
  END IF;
  SELECT * INTO model_ FROM public.shift_templates
    WHERE company_id=p_company_id AND lower(code)=lower(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Das Schichtmodell wurde nicht gefunden.'; END IF;
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=p_company_id;
  SELECT coalesce(array_agg(id),ARRAY[]::uuid[]),count(*)::integer,
    count(*) FILTER(WHERE status='DRAFT')::integer,count(*) FILTER(WHERE status='PUBLISHED')::integer
    INTO ids_,total_,draft_,published_ FROM public.shift_assignments
    WHERE company_id=p_company_id AND shift_code=model_.code;
  IF p_confirmation IS NOT NULL THEN
    PERFORM 1 FROM public.shift_assignments WHERE id=ANY(ids_) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.time_entries WHERE assignment_id=ANY(ids_) ORDER BY assignment_id FOR UPDATE;
  END IF;
  SELECT coalesce(array_agg(DISTINCT date_trunc('week',a.starts_at AT TIME ZONE tz_)::date),ARRAY[]::date[])
    INTO weeks_ FROM public.shift_assignments a WHERE a.id=ANY(ids_);
  SELECT count(*)::integer,count(*) FILTER(WHERE actual_start IS NOT NULL OR actual_end IS NOT NULL
     OR status<>'open' OR confirmed_at IS NOT NULL OR submitted_at IS NOT NULL
     OR coalesce(employee_note,'')<>'' OR coalesce(manager_note,'')<>'')::integer
    INTO entries_,recorded_ FROM public.time_entries WHERE assignment_id=ANY(ids_);
  SELECT count(*)::integer INTO qr_ FROM public.shift_assignments a WHERE a.id=ANY(ids_)
    AND (EXISTS(SELECT 1 FROM public.time_qr_punches q WHERE q.assignment_id=a.id)
      OR EXISTS(SELECT 1 FROM public.time_qr_breaks b WHERE b.assignment_id=a.id));
  SELECT count(*)::integer INTO closed_ FROM public.shift_assignments a WHERE a.id=ANY(ids_)
    AND (private.sf_is_time_month_closed(p_company_id,(a.starts_at AT TIME ZONE tz_)::date)
      OR EXISTS(SELECT 1 FROM public.time_entries e WHERE e.assignment_id=a.id AND e.actual_start IS NOT NULL
        AND private.sf_is_time_month_closed(p_company_id,(e.actual_start AT TIME ZONE tz_)::date)));
  SELECT count(*)::integer INTO handovers_ FROM public.shift_handovers
    WHERE company_id=p_company_id AND shift_code=model_.code;
  SELECT count(*)::integer INTO teams_ FROM public.company_planning_teams
    WHERE company_id=p_company_id AND model_.code=ANY(pattern);
  SELECT count(*)::integer INTO individual_rhythms_ FROM public.employees e WHERE e.company_id=p_company_id
    AND EXISTS(SELECT 1 FROM unnest(e.qualifications) q WHERE q LIKE '__sp:rhythmPattern=%'
      AND upper(model_.code)=ANY(regexp_split_to_array(upper(split_part(q,'=',2)),'[[:space:],;|/+]+' )));
  SELECT count(*)::integer INTO policy_refs_ FROM public.company_compliance_policy p
    WHERE p.company_id=p_company_id AND jsonb_path_exists(p.solid_planning_rules,
      '$.** ? (@ == $code)'::jsonpath,jsonb_build_object('code',model_.code));
  SELECT count(*)::integer INTO requests_ FROM public.shift_change_requests
    WHERE company_id=p_company_id AND (assignment_id=ANY(ids_)
      OR old_snapshot->>'type'=model_.code OR proposed_snapshot->>'type'=model_.code);
  SELECT count(*)::integer INTO offers_ FROM public.open_shift_market_offers
    WHERE company_id=p_company_id AND shift_code=model_.code;
  SELECT count(*)::integer INTO wishes_ FROM public.planning_wishes
    WHERE company_id=p_company_id AND shift_code=model_.code;
  SELECT count(*)::integer INTO employees_ FROM public.employees
    WHERE company_id=p_company_id AND (model_.code=ANY(shift_permissions) OR model_.code=ANY(qualifications));
  summary_:=jsonb_build_object('code',model_.code,'active',model_.active,'total',total_,
    'draft',draft_,'published',published_,'timeEntries',entries_,'recordedTimeEntries',recorded_,
    'qrAssignments',qr_,'closedAssignments',closed_,'handovers',handovers_,
    'teamRhythms',teams_,'individualRhythms',individual_rhythms_,'policyReferences',policy_refs_,
    'requests',requests_,'marketOffers',offers_,
    'wishes',wishes_,'employeePermissions',employees_,
    'canDelete',closed_=0 AND qr_=0 AND handovers_=0 AND teams_=0 AND individual_rhythms_=0 AND policy_refs_=0);
  IF p_confirmation IS NULL THEN RETURN summary_; END IF;
  IF p_confirmation IS DISTINCT FROM 'LÖSCHEN '||model_.code THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bitte das Kürzel im Bestätigungstext exakt eingeben.';
  END IF;
  IF p_expected IS NULL OR (p_expected->>'total')::integer IS DISTINCT FROM total_
    OR (p_expected->>'published')::integer IS DISTINCT FROM published_
    OR (p_expected->>'timeEntries')::integer IS DISTINCT FROM entries_
    OR (p_expected->>'recordedTimeEntries')::integer IS DISTINCT FROM recorded_
    OR (p_expected->>'requests')::integer IS DISTINCT FROM requests_
    OR (p_expected->>'marketOffers')::integer IS DISTINCT FROM offers_ THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Die betroffenen Daten haben sich geändert. Bitte die Vorschau erneut öffnen.';
  END IF;
  IF closed_>0 OR qr_>0 OR handovers_>0 OR teams_>0 OR individual_rhythms_>0 OR policy_refs_>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Abgeschlossene Monate, QR-Nachweise, Schichtübergaben oder noch aktive Planungsregeln verhindern die endgültige Löschung.';
  END IF;

  -- Related workflow records are removed only for this company and this model.
  DELETE FROM public.open_shift_market_claims c WHERE c.company_id=p_company_id
    AND (c.assignment_id=ANY(ids_) OR EXISTS(SELECT 1 FROM public.open_shift_market_offers o
      WHERE o.id=c.offer_id AND o.company_id=p_company_id AND o.shift_code=model_.code));
  DELETE FROM public.open_shift_market_offers WHERE company_id=p_company_id AND shift_code=model_.code;
  DELETE FROM public.shift_change_requests WHERE company_id=p_company_id
    AND (assignment_id=ANY(ids_) OR old_snapshot->>'type'=model_.code OR proposed_snapshot->>'type'=model_.code);
  DELETE FROM public.planning_wishes WHERE company_id=p_company_id AND shift_code=model_.code;
  DELETE FROM public.time_entries WHERE company_id=p_company_id AND assignment_id=ANY(ids_);
  previous_flag_:=current_setting('app.schichtfunk_full_plan_reset',true);
  PERFORM set_config('app.schichtfunk_full_plan_reset','on',true);
  DELETE FROM public.shift_assignments WHERE company_id=p_company_id AND id=ANY(ids_);
  GET DIAGNOSTICS removed_=ROW_COUNT;
  PERFORM set_config('app.schichtfunk_full_plan_reset',coalesce(previous_flag_,''),true);
  DELETE FROM public.plan_publications p WHERE p.company_id=p_company_id AND p.week_start=ANY(weeks_)
    AND NOT EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.company_id=p_company_id
      AND a.status='PUBLISHED' AND a.starts_at>=p.week_start::timestamp AT TIME ZONE tz_
      AND a.starts_at<(p.week_start+7)::timestamp AT TIME ZONE tz_);
  UPDATE public.employees SET shift_permissions=array_remove(shift_permissions,model_.code),
    qualifications=array_remove(qualifications,model_.code)
    WHERE company_id=p_company_id AND (model_.code=ANY(shift_permissions) OR model_.code=ANY(qualifications));
  DELETE FROM public.datev_lodas_rules WHERE company_id=p_company_id AND source_key=model_.code;
  DELETE FROM public.global_staffing_requirements WHERE company_id=p_company_id AND shift_code=model_.code;
  DELETE FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND shift_code=model_.code;
  DELETE FROM public.shift_templates WHERE id=model_.id AND company_id=p_company_id;
  INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
    VALUES(p_company_id,'SHIFT_MODEL_PERMANENT_DELETE','shift_templates',actor_,role_,
      summary_||jsonb_build_object('deletedAssignments',removed_));
  RETURN summary_||jsonb_build_object('deleted',true,'deletedAssignments',removed_);
END $$;
REVOKE ALL ON FUNCTION private.sf_delete_shift_model_with_duties(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_delete_shift_model_with_duties(uuid,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.manager_delete_shift_model_with_duties(
  p_company_id uuid,p_code text,p_confirmation text DEFAULT NULL,p_expected jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.sf_delete_shift_model_with_duties(p_company_id,p_code,p_confirmation,p_expected);
$$;
REVOKE ALL ON FUNCTION public.manager_delete_shift_model_with_duties(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_delete_shift_model_with_duties(uuid,text,text,jsonb) TO authenticated;
