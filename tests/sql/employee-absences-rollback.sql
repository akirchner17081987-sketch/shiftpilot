-- Synthetic accounts and companies only. No test data is committed.
BEGIN;
DO $test$
DECLARE
  employee_user uuid:=gen_random_uuid(); planner_user uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid(); time_user uuid:=gen_random_uuid();
  company uuid; other_company uuid; employee uuid; absence uuid; rejected uuid; result text; kind text; i integer:=0; negative_checks integer:=0;
  kinds text[]:=ARRAY['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office']; ids uuid[]:=ARRAY[]::uuid[];
  start_day date; uid uuid;
BEGIN
  FOREACH uid IN ARRAY ARRAY[employee_user,planner_user,foreign_user,time_user] LOOP
    INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES(uid,'authenticated','authenticated','sf-absence-rollback-'||uid::text||'@example.invalid','{}','{}',now(),now());
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',planner_user,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',planner_user::text,true);
  INSERT INTO public.companies(name,created_by) VALUES('SF Absence Rollback QA',planner_user) RETURNING id INTO company;
  INSERT INTO public.companies(name,created_by) VALUES('SF Absence Foreign Rollback QA',foreign_user) RETURNING id INTO other_company;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(company,planner_user,'PLANNER','ACTIVE'),(other_company,foreign_user,'PLANNER','ACTIVE'),(company,time_user,'TIME_TRACKING','ACTIVE');
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
  VALUES(company,employee_user,'Synthetic','Absence Check','SF-ABSENCE-ROLLBACK','sf-absence-employee@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO employee;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employee_user,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',employee_user::text,true);
  SET LOCAL ROLE authenticated;
  FOREACH kind IN ARRAY kinds LOOP
    start_day:='2050-01-01'::date+i*10;i:=i+1;
    absence:=public.employee_submit_absence_request(kind,start_day,start_day+2,CASE WHEN kind='Urlaub' THEN '' ELSE 'Synthetic optional comment' END,true,null,null,'');ids:=array_append(ids,absence);
    IF NOT EXISTS(SELECT 1 FROM public.absences a WHERE a.id=absence AND a.company_id=company AND a.employee_id=employee AND a.status='Beantragt' AND a.absence_type=kind AND a.start_date=start_day AND a.end_date=start_day+2 AND a.requested_by=employee_user AND a.request_source='EMPLOYEE') THEN RAISE EXCEPTION 'Request contract failed for %',kind; END IF;
  END LOOP;
  BEGIN PERFORM public.employee_submit_absence_request('Fake','2050-06-01','2050-06-02');RAISE EXCEPTION 'Invalid type accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Ungültige Abwesenheitsart%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  BEGIN PERFORM public.employee_submit_absence_request('Urlaub','2050-06-02','2050-06-01');RAISE EXCEPTION 'Reversed dates accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Bitte einen gültigen Zeitraum%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  BEGIN PERFORM public.employee_submit_absence_request('Urlaub','2050-01-01','2050-01-03');RAISE EXCEPTION 'Duplicate accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Für diesen Zeitraum besteht bereits%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  BEGIN PERFORM public.manager_review_absence_request(ids[1],'APPROVE','');RAISE EXCEPTION 'Employee could approve';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Keine Berechtigung%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',foreign_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',foreign_user::text,true);
  BEGIN PERFORM public.manager_review_absence_request(ids[1],'APPROVE','');RAISE EXCEPTION 'Foreign planner could approve';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Keine Berechtigung%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',time_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',time_user::text,true);
  BEGIN PERFORM public.employee_submit_absence_request('Home-Office','2050-06-01','2050-06-02');RAISE EXCEPTION 'Time-only login could submit';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Dieser Zugang ist nur fuer die Zeiterfassung%' THEN RAISE;END IF;negative_checks:=negative_checks+1;END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',planner_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',planner_user::text,true);
  i:=0;
  FOREACH absence IN ARRAY ids LOOP
    i:=i+1;result:=public.manager_review_absence_request(absence,'APPROVE','Synthetic planner feedback');
    IF result IS DISTINCT FROM (CASE WHEN kinds[i]='Krank' THEN 'Erfasst' ELSE 'Genehmigt' END) THEN RAISE EXCEPTION 'Unexpected approval status for %: %',kinds[i],result;END IF;
    IF NOT EXISTS(SELECT 1 FROM public.absences a WHERE a.id=absence AND a.reviewed_by=planner_user AND a.review_note='Synthetic planner feedback' AND a.reviewed_at IS NOT NULL) THEN RAISE EXCEPTION 'Planner feedback not stored';END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employee_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',employee_user::text,true);
  rejected:=public.employee_submit_absence_request('Home-Office','2050-07-01','2050-07-01','',true,null,null,'');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',planner_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',planner_user::text,true);
  result:=public.manager_review_absence_request(rejected,'REJECT','Synthetic rejection feedback');IF result<>'Abgelehnt' THEN RAISE EXCEPTION 'Rejection failed';END IF;
  IF negative_checks<>6 THEN RAISE EXCEPTION 'Incomplete negative checks: %',negative_checks;END IF;
  RESET ROLE;
  IF (SELECT count(*) FROM public.audit_events WHERE company_id=company AND entity_type='absence' AND event_type IN ('ABSENCE_REQUEST_CREATED','ABSENCE_REQUEST_APPROVED','ABSENCE_REQUEST_REJECTED'))<>12 THEN RAISE EXCEPTION 'Audit trail incomplete';END IF;
  PERFORM set_config('app.absence_qa_result','All 5 categories: submission, dates, optional comment, planner approval, feedback, rejection and audit trail passed; 6 negative checks passed; all fixtures rolled back.',true);
END $test$;
SELECT current_setting('app.absence_qa_result') AS result;
ROLLBACK;
