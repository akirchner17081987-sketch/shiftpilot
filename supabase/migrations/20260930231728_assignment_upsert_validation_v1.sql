-- Validate an upsert against other assignments, excluding its existing target.
CREATE OR REPLACE FUNCTION public.enforce_assignment_standard_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_existing_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN v_existing_id:=old.id;
  ELSE
    SELECT a.id INTO v_existing_id FROM public.shift_assignments a
      WHERE a.company_id=new.company_id AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))
      LIMIT 1 FOR KEY SHARE;
  END IF;
  IF new.status<>'CANCELLED'
    AND coalesce(current_setting('schichtfunk.legacy_import',true),'off')<>'on'
    AND (TG_OP='INSERT' OR new.company_id IS DISTINCT FROM old.company_id
      OR new.employee_id IS DISTINCT FROM old.employee_id OR new.starts_at IS DISTINCT FROM old.starts_at
      OR new.ends_at IS DISTINCT FROM old.ends_at OR (old.status='CANCELLED' AND new.status<>'CANCELLED')) THEN
    PERFORM public.assert_standard_shift_rules(new.company_id,new.employee_id,new.starts_at,new.ends_at,v_existing_id);
  END IF;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_assignment_standard_rules() FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.enforce_active_shift_model()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF new.status='CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='UPDATE' AND old.company_id=new.company_id AND old.shift_code=new.shift_code
    AND old.status<>'CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM 1 FROM public.shift_assignments a WHERE a.company_id=new.company_id
      AND a.shift_code=new.shift_code AND a.status<>'CANCELLED'
      AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id)) FOR KEY SHARE;
    IF FOUND THEN RETURN new; END IF;
  END IF;
  PERFORM 1 FROM public.shift_templates WHERE company_id=new.company_id AND code=new.shift_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dieses Schichtmodell ist nicht mehr für neue Einplanungen verfügbar.'; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.enforce_active_shift_model() FROM PUBLIC,anon,authenticated;
