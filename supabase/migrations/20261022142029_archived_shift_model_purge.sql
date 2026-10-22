-- Inspect archived models and permanently remove only those without historical links.
CREATE OR REPLACE FUNCTION public.manager_archived_shift_model(p_company_id uuid, p_code text, p_action text DEFAULT 'CHECK')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_model public.shift_templates%rowtype;
  v_assignments bigint; v_changes bigint; v_employees bigint; v_payroll bigint;
  v_usage jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id=p_company_id
      AND user_id=auth.uid() AND status='ACTIVE'
      AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('CHECK','PURGE') OR p_code IS NULL
    OR p_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige Aktion oder ungültiges Schichtkürzel.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  SELECT * INTO v_model FROM public.shift_templates
    WHERE company_id=p_company_id AND lower(code)=lower(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Das Schichtmodell wurde nicht gefunden.'; END IF;
  IF v_model.active THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Nur bereits entfernte Schichtmodelle können endgültig gelöscht werden.'; END IF;

  SELECT count(*) INTO v_assignments FROM public.shift_assignments
    WHERE company_id=p_company_id AND shift_code=v_model.code;
  SELECT count(*) INTO v_changes FROM public.shift_change_requests
    WHERE company_id=p_company_id AND (old_snapshot->>'type'=v_model.code OR proposed_snapshot->>'type'=v_model.code);
  SELECT count(*) INTO v_employees FROM public.employees
    WHERE company_id=p_company_id AND (v_model.code=ANY(shift_permissions) OR v_model.code=ANY(qualifications));
  SELECT count(*) INTO v_payroll FROM public.datev_lodas_rules
    WHERE company_id=p_company_id AND source_key=v_model.code;
  v_usage:=jsonb_build_object('assignments',v_assignments,'changes',v_changes,
    'employees',v_employees,'payroll',v_payroll);
  IF p_action='CHECK' THEN RETURN v_usage; END IF;
  IF v_assignments+v_changes+v_employees+v_payroll>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Das Schichtmodell ist noch mit Diensten, Änderungsanträgen, Mitarbeiterfreigaben oder Abrechnungsregeln verknüpft. Es bleibt zum Schutz dieser Daten archiviert.';
  END IF;
  DELETE FROM public.shift_templates WHERE id=v_model.id;
  RETURN v_usage||jsonb_build_object('deleted',true);
END $$;
REVOKE ALL ON FUNCTION public.manager_archived_shift_model(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_archived_shift_model(uuid,text,text) TO authenticated;
