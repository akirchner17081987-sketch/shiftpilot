-- Test demand for required weekday models in both companies; roll back every change.
BEGIN;
DO $$
DECLARE model record; ctx jsonb; tested integer:=0;
BEGIN
 FOR model IN SELECT t.* FROM public.shift_templates t JOIN public.companies c ON c.id=t.company_id WHERE c.name IN ('SchichtFunk','Secontec Services - 8h') AND t.code IN ('OT1','OT2','OT3') LOOP
  UPDATE public.shift_templates SET active=true,optional_weekdays=ARRAY[1,2,3,4,5] WHERE id=model.id;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count) VALUES(model.company_id,model.code,4) ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=4;
  ctx:=private.sf_open_market_slot(model.company_id,'2099-01-02',model.code);
  IF ctx->>'target'<>'4' THEN RAISE EXCEPTION 'Friday standard demand missing'; END IF;
  ctx:=private.sf_open_market_slot(model.company_id,'2099-01-03',model.code);
  IF ctx->>'target'<>'0' OR ctx->>'missing'<>'0' THEN RAISE EXCEPTION 'Saturday generated regular demand'; END IF;
  ctx:=private.sf_open_market_slot(model.company_id,'2099-01-04',model.code);
  IF ctx->>'target'<>'0' OR ctx->>'missing'<>'0' THEN RAISE EXCEPTION 'Sunday generated regular demand'; END IF;
  INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count) VALUES(model.company_id,'2099-01-03',model.code,2) ON CONFLICT(company_id,work_date,shift_code) DO UPDATE SET required_count=2;
  ctx:=private.sf_open_market_slot(model.company_id,'2099-01-03',model.code);
  IF ctx->>'target'<>'2' THEN RAISE EXCEPTION 'Deliberate daily exception not honored'; END IF;
  tested:=tested+1;
 END LOOP;
 IF tested<>6 THEN RAISE EXCEPTION 'Expected all three models in both companies, tested %',tested; END IF;
END $$;
ROLLBACK;
