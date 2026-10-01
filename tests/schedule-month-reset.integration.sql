-- Synthetic records only; every write, deletion and audit event is rolled back.
BEGIN;
DO $$
DECLARE owner_user uuid; planner_user uuid:=gen_random_uuid(); co uuid:=gen_random_uuid(); other_co uuid:=gen_random_uuid();
 emp uuid:=gen_random_uuid(); emp_alt uuid:=gen_random_uuid(); ids uuid[]; foreign_shift uuid; offer uuid; claim uuid; legacy_offer uuid; summary jsonb; result jsonb; blocked boolean;
BEGIN
 SELECT user_id INTO owner_user FROM public.company_members WHERE status='ACTIVE' AND role='OWNER' LIMIT 1;
 ASSERT owner_user IS NOT NULL;
 PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(planner_user,'authenticated','authenticated','month-reset-'||planner_user::text||'@example.invalid',now(),now());
 INSERT INTO public.companies(id,name,timezone,created_by) VALUES(co,'Monatslöschung Integrationstest','Europe/Berlin',owner_user),(other_co,'Fremder Monatslöschung Test','Europe/Berlin',owner_user);
 INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(co,owner_user,'OWNER','ACTIVE'),(co,planner_user,'PLANNER','ACTIVE');
 INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,status,weekly_hours,shift_permissions,auth_user_id) VALUES(emp,co,'Fiktive','Monatsprüfung','MONTH-RESET-TEST','active',40,ARRAY['TEST'],planner_user);
 INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,status,weekly_hours,shift_permissions) VALUES(emp_alt,co,'Fiktive','Grenzprüfung','MONTH-RESET-ALT','active',40,ARRAY['TEST']);
 INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(co,'TEST','Testdienst','22:00','06:00');
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 SELECT co,CASE WHEN s IN('2026-12-01 00:00+01'::timestamptz,'2027-01-01 06:00+01'::timestamptz) THEN emp_alt ELSE emp END,'TEST',s,e,status,owner_user FROM (VALUES
  ('2026-08-31 22:00+02'::timestamptz,'2026-09-01 06:00+02'::timestamptz,'PUBLISHED'),
  ('2026-11-30 22:00+01'::timestamptz,'2026-12-01 06:00+01'::timestamptz,'PUBLISHED'),
  ('2026-12-01 00:00+01'::timestamptz,'2026-12-01 08:00+01'::timestamptz,'DRAFT'),
  ('2026-12-15 22:00+01'::timestamptz,'2026-12-16 06:00+01'::timestamptz,'PUBLISHED'),
  ('2026-12-31 22:00+01'::timestamptz,'2027-01-01 06:00+01'::timestamptz,'PUBLISHED'),
  ('2027-01-01 06:00+01'::timestamptz,'2027-01-01 14:00+01'::timestamptz,'PUBLISHED')) v(s,e,status);
 SELECT array_agg(id ORDER BY starts_at) INTO ids FROM public.shift_assignments WHERE company_id=co;
 INSERT INTO public.time_month_closures(company_id,month_start,status,report_snapshot,closed_at,closed_by) VALUES(co,'2026-08-01','CLOSED','{"test":"preserve"}',now(),owner_user),(co,'2026-11-01','CLOSED','{"test":"boundary"}',now(),owner_user);
 INSERT INTO public.time_entries(company_id,assignment_id,status) VALUES(co,ids[3],'open') ON CONFLICT(assignment_id) DO NOTHING;
 INSERT INTO public.plan_publications(company_id,week_start,published_at,published_by) VALUES(co,'2026-08-31',now(),owner_user),(co,'2026-11-30',now(),owner_user),(co,'2026-12-14',now(),owner_user),(co,'2026-12-28',now(),owner_user);
 INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,created_by) VALUES(co,'2026-12-15','TEST','2026-12-15 22:00+01','2026-12-16 06:00+01',1,owner_user) RETURNING id INTO offer;
 INSERT INTO public.open_shift_market_claims(company_id,offer_id,employee_id,requested_by,status,assignment_id) VALUES(co,offer,emp,planner_user,'APPLIED',ids[4]) RETURNING id INTO claim;
 INSERT INTO public.shift_swap_requests(company_id,original_employee_id,assignment_id,assignment_version,status) VALUES(co,emp,ids[4],1,'MARKET_OPEN') RETURNING id INTO legacy_offer;
 summary:=public.preview_schedule_month_reset(co,'2026-12-01');
 ASSERT (summary->>'total')::integer=3 AND (summary->>'canDelete')::boolean,'Only December duties count; August closure does not block';
 ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=co)=6,'Preview must not delete';
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Generic confirmation must not reset a month';
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN 2026-11');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Wrong month confirmation denied';
 PERFORM set_config('request.jwt.claim.sub',planner_user::text,true);
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN 2026-12');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Planner cannot perform administrative deletion';
 PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(other_co,'2026-12-01','LÖSCHEN 2026-12');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Cross-company deletion denied';
 INSERT INTO public.time_month_closures(company_id,month_start,status,closed_at,closed_by,report_snapshot) VALUES(co,'2026-12-01','CLOSED',now(),owner_user,'{}');
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN 2026-12');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'A closure after preview must still block confirmation';
 UPDATE public.time_month_closures SET status='OPEN' WHERE company_id=co AND month_start='2026-12-01';
 INSERT INTO public.time_entries(assignment_id,company_id,actual_start,actual_end,status) VALUES(ids[4],co,now()-interval '1 hour',now(),'confirmed') ON CONFLICT(assignment_id) DO UPDATE SET actual_start=excluded.actual_start,actual_end=excluded.actual_end,status='confirmed';
 ASSERT NOT (public.preview_schedule_month_reset(co,'2026-12-01')->>'canDelete')::boolean,'Recorded working times prevent a destructive plan reset';
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN 2026-12');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked AND (SELECT count(*) FROM public.shift_assignments WHERE company_id=co)=6,'Blocked deletion must be atomic';
 DELETE FROM public.time_entries WHERE company_id=co AND assignment_id=ids[4];
 result:=public.reset_company_schedule_month(co,'2026-12-01','LÖSCHEN 2026-12');
 ASSERT (result->>'deletedAssignments')::integer=3,'Deletes exactly the selected month including midnight and overnight duties';
 ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=co)=3,'Adjacent months remain';
 ASSERT EXISTS(SELECT 1 FROM public.shift_assignments WHERE id=ids[1]) AND EXISTS(SELECT 1 FROM public.shift_assignments WHERE id=ids[2]) AND EXISTS(SELECT 1 FROM public.shift_assignments WHERE id=ids[6]),'August, November overnight, January duties preserved';
 ASSERT EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=co AND month_start='2026-08-01' AND status='CLOSED' AND report_snapshot='{"test":"preserve"}'::jsonb),'Closed August snapshot unchanged';
 ASSERT EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=co AND week_start='2026-11-30') AND EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=co AND week_start='2026-12-28'),'Boundary-week publications kept for adjacent published duties';
 ASSERT NOT EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=co AND week_start='2026-12-14'),'Empty December publication cleared';
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE id=claim AND assignment_id IS NULL AND status='SUPERSEDED'),'Claim history detached and ended';
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_offers WHERE id=offer AND status='CANCELLED'),'Month marketplace offer withdrawn';
 ASSERT EXISTS(SELECT 1 FROM public.shift_swap_requests WHERE id=legacy_offer AND status='CANCELLED' AND assignment_id IS NULL),'Legacy employee offer withdrawn too';
 ASSERT EXISTS(SELECT 1 FROM public.audit_events WHERE company_id=co AND event_type='MONTH_SCHEDULE_RESET' AND metadata->>'month'='2026-12'),'Scoped deletion recorded in audit';
 ASSERT coalesce(current_setting('app.schichtfunk_full_plan_reset',true),'')<>'on','Published-duty reset bypass must not leak';
 blocked:=false;BEGIN PERFORM public.reset_company_schedule_month(co,'2026-08-01','LÖSCHEN 2026-08');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Closed month remains protected';
 ASSERT NOT has_function_privilege('anon','public.reset_company_schedule_month(uuid,date,text)','EXECUTE'),'Anonymous deletion denied';
 PERFORM set_config('month_reset.test_result','All month-reset integration assertions passed; fixtures rolled back',true);
 PERFORM set_config('month_reset.test_company',co::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT current_setting('month_reset.test_result') AS result,
 public.preview_schedule_month_reset(current_setting('month_reset.test_company')::uuid,'2026-12-01')->>'month' AS authenticated_rpc_month;
ROLLBACK;
