-- Production RPC checks with fictitious users/company; every write rolls back.
-- Manager/employee JWT contexts are simulated; booking RPC uses service_role.
DO $$ DECLARE o uuid;u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();e uuid:=gen_random_uuid();t uuid:=gen_random_uuid();s uuid;
qr text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');ses text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
request text;action text;code text;r jsonb;snap jsonb;evidence jsonb:='{}';finished timestamptz;blocked boolean;n integer;
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
RESET ROLE;
PERFORM public.manager_qr_pin_admin(c,'ENABLE_REQUIRED');
SET LOCAL ROLE service_role;
r:=public.qr_independent_login(qr,'QA-QR-WORKFLOW','2020-01-15',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));ASSERT NOT (r->>'ok')::boolean,'Date fallback bypass';
FOREACH action IN ARRAY ARRAY['CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT'] LOOP
request:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
r:=public.qr_independent_action(qr,ses,action,request);ASSERT (r->>'request_processed')::boolean AND r->>'processed_action'=action,'Missing receipt';
r:=public.qr_independent_action(qr,ses,action,request);ASSERT (r->>'replayed')::boolean,'Retry not deduplicated';
r:=public.qr_independent_action(qr,ses,'STATUS',request);ASSERT (r->>'request_processed')::boolean AND r->>'processed_action'=action,'Lost reply not verifiable';
IF action='CLOCK_IN' THEN
blocked:=false;BEGIN PERFORM public.qr_independent_action(qr,ses,'CLOCK_IN',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));EXCEPTION WHEN OTHERS THEN IF sqlerrm='Arbeitszeit läuft bereits' THEN blocked:=true;ELSE RAISE;END IF;END;ASSERT blocked,'Double clock-in';
END IF;
END LOOP;
ASSERT r->>'state'='READY';finished:=(r->>'ended_at')::timestamptz;
RESET ROLE;
SELECT id INTO s FROM public.time_qr_independent_shifts WHERE company_id=c;
ASSERT (SELECT count(*) FROM public.time_qr_independent_shifts WHERE company_id=c)=1;
ASSERT (SELECT count(*) FROM public.time_qr_independent_events WHERE shift_id=s)=4,'Duplicate event';
-- The single management statement keeps statement_timestamp fixed. Model the
-- later read request with a historical corrected end, before that snapshot.
finished:=statement_timestamp()-interval '1 minute';
-- Use the real audited correction API to model an eight-hour duty with 20 paid pause minutes.
snap:=public.manager_qr_independent_detail(c,s);
r:=public.manager_correct_qr_independent_shift(c,s,finished-interval '8 hours',finished,'Fiktiver Test: acht Stunden und bezahlte Pause',snap->>'revision',jsonb_build_array(jsonb_build_object('number',1,'started_at',finished-interval '30 minutes','ended_at',finished-interval '10 minutes')));
ASSERT jsonb_array_length(r->'history')=1,'Correction audit missing';
ASSERT private.sf_confirmed_work_minutes(e,(finished AT TIME ZONE 'Europe/Berlin')::date,(finished AT TIME ZONE 'Europe/Berlin')::date)=480,'Paid pause deducted';
PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
SET LOCAL ROLE authenticated;
r:=public.employee_my_qr_bookings((finished AT TIME ZONE 'Europe/Berlin')::date);
ASSERT (r#>>'{rows,0,attendance_minutes}')::numeric=480 AND (r#>>'{rows,0,pause_minutes}')::numeric=20,'Employee booking totals';
r:=public.employee_my_time_account_month((finished AT TIME ZONE 'Europe/Berlin')::date);ASSERT (r->>'confirmed_work_minutes')::numeric=480,'Employee account mismatch';
RESET ROLE;
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
r:=public.manager_central_time_entries(c,(finished AT TIME ZONE 'Europe/Berlin')::date,(finished AT TIME ZONE 'Europe/Berlin')::date);
ASSERT jsonb_array_length(r->'qr_rows')=1 AND (r#>>'{qr_rows,0,pause_minutes}')::numeric=20,'Manager view mismatch';
RESET ROLE;
evidence:=jsonb_build_object('pin_login',true,'actions_and_receipt_retries',4,'stored_events',4,'double_clock_in_blocked',true,'attendance_minutes',480,'paid_pause_minutes',20,'employee_account_minutes',480,'manager_view',true,'passed',true);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.qr_workflow_result',evidence::text,false);
END $$;SELECT current_setting('sf.qr_workflow_result')::jsonb AS result;
