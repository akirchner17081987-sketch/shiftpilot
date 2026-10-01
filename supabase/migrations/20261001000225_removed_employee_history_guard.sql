-- Preserve historical dates and prevent old browser sessions from moving archived rows into a new plan.
CREATE OR REPLACE FUNCTION public.guard_removed_employee_planning()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_deleted timestamptz;
BEGIN
  SELECT e.deleted_at INTO v_deleted FROM public.employees e WHERE e.id=new.employee_id AND e.company_id=new.company_id FOR SHARE;
  IF v_deleted IS NULL THEN RETURN new; END IF;
  IF TG_TABLE_NAME='shift_assignments' THEN
    IF new.status='CANCELLED' THEN RETURN new; END IF;
    IF TG_OP='UPDATE' AND old.employee_id=new.employee_id AND old.company_id=new.company_id AND old.status<>'CANCELLED'
      AND old.starts_at=new.starts_at AND old.ends_at=new.ends_at THEN RETURN new; END IF;
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.company_id=new.company_id AND a.employee_id=new.employee_id
      AND a.status<>'CANCELLED' AND a.starts_at=new.starts_at AND a.ends_at=new.ends_at AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))) THEN RETURN new; END IF;
  ELSE
    IF TG_OP='UPDATE' AND old.employee_id=new.employee_id AND old.company_id=new.company_id
      AND old.start_date=new.start_date AND old.end_date=new.end_date THEN RETURN new; END IF;
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.absences a WHERE a.company_id=new.company_id AND a.employee_id=new.employee_id
      AND a.start_date=new.start_date AND a.end_date=new.end_date AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))) THEN RETURN new; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Für gelöschte Mitarbeiter sind keine neuen Einplanungen oder Abwesenheiten möglich.';
END $$;
REVOKE ALL ON FUNCTION public.guard_removed_employee_planning() FROM PUBLIC,anon,authenticated;
DROP TRIGGER assignments_removed_employee ON public.shift_assignments;
CREATE TRIGGER assignments_removed_employee BEFORE INSERT OR UPDATE OF employee_id,company_id,status,starts_at,ends_at ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_removed_employee_planning();
DROP TRIGGER absences_removed_employee ON public.absences;
CREATE TRIGGER absences_removed_employee BEFORE INSERT OR UPDATE OF employee_id,company_id,start_date,end_date ON public.absences FOR EACH ROW EXECUTE FUNCTION public.guard_removed_employee_planning();
