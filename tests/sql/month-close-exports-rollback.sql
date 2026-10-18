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
SET LOCAL ROLE authenticated;
PERFORM public.manager_update_time_account_settings_v2(c,'2026-09-01',array['Fortbildung'],'DE-SN');
PERFORM public.manager_set_time_account_opening(e,'2026-09-01',60,'QA');
r:=public.manager_time_month_status(c,'2026-09-01');ASSERT (r->>'missing_confirmed_assignments')::int=1 AND NOT (r->>'can_close')::boolean,'Missing work did not block close';
blocked:=false;BEGIN PERFORM public.manager_close_time_month(c,'2026-09-01','QA');EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Incomplete month closed';
RESET ROLE;
INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,break_minutes,status) VALUES(a,c,'2026-09-15 06:00Z','2026-09-15 14:00Z',0,'confirmed');
SET LOCAL ROLE authenticated;
r:=public.manager_monthly_time_accounts(c,'2026-09-01');before_rows:=r->'rows';
ASSERT (r#>>'{rows,0,target_minutes}')::int=10560,'September target';
ASSERT (r#>>'{rows,0,confirmed_work_minutes}')::int=480,'Work total';
ASSERT (r#>>'{rows,0,absence_credit_minutes}')::int=480,'Absence credit';
ASSERT (r#>>'{rows,0,account_balance_minutes}')::int=-9540,'Opening and balance';
r:=public.manager_close_time_month(c,'2026-09-01','QA');ASSERT r->>'status'='CLOSED' AND (r->>'revision')::int=1,'Close revision';
r:=public.manager_monthly_time_accounts(c,'2026-09-01');ASSERT r->'rows'=before_rows,'Closed accounts differ';
r:=public.manager_time_report_bundle(c,'2026-09-01',e);snapshot:=r;ASSERT r->'employees'=before_rows AND jsonb_array_length(r->'details')=30,'Snapshot export completeness';
blocked:=false;BEGIN PERFORM public.manager_update_time_account_settings_v2(c,'2026-09-01',array['Fortbildung'],'DE');EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Closed settings writable';
blocked:=false;BEGIN PERFORM public.manager_set_time_account_opening(e,'2026-09-01',120,'QA');EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Closed opening writable';
blocked:=false;BEGIN PERFORM public.manager_authorize_datev_lodas_export(c,'2026-09-01',1,repeat('a',64),2);EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Stale export authorized';
id:=public.manager_authorize_datev_lodas_export(c,'2026-09-01',1,repeat('a',64),1);ASSERT id IS NOT NULL,'Export missing audit';
RESET ROLE;
blocked:=false;BEGIN UPDATE public.time_entries SET break_minutes=10 WHERE assignment_id=a;EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Closed time writable';
blocked:=false;BEGIN DELETE FROM public.absences WHERE company_id=c;EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Closed absence writable';
UPDATE public.employees emp SET weekly_hours=20 WHERE emp.id=e;
SET LOCAL ROLE authenticated;
r:=public.manager_monthly_time_accounts(c,'2026-09-01');ASSERT r->'rows'=before_rows,'Contract change rewrote closed account';
r:=public.manager_time_report_bundle(c,'2026-09-01',e);ASSERT r=snapshot,'Contract change rewrote closed report';
blocked:=false;BEGIN PERFORM public.manager_reopen_time_month(c,'2026-09-01','');EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Reopen without reason';
r:=public.manager_reopen_time_month(c,'2026-09-01','QA Korrektur');ASSERT r->>'status'='OPEN' AND (r->>'revision')::int=2,'Reopen revision';
blocked:=false;BEGIN PERFORM public.manager_authorize_datev_lodas_export(c,'2026-09-01',1,repeat('a',64),1);EXCEPTION WHEN raise_exception THEN blocked:=true;END;ASSERT blocked,'Open month export authorized';
r:=public.manager_close_time_month(c,'2026-09-01','QA erneut');ASSERT (r->>'revision')::int=3,'Reclose revision';
r:=public.manager_monthly_time_accounts(c,'2026-09-01');ASSERT (r#>>'{rows,0,target_minutes}')::int=5280,'New revision did not include correction';
RESET ROLE;
PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
SET LOCAL ROLE authenticated;
blocked:=false;BEGIN PERFORM public.manager_reopen_time_month(c,'2026-09-01','QA unerlaubt');EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true;END;ASSERT blocked,'Employee reopened month';
blocked:=false;BEGIN PERFORM public.manager_time_report_bundle(c,'2026-09-01',null);EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true;END;ASSERT blocked,'Employee obtained full export';
blocked:=false;BEGIN PERFORM public.manager_authorize_datev_lodas_export(c,'2026-09-01',1,repeat('a',64),3);EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true;END;ASSERT blocked,'Employee authorized payroll export';
RESET ROLE;
evidence:=jsonb_build_object('passed',true,'target_minutes',10560,'work_minutes',480,'absence_minutes',480,'balance_with_opening',-9540,'daily_export_rows',30,'closed_snapshot_stable',true,'write_guards',true,'revisions',jsonb_build_array(1,2,3),'datev_audit_and_stale_revision_guard',true);
RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_FIXTURE';
EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL;END;
PERFORM set_config('sf.month_close_result',evidence::text,false);
END $$;SELECT current_setting('sf.month_close_result')::jsonb AS result;
