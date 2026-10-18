-- Limits, auto-closed pause, expired/foreign/revoked sessions. All writes roll back.
DO $$ DECLARE o uuid;u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();e uuid:=gen_random_uuid();t uuid:=gen_random_uuid();s uuid;other_c uuid:=gen_random_uuid();other_t uuid:=gen_random_uuid();
qr text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');ses text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');foreign_qr text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
code text;r jsonb;evidence jsonb;blocked boolean;n integer;scenario text;checks jsonb:='[]';
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
IF o IS NULL THEN RAISE EXCEPTION 'Owner context missing';END IF;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) VALUES(u,'qa-qr-workflow-'||u||'@example.invalid');
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA QR Workflow Rollback','Europe/Berlin',o);
INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(c,o,'OWNER','ACTIVE');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date)
VALUES(e,c,u,'Fiktiv','QR Test','QA-QR-WORKFLOW','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
INSERT INTO public.time_qr_terminals(id,company_id,name,is_active,pilot_mode,token_hash) VALUES(t,c,'QA Terminal',true,false,extensions.digest(qr,'sha256'));
r:=public.manager_qr_pin_admin(c,'ISSUE_CODE',e);code:=r->>'setup_code';
SET LOCAL ROLE service_role;
r:=public.qr_independent_pin_login(qr,'QA-QR-WORKFLOW','739281',ses,code);ASSERT (r->>'ok')::boolean,'PIN setup/login';

PERFORM public.qr_independent_action(qr,ses,'CLOCK_IN',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
FOR n IN 1..10 LOOP
PERFORM public.qr_independent_action(qr,ses,'BREAK_START',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
PERFORM public.qr_independent_action(qr,ses,'BREAK_END',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
END LOOP;
blocked:=false;BEGIN PERFORM public.qr_independent_action(qr,ses,'BREAK_START',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));EXCEPTION WHEN OTHERS THEN IF sqlerrm='Maximal zehn Pausen pro Buchung' THEN blocked:=true;ELSE RAISE;END IF;END;ASSERT blocked,'Eleventh pause accepted';
r:=public.qr_independent_action(qr,ses,'CLOCK_OUT',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));ASSERT jsonb_array_length(r->'breaks')=10;
PERFORM public.qr_independent_action(qr,ses,'CLOCK_IN',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
PERFORM public.qr_independent_action(qr,ses,'BREAK_START',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
r:=public.qr_independent_action(qr,ses,'CLOCK_OUT',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
ASSERT (r->>'pause_automatically_closed')::boolean AND r#>>'{breaks,0,ended_at}'=r->>'ended_at','Open pause not closed at exact end';
RESET ROLE;
SELECT id INTO s FROM public.time_qr_independent_shifts WHERE company_id=c ORDER BY started_at DESC LIMIT 1;
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(other_c,'QA QR Foreign Rollback','Europe/Berlin',o);
INSERT INTO public.time_qr_terminals(id,company_id,name,is_active,pilot_mode,token_hash) VALUES(other_t,other_c,'QA Foreign Terminal',true,false,extensions.digest(foreign_qr,'sha256'));
FOREACH scenario IN ARRAY ARRAY['foreign_terminal','expired_session','disabled_terminal','disabled_employee','pin_reset'] LOOP
BEGIN
IF scenario='expired_session' THEN UPDATE public.time_qr_independent_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE employee_id=e;END IF;
IF scenario='disabled_terminal' THEN UPDATE public.time_qr_terminals SET is_active=false WHERE id=t;END IF;
IF scenario='disabled_employee' THEN UPDATE public.employees SET access_status='DISABLED' WHERE id=e;END IF;
IF scenario='pin_reset' THEN PERFORM public.manager_qr_pin_admin(c,'ISSUE_CODE',e);END IF;
SET LOCAL ROLE service_role;
blocked:=false;BEGIN PERFORM public.qr_independent_action(CASE WHEN scenario='foreign_terminal' THEN foreign_qr ELSE qr END,ses,'STATUS',null);EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE 'Anmeldung abgelaufen%' THEN blocked:=true;ELSE RAISE;END IF;END;ASSERT blocked,scenario;
RESET ROLE;
checks:=checks||jsonb_build_array(scenario);
RAISE EXCEPTION USING ERRCODE='P7776',MESSAGE='ROLLBACK_SCENARIO';
EXCEPTION WHEN SQLSTATE 'P7776' THEN NULL;END;
END LOOP;
blocked:=false;BEGIN PERFORM public.manager_qr_independent_detail(other_c,s);EXCEPTION WHEN OTHERS THEN IF lower(sqlerrm) LIKE '%berechtig%' OR sqlerrm LIKE '%gefunden%' THEN blocked:=true;ELSE RAISE;END IF;END;ASSERT blocked,'Foreign manager detail';
ASSERT NOT has_function_privilege('authenticated','public.qr_independent_action(text,text,text,text)','EXECUTE');
ASSERT NOT has_function_privilege('anon','public.qr_independent_action(text,text,text,text)','EXECUTE');
evidence:=jsonb_build_object('passed',true,'ten_breaks',true,'eleventh_break_blocked',true,'open_pause_closed_at_end',true,'blocked_sessions',checks,'foreign_manager_detail_blocked',true,'booking_rpc_service_only',true);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.qr_safety_result',evidence::text,false);
END $$;SELECT current_setting('sf.qr_safety_result')::jsonb AS result;
