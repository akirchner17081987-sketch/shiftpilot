-- Synthetic users/company only; each scenario and the fixture are rolled back.
-- RPC Auth claims are simulated; this does not perform an interactive login.
DO $$
DECLARE o uuid; c uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
e uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); a uuid; s uuid; r text; scenario text; evidence jsonb:='[]';
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
INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
VALUES(c,e,'FD','2027-02-01 06:00+01','2027-02-01 14:00+01','PUBLISHED',now(),o) RETURNING id INTO a;
FOREACH scenario IN ARRAY ARRAY['approve','colleague_reject','manager_reject','cancel','changed','overlap','absence','rest','permission'] LOOP
BEGIN
PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
s:=public.employee_create_shift_swap(a,f,'Fiktiver Test');
ASSERT (SELECT employee_id=e FROM public.shift_assignments WHERE id=a),'Request changed schedule';
IF scenario='cancel' THEN
PERFORM public.employee_cancel_shift_swap(s);r:=(SELECT status FROM public.shift_swap_requests WHERE id=s);ASSERT r='CANCELLED';
ELSE
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
IF scenario='changed' THEN UPDATE public.shift_assignments SET version=version+1 WHERE id=a;END IF;
IF scenario='overlap' THEN INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,created_by) VALUES(c,f,'FD','2027-02-01 06:00+01','2027-02-01 14:00+01',o);END IF;
IF scenario='rest' THEN INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,created_by) VALUES(c,f,'FD','2027-01-31 22:00+01','2027-02-01 06:00+01',o);END IF;
IF scenario='absence' THEN INSERT INTO public.absences(company_id,employee_id,start_date,end_date,absence_type,status) VALUES(c,f,'2027-02-01','2027-02-01','Urlaub','Genehmigt');END IF;
IF scenario='permission' THEN UPDATE public.employees SET shift_permissions=ARRAY[]::text[] WHERE id=f;END IF;
PERFORM set_config('request.jwt.claim.sub',v::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','aal','aal1')::text,true);
r:=public.employee_respond_shift_swap(s,CASE WHEN scenario='colleague_reject' THEN 'REJECT' ELSE 'APPROVE' END);
IF scenario='colleague_reject' THEN ASSERT r='REJECTED_COLLEAGUE';
ELSIF scenario IN ('changed','overlap','absence','rest','permission') THEN ASSERT r='SUPERSEDED',scenario||':'||r;
ELSE
ASSERT r='PENDING_MANAGER';ASSERT (SELECT employee_id=e FROM public.shift_assignments WHERE id=a),'Colleague changed schedule';
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
SELECT status INTO r FROM public.manager_review_shift_swap(s,CASE WHEN scenario='manager_reject' THEN 'REJECT' ELSE 'APPROVE' END);
ASSERT r=CASE WHEN scenario='manager_reject' THEN 'REJECTED_MANAGER' ELSE 'APPLIED' END,scenario||':'||r;
ASSERT (SELECT employee_id=CASE WHEN scenario='approve' THEN f ELSE e END FROM public.shift_assignments WHERE id=a),'Wrong schedule owner';
ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=c)=1,'Duplicate duty';
END IF;END IF;
evidence:=evidence||jsonb_build_array(jsonb_build_object('scenario',scenario,'status',r,'passed',true));
RAISE EXCEPTION USING ERRCODE='P7776',MESSAGE='ROLLBACK_SCENARIO';
EXCEPTION WHEN SQLSTATE 'P7776' THEN NULL;END;
END LOOP;
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.swap_qa',evidence::text,false);
END $$;
SELECT current_setting('sf.swap_qa')::jsonb AS results;
