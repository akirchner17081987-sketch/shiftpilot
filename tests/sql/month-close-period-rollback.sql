-- Synthetic month close/export lifecycle. Intentional subtransaction rollback removes every fixture.
DO $$ DECLARE o uuid;u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();e uuid:=gen_random_uuid();a uuid:=gen_random_uuid();r jsonb;before_rows jsonb;snapshot jsonb;evidence jsonb;blocked boolean;id uuid;
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) VALUES(u,'qa-month-'||u||'@example.invalid');
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA Month Close Rollback','Europe/Berlin',o);
INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(c,o,'OWNER','ACTIVE');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date)
VALUES(e,c,u,'Fiktiv','Monatsabschluss','QA-MONTH','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(c,'FD','Test','08:00','16:00');
INSERT INTO public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
VALUES(a,c,e,'FD','2026-09-15 06:00Z','2026-09-15 14:00Z','PUBLISHED',now(),o);
INSERT INTO public.absences(company_id,employee_id,start_date,end_date,absence_type,status) VALUES(c,e,'2026-09-16','2026-09-16','Fortbildung','Genehmigt');
INSERT INTO public.time_qr_terminals(id,company_id,name,is_active,pilot_mode,token_hash) VALUES(gen_random_uuid(),c,'QA',true,false,extensions.digest(gen_random_uuid()::text,'sha256')) returning time_qr_terminals.id into id;
INSERT INTO public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at,ended_at) VALUES(c,e,id,'2026-09-15 06:00Z','2026-09-15 14:00Z');
SET LOCAL ROLE authenticated;
r:=public.manager_time_month_status(c,'2026-09-01');ASSERT (r->>'missing_confirmed_assignments')::int=0,'Completed QR not accepted';evidence:=jsonb_build_object('qr_covered_missing',r->'missing_confirmed_assignments');
RESET ROLE;
INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by) VALUES(c,e,'FD','2026-09-30 20:00Z','2026-10-01 04:00Z','PUBLISHED',now(),o);
SET LOCAL ROLE authenticated;
r:=public.manager_time_month_status(c,'2026-09-01');ASSERT (r->>'missing_confirmed_assignments')::int=1,'Month-boundary work missed';evidence:=evidence||jsonb_build_object('with_missing_month_boundary',r->'missing_confirmed_assignments');
RESET ROLE;
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.month_boundary_result',evidence::text,false);
END $$;SELECT current_setting('sf.month_boundary_result')::jsonb AS result;
