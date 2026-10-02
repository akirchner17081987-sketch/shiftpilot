-- Regular shift weekdays also govern mandatory staffing. Explicit daily overrides remain available for individual exceptions.
CREATE OR REPLACE FUNCTION private.sf_open_market_slot(p_company uuid, p_date date, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.shift_templates%rowtype; tz text; target integer; filled integer; st timestamptz; en timestamptz;
BEGIN
 SELECT * INTO t FROM public.shift_templates WHERE company_id=p_company AND code=p_code AND active;
 IF t.id IS NULL THEN RETURN jsonb_build_object('missing',0); END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
 st:=(p_date+t.default_start) AT TIME ZONE tz;
 en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
 SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=p_company AND work_date=p_date AND shift_code=p_code),
 CASE WHEN t.planning_mode='optional' OR NOT (extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays)) THEN 0 ELSE (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=p_company AND shift_code=p_code) END,0) INTO target;
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
END $function$;
