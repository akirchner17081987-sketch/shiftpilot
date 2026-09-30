-- INSERT ... ON CONFLICT runs BEFORE INSERT before the historical UPDATE.
-- Allow that path only if it is guaranteed to address an existing assignment.
CREATE OR REPLACE FUNCTION public.enforce_active_shift_model()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF new.status='CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='UPDATE' AND old.company_id=new.company_id AND old.shift_code=new.shift_code
    AND old.status<>'CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='INSERT' AND EXISTS (
    SELECT 1 FROM public.shift_assignments a WHERE a.company_id=new.company_id
      AND a.shift_code=new.shift_code AND a.status<>'CANCELLED'
      AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))
  ) THEN RETURN new; END IF;
  PERFORM 1 FROM public.shift_templates WHERE company_id=new.company_id AND code=new.shift_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dieses Schichtmodell ist nicht mehr für neue Einplanungen verfügbar.'; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.enforce_active_shift_model() FROM PUBLIC,anon,authenticated;
