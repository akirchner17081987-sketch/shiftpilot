-- Company shift models: caller permissions and existing RLS remain authoritative.
CREATE OR REPLACE FUNCTION public.manager_manage_shift_model(
  p_company_id uuid, p_action text, p_model jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_code text := btrim(coalesce(p_model->>'code',''));
  v_name text; v_start time; v_end time; v_color text; v_soll integer;
  v_model public.shift_templates%rowtype; v_used boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id=p_company_id
      AND user_id=auth.uid() AND status='ACTIVE'
      AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
  IF p_action NOT IN ('CREATE','UPDATE','REMOVE','RESTORE') OR p_action IS NULL
    OR jsonb_typeof(p_model) IS DISTINCT FROM 'object'
    OR v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige Aktion oder ungültiges Schichtkürzel.';
  END IF;
  -- Serialize catalogue edits within one company, including case-insensitive codes.
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  SELECT * INTO v_model FROM public.shift_templates
    WHERE company_id=p_company_id AND lower(code)=lower(v_code) FOR UPDATE;
  IF p_action='CREATE' AND FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Dieses Kürzel ist bereits vorhanden. Entfernte Modelle können wiederhergestellt werden.';
  ELSIF p_action<>'CREATE' AND NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Das Schichtmodell wurde nicht gefunden.';
  END IF;
  IF p_action='REMOVE' THEN
    v_used := EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=p_company_id AND shift_code=v_model.code)
      OR EXISTS(SELECT 1 FROM public.shift_change_requests WHERE company_id=p_company_id
        AND (old_snapshot->>'type'=v_model.code OR proposed_snapshot->>'type'=v_model.code))
      OR EXISTS(SELECT 1 FROM public.employees WHERE company_id=p_company_id
        AND (v_model.code=ANY(shift_permissions) OR v_model.code=ANY(qualifications)))
      OR EXISTS(SELECT 1 FROM public.datev_lodas_rules WHERE company_id=p_company_id AND source_key=v_model.code);
    IF v_used THEN
      UPDATE public.shift_templates SET active=false WHERE id=v_model.id;
    ELSE
      DELETE FROM public.shift_templates WHERE id=v_model.id;
    END IF;
    DELETE FROM public.global_staffing_requirements WHERE company_id=p_company_id AND shift_code=v_model.code;
    DELETE FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND shift_code=v_model.code;
    RETURN jsonb_build_object('code',v_model.code,'removed',true,'archived',v_used);
  END IF;
  v_name:=btrim(coalesce(p_model->>'name','')); v_color:=p_model->>'color';
  IF length(v_name) NOT BETWEEN 1 AND 80 OR v_name ~ '[<>]'
    OR coalesce(p_model->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'soll','') !~ '^[0-9]{1,2}$'
    OR v_color IS NULL OR v_color NOT IN ('blue','amber','pink','teal','cyan','violet','magenta','olive','gray') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bitte gültigen Namen, Zeiten, Farbe und eine SOLL-Stärke von 0 bis 99 angeben.';
  END IF;
  v_start:=(p_model->>'start')::time; v_end:=(p_model->>'end')::time; v_soll:=(p_model->>'soll')::integer;
  IF v_start=v_end THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Beginn und Ende müssen unterschiedlich sein.'; END IF;
  IF p_action='CREATE' THEN
    INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,css_class,active,sort_order)
      SELECT p_company_id,upper(v_code),v_name,v_start,v_end,v_color,true,coalesce(max(sort_order),0)+1
      FROM public.shift_templates WHERE company_id=p_company_id RETURNING * INTO v_model;
  ELSE
    IF (p_action='UPDATE' AND NOT v_model.active) OR (p_action='RESTORE' AND v_model.active) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der Status wurde inzwischen geändert. Bitte lade die Schichtmodelle neu.';
    END IF;
    UPDATE public.shift_templates SET name=v_name,default_start=v_start,default_end=v_end,css_class=v_color,active=true
      WHERE id=v_model.id RETURNING * INTO v_model;
  END IF;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    VALUES(p_company_id,v_model.code,v_soll)
    ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count;
  RETURN jsonb_build_object('model',to_jsonb(v_model),'soll',v_soll);
END $$;
REVOKE ALL ON FUNCTION public.manager_manage_shift_model(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_manage_shift_model(uuid,text,jsonb) TO authenticated;

-- Serialize new assignments with model deletion. Existing historical assignments
-- can still be edited; they cannot be recreated using an inactive model.
CREATE OR REPLACE FUNCTION public.enforce_active_shift_model()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF new.status='CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='UPDATE' AND old.company_id=new.company_id AND old.shift_code=new.shift_code
    AND old.status<>'CANCELLED' THEN RETURN new; END IF;
  PERFORM 1 FROM public.shift_templates WHERE company_id=new.company_id AND code=new.shift_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dieses Schichtmodell ist nicht mehr für neue Einplanungen verfügbar.'; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.enforce_active_shift_model() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shift_assignments_active_model BEFORE INSERT OR UPDATE OF company_id,shift_code,status
  ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_active_shift_model();

-- A direct Data API delete must preserve the same history as the manager RPC.
CREATE OR REPLACE FUNCTION public.protect_used_shift_model()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND new.code=old.code AND new.company_id=old.company_id THEN RETURN new; END IF;
  IF EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=old.company_id AND shift_code=old.code)
    OR EXISTS(SELECT 1 FROM public.shift_change_requests WHERE company_id=old.company_id
      AND (old_snapshot->>'type'=old.code OR proposed_snapshot->>'type'=old.code))
    OR EXISTS(SELECT 1 FROM public.employees WHERE company_id=old.company_id
      AND (old.code=ANY(shift_permissions) OR old.code=ANY(qualifications)))
    OR EXISTS(SELECT 1 FROM public.datev_lodas_rules WHERE company_id=old.company_id AND source_key=old.code) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dieses Schichtmodell wird bereits verwendet. Bitte aus der Planung entfernen statt die Historie zu löschen.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_used_shift_model() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shift_templates_preserve_history BEFORE DELETE OR UPDATE OF company_id,code
  ON public.shift_templates FOR EACH ROW EXECUTE FUNCTION public.protect_used_shift_model();
CREATE TRIGGER shift_templates_audit AFTER INSERT OR UPDATE OR DELETE
  ON public.shift_templates FOR EACH ROW EXECUTE FUNCTION private.capture_audit_change();
