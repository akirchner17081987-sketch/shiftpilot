-- Synthetic fixtures; this entire test is rolled back.
BEGIN;
DO $test$
DECLARE
  own_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid(); time_user uuid:=gen_random_uuid();
  company uuid; foreign_company uuid; employee uuid; other_employee uuid; foreign_employee uuid; terminal uuid; foreign_terminal uuid;
  closed_shift uuid; open_shift uuid; uid uuid; result jsonb; negatives integer:=0;
BEGIN
  FOREACH uid IN ARRAY ARRAY[own_user,other_user,foreign_user,time_user] LOOP
    INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES(uid,'authenticated','authenticated','sf-qr-rollback-'||uid||'@example.invalid','{}','{}',now(),now());
  END LOOP;
  INSERT INTO public.companies(name,created_by,timezone) VALUES('SF QR Own Rollback',own_user,'Europe/Berlin') RETURNING id INTO company;
  INSERT INTO public.companies(name,created_by,timezone) VALUES('SF QR Foreign Rollback',foreign_user,'Europe/Berlin') RETURNING id INTO foreign_company;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(company,time_user,'TIME_TRACKING','ACTIVE');
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(company,own_user,'Synthetic','Own','QR-OWN','own@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO employee;
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(company,other_user,'Synthetic','Other','QR-OTHER','other@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO other_employee;
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(foreign_company,foreign_user,'Synthetic','Foreign','QR-FOREIGN','foreign@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO foreign_employee;
  INSERT INTO public.time_qr_terminals(company_id,name,token_hash) VALUES(company,'Own terminal',extensions.digest(gen_random_uuid()::text,'sha256')) RETURNING id INTO terminal;
  INSERT INTO public.time_qr_terminals(company_id,name,token_hash) VALUES(foreign_company,'Foreign terminal',extensions.digest(gen_random_uuid()::text,'sha256')) RETURNING id INTO foreign_terminal;
  -- 23:30 UTC on Jan 31 is Feb 1 in the company timezone. End on the following day.
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at)
    VALUES(company,employee,terminal,'2050-01-31T23:30:05Z','2050-02-01T23:30:05Z') RETURNING id INTO closed_shift;
  INSERT INTO public.time_qr_independent_breaks(shift_id,ordinal,started_at,ended_at)
    SELECT closed_shift,n,'2050-02-01T00:00:05Z'::timestamptz+n*interval '1 hour','2050-02-01T00:05:05Z'::timestamptz+n*interval '1 hour' FROM generate_series(1,10) n;
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at)
    VALUES(company,other_employee,terminal,'2050-02-03T06:00Z','2050-02-03T14:00Z'),(foreign_company,foreign_employee,foreign_terminal,'2050-02-03T06:00Z','2050-02-03T14:00Z');
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at)
    VALUES(company,employee,terminal,statement_timestamp()-interval '2 hours') RETURNING id INTO open_shift;
  INSERT INTO public.time_qr_independent_breaks(shift_id,ordinal,started_at) VALUES(open_shift,1,statement_timestamp()-interval '15 minutes');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',own_user::text,true);
  SET LOCAL ROLE authenticated;
  result:=public.employee_my_qr_bookings('2050-02-17');
  IF jsonb_array_length(result->'rows')<>1 OR result->>'employee_id'<>employee::text OR result->>'month'<>'2050-02-01' OR result->>'timezone'<>'Europe/Berlin' THEN RAISE EXCEPTION 'Own monthly isolation/timezone failed: %',result; END IF;
  IF (result#>>'{rows,0,attendance_minutes}')::integer<>1440 OR (result#>>'{rows,0,pause_minutes}')::integer<>50 OR jsonb_array_length(result#>'{rows,0,breaks}')<>10 OR result#>>'{rows,0,breaks,9,number}'<>'10' THEN RAISE EXCEPTION 'Paid attendance or ten breaks failed'; END IF;
  IF result#>>'{rows,0,started_at}' NOT LIKE '%23:30:05%' THEN RAISE EXCEPTION 'Timestamp precision lost'; END IF;
  result:=public.employee_my_qr_bookings('2050-01-01');IF jsonb_array_length(result->'rows')<>0 THEN RAISE EXCEPTION 'UTC boundary leaked into January'; END IF;
  result:=public.employee_my_qr_bookings(null);
  IF jsonb_array_length(result->'rows')<>1 OR result#>>'{rows,0,id}'<>open_shift::text OR result#>>'{rows,0,ended_at}' IS NOT NULL OR (result#>>'{rows,0,attendance_minutes}')::integer<>120 OR (result#>>'{rows,0,pause_minutes}')::integer<>15 THEN RAISE EXCEPTION 'Open shift/break or current month failed'; END IF;
  BEGIN PERFORM public.employee_my_qr_bookings('9999-01-01');RAISE EXCEPTION 'Invalid date accepted';EXCEPTION WHEN invalid_parameter_value THEN negatives:=negatives+1;END;
  BEGIN PERFORM 1 FROM public.time_qr_independent_shifts;RAISE EXCEPTION 'Direct table read allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',time_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',time_user::text,true);
  BEGIN PERFORM public.employee_my_qr_bookings('2050-02-01');RAISE EXCEPTION 'Time-only account allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;
  UPDATE public.employees SET access_status='DISABLED' WHERE id=employee;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',own_user::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.employee_my_qr_bookings('2050-02-01');RAISE EXCEPTION 'Disabled account allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.employee_my_qr_bookings('2050-02-01');RAISE EXCEPTION 'Anonymous access allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);PERFORM set_config('request.jwt.claim.sub','',true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM private.employee_my_qr_bookings_impl('2050-02-01');RAISE EXCEPTION 'No user access allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;
  IF negatives<>6 THEN RAISE EXCEPTION 'Incomplete negative checks';END IF;
  PERFORM set_config('app.qr_own_qa','Own-only and cross-company isolation; company-timezone month boundary; second precision; ten breaks; paid duration; open service and pause; six access/input negatives passed. Fixtures rolled back.',true);
END $test$;
SELECT current_setting('app.qr_own_qa') result;
ROLLBACK;
