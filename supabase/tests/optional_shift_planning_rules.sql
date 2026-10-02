-- Run as database administrator. All fixtures and audit records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT cm.user_id::text FROM public.company_members cm JOIN public.companies c ON c.id=cm.company_id WHERE c.name='SchichtFunk' AND cm.role='OWNER' AND cm.status='ACTIVE' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE co record; fl uuid; other uuid; foreign_fl uuid; result jsonb; payload jsonb; message text;
BEGIN
 FOR co IN SELECT id,name FROM public.companies WHERE name IN ('SchichtFunk','Secontec Services - 8h') LOOP
  SELECT id INTO STRICT fl FROM public.employees WHERE company_id=co.id AND first_name='Florian' AND last_name='Weiß' AND status='active' AND deleted_at IS NULL;
  SELECT id INTO other FROM public.employees WHERE company_id=co.id AND id<>fl AND status='active' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO foreign_fl FROM public.employees WHERE company_id<>co.id AND first_name='Florian' AND last_name='Weiß' AND deleted_at IS NULL LIMIT 1;
  payload:=jsonb_build_object('code','QARULETEST','name','Rollback QA rule test','start','20:00','end','06:00','soll',1,'color','teal','planning_mode','optional','optional_staffing',1,'responsible_only',true,'responsible_employee_id',fl,'optional_weekdays',jsonb_build_array(1,2,3,4,5,6,7));
  result:=public.manager_manage_shift_model(co.id,'CREATE',payload);
  IF result->>'soll'<>'0' OR result->'model'->>'responsible_employee_id'<>fl::text THEN RAISE EXCEPTION 'Optional model save failed'; END IF;
  -- Old clients updating only base fields must retain planning rules.
  result:=public.manager_manage_shift_model(co.id,'UPDATE',jsonb_build_object('code','QARULETEST','name','Rollback QA rule test','start','20:00','end','06:00','soll',2,'color','teal'));
  IF result->>'soll'<>'0' OR result->'model'->>'planning_mode'<>'optional' OR result->'model'->>'responsible_employee_id'<>fl::text THEN RAISE EXCEPTION 'Legacy payload erased planning rules'; END IF;
  BEGIN
   PERFORM public.manager_manage_shift_model(co.id,'UPDATE',payload||jsonb_build_object('responsible_employee_id',foreign_fl));
   RAISE EXCEPTION 'Cross-company responsibility accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.global_staffing_requirements SET required_count=8 WHERE company_id=co.id AND shift_code='QARULETEST';
  IF EXISTS(SELECT 1 FROM public.global_staffing_requirements WHERE company_id=co.id AND shift_code='QARULETEST' AND required_count<>0) THEN RAISE EXCEPTION 'Stale client made optional shift mandatory'; END IF;
  BEGIN
   INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co.id,other,'QARULETEST','2099-01-01 20:00 Europe/Berlin','2099-01-02 06:00 Europe/Berlin');
   RAISE EXCEPTION 'Exclusive responsibility accepted wrong employee';
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%zuständigen Mitarbeiter%' THEN RAISE; END IF; END;
  INSERT INTO public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at) VALUES(co.id,fl,'QARULETEST','2099-01-01 20:00 Europe/Berlin','2099-01-02 06:00 Europe/Berlin');
 END LOOP;
END $$;
RESET ROLE;
DO $$
DECLARE co record; ctx jsonb;
BEGIN
 FOR co IN SELECT id FROM public.companies WHERE name IN ('SchichtFunk','Secontec Services - 8h') LOOP
  ctx:=private.sf_open_market_slot(co.id,'2099-01-03','QARULETEST');
  IF ctx->>'missing'<>'0' THEN RAISE EXCEPTION 'Optional shift leaked into mandatory marketplace'; END IF;
  INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count) VALUES(co.id,'2099-01-03','QARULETEST',1);
  ctx:=private.sf_open_market_slot(co.id,'2099-01-03','QARULETEST');
  IF ctx->>'missing'<>'1' THEN RAISE EXCEPTION 'Daily required override did not create demand'; END IF;
 END LOOP;
END $$;
ROLLBACK;
