-- Only fictitious records. Never commit this test transaction.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"36dbab7d-2912-4ade-8f28-66fda6bd5a75","role":"authenticated","aal":"aal2"}',true);
CREATE TEMP TABLE period_fixture(company_id uuid,employee_id uuid);
DO $$
DECLARE co uuid; emp uuid; i integer;
BEGIN
  FOR i IN 1..2 LOOP
    INSERT INTO public.companies(name,created_by) VALUES('FIKTIVER ZEITRAUMTEST '||i,auth.uid()) RETURNING id INTO co;
    INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(co,auth.uid(),'OWNER','ACTIVE');
    INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(co,'FD','Fiktive Frühschicht','06:00','14:00');
    INSERT INTO public.employees(company_id,first_name,last_name,personnel_no,shift_permissions) VALUES(co,'Fiktive','Testperson','ZEITRAUMTEST',ARRAY['FD']) RETURNING id INTO emp;
    INSERT INTO period_fixture VALUES(co,emp);
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at)
      SELECT co,emp,'FD',(d::timestamp+interval '6 hours') AT TIME ZONE 'Europe/Berlin',(d::timestamp+interval '14 hours') AT TIME ZONE 'Europe/Berlin'
      FROM unnest(ARRAY['2026-11-30'::date,'2026-12-01'::date,'2026-12-31'::date,'2027-01-01'::date]) d;
  END LOOP;
END $$;
GRANT SELECT ON period_fixture TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE co uuid; other uuid; n integer; result record;
BEGIN
  SELECT company_id INTO co FROM period_fixture ORDER BY company_id LIMIT 1;
  SELECT company_id INTO other FROM period_fixture WHERE company_id<>co;
  SELECT * INTO result FROM public.publish_schedule_period(co,'2026-12-01','2026-12-31');
  IF result.assignment_count<>2 THEN RAISE EXCEPTION 'Wrong assignment count: %',result.assignment_count; END IF;
  SELECT count(*) INTO n FROM public.shift_assignments WHERE company_id=co AND status='PUBLISHED';
  IF n<>2 THEN RAISE EXCEPTION 'Boundary leak'; END IF;
  SELECT count(*) INTO n FROM public.shift_assignments WHERE company_id=other AND status='DRAFT';
  IF n<>4 THEN RAISE EXCEPTION 'Other tenant modified'; END IF;
  IF EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=co AND week_start IN ('2026-11-30','2026-12-28')) THEN RAISE EXCEPTION 'Partial week marked published'; END IF;
  SELECT count(*) INTO n FROM public.plan_publications WHERE company_id=co;
  IF n<>3 THEN RAISE EXCEPTION 'Full week audit missing'; END IF;
  SELECT * INTO result FROM public.publish_schedule_period(co,'2026-12-01','2026-12-31');
  IF result.assignment_count<>0 THEN RAISE EXCEPTION 'Duplicate publication'; END IF;
  SELECT * INTO result FROM public.publish_schedule_period(other,'2026-12-01','2026-12-31');
  IF result.assignment_count<>2 THEN RAISE EXCEPTION 'Second tenant failed'; END IF;
  BEGIN
    PERFORM public.publish_schedule_period(gen_random_uuid(),'2026-12-01','2026-12-31');
    RAISE EXCEPTION 'UNAUTHORIZED CALL SUCCEEDED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='UNAUTHORIZED CALL SUCCEEDED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.publish_schedule_period(co,'2026-12-01','2027-01-01');
    RAISE EXCEPTION 'INVALID RANGE SUCCEEDED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='INVALID RANGE SUCCEEDED' THEN RAISE; END IF; END;
END $$;
SELECT 'exact month boundaries, both tenants, isolation, repeat call and unauthorized access verified' AS result;
ROLLBACK;
