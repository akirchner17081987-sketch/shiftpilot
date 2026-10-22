-- Shared coverage models can change their times and required staffing together.
-- Check their final state at transaction end, so an atomic group update is possible.
CREATE OR REPLACE FUNCTION public.validate_shared_shift_coverage()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_model public.shift_templates%rowtype;
BEGIN
  SELECT * INTO current_model FROM public.shift_templates WHERE id=new.id;
  IF current_model.coverage_group IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('shift-coverage:'||current_model.company_id::text,0));
    IF EXISTS(SELECT 1 FROM public.shift_templates t WHERE t.company_id=current_model.company_id
      AND t.coverage_group=current_model.coverage_group AND t.id<>current_model.id
      AND (t.default_start<>current_model.default_start OR t.default_end<>current_model.default_end
        OR t.coverage_required<>current_model.coverage_required)) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Gemeinsame TL-Besetzung benötigt identische Zeiten und Mindestbesetzung.';
    END IF;
  END IF;
  RETURN new;
END $$;
DROP TRIGGER shift_templates_shared_coverage ON public.shift_templates;
CREATE CONSTRAINT TRIGGER shift_templates_shared_coverage
AFTER INSERT OR UPDATE ON public.shift_templates DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_shared_shift_coverage();

CREATE OR REPLACE FUNCTION public.manager_manage_shared_shift_model(p_company_id uuid,p_model jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE model_ public.shift_templates%rowtype; group_ text; required_ integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id=p_company_id AND user_id=auth.uid()
      AND status='ACTIVE' AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
  IF jsonb_typeof(p_model) IS DISTINCT FROM 'object'
    OR coalesce(p_model->>'soll','') !~ '^([1-9]|[1-9][0-9])$'
    OR p_model->>'planning_mode' IS DISTINCT FROM 'required' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Gemeinsame Modelle benötigen eine Pflichtbesetzung von 1 bis 99.';
  END IF;
  required_:=(p_model->>'soll')::integer;
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  SELECT * INTO model_ FROM public.shift_templates
    WHERE company_id=p_company_id AND code=p_model->>'code' AND active FOR UPDATE;
  IF model_.id IS NULL OR model_.coverage_group IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Dieses Modell gehört nicht zu einer aktiven gemeinsamen Besetzung.';
  END IF;
  group_:=model_.coverage_group;
  PERFORM 1 FROM public.shift_templates WHERE company_id=p_company_id AND coverage_group=group_
    ORDER BY id FOR UPDATE;
  PERFORM public.manager_manage_shift_model(p_company_id,'UPDATE',p_model);
  UPDATE public.shift_templates SET default_start=(p_model->>'start')::time,
    default_end=(p_model->>'end')::time,coverage_required=required_
    WHERE company_id=p_company_id AND coverage_group=group_;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    SELECT p_company_id,code,required_ FROM public.shift_templates
    WHERE company_id=p_company_id AND coverage_group=group_
    ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count;
  RETURN jsonb_build_object('model',(SELECT to_jsonb(t) FROM public.shift_templates t WHERE t.id=model_.id),
    'soll',required_,'shared_group',group_,'updated_models',
    (SELECT count(*) FROM public.shift_templates WHERE company_id=p_company_id AND coverage_group=group_));
END $$;
REVOKE ALL ON FUNCTION public.manager_manage_shared_shift_model(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_manage_shared_shift_model(uuid,jsonb) TO authenticated,service_role;
