-- All test employees, assignments, claims and notifications are rolled back.
BEGIN;
DO $$
DECLARE co uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); employee_user uuid:=gen_random_uuid();
 manager uuid; offer uuid; claim uuid; result jsonb; rows jsonb; blocked boolean;
BEGIN
 SELECT user_id INTO manager FROM public.company_members WHERE status='ACTIVE' AND role='OWNER' LIMIT 1;
 ASSERT manager IS NOT NULL;
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(employee_user,'authenticated','authenticated','auto-hours-test-'||employee_user||'@example.invalid',now(),now());
 PERFORM set_config('request.jwt.claim.sub',manager::text,true);
 INSERT INTO public.companies(id,name,timezone,created_by) VALUES(co,'Voluntary 180h test','Europe/Berlin',manager);
 INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(co,manager,'OWNER','ACTIVE') ON CONFLICT(company_id,user_id) DO UPDATE SET role='OWNER',status='ACTIVE';
 INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end) VALUES(co,'TEST10','Test night','20:00','06:00');
 INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count) VALUES(co,'TEST10',1);
 INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,status,weekly_hours,shift_permissions,qualifications)
 VALUES(employee,co,'Test','Voluntary','TEST-180H',employee_user,'active',40,ARRAY['TEST10'],ARRAY['__sp:monthlyHours=180','__sp:maxWeekly=50']);
 INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 SELECT co,employee,'TEST10',(d::date+'20:00'::time) AT TIME ZONE 'Europe/Berlin',((d::date+1)+'06:00'::time) AT TIME ZONE 'Europe/Berlin','DRAFT',manager
 FROM generate_series('2026-12-01'::date,'2026-12-18'::date,interval '1 day') d;
 ASSERT (SELECT sum(extract(epoch FROM(ends_at-starts_at))/3600) FROM public.shift_assignments WHERE company_id=co)=180,'Fixture must have exactly 180 monthly hours';
 PERFORM public.manager_publish_open_shifts(co,'[{"date":"2026-12-22","type":"TEST10","count":1}]');
 SELECT id INTO offer FROM public.open_shift_market_offers WHERE company_id=co;
 ASSERT private.sf_open_market_candidate(offer,employee) IS NULL,'180 hours must not block a voluntary claim';
 ASSERT private.sf_open_market_extra_warning(offer,employee) LIKE '%190.00 / 180%','Ten additional hours must warn at 190 / 180';
 UPDATE public.employees SET qualifications=ARRAY['__sp:monthlyHours=400'] WHERE id=employee;
 ASSERT private.sf_open_market_extra_warning(offer,employee) LIKE '%190.00 / 180%','Higher individual target must not hide the 180-hour overtime warning';
 PERFORM set_config('request.jwt.claim.sub',employee_user::text,true);
 rows:=public.employee_list_open_shift_market();
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE x->>'id'=offer::text AND (x->>'can_take')::boolean AND (x->>'is_additional')::boolean),'Employee must be able to volunteer with an additional-shift warning';
 result:=public.employee_claim_open_shift(offer,'Freiwillige Mehrstunden');claim:=(result->>'id')::uuid;
 ASSERT result->>'status'='PENDING_MANAGER','Employee request must await manager approval';
 ASSERT (SELECT count(*) FROM public.shift_assignments WHERE company_id=co)=18,'Claim alone must not add an assignment';
 PERFORM set_config('request.jwt.claim.sub',manager::text,true);
 blocked:=false;BEGIN PERFORM public.manager_review_open_shift_claim(claim,'APPROVE');EXCEPTION WHEN OTHERS THEN blocked:=true;END;
 ASSERT blocked,'Manager must expressly accept additional hours';
 result:=public.manager_review_open_shift_claim(claim,'APPROVE','Freiwillige Mehrstunden geprüft',true);
 ASSERT result->>'status'='APPLIED','Confirmed voluntary overtime must remain possible';
 ASSERT (SELECT sum(extract(epoch FROM(ends_at-starts_at))/3600) FROM public.shift_assignments WHERE company_id=co AND status<>'CANCELLED')=190,'Approved voluntary takeover may exceed 180';
 ASSERT (SELECT note FROM public.shift_assignments WHERE id=(result->>'assignment_id')::uuid) LIKE '%Zusatzdienst%','Overtime must be marked as a voluntary additional shift';
END $$;
ROLLBACK;
