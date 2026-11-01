-- Execute after the regional helper and integration migrations inside a rollback.
-- Three synthetic company models; no existing schedule or employee is altered.
DO $test$
DECLARE owner_ uuid; company_ uuid; employee_a uuid; employee_b uuid; employee_c uuid;
  user_c uuid; offer_ uuid; model_ record; cfg_ jsonb; preview_ jsonb; proposal_ jsonb;
  result_ jsonb; slot_ jsonb; snapshot_ jsonb; blocked_ boolean; manual_ok_ boolean;
BEGIN
 SELECT user_id INTO owner_ FROM public.company_members WHERE role='OWNER' AND status='ACTIVE' LIMIT 1;
 IF owner_ IS NULL THEN RAISE EXCEPTION 'No owner for test context'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_,'role','authenticated','aal','aal2')::text,true);
 FOR model_ IN SELECT * FROM (VALUES
  ('10h','OT1','OT2','OT','06:00'::time,'08:00'::time,'08:00'::time,'16:00'::time,'18:00'::time,'18:00'::time),
  ('8h','FD','FD','FD-WE','06:00'::time,'06:00'::time,'06:00'::time,'14:00'::time,'14:00'::time,'14:00'::time),
  ('9h','OT','OT','OT-WE','07:00'::time,'07:00'::time,'07:00'::time,'16:00'::time,'16:00'::time,'16:00'::time)
 ) x(label,week1,week2,special,start1,start2,special_start,end1,end2,special_end) LOOP
  company_:=gen_random_uuid();employee_a:=gen_random_uuid();employee_b:=gen_random_uuid();employee_c:=gen_random_uuid();user_c:=gen_random_uuid();
  INSERT INTO auth.users(id,email) VALUES(user_c,'regional-'||user_c||'@example.invalid');
  INSERT INTO public.companies(id,name,timezone,created_by) VALUES(company_,'QA regional '||model_.label,'Europe/Berlin',owner_);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES(company_,owner_,'OWNER','ACTIVE');
  cfg_:=jsonb_build_object('target',3,'statesBySite',jsonb_build_object('Leipzig','SN','Recklinghausen','NW'),
    'weekdayCodes',to_jsonb(ARRAY[model_.week1,model_.week2]),'specialCodes',to_jsonb(ARRAY[model_.special]));
  INSERT INTO public.company_compliance_policy(company_id,solid_planning_rules) VALUES(company_,jsonb_build_object('enabled',true,'regionalDayStaffing',cfg_));
  INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,optional_weekdays)
    VALUES(company_,model_.week1,model_.week1,model_.start1,model_.end1,ARRAY[1,2,3,4,5]);
  IF model_.week2<>model_.week1 THEN
   INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,optional_weekdays)
    VALUES(company_,model_.week2,model_.week2,model_.start2,model_.end2,ARRAY[1,2,3,4,5]);
  END IF;
  INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,optional_weekdays)
    VALUES(company_,model_.special,model_.special,model_.special_start,model_.special_end,ARRAY[6,7]);
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    SELECT company_,code,3 FROM public.shift_templates WHERE company_id=company_;
  INSERT INTO public.employees(id,company_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,weekly_hours,shift_permissions,qualifications)
    VALUES(employee_a,company_,'Test','Leipzig','A','Mitarbeiter','Vollzeit','SHIFT','active',40,ARRAY[model_.week1,model_.special],ARRAY['__sp:team=Leipzig']),
    (employee_b,company_,'Test','Leipzig','B','Mitarbeiter','Vollzeit','SHIFT','active',40,ARRAY[model_.week2],ARRAY['__sp:team=Leipzig']),
    (employee_c,company_,'Test','Recklinghausen','C','Mitarbeiter','Vollzeit','SHIFT','active',40,ARRAY[model_.special],ARRAY['__sp:team=Recklinghausen']);
  UPDATE public.employees SET auth_user_id=user_c,access_status='ACTIVE' WHERE id=employee_c;
  ASSERT private.sf_regional_day_allowed(company_,employee_a,'2027-05-27',model_.week1);
  ASSERT private.sf_regional_day_allowed(company_,employee_c,'2027-05-27',model_.special);
  ASSERT NOT private.sf_regional_day_allowed(company_,employee_a,'2027-05-27',model_.special);
  ASSERT private.sf_regional_day_allowed(company_,employee_a,'2027-05-26',model_.week1);
  ASSERT NOT private.sf_regional_day_allowed(company_,employee_c,'2027-05-26',model_.special);
  ASSERT private.sf_regional_day_allowed(company_,employee_a,'2027-05-29',model_.special);
  ASSERT private.sf_regional_day_allowed(company_,employee_a,'2027-11-17',model_.special);
  ASSERT private.sf_regional_day_allowed(company_,employee_c,'2027-11-17',model_.week1);
  ASSERT private.sf_regional_day_allowed(company_,employee_a,'2027-01-01',model_.special);
  ASSERT private.sf_regional_day_allowed(company_,employee_c,'2027-01-01',model_.special);
  snapshot_:=private.sf_autonomy_snapshot_before_continuity(company_,'2027-05-01',1,gen_random_uuid(),0);
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot_->'candidates') x WHERE x->>'employeeId'=employee_a::text AND x->>'date'='2027-05-27' AND x->>'type'=model_.week1),'Regular location candidate missing';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot_->'candidates') x WHERE x->>'employeeId'=employee_c::text AND x->>'date'='2027-05-27' AND x->>'type'=model_.special),'Holiday location candidate missing';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot_->'candidates') x WHERE x->>'employeeId'=employee_a::text AND x->>'date'='2027-05-27' AND x->>'type'=model_.special),'Wrong-location candidate must be excluded';
  result_:=public.manager_publish_open_shifts(company_,jsonb_build_array(jsonb_build_object('date','2027-05-27','type',model_.special,'count',3),jsonb_build_object('date','2027-05-27','type',model_.week1,'count',3)));
  ASSERT (SELECT count(*) FROM public.open_shift_market_offers WHERE company_id=company_)=2,'Two alternatives must be available';
  SELECT id INTO STRICT offer_ FROM public.open_shift_market_offers WHERE company_id=company_ AND shift_code=model_.special;
  preview_:=public.preview_planning_period(company_,'2027-05-01',1);
  PERFORM set_config('sf.incomplete_draft_company',company_::text,true);
  PERFORM set_config('sf.incomplete_draft_confirmation','OFFEN ÜBERNEHMEN',true);
  proposal_:=jsonb_build_array(jsonb_build_object('employee_id',employee_a,'shift_code',model_.special,'starts_at',(date '2027-05-27'+model_.special_start) AT TIME ZONE 'Europe/Berlin','ends_at',(date '2027-05-27'+model_.special_end) AT TIME ZONE 'Europe/Berlin','legacy_id','qa-wrong-'||employee_a));
  blocked_:=false;BEGIN PERFORM public.apply_planning_period(company_,'2027-05-01',1,preview_->>'fingerprint',ARRAY[]::uuid[],proposal_,true);EXCEPTION WHEN OTHERS THEN blocked_:=true;END;
  ASSERT blocked_,'Wrong-location automatic day shift must be rejected';
  ASSERT NOT EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_),'Rejected draft must leave no assignments';
  manual_ok_:=false;
  BEGIN
   result_:=public.apply_planning_period(company_,'2027-05-01',1,preview_->>'fingerprint',ARRAY[]::uuid[],
     jsonb_build_array((proposal_->0)||jsonb_build_object('rhythm_override',jsonb_build_object('manualPlanning',true,'reason','Manuelle Planerentscheidung'))),true);
   manual_ok_:=(result_->>'created')::int=1;
   RAISE EXCEPTION USING ERRCODE='P7777',MESSAGE='ROLLBACK_MANUAL_FIXTURE';
  EXCEPTION WHEN SQLSTATE 'P7777' THEN NULL; END;
  ASSERT manual_ok_,'Planner manual adjustment must remain possible';
  proposal_:=jsonb_build_array(
    jsonb_build_object('employee_id',employee_a,'shift_code',model_.week1,'starts_at',(date '2027-05-27'+model_.start1) AT TIME ZONE 'Europe/Berlin','ends_at',(date '2027-05-27'+model_.end1) AT TIME ZONE 'Europe/Berlin','legacy_id','qa-'||employee_a),
    jsonb_build_object('employee_id',employee_b,'shift_code',model_.week2,'starts_at',(date '2027-05-27'+model_.start2) AT TIME ZONE 'Europe/Berlin','ends_at',(date '2027-05-27'+model_.end2) AT TIME ZONE 'Europe/Berlin','legacy_id','qa-'||employee_b),
    jsonb_build_object('employee_id',employee_c,'shift_code',model_.special,'starts_at',(date '2027-05-27'+model_.special_start) AT TIME ZONE 'Europe/Berlin','ends_at',(date '2027-05-27'+model_.special_end) AT TIME ZONE 'Europe/Berlin','legacy_id','qa-'||employee_c));
  result_:=public.apply_planning_period(company_,'2027-05-01',1,preview_->>'fingerprint',ARRAY[]::uuid[],proposal_,true);
  ASSERT (result_->>'created')::int=3,'Three shared day positions applied';
  slot_:=private.sf_open_market_slot(company_,'2027-05-27',model_.special);
  ASSERT (slot_->>'missing')::int=0,'Market reflects all three shift types';
  ASSERT (private.sf_open_market_slot(company_,'2027-05-27',model_.week1)->>'missing')::int=0,'Other alternative shares the same filled capacity';
  ASSERT private.sf_open_market_candidate(offer_,employee_c)='Der Bedarf wurde inzwischen vollständig besetzt','Shared capacity must be the reason for blocking';
  PERFORM set_config('request.jwt.claim.sub',user_c::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_c,'role','authenticated','aal','aal1')::text,true);
  blocked_:=false;BEGIN PERFORM public.employee_claim_open_shift(offer_);EXCEPTION WHEN OTHERS THEN blocked_:=true;END;
  ASSERT blocked_,'Filled shared position cannot be claimed';
  PERFORM set_config('request.jwt.claim.sub',owner_::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_,'role','authenticated','aal','aal2')::text,true);
 END LOOP;
END $test$;
