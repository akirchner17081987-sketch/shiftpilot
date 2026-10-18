-- Fictional users/companies only. Every fixture and generated audit row rolls back.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();l uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();r uuid:=gen_random_uuid();f uuid:=gen_random_uuid();z uuid:=gen_random_uuid();u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();e uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();s uuid:=gen_random_uuid();k uuid:=gen_random_uuid();extra_employee uuid:=gen_random_uuid();actor record;action record;outcome jsonb;value_ jsonb;evidence jsonb:='[]';
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) SELECT x,'qa-role-'||x||'@example.invalid' FROM unnest(array[a,l,v,w,r,f,z,u,u2,k]) x;
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA Roles A Rollback','Europe/Berlin',o),(d,'QA Roles B Rollback','Europe/Berlin',f);
INSERT INTO public.company_members(company_id,user_id,role,status,access_role,extra_permissions) VALUES
(c,o,'OWNER','ACTIVE','OWNER','{}'),(c,a,'ADMIN','ACTIVE','ADMIN','{}'),(c,l,'PLANNER','ACTIVE','TEAM_LEAD','{}'),(c,v,'VIEWER','ACTIVE','TEAM_LEAD','{read_only}'),(c,w,'PLANNER','ACTIVE','TEAM_LEAD','{manage_time}'),(c,r,'PLANNER','ACTIVE','TEAM_LEAD','{confirm_time}'),(d,f,'OWNER','ACTIVE','OWNER','{}'),(c,z,'ADMIN','DISABLED','ADMIN','{}'),(c,k,'TIME_TRACKING','ACTIVE','EMPLOYEE','{manage_time,confirm_time}');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date)
VALUES(e,c,u,'Fiktiv','Portal A','QA-A','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15'),(e2,c,u2,'Fiktiv','Portal B','QA-B','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(c,'FD','Test','08:00','16:00');
INSERT INTO public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by) VALUES(s,c,e,'FD','2026-09-15 06:00Z','2026-09-15 14:00Z','PUBLISHED',now(),o);
INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,break_minutes,status) VALUES(s,c,'2026-09-15 06:00Z','2026-09-15 14:00Z',0,'confirmed');

INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,shift_permissions)
VALUES(extra_employee,c,v,'Fiktiv','Readonly','QA-RO','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,ARRAY['FD']);
UPDATE public.employees SET shift_permissions=ARRAY['FD'] WHERE id=e;
INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
VALUES(c,extra_employee,'FD','2027-02-01 06:00+01','2027-02-01 14:00+01','PUBLISHED',now(),o) RETURNING id INTO s;
PERFORM set_config('request.jwt.claim.sub',v::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
BEGIN PERFORM public.employee_create_shift_swap(s,e,'QA readonly');evidence:=jsonb_build_object('readonly_swap_created',true);
EXCEPTION WHEN OTHERS THEN evidence:=jsonb_build_object('readonly_swap_created',false,'reason',SQLERRM);END;
RESET ROLE;
ASSERT NOT (evidence->>'readonly_swap_created')::boolean,'Read-only employee created a swap';
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.readonly_probe',evidence::text,false);
END $$;SELECT current_setting('sf.readonly_probe')::jsonb AS result;