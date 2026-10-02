-- Administrator verification: no fixture, claim or notification survives ROLLBACK.
BEGIN;
DO $$
DECLARE manager uuid; co uuid:=gen_random_uuid(); other_co uuid:=gen_random_uuid();
 le uuid:=gen_random_uuid(); re uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 u_le uuid:=gen_random_uuid(); u_re uuid:=gen_random_uuid(); u_other uuid:=gen_random_uuid();
 ctx jsonb; result jsonb; offer uuid; claim uuid; blocked boolean;
BEGIN
 SELECT user_id INTO manager FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
 ASSERT manager IS NOT NULL;
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
 SELECT u,'authenticated','authenticated','shared-tl-test-'||u||'@example.invalid',now(),now() FROM unnest(ARRAY[u_le,u_re,u_other]) u;
 PERFORM set_config('request.jwt.claim.sub',manager::text,true);
 INSERT INTO public.companies(id,name,timezone,created_by) VALUES(co,'Shared TL test','Europe/Berlin',manager),(other_co,'Other TL test','Europe/Berlin',manager);
 INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(co,manager,'OWNER','ACTIVE') ON CONFLICT(company_id,user_id) DO UPDATE SET role='OWNER',status='ACTIVE';
 INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,active,coverage_group,coverage_required,sort_order)
 VALUES(co,'TL-LE','TL Leipzig','20:00','06:00',true,'TL LE/RE',1,1),
 (co,'TL-RE','TL Recklinghausen','20:00','06:00',true,'TL LE/RE',1,2),
 (co,'Teamleiter','Legacy TL','20:00','06:00',false,'TL LE/RE',1,0),
 (other_co,'TL-RE','Foreign TL','20:00','06:00',true,'TL LE/RE',1,1);
 INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count) VALUES(co,'TL-LE',1),(co,'TL-RE',1);
 INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,status,weekly_hours,shift_permissions,qualifications)
 VALUES(le,co,'Test','LE','TL-TEST-LE',u_le,'active',40,ARRAY['TL-LE'],ARRAY[]::text[]),
 (re,co,'Test','RE','TL-TEST-RE',u_re,'active',40,ARRAY['TL-RE'],ARRAY[]::text[]),
 (outsider,other_co,'Test','Foreign','TL-TEST-OTHER',u_other,'active',40,ARRAY['TL-RE'],ARRAY[]::text[]);
 ctx:=private.sf_open_market_slot(co,'2026-12-01','TL-RE');
 ASSERT (ctx->>'target')::int=1 AND (ctx->>'missing')::int=1,'Two models must produce only one shared minimum';
 ASSERT private.sf_shared_coverage_shift(co,'TL-LE',re,'2026-12-01')='TL-RE','RE permissions must resolve shared LE offer to RE';
 ASSERT private.sf_shared_coverage_shift(co,'TL-RE',le,'2026-12-01')='TL-LE','Reverse permission resolution';
 ASSERT private.sf_shared_coverage_shift(co,'TL-LE',outsider,'2026-12-01') IS NULL,'Foreign employee must not cross company';
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status) VALUES(co,re,'TL-RE','2026-12-01 20:00 Europe/Berlin','2026-12-02 06:00 Europe/Berlin','DRAFT');
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-LE')->>'missing')::int=0,'RE covers LE';
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status) VALUES(co,le,'TL-LE','2026-12-01 20:00 Europe/Berlin','2026-12-02 06:00 Europe/Berlin','DRAFT');
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-RE')->>'filled')::int=2,'A voluntary second TL remains allowed';
 UPDATE public.shift_assignments SET status='CANCELLED' WHERE company_id=co;
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status) VALUES(co,le,'TL-LE','2026-12-01 22:00 Europe/Berlin','2026-12-02 06:00 Europe/Berlin','DRAFT');
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-RE')->>'missing')::int=1,'Partial TL night cannot cover entire shared shift';
 UPDATE public.shift_assignments SET status='CANCELLED' WHERE company_id=co;
 UPDATE public.shift_templates SET active=true WHERE company_id=co AND code='Teamleiter';
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status) VALUES(co,le,'Teamleiter','2026-12-01 20:00 Europe/Berlin','2026-12-02 06:00 Europe/Berlin','DRAFT');
 UPDATE public.shift_templates SET active=false WHERE company_id=co AND code='Teamleiter';
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-RE')->>'missing')::int=0,'Historical model assignments still count';
 UPDATE public.shift_assignments SET status='CANCELLED' WHERE company_id=co;
 INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count) VALUES(co,'2026-12-01','TL-RE',2);
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-LE')->>'target')::int=2,'Daily shared override can request two TL';
 UPDATE public.daily_staffing_overrides SET required_count=0 WHERE company_id=co;
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-RE')->>'missing')::int=0,'Daily zero disables shared demand';
 DELETE FROM public.daily_staffing_overrides WHERE company_id=co;
 blocked:=false;BEGIN UPDATE public.shift_templates SET default_start='21:00' WHERE company_id=co AND code='TL-LE';EXCEPTION WHEN check_violation THEN blocked:=true;END;
 ASSERT blocked,'Diverging shift times must not silently create shared coverage';
 blocked:=false;BEGIN PERFORM public.manager_publish_open_shifts(co,'[{"date":"2026-12-01","type":"TL-LE","count":1},{"date":"2026-12-01","type":"TL-RE","count":1}]');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Two entries for the same shared group must not publish duplicate demand';
 result:=public.manager_publish_open_shifts(co,'[{"date":"2026-12-01","type":"TL-RE","count":99}]');
 ASSERT (result->>'published_positions')::int=1,'Shared publication must cap demand at one';
 SELECT id INTO offer FROM public.open_shift_market_offers WHERE company_id=co;
 ASSERT (SELECT shift_code FROM public.open_shift_market_offers WHERE id=offer)='TL-LE','Shared offers must have a stable representative';
 PERFORM set_config('request.jwt.claim.sub',u_re::text,true);
 ASSERT private.sf_open_market_candidate(offer,re) IS NULL,'RE employee may apply to shared LE offer';
 result:=public.employee_claim_open_shift(offer);claim:=(result->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',manager::text,true);
 result:=public.manager_review_open_shift_claim(claim,'APPROVE');
 ASSERT result->>'status'='APPLIED','Shared takeover must pass planner approval';
 ASSERT (SELECT shift_code FROM public.shift_assignments WHERE id=(result->>'assignment_id')::uuid)='TL-RE','Final assignment must keep employee site permission';
 ASSERT (private.sf_open_market_slot(co,'2026-12-01','TL-LE')->>'missing')::int=0,'Market assignment covers both sites';
 ASSERT (private.sf_open_market_slot(other_co,'2026-12-01','TL-RE')->>'missing')::int=1,'Company coverage must remain isolated';
END $$;
ROLLBACK;
