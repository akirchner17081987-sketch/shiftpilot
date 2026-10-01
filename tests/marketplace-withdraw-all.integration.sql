-- Synthetic tenants only. Every write and audit record is rolled back.
BEGIN;
DO $$
DECLARE actor uuid; co uuid:=gen_random_uuid(); foreign_co uuid:=gen_random_uuid(); emp uuid:=gen_random_uuid(); alt uuid:=gen_random_uuid();
 employee_user uuid:=gen_random_uuid(); a uuid; a2 uuid; offer uuid; filled uuid; foreign_offer uuid; pending uuid; applied uuid; result jsonb; blocked boolean;
BEGIN
 SELECT user_id INTO actor FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
 ASSERT actor IS NOT NULL;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(employee_user,'authenticated','authenticated','withdraw-'||employee_user||'@example.invalid',now(),now());
 INSERT INTO public.companies(id,name,timezone,created_by) VALUES(co,'Fiktiver Rückzugtest','Europe/Berlin',actor),(foreign_co,'Fiktiver Fremdmandant','Europe/Berlin',actor);
 INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(co,actor,'OWNER','ACTIVE');
 INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,status,weekly_hours,shift_permissions,auth_user_id)
 VALUES(emp,co,'Fiktive','Person','WITHDRAW-1','active',40,ARRAY['FD'],employee_user),(alt,co,'Fiktive','Person2','WITHDRAW-2','active',40,ARRAY['FD'],NULL);
 INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(co,'FD','Frühdienst','06:00','14:00'),(foreign_co,'FD','Frühdienst','06:00','14:00');
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 VALUES(co,emp,'FD','2026-12-01 06:00+01','2026-12-01 14:00+01','PUBLISHED',actor) RETURNING id INTO a;
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 VALUES(co,alt,'FD','2026-12-02 06:00+01','2026-12-02 14:00+01','PUBLISHED',actor) RETURNING id INTO a2;
 INSERT INTO public.time_month_closures(company_id,month_start,status,closed_at,closed_by,report_snapshot) VALUES(co,'2026-08-01','CLOSED',now(),actor,'{"preserve":true}');
 INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,created_by)
 VALUES(co,'2026-12-01','FD','2026-12-01 06:00+01','2026-12-01 14:00+01',2,actor) RETURNING id INTO offer;
 INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,status,created_by)
 VALUES(co,'2026-12-02','FD','2026-12-02 06:00+01','2026-12-02 14:00+01',0,'FILLED',actor) RETURNING id INTO filled;
 INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,created_by)
 VALUES(foreign_co,'2026-12-01','FD','2026-12-01 06:00+01','2026-12-01 14:00+01',1,actor) RETURNING id INTO foreign_offer;
 INSERT INTO public.open_shift_market_claims(company_id,offer_id,employee_id,requested_by,status)
 VALUES(co,offer,emp,employee_user,'PENDING_MANAGER') RETURNING id INTO pending;
 INSERT INTO public.open_shift_market_claims(company_id,offer_id,employee_id,requested_by,status,assignment_id)
 VALUES(co,filled,alt,actor,'APPLIED',a2) RETURNING id INTO applied;
 INSERT INTO public.shift_swap_requests(company_id,original_employee_id,assignment_id,assignment_version,status)
 VALUES(co,emp,a,1,'MARKET_OPEN'),(co,alt,a2,1,'PENDING_MANAGER'),(co,alt,a2,1,'APPLIED');
 blocked:=false;BEGIN PERFORM public.manager_withdraw_all_market_offers(co,false,'');EXCEPTION WHEN OTHERS THEN blocked:=true;END;ASSERT blocked,'Confirmation is required';
 blocked:=false;BEGIN PERFORM public.manager_withdraw_all_market_offers(foreign_co,true,'');EXCEPTION WHEN OTHERS THEN blocked:=true;END;ASSERT blocked,'Cross-company access denied';
 PERFORM set_config('request.jwt.claim.sub',employee_user::text,true);
 blocked:=false;BEGIN PERFORM public.manager_withdraw_all_market_offers(co,true,'');EXCEPTION WHEN OTHERS THEN blocked:=true;END;ASSERT blocked,'Employee cannot withdraw company offers';
 PERFORM set_config('request.jwt.claim.sub','',true);
 blocked:=false;BEGIN PERFORM public.manager_withdraw_all_market_offers(co,true,'');EXCEPTION WHEN OTHERS THEN blocked:=true;END;ASSERT blocked,'Unauthenticated withdrawal denied';
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.manager_withdraw_all_market_offers(co,true,'Integrationstest');
 ASSERT (result->>'withdrawnOffers')::integer=3 AND (result->>'endedClaims')::integer=1,'Both offer systems and pending claims withdrawn together';
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_offers WHERE id=offer AND status='CANCELLED' AND remaining_count=0);
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE id=pending AND status='SUPERSEDED' AND reviewed_by=actor);
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE id=applied AND status='APPLIED' AND assignment_id=a2),'Approved claim retained';
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_offers WHERE id=filled AND status='FILLED'),'Filled offer history retained';
 ASSERT EXISTS(SELECT 1 FROM public.open_shift_market_offers WHERE id=foreign_offer AND status='MARKET_OPEN'),'Other company untouched';
 ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=co)=2,'Assigned duties never deleted';
 ASSERT EXISTS(SELECT 1 FROM public.shift_swap_requests WHERE company_id=co AND status='APPLIED' AND assignment_id=a2),'Applied swap retained';
 ASSERT (SELECT count(*) FROM public.shift_swap_requests WHERE company_id=co AND status='CANCELLED')=2;
 ASSERT EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=co AND status='CLOSED' AND report_snapshot='{"preserve":true}'::jsonb),'Closed month unchanged';
 ASSERT EXISTS(SELECT 1 FROM public.audit_events WHERE company_id=co AND event_type='SHIFT_MARKET_ALL_WITHDRAWN' AND metadata->>'withdrawnOffers'='3'),'Withdrawal audited';
 ASSERT NOT has_function_privilege('anon','public.manager_withdraw_all_market_offers(uuid,boolean,text)','EXECUTE');
 ASSERT (public.manager_withdraw_all_market_offers(co,true,'')->>'withdrawnOffers')::integer=0,'Repeated withdrawal is idempotent';
 PERFORM set_config('withdraw_all.test_company',co::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT public.manager_withdraw_all_market_offers(current_setting('withdraw_all.test_company')::uuid,true,'') AS authenticated_idempotent_result;
ROLLBACK;
