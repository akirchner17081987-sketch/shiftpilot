-- Synthetic fixtures only. Always ROLLBACK; never point this at an actual employee.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"36dbab7d-2912-4ade-8f28-66fda6bd5a75","role":"authenticated","aal":"aal2"}',true);
DO $$
DECLARE co uuid; emp uuid; past uuid; future_draft uuid; future_published uuid; closed_shift uuid; recorded_shift uuid; request_id uuid; preview jsonb; result jsonb; code text; failures integer:=0;
BEGIN
  SET LOCAL ROLE authenticated;
  FOREACH co IN ARRAY ARRAY['3dbc2d99-78d7-4b82-bcaf-fe11db8213d3'::uuid,'1f23f5a3-1cbb-430f-af90-36ed34004440'::uuid] LOOP
    code:=CASE WHEN co='3dbc2d99-78d7-4b82-bcaf-fe11db8213d3' THEN 'O1' ELSE 'FD' END;
    INSERT INTO public.employees(company_id,first_name,last_name,personnel_no,shift_permissions,qualifications)
      VALUES(co,'Fiktiver','Löschtest','SF-DELETE-ROLLBACK',ARRAY[code],ARRAY[code]) RETURNING id INTO emp;
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co,emp,code,'2026-09-29 06:00+02','2026-09-29 14:00+02') RETURNING id INTO past;
    INSERT INTO public.time_entries(company_id,assignment_id,actual_start,actual_end,status,source) VALUES(co,past,'2026-09-29 06:00+02','2026-09-29 14:00+02','confirmed','MANAGER');
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co,emp,code,'2026-10-05 06:00+02','2026-10-05 14:00+02') RETURNING id INTO future_draft;
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) VALUES(co,emp,code,'2026-10-07 06:00+02','2026-10-07 14:00+02','PUBLISHED',now()) RETURNING id INTO future_published;
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co,emp,code,'2027-02-04 06:00+01','2027-02-04 14:00+01') RETURNING id INTO closed_shift;
    INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co,emp,code,'2027-01-10 06:00+01','2027-01-10 14:00+01') RETURNING id INTO recorded_shift;
    INSERT INTO public.time_entries(company_id,assignment_id,actual_start,status,source) VALUES(co,recorded_shift,now()-interval '1 hour','open','MANAGER');
    INSERT INTO public.absences(company_id,employee_id,start_date,end_date,absence_type) VALUES(co,emp,'2026-09-29','2026-09-29','Urlaub'),(co,emp,'2026-10-15','2026-10-15','Urlaub'),(co,emp,'2027-02-06','2027-02-06','Urlaub');
    -- Fixture-only setup: month closures are writable only through privileged server paths.
    RESET ROLE;
    INSERT INTO public.time_month_closures(company_id,month_start,status,closed_at,closed_by,report_snapshot) VALUES(co,'2027-02-01','CLOSED',now(),auth.uid(),'{}');
    SET LOCAL ROLE authenticated;
    IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Test must execute as authenticated'; END IF;
    INSERT INTO public.shift_change_requests(company_id,assignment_id,employee_id,action,reason_code,compliance_status,status) VALUES(co,future_published,emp,'DELETE','OTHER','GREEN','DRAFT') RETURNING id INTO request_id;
    preview:=public.manager_employee_removal_preview(co,emp);
    IF (preview->>'cancel_shifts')::int<>2 OR (preview->>'delete_absences')::int<>1 OR (preview->>'retained_shifts')::int<>3 OR (preview->>'retained_absences')::int<>2 THEN RAISE EXCEPTION 'Incorrect preview: %',preview; END IF;
    BEGIN PERFORM public.manager_remove_employee(co,emp,'Falscher Name',true,preview->>'fingerprint'); RAISE EXCEPTION 'Wrong name accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;
    BEGIN PERFORM public.manager_remove_employee(co,emp,'Fiktiver Löschtest',false,preview->>'fingerprint'); RAISE EXCEPTION 'Unchecked confirmation accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;
    UPDATE public.employees SET note='Concurrent edit' WHERE id=emp;
    BEGIN PERFORM public.manager_remove_employee(co,emp,'Fiktiver Löschtest',true,preview->>'fingerprint'); RAISE EXCEPTION 'Stale preview accepted'; EXCEPTION WHEN SQLSTATE '40001' THEN failures:=failures+1; END;
    BEGIN PERFORM public.manager_employee_removal_preview('e2f6c618-04ab-42f9-bc91-bde7f9d9f713',emp); RAISE EXCEPTION 'Foreign tenant accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN failures:=failures+1; END;
    preview:=public.manager_employee_removal_preview(co,emp);
    result:=public.manager_remove_employee(co,emp,'Fiktiver Löschtest',true,preview->>'fingerprint');
    IF NOT (result->>'removed')::boolean OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=emp AND deleted_at IS NOT NULL AND status='inactive' AND auth_user_id IS NULL AND access_status='DISABLED') THEN RAISE EXCEPTION 'Profile was not removed'; END IF;
    IF (SELECT count(*) FROM public.shift_assignments WHERE id IN(future_draft,future_published) AND status='CANCELLED')<>2 THEN RAISE EXCEPTION 'Future duties not cancelled'; END IF;
    IF (SELECT count(*) FROM public.shift_assignments WHERE id IN(past,closed_shift,recorded_shift) AND status='DRAFT')<>3 OR (SELECT count(*) FROM public.time_entries WHERE assignment_id IN(past,recorded_shift))<>2 THEN RAISE EXCEPTION 'History modified'; END IF;
    IF (SELECT count(*) FROM public.absences WHERE employee_id=emp)<>2 OR NOT EXISTS(SELECT 1 FROM public.shift_change_requests WHERE id=request_id AND status='CANCELLED') THEN RAISE EXCEPTION 'Absences or requests incorrect'; END IF;
    BEGIN INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co,emp,code,'2027-03-08 06:00+01','2027-03-08 14:00+01'); RAISE EXCEPTION 'Removed employee could be planned'; EXCEPTION WHEN SQLSTATE '23514' THEN failures:=failures+1; END;
    BEGIN INSERT INTO public.absences(company_id,employee_id,start_date,end_date,absence_type) VALUES(co,emp,'2027-03-08','2027-03-08','Urlaub'); RAISE EXCEPTION 'Removed employee could get absences'; EXCEPTION WHEN SQLSTATE '23514' THEN failures:=failures+1; END;
    BEGIN UPDATE public.shift_assignments SET starts_at='2027-03-08 06:00+01',ends_at='2027-03-08 14:00+01' WHERE id=past; RAISE EXCEPTION 'History could move to future'; EXCEPTION WHEN SQLSTATE '23514' THEN failures:=failures+1; END;
    BEGIN UPDATE public.employees SET status='active' WHERE id=emp; RAISE EXCEPTION 'Stale session reactivated removed employee'; EXCEPTION WHEN SQLSTATE '23514' THEN failures:=failures+1; END;
    BEGIN UPDATE public.employees SET deleted_at=NULL WHERE id=emp; RAISE EXCEPTION 'Removal could be reversed'; EXCEPTION WHEN SQLSTATE '23514' THEN failures:=failures+1; END;
  END LOOP;
  IF failures<>18 THEN RAISE EXCEPTION 'Expected 18 negative tests, got %',failures; END IF;
  PERFORM set_config('app.employee_removal_test_result','Both companies: confirmation, stale state, tenant boundary, future draft/published cancellation, absence removal, time/month history retention and resurrection guards passed',true);
END $$;
SELECT current_setting('app.employee_removal_test_result') AS result;
ROLLBACK;
