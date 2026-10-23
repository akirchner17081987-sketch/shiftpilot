CREATE OR REPLACE FUNCTION private.sf_ot_day(company_ uuid, day_ date, employee_ uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $body$
DECLARE mapping_ jsonb;state_ text;site_ text;daily_minimum_ int;
BEGIN
 IF day_ IS NULL THEN RETURN false; END IF;
 SELECT nullif(solid_planning_rules->>'otDailyMinimumStaffing','')::int,
        solid_planning_rules->'otHolidayStatesBySite'
 INTO daily_minimum_,mapping_
 FROM public.company_compliance_policy WHERE company_id=company_;
 IF coalesce(daily_minimum_,0)>0 THEN RETURN true; END IF;
 IF extract(isodow FROM day_)>5 THEN RETURN true; END IF;
 IF mapping_ IS NULL THEN
  RETURN EXISTS(SELECT 1 FROM private.sf_public_holidays(extract(year FROM day_)::int,'BE') h WHERE h.holiday_date=day_);
 END IF;
 IF employee_ IS NULL THEN
  RETURN EXISTS(SELECT 1 FROM jsonb_each_text(mapping_) x CROSS JOIN LATERAL private.sf_public_holidays(extract(year FROM day_)::int,x.value) h WHERE h.holiday_date=day_);
 END IF;
 SELECT private.sf_month_meta(e.qualifications,'team') INTO site_ FROM public.employees e WHERE e.company_id=company_ AND e.id=employee_;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT value INTO state_ FROM jsonb_each_text(mapping_) WHERE lower(trim(key))=lower(trim(site_)) LIMIT 1;
 RETURN EXISTS(SELECT 1 FROM private.sf_public_holidays(extract(year FROM day_)::int,coalesce(state_,'DE')) h WHERE h.holiday_date=day_);
END $body$;
REVOKE ALL ON FUNCTION private.sf_ot_day(uuid,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_ot_day(uuid,date,uuid) TO authenticated,service_role;
UPDATE public.company_compliance_policy p SET
 solid_planning_rules=jsonb_set(
   jsonb_set(p.solid_planning_rules,'{otDailyMinimumStaffing}','2'::jsonb,true),
   '{criticalShifts}',
   coalesce(p.solid_planning_rules->'criticalShifts','[]'::jsonb)||
   '[{"code":"OT","minimum":3,"weekdays":[6,7]}]'::jsonb,true),
 updated_at=now()
FROM public.companies c
WHERE c.id=p.company_id AND c.name='Secontec Services - 9h'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.solid_planning_rules->'criticalShifts','[]'::jsonb)) r
 WHERE r->>'code'='OT' AND (r->>'minimum')::int>=3
 AND coalesce(r->'weekdays','[1,2,3,4,5,6,7]'::jsonb) @> '[6,7]'::jsonb);
UPDATE public.company_compliance_policy p SET
 solid_planning_rules=jsonb_set(p.solid_planning_rules,'{otDailyMinimumStaffing}','2'::jsonb,true),
 updated_at=now()
FROM public.companies c WHERE c.id=p.company_id AND c.name='Secontec Services - 9h'
 AND NOT (p.solid_planning_rules ? 'otDailyMinimumStaffing');
UPDATE public.global_staffing_requirements g SET required_count=2,updated_at=now()
FROM public.companies c WHERE c.id=g.company_id AND c.name='Secontec Services - 9h' AND g.shift_code='OT';
INSERT INTO public.daily_staffing_overrides(company_id,work_date,shift_code,required_count)
SELECT c.id,'2027-01-01'::date,'OT',3 FROM public.companies c
WHERE c.name='Secontec Services - 9h'
ON CONFLICT(company_id,work_date,shift_code) DO UPDATE SET required_count=greatest(public.daily_staffing_overrides.required_count,excluded.required_count);
UPDATE public.company_compliance_policy p SET solid_planning_rules=jsonb_set(p.solid_planning_rules,'{otDailyPreferredBlockLength}','5'::jsonb,true),updated_at=now() FROM public.companies c WHERE c.id=p.company_id AND c.name='Secontec Services - 9h';
NOTIFY pgrst,'reload schema';