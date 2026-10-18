-- Real production RPCs with synthetic fixtures; all writes rolled back.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();
e uuid:=gen_random_uuid();f uuid:=gen_random_uuid();offer uuid;ca uuid;cb uuid;r jsonb;blocked boolean;evidence jsonb;
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
IF o IS NULL THEN RAISE EXCEPTION 'No owner context';END IF;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) VALUES(u,'qa-swap-'||u||'@example.invalid'),(v,'qa-swap-'||v||'@example.invalid');
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA Swap Rollback','Europe/Berlin',o);
INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(c,o,'OWNER','ACTIVE');
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(c,'FD','Test','06:00','14:00');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,shift_permissions)
VALUES(e,c,u,'Fiktiv','A','QA-SWAP-A','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,ARRAY['FD']),
(f,c,v,'Fiktiv','B','QA-SWAP-B','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,ARRAY['FD']);
INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count) VALUES(c,'FD',1);

r:=public.manager_publish_open_shifts(c,'[{"date":"2027-02-01","type":"FD","count":5}]');
ASSERT (r->>'published_positions')::integer=1,'Demand cap';
SELECT id INTO offer FROM public.open_shift_market_offers WHERE company_id=c;
PERFORM public.manager_publish_open_shifts(c,'[{"date":"2027-02-01","type":"FD","count":1}]');
ASSERT (SELECT count(*) FROM public.open_shift_market_offers WHERE company_id=c)=1,'Duplicate offer';
PERFORM set_config('request.jwt.claim.sub',u::text,true);
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
blocked:=false;BEGIN PERFORM public.manager_publish_open_shifts(c,'[]');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Employee published';
r:=public.employee_claim_open_shift(offer);ca:=(r->>'id')::uuid;ASSERT r->>'status'='PENDING_MANAGER';
ASSERT NOT EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=c),'Employee assigned own claim';
blocked:=false;BEGIN PERFORM public.employee_claim_open_shift(offer);EXCEPTION WHEN OTHERS THEN blocked:=true;END;ASSERT blocked,'Duplicate claim';
PERFORM set_config('request.jwt.claim.sub',v::text,true);
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','aal','aal1')::text,true);
r:=public.employee_claim_open_shift(offer);cb:=(r->>'id')::uuid;
r:=public.employee_list_open_shift_market();ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'id'=ca::text),'Colleague claim exposed';
PERFORM set_config('request.jwt.claim.sub',o::text,true);
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
r:=public.manager_review_open_shift_claim(ca,'APPROVE');ASSERT r->>'status'='APPLIED';
r:=public.manager_review_open_shift_claim(cb,'APPROVE');ASSERT r->>'status'='SUPERSEDED','Place assigned twice';
PERFORM public.manager_review_open_shift_claim(ca,'APPROVE');
ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=c)=1,'Duplicate assignment';
ASSERT (SELECT employee_id=e AND status='PUBLISHED' AND break_minutes=0 FROM public.shift_assignments WHERE company_id=c),'Wrong published duty';
evidence:=jsonb_build_object('passed',true,'request_without_assignment',true,'approval','APPLIED','second_claim','SUPERSEDED','assignment_count',1);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.open_market_qa',evidence::text,false);
END $$;SELECT current_setting('sf.open_market_qa')::jsonb AS result;
