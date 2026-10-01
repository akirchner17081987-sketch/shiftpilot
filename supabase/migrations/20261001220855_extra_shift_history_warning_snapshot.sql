DO $$
DECLARE def text;
BEGIN
 def:=pg_get_functiondef('private.sf_open_market_api(text,uuid,jsonb)'::regprocedure);
 IF position('   SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id;' in def)=0 THEN RAISE EXCEPTION 'History warning anchor missing'; END IF;
 def:=replace(def,
 '   SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id;
   warning:=private.sf_open_market_extra_warning(o.id,cl.employee_id);',
 '   SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id;
   warning:=CASE WHEN cl.status=''PENDING_MANAGER'' THEN private.sf_open_market_extra_warning(o.id,cl.employee_id) ELSE coalesce(cl.rhythm_warning,'''') END;');
 EXECUTE def;
END $$;