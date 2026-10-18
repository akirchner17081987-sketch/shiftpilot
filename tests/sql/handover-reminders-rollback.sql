-- Real production schema, fictional users only. All notifications, pg_net HTTP
-- requests, audit rows and fixtures roll back before anything can be delivered.
DO $$ DECLARE o uuid;c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();m uuid:=gen_random_uuid();v uuid:=gen_random_uuid();e uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();src uuid:=gen_random_uuid();b uuid:=gen_random_uuid();i uuid:=gen_random_uuid();n uuid;count_ integer;r record;blocked boolean;results jsonb:='[]';stamp timestamptz:=now();
BEGIN
SELECT user_id INTO o FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claim.sub',o::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
INSERT INTO auth.users(id,email) SELECT x,'qa-ho-reminder-'||x||'@example.invalid' FROM unnest(array[u,m,v])x;
INSERT INTO public.companies(id,name,timezone,created_by) VALUES(c,'QA Handover Reminders Rollback','Europe/Berlin',o);
INSERT INTO public.company_members(company_id,user_id,role,status,access_role,extra_permissions) VALUES(c,m,'OWNER','ACTIVE','OWNER','{}'),(c,v,'VIEWER','ACTIVE','TEAM_LEAD','{read_only}');
INSERT INTO public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status,weekly_hours,start_date)
VALUES(e,c,u,'Fiktiv','Team','QA-REM','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15'),(ev,c,v,'Fiktiv','Readonly','QA-VIEW','Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE',40,'2020-01-15');
PERFORM set_config('request.jwt.claim.sub',m::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','aal','aal2')::text,true);
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(c,'FD','Test','08:00','16:00');
INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
VALUES(c,e,'FD',stamp-interval '30 minutes',stamp+interval '8 hours','PUBLISHED',stamp,m),(c,ev,'FD',stamp-interval '30 minutes',stamp+interval '8 hours','PUBLISHED',stamp,m);
INSERT INTO public.shift_handovers(id,company_id,shift_code,starts_at,ends_at) VALUES(b,c,'FD',stamp-interval '30 minutes',stamp+interval '8 hours');
INSERT INTO public.shift_handovers(id,company_id,shift_code,starts_at,ends_at,state,target_id,sent_at) VALUES(src,c,'FD',stamp-interval '8 hours',stamp-interval '30 minutes','SENT',b,stamp-interval '40 minutes');
INSERT INTO public.shift_handover_items(id,company_id,board_id,kind,title,detail,status,critical,due_at,escalation,responsible_employee_id)
VALUES(i,c,b,'TASK','Fiktiver Geheimtext','Vertraulicher Detailtext','OPEN',true,stamp-interval '1 minute','Interner Kontakt',e);
ASSERT private.sf_run_handover_reminders(stamp-interval '16 minutes')=0,'Premature reminder';
ASSERT private.sf_run_handover_reminders(stamp)=4,'Expected team + owner for both events';
ASSERT private.sf_run_handover_reminders(stamp)=0,'Duplicate worker result';
ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE company_id=c AND kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE') AND user_id NOT IN(u,m)),'Wrong recipient';
ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE company_id=c AND kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE') AND (message LIKE '%Geheimtext%' OR message LIKE '%Vertraulicher%' OR message LIKE '%Kontakt%')),'Sensitive payload';
SELECT id INTO n FROM public.notifications WHERE company_id=c AND kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE') AND user_id=u AND kind='HANDOVER_CRITICAL_OVERDUE';
ASSERT public.server_handover_reminder_active(n),'Live source gate denied';
ASSERT private.sf_run_handover_reminders(stamp+interval '59 minutes')=0,'Interval too short';
ASSERT private.sf_run_handover_reminders(stamp+interval '60 minutes')=4,'Second reminders missing';
ASSERT private.sf_run_handover_reminders(stamp+interval '120 minutes')=4,'Third reminders missing';
ASSERT private.sf_run_handover_reminders(stamp+interval '180 minutes')=0,'Reminder cap failed';
SELECT count(*) INTO count_ FROM net.http_request_queue q WHERE EXISTS(SELECT 1 FROM public.notifications nn WHERE nn.company_id=c AND nn.kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE') AND nn.id::text=convert_from(q.body,'UTF8')::jsonb->>'notification_id');ASSERT count_=4,'Unexpected initial queue size';
-- now() stays fixed inside this rollback transaction; real cron invocations use
-- separate transactions, so the created_at refresh trigger requeues each repeat.
ASSERT NOT EXISTS(SELECT 1 FROM private.handover_reminder_log WHERE company_id=c AND sent_count<>3),'Ledger cap mismatch';
UPDATE public.shift_handover_items SET status='DONE',resolution='Fiktiv geprüft' WHERE id=i;
ASSERT NOT public.server_handover_reminder_active(n),'Completed task still dispatchable';
UPDATE public.shift_handovers SET received_at=stamp,employee_id=e WHERE id=src;
ASSERT private.sf_run_handover_reminders(stamp+interval '181 minutes')=0,'Resolved event sent reminder';
ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE company_id=c AND kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE') AND (NOT is_read OR metadata->>'resolved'<>'true')),'Reminder not resolved';
results:=jsonb_build_array('grace period','team/owner scope','readonly excluded','private payload','four initial queue entries; three ledger claims each','one-hour interval','three-message cap','source gate','completion and receipt stop');
UPDATE public.shift_handover_items SET status='OPEN' WHERE id=i;
ASSERT private.sf_run_handover_reminders(stamp+interval '182 minutes')=2,'Reopened episode missing';
INSERT INTO public.company_members(company_id,user_id,role,status,access_role,extra_permissions) VALUES(c,u,'PLANNER','DISABLED','TEAM_LEAD','{}');
ASSERT NOT public.server_handover_reminder_active(n),'Blocked recipient allowed';
ASSERT NOT EXISTS(SELECT 1 FROM private.sf_handover_reminder_candidates(c,stamp) WHERE user_id=u),'Disabled recipient still candidate';
SET LOCAL ROLE authenticated;
blocked:=false;BEGIN PERFORM private.sf_run_handover_reminders();EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Client called worker';
blocked:=false;BEGIN PERFORM public.server_handover_reminder_active(n);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;ASSERT blocked,'Client called service gate';
RESET ROLE;
results:=results||jsonb_build_array('reopened episode','disabled account stop','worker and service grants');
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
ASSERT NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c),'Company fixture remained';
ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE company_id=c AND kind IN('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE')),'Notification remained';
ASSERT NOT EXISTS(SELECT 1 FROM private.handover_reminder_log WHERE company_id=c),'Reminder log remained';
PERFORM set_config('sf.handover_reminder_qa',jsonb_build_object('passed',results,'rolled_back',true)::text,false);
END $$;
SELECT current_setting('sf.handover_reminder_qa')::jsonb result;
