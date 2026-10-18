-- Fictional identity + .invalid endpoint. Queue, notifications, audit and fixtures
-- roll back together; pg_net sends only after commit, so no provider is contacted.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();e uuid:=gen_random_uuid();n uuid;count_ integer;state_ text;results jsonb:='[]';blocked boolean;stage integer;
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) VALUES(u,'qa-push-'||u||'@example.invalid');
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA Push Rollback','Europe/Berlin',o);
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date) VALUES(e,c,u,'Fiktiv','Push','QA-PUSH','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
SET LOCAL ROLE authenticated;
PERFORM public.get_push_public_key();
PERFORM public.register_push_subscription(c,'https://example.invalid/qa-push-'||u,repeat('A',87),repeat('B',22),'QA Fictional');
n:=public.send_push_test(c);
blocked:=false;BEGIN PERFORM public.send_push_test(c);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PUSH_TEST_RATE_LIMIT' THEN RAISE;END IF;blocked:=true;END;
ASSERT blocked,'Test push rate limit failed';
RESET ROLE;
SELECT status INTO state_ FROM private.push_dispatches WHERE notification_id=n;ASSERT state_='PENDING','Dispatch not queued';
SELECT count(*) INTO count_ FROM net.http_request_queue WHERE convert_from(body,'UTF8')::jsonb->>'notification_id'=n::text;ASSERT count_=1,'Expected exactly one pending HTTP request';
ASSERT public.server_push_recipient_active(c,u),'Active employee cannot receive';
ASSERT NOT public.server_push_recipient_active(gen_random_uuid(),u),'Foreign company allowed';
results:=results||jsonb_build_array('active registration','test notification queued once','test rate limit','active delivery gate','foreign company denied');

FOR stage IN 1..3 LOOP
 IF stage=1 THEN INSERT INTO public.company_members(company_id,user_id,role,status,access_role,extra_permissions) VALUES(c,u,'PLANNER','DISABLED','TEAM_LEAD','{}');
 ELSIF stage=2 THEN DELETE FROM public.company_members WHERE company_id=c AND user_id=u;UPDATE public.employees SET deleted_at=now(),status='inactive',auth_user_id=null,access_status='DISABLED' WHERE id=e;
 ELSE UPDATE public.employees SET deleted_at=null,status='active',auth_user_id=u,access_status='DISABLED' WHERE id=e;END IF;
 ASSERT NOT public.server_push_recipient_active(c,u),'Inactive recipient allowed';
 SET LOCAL ROLE authenticated;
 blocked:=false;BEGIN PERFORM public.get_push_public_key();EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ACTIVE_MEMBERSHIP_REQUIRED' THEN RAISE;END IF;blocked:=true;END;ASSERT blocked,'Inactive key lookup allowed';
 blocked:=false;BEGIN PERFORM public.register_push_subscription(c,'https://example.invalid/qa-push-'||u,repeat('A',87),repeat('B',22),'QA Fictional');EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ACTIVE_MEMBERSHIP_REQUIRED' THEN RAISE;END IF;blocked:=true;END;ASSERT blocked,'Inactive registration allowed';
 blocked:=false;BEGIN PERFORM public.send_push_test(c);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ACTIVE_MEMBERSHIP_REQUIRED' THEN RAISE;END IF;blocked:=true;END;ASSERT blocked,'Inactive test allowed';
 RESET ROLE;
 results:=results||jsonb_build_array(jsonb_build_object('inactive_case',stage,'key_registration_test_delivery','denied'));
END LOOP;
SET LOCAL ROLE authenticated;
blocked:=false;BEGIN PERFORM public.server_push_recipient_active(c,u);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Client called service RPC';
PERFORM public.unregister_push_subscription('https://example.invalid/qa-push-'||u);
RESET ROLE;
ASSERT NOT EXISTS(SELECT 1 FROM public.push_subscriptions WHERE user_id=u),'Unsubscribe failed';
results:=results||jsonb_build_array('service RPC restricted','own unsubscribe works after account block');
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
ASSERT NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u),'User fixture remained';
ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE id=n),'Notification remained';
ASSERT NOT EXISTS(SELECT 1 FROM net.http_request_queue WHERE convert_from(body,'UTF8')::jsonb->>'notification_id'=n::text),'HTTP request remained';
PERFORM set_config('sf.push_qa',jsonb_build_object('passed',results,'rolled_back',true)::text,false);
END $$;
SELECT current_setting('sf.push_qa')::jsonb result;
