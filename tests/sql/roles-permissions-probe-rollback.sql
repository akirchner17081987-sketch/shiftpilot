-- Fictional users/companies only. Every fixture and generated audit row rolls back.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();l uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();r uuid:=gen_random_uuid();f uuid:=gen_random_uuid();z uuid:=gen_random_uuid();u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();e uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();s uuid:=gen_random_uuid();k uuid:=gen_random_uuid();actor record;action record;outcome jsonb;value_ jsonb;evidence jsonb:='[]';
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
UPDATE public.employees SET access_status='DISABLED' WHERE id=e2;
PERFORM public.manager_close_time_month(c,'2026-09-01','QA Snapshot');
FOR actor IN SELECT * FROM (VALUES(o,'owner','aal2'),(a,'admin','aal2'),(a,'admin_without_mfa','aal1'),(l,'lead_no_time','aal2'),(v,'read_only','aal2'),(w,'time_editor','aal2'),(r,'time_reviewer','aal2'),(f,'foreign_owner','aal2'),(z,'disabled_admin','aal2'),(k,'time_only','aal2'),(u,'employee','aal1'),(u2,'disabled_employee','aal1'),(null::uuid,'anonymous','aal1')) x(uid,label,aal) LOOP
PERFORM set_config('request.jwt.claim.sub',coalesce(actor.uid::text,''),true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.uid,'role',case when actor.uid is null then 'anon' else 'authenticated' end,'aal',actor.aal)::text,true);
IF actor.uid IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
outcome:=jsonb_build_object('role',actor.label);
FOR action IN SELECT * FROM (VALUES
('context',format('select public.access_profile_context(%L)',c)),
('users',format('select public.manager_list_access_users(%L)',c)),
('accounts',format('select public.manager_monthly_time_accounts(%L,%L)',c,'2026-09-01')),
('month_status',format('select public.manager_time_month_status(%L,%L)',c,'2026-09-01')),
('time_list',format('select to_jsonb(public.manager_list_time_entries(%L,%L,%L))',c,'2026-09-01','2026-09-30')),
('report',format('select public.manager_time_report_bundle(%L,%L,null)',c,'2026-09-01')),
('employee_rows',format('select to_jsonb(count(*)) from public.employees where company_id=%L',c)),
('time_rows',format('select to_jsonb(count(*)) from public.time_entries where company_id=%L',c)),
('my_account','select public.employee_my_time_account_month(''2026-09-01'')'),
('marketplace','select to_jsonb(count(*)) from public.employee_list_shift_marketplace()'),
('swaps','select to_jsonb(count(*)) from public.employee_list_shift_swaps()'),
('readonly_schedule',format('select public.read_only_schedule_snapshot(%L)',c))
) x(label,statement) LOOP
BEGIN EXECUTE action.statement INTO value_;outcome:=outcome||jsonb_build_object(action.label,case when action.label in ('employee_rows','time_rows') then value_ else '"ALLOWED"'::jsonb end);
EXCEPTION WHEN OTHERS THEN outcome:=outcome||jsonb_build_object(action.label,'DENIED:'||SQLSTATE||':'||left(SQLERRM,65));END;
END LOOP;
RESET ROLE;
IF actor.label<>'anonymous' THEN
 ASSERT (outcome->>'employee_rows')::int=CASE WHEN actor.label IN ('owner','admin','admin_without_mfa','lead_no_time','time_editor','time_reviewer') THEN 2 WHEN actor.label='employee' THEN 1 ELSE 0 END,'Employee row scope: '||actor.label;
 ASSERT (outcome->>'time_rows')::int=CASE WHEN actor.label IN ('owner','admin','admin_without_mfa','time_editor','time_reviewer','employee') THEN 1 ELSE 0 END,'Time row scope: '||actor.label;
END IF;
ASSERT (outcome->>'accounts'='ALLOWED')=(actor.label IN ('owner','admin','admin_without_mfa','time_editor','time_reviewer')),'Closed account scope: '||actor.label;
ASSERT (outcome->>'users'='ALLOWED')=(actor.label IN ('owner','admin')),'User management scope: '||actor.label;
ASSERT (outcome->>'my_account'='ALLOWED')=(actor.label='employee'),'Own account scope: '||actor.label;
ASSERT (outcome->>'marketplace'='ALLOWED')=(actor.label='employee'),'Marketplace scope: '||actor.label;
ASSERT (outcome->>'swaps'='ALLOWED')=(actor.label='employee'),'Swap scope: '||actor.label;
ASSERT (outcome->>'readonly_schedule'='ALLOWED')=(actor.label='read_only'),'Read-only scope: '||actor.label;
evidence:=evidence||jsonb_build_array(outcome);
END LOOP;
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.roles_probe_result',evidence::text,false);
END $$;SELECT current_setting('sf.roles_probe_result')::jsonb AS result;
