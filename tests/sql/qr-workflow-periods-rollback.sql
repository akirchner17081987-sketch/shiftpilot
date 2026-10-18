-- Historical synthetic bookings only. All fixtures and audit writes roll back.
DO $$ DECLARE o uuid;u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();e uuid:=gen_random_uuid();t uuid:=gen_random_uuid();a uuid:=gen_random_uuid();q uuid:=gen_random_uuid();r jsonb;evidence jsonb;blocked boolean;minutes numeric;
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) VALUES(u,'qa-qr-periods-'||u||'@example.invalid');
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA QR Periods Rollback','Europe/Berlin',o);
INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(c,o,'OWNER','ACTIVE');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date)
VALUES(e,c,u,'Fiktiv','QR Perioden','QA-QR-PERIODS','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
INSERT INTO public.time_qr_terminals(id,company_id,name,is_active,pilot_mode,token_hash) VALUES(t,c,'QA Terminal',true,false,extensions.digest(gen_random_uuid()::text,'sha256'));
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(c,'FD','Test','08:00','16:00');
INSERT INTO public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
VALUES(a,c,e,'FD','2026-09-15 06:00Z','2026-09-15 14:00Z','PUBLISHED',now(),o);
INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,break_minutes,status) VALUES(a,c,'2026-09-15 06:00Z','2026-09-15 14:00Z',60,'confirmed');
INSERT INTO public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at,ended_at) VALUES(q,c,e,t,'2026-09-15 06:00Z','2026-09-15 14:00Z');
INSERT INTO public.time_qr_independent_breaks(shift_id,ordinal,started_at,ended_at) VALUES(q,1,'2026-09-15 10:00Z','2026-09-15 11:00Z');
ASSERT private.sf_confirmed_work_minutes(e,'2026-09-15','2026-09-15')=480,'Manual + QR duplicate or paid pause deducted';
INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at) VALUES
(c,e,t,'2026-09-30 20:00Z','2026-10-01 04:00Z'),
(c,e,t,'2026-03-28 21:00Z','2026-03-29 04:00Z'),
(c,e,t,'2025-10-25 20:00Z','2025-10-26 05:00Z');
ASSERT private.sf_confirmed_work_minutes(e,'2026-09-30','2026-09-30')=120,'September night clipping';
ASSERT private.sf_confirmed_work_minutes(e,'2026-10-01','2026-10-01')=360,'October night clipping';
ASSERT private.sf_confirmed_work_minutes(e,'2026-03-28','2026-03-29')=420,'Spring DST';
ASSERT private.sf_confirmed_work_minutes(e,'2025-10-25','2025-10-26')=540,'Autumn DST';
INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at) VALUES(c,e,t,statement_timestamp()-interval '1 hour');
r:=public.manager_time_month_status(c,current_date);ASSERT (r->>'open_qr_shifts')::numeric=1 AND NOT (r->>'can_close')::boolean,'Open shift month guard';
PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
SET LOCAL ROLE authenticated;
r:=public.employee_my_time_account_month('2026-09-01');ASSERT (r->>'confirmed_work_minutes')::numeric=600,'Employee September total';
r:=public.employee_my_time_account_month('2026-10-01');ASSERT (r->>'confirmed_work_minutes')::numeric=360,'Open shift counted as finalized';
blocked:=false;BEGIN PERFORM public.manager_central_time_entries(c,'2026-09-01','2026-09-30');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Employee obtained manager access';
RESET ROLE;
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
r:=public.manager_time_report_bundle(c,'2026-09-01',e);
SELECT sum((x->>'confirmed_actual_minutes')::numeric) INTO minutes FROM jsonb_array_elements(r->'details') x;ASSERT minutes=600,'Daily report disagrees';
r:=public.manager_central_time_entries(c,'2026-09-01','2026-09-30');ASSERT (r#>>'{confirmed_summary,0,confirmed_seconds}')::numeric=36000,'Manager summary disagrees';
RESET ROLE;
evidence:=jsonb_build_object('passed',true,'matched_manual_plus_qr_minutes',480,'night_september_minutes',120,'night_october_minutes',360,'spring_dst_minutes',420,'autumn_dst_minutes',540,'september_account_and_report_minutes',600,'open_shift_provisional',true,'employee_manager_boundary',true);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.qr_period_result',evidence::text,false);
END $$;SELECT current_setting('sf.qr_period_result')::jsonb AS result;
