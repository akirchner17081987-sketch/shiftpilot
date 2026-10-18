-- Fictional users/companies only. Every fixture and generated audit row rolls back.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();l uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();r uuid:=gen_random_uuid();f uuid:=gen_random_uuid();z uuid:=gen_random_uuid();u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();e uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();s uuid:=gen_random_uuid();k uuid:=gen_random_uuid();actor record;action record;blocked boolean;changed_rows integer;checked integer:=0;outcome jsonb;value_ jsonb;evidence jsonb:='[]';
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


-- AAL1 must fail before every financial-setting write, even though the actor is OWNER.
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal1')::text,true);
SET LOCAL ROLE authenticated;
FOR action IN SELECT * FROM (VALUES
(format('select public.manager_set_time_account_opening(%L,%L,60,%L)',e,'2026-10-01','QA')),
(format('select public.manager_update_time_account_settings(%L,%L,ARRAY[]::text[])',c,'2026-09-01')),
(format('select public.manager_update_time_account_settings_v2(%L,%L,ARRAY[]::text[],%L)',c,'2026-09-01','DE-SN')),
(format('select public.manager_set_time_account_target_method(%L,%L,null)',c,'WEEKDAYS_5'))
) x(statement) LOOP
 blocked:=false;BEGIN EXECUTE action.statement;EXCEPTION WHEN raise_exception THEN IF SQLERRM='MFA_REQUIRED' THEN blocked:=true;ELSE RAISE;END IF;END;
 ASSERT blocked,'Financial setter accepted AAL1';checked:=checked+1;
END LOOP;
RESET ROLE;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
PERFORM public.manager_update_time_account_settings_v2(c,'2026-09-01',ARRAY['Fortbildung'],'DE-SN');
PERFORM public.manager_set_time_account_opening(e,'2026-09-01',60,'QA opening');
PERFORM public.manager_set_time_account_target_method(c,'PERSONAL_MONTHLY','2026-10-01');
blocked:=false;BEGIN PERFORM public.manager_set_access_profile(c,o,'ADMIN',ARRAY[]::text[],'ACTIVE');EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%geschützt%';END;ASSERT blocked,'Owner protection';
RESET ROLE;
PERFORM set_config('request.jwt.claim.sub',a::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
blocked:=false;BEGIN PERFORM public.manager_set_access_profile(c,l,'ADMIN',ARRAY[]::text[],'ACTIVE');EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%Inhaber%';END;ASSERT blocked,'Administrator promoted another admin';
RESET ROLE;
-- A team leader cannot elevate their own stored role or a role in user-editable metadata.
PERFORM set_config('request.jwt.claim.sub',l::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',l,'role','authenticated','aal','aal2','user_metadata',jsonb_build_object('role','OWNER'))::text,true);
SET LOCAL ROLE authenticated;
blocked:=false;BEGIN UPDATE public.company_members SET extra_permissions=ARRAY['manage_time'] WHERE company_id=c AND user_id=l;GET DIAGNOSTICS changed_rows=ROW_COUNT;blocked:=changed_rows=0;EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Direct role elevation';
blocked:=false;BEGIN PERFORM public.manager_list_access_users(c);EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%berechtigt%';END;ASSERT blocked,'User metadata granted admin';
RESET ROLE;
-- Use an open-period draft for separate edit/confirm capabilities.
INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,created_by) VALUES(c,e,'FD','2026-10-14 06:00Z','2026-10-14 14:00Z','DRAFT',o) RETURNING id INTO s;
PERFORM set_config('request.jwt.claim.sub',w::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',w,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
value_:=public.manager_save_time_entry(s,'2026-10-14 06:00Z','2026-10-14 14:00Z',0,'QA recorded',false);ASSERT value_->>'status'='recorded','Editor save';
blocked:=false;BEGIN PERFORM public.manager_review_time_entry(s,'CONFIRM','QA unauthorized');EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%bestätigen%';END;ASSERT blocked,'Editor confirmed without right';
RESET ROLE;
PERFORM set_config('request.jwt.claim.sub',r::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
value_:=public.manager_review_time_entry(s,'CONFIRM','QA reviewed');ASSERT value_->>'status'='confirmed','Reviewer confirm';
blocked:=false;BEGIN PERFORM public.manager_save_time_entry(s,'2026-10-14 06:00Z','2026-10-14 14:00Z',0,'QA unauthorized',false);EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%verwalten%';END;ASSERT blocked,'Reviewer edited without right';
RESET ROLE;
evidence:=jsonb_build_object('passed',true,'financial_mfa_rejections',checked,'aal2_financial_writes',true,'owner_admin_protection',true,'separate_edit_confirm',true);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.roles_write_result',evidence::text,false);
END $$;SELECT current_setting('sf.roles_write_result')::jsonb AS result;
