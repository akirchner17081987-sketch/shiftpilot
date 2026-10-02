-- Synthetic fixtures only; all accounts, hours and bookings are rolled back.
BEGIN;
DO $test$
DECLARE
  own_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid(); time_user uuid:=gen_random_uuid();
  company uuid; foreign_company uuid; employee uuid; other_employee uuid; foreign_employee uuid; terminal uuid; foreign_terminal uuid;
  crossing uuid; assignment uuid; uid uuid; r jsonb; negatives integer:=0;
BEGIN
  FOREACH uid IN ARRAY ARRAY[own_user,other_user,foreign_user,time_user] LOOP
    INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES(uid,'authenticated','authenticated','sf-wage-rollback-'||uid||'@example.invalid','{}','{}',now(),now());
  END LOOP;
  INSERT INTO public.companies(name,created_by,timezone) VALUES('SF Wage Rollback',own_user,'Europe/Berlin') RETURNING id INTO company;
  INSERT INTO public.companies(name,created_by,timezone) VALUES('SF Wage Foreign Rollback',foreign_user,'Europe/Berlin') RETURNING id INTO foreign_company;
  INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(company,'FD','Synthetic','06:00','14:00');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(company,time_user,'TIME_TRACKING','ACTIVE');
  INSERT INTO public.time_account_settings(company_id,federal_state) VALUES(company,'DE-SN');
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(company,own_user,'Synthetic','Own','WAGE-OWN','own@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO employee;
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(company,other_user,'Synthetic','Other','WAGE-OTHER','other@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO other_employee;
  INSERT INTO public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    VALUES(foreign_company,foreign_user,'Synthetic','Foreign','WAGE-FOREIGN','foreign@example.invalid','ACTIVE',ARRAY['FD']) RETURNING id INTO foreign_employee;
  INSERT INTO public.time_qr_terminals(company_id,name,token_hash) VALUES(company,'Own terminal',extensions.digest(gen_random_uuid()::text,'sha256')) RETURNING id INTO terminal;
  INSERT INTO public.time_qr_terminals(company_id,name,token_hash) VALUES(foreign_company,'Foreign terminal',extensions.digest(gen_random_uuid()::text,'sha256')) RETURNING id INTO foreign_terminal;
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at)
    VALUES(company,employee,terminal,'2026-09-30 20:00+02','2026-10-01 06:00+02') RETURNING id INTO crossing;
  INSERT INTO public.time_qr_independent_breaks(shift_id,ordinal,started_at,ended_at) VALUES(crossing,1,'2026-10-01 02:00+02','2026-10-01 03:00+02');
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at) VALUES
    (company,employee,terminal,'2026-09-28 21:30+02','2026-09-29 06:30+02'),
    (company,employee,terminal,'2026-09-27 07:00:00+02','2026-09-27 07:00:30+02'),
    (company,employee,terminal,'2025-10-03 22:00+02','2025-10-04 06:00+02'),
    (company,employee,terminal,'2025-10-05 22:00+02','2025-10-06 06:00+02'),
    (company,employee,terminal,'2025-10-25 22:00+02','2025-10-26 06:00+01'),
    (company,employee,terminal,'2026-03-28 22:00+01','2026-03-29 06:00+02'),
    (company,employee,terminal,'2025-12-31 22:00+01','2026-01-01 06:00+01'),
    (company,employee,terminal,'2025-11-19 22:00+01','2025-11-20 06:00+01'),
    (company,other_employee,terminal,'2026-09-28 06:00+02','2026-09-28 18:00+02'),
    (foreign_company,foreign_employee,foreign_terminal,'2026-09-28 06:00+02','2026-09-28 18:00+02'),
    (company,employee,terminal,'2026-10-03 08:00+02','2026-10-03 16:00+02');
  INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at) VALUES(company,employee,terminal,statement_timestamp()-interval '2 hours');
  INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at)
    VALUES(company,employee,'FD','2026-09-30 20:00+02','2026-10-01 06:00+02') RETURNING id INTO assignment;
  INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,status,source)
    VALUES(assignment,company,'2026-09-30 20:00+02','2026-10-01 06:00+02','confirmed','MANAGER');
  INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at)
    VALUES(company,employee,'FD','2026-09-28 12:00+02','2026-09-28 13:00+02') RETURNING id INTO assignment;
  INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,status,source)
    VALUES(assignment,company,'2026-09-28 12:00+02','2026-09-28 13:00+02','recorded','EMPLOYEE');
  INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at)
    VALUES(company,employee,'FD','2026-08-03 10:00+02','2026-08-03 18:00+02') RETURNING id INTO assignment;
  INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,break_minutes,status,source)
    VALUES(assignment,company,'2026-08-03 10:00+02','2026-08-03 18:00+02',60,'confirmed','MANAGER');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',own_user::text,true);
  SET LOCAL ROLE authenticated;
  r:=public.employee_my_wage_month('2026-09-20');
  IF r->>'employee_id'<>employee::text OR r->>'month'<>'2026-09-01' OR (r#>>'{totals,paid_seconds}')::numeric<>46830 OR (r#>>'{totals,night_seconds}')::numeric<>36000 OR (r#>>'{totals,sunday_seconds}')::numeric<>30 OR (r#>>'{sources,overlap_seconds}')::numeric<>14400 OR jsonb_array_length(r->'pending')<>1 THEN RAISE EXCEPTION 'Isolation, second precision, night boundaries, duplicate union or pending exclusion failed: %',r;END IF;
  r:=public.employee_my_wage_month('2026-10-01');
  IF (r#>>'{totals,paid_seconds}')::numeric<>21600 OR (r#>>'{totals,night_seconds}')::numeric<>21600 OR (r#>>'{sources,overlap_seconds}')::numeric<>21600 OR jsonb_array_length(r->'pending')<>2 THEN RAISE EXCEPTION 'Cross-month paid QR pause, open/future exclusion failed: %',r;END IF;
  r:=public.employee_my_wage_month('2025-10-01');
  IF (r#>>'{totals,paid_seconds}')::numeric<>90000 OR (r#>>'{totals,night_seconds}')::numeric<>50400 OR (r#>>'{totals,sunday_seconds}')::numeric<>32400 OR (r#>>'{totals,holiday_seconds}')::numeric<>7200 THEN RAISE EXCEPTION 'Holiday/Sunday priority or fall DST failed: %',r;END IF;
  r:=public.employee_my_wage_month('2026-03-01');
  IF (r#>>'{totals,paid_seconds}')::numeric<>25200 OR (r#>>'{totals,night_seconds}')::numeric<>7200 OR (r#>>'{totals,sunday_seconds}')::numeric<>18000 THEN RAISE EXCEPTION 'Spring DST failed';END IF;
  r:=public.employee_my_wage_month('2025-12-01');IF (r#>>'{totals,paid_seconds}')::numeric<>7200 OR (r#>>'{totals,night_seconds}')::numeric<>7200 THEN RAISE EXCEPTION 'Year boundary December failed';END IF;
  r:=public.employee_my_wage_month('2026-01-01');IF (r#>>'{totals,paid_seconds}')::numeric<>21600 OR (r#>>'{totals,holiday_seconds}')::numeric<>21600 THEN RAISE EXCEPTION 'Year boundary January failed';END IF;
  r:=public.employee_my_wage_month('2025-11-01');IF (r#>>'{totals,holiday_seconds}')::numeric<>7200 OR (r#>>'{totals,night_seconds}')::numeric<>21600 THEN RAISE EXCEPTION 'Saxony holiday failed';END IF;
  r:=public.employee_my_wage_month('2026-08-01');IF (r#>>'{totals,paid_seconds}')::numeric<>25200 OR (r#>>'{sources,legacy_break_entries}')::integer<>1 THEN RAISE EXCEPTION 'Confirmed net time failed';END IF;
  r:=public.employee_my_wage_month('2024-01-01');IF (r#>>'{totals,paid_seconds}')::numeric<>0 OR jsonb_array_length(r->'days')<>0 THEN RAISE EXCEPTION 'Empty month failed';END IF;
  BEGIN PERFORM public.employee_my_wage_month('9999-01-01');RAISE EXCEPTION 'Invalid date accepted';EXCEPTION WHEN invalid_parameter_value THEN negatives:=negatives+1;END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',time_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',time_user::text,true);
  BEGIN PERFORM public.employee_my_wage_month('2026-09-01');RAISE EXCEPTION 'Time-only account allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;UPDATE public.employees SET access_status='DISABLED' WHERE id=employee;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.sub',own_user::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.employee_my_wage_month('2026-09-01');RAISE EXCEPTION 'Disabled account allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;SET LOCAL ROLE anon;
  BEGIN PERFORM public.employee_my_wage_month('2026-09-01');RAISE EXCEPTION 'Anonymous access allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;PERFORM set_config('request.jwt.claims','{}',true);PERFORM set_config('request.jwt.claim.sub','',true);SET LOCAL ROLE authenticated;
  BEGIN PERFORM private.employee_my_wage_month_impl('2026-09-01');RAISE EXCEPTION 'Missing identity allowed';EXCEPTION WHEN insufficient_privilege THEN negatives:=negatives+1;END;
  RESET ROLE;IF negatives<>5 THEN RAISE EXCEPTION 'Incomplete negative checks';END IF;
  PERFORM set_config('app.wage_qa','PASS: own-only and cross-company isolation; confirmed and QR time union; paid QR pause; 22:00/06:00 limits; second precision; month/year boundaries; highest premium; Saxony holidays; both DST changes; pending/future excluded; empty month; five security/input negatives. Fixtures rolled back.',true);
END $test$;
SELECT current_setting('app.wage_qa') result;
ROLLBACK;
