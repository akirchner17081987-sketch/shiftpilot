-- Run only in a transaction that is rolled back after the configuration draft.
DO $test$
DECLARE item_ record; company_ uuid; actor_ uuid; snapshot_ jsonb; rule_ jsonb;
BEGIN
 FOR item_ IN SELECT * FROM (VALUES
  ('Secontec Services',ARRAY['OT1','OT2','OT3']::text[],ARRAY['OT']::text[]),
  ('Secontec Services - 8h',ARRAY['FD']::text[],ARRAY['FD-WE']::text[]),
  ('Secontec Services - 9h',ARRAY['OT']::text[],ARRAY['OT-WE']::text[])
 ) x(name,week_codes,special_codes) LOOP
  SELECT id INTO STRICT company_ FROM public.companies WHERE name=item_.name;
  SELECT user_id INTO STRICT actor_ FROM public.company_members
    WHERE company_id=company_ AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER') AND status='ACTIVE'
    ORDER BY CASE WHEN role='OWNER' THEN 0 ELSE 1 END,user_id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor_::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_,'role','authenticated','aal','aal2')::text,true);
  SELECT solid_planning_rules->'regionalDayStaffing' INTO rule_ FROM public.company_compliance_policy WHERE company_id=company_;
  ASSERT (rule_->>'target')::int=3,'Shared day target';
  ASSERT NOT EXISTS(SELECT 1 FROM public.shift_templates t WHERE t.company_id=company_ AND t.active
    AND t.code=ANY(CASE WHEN item_.name='Secontec Services' THEN ARRAY['TL-LE','TL-RE'] ELSE ARRAY['TL'] END)
    AND (t.default_start<>'22:00'::time OR t.default_end<>'06:00'::time)), 'TL time';
  snapshot_:=private.sf_autonomy_snapshot_before_continuity(company_,'2027-05-01',1,gen_random_uuid(),0);
  ASSERT jsonb_array_length(snapshot_->'types')>0,'Actual models loaded';
  IF EXISTS(
   SELECT 1 FROM jsonb_array_elements(snapshot_->'candidates') x
   JOIN public.employees e ON e.company_id=company_ AND coalesce(e.legacy_id,e.id::text)=x->>'employeeId'
   WHERE (x->>'type')=ANY(item_.week_codes||item_.special_codes)
    AND private.sf_regional_day_allowed(company_,e.id,(x->>'date')::date,x->>'type') IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Invalid regional candidate in %',item_.name; END IF;
 END LOOP;
END; $test$;
