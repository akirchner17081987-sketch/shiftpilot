CREATE OR REPLACE FUNCTION private.sf_employee_planning_rules(company_ uuid, employee_ uuid, rules_ jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees; target_ numeric; explicit_week_ numeric; result_ jsonb:=rules_; pair_ record;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RETURN rules_; END IF;
 IF e_.role='Teamleiter' AND rules_->'teamLeaderMaxConsecutiveNightShifts' IS NOT NULL THEN
  RETURN rules_||jsonb_build_object('maxConsecutiveNightShifts',rules_->'teamLeaderMaxConsecutiveNightShifts');
 END IF;
 target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
 IF NOT coalesce((e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180 AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[]),false) THEN RETURN rules_; END IF;
 FOR pair_ IN SELECT * FROM (VALUES
 ('otOnlyMaxConsecutiveShifts','maxConsecutiveShifts'),('otOnlyMaxCalendarWeekHours','maxCalendarWeekHours'),
 ('otOnlyMinFreeCalendarDays','minFreeCalendarDays'),('otOnlyMinBlockRestHours','minBlockRestHours')) keys(source,target) LOOP
  IF rules_->pair_.source IS NOT NULL AND rules_->pair_.source<>'null'::jsonb THEN result_:=jsonb_set(result_,ARRAY[pair_.target],rules_->pair_.source); END IF;
 END LOOP;
 IF rules_->>'otOnlyMaxCalendarWeekHours' IS NOT NULL THEN
  explicit_week_:=nullif(private.sf_month_meta(e_.qualifications,'maxWeekly'),'')::numeric;
  result_:=result_||jsonb_build_object('_otDayWeeklyLimit',least((rules_->>'otOnlyMaxCalendarWeekHours')::numeric,CASE WHEN explicit_week_>0 THEN explicit_week_ ELSE (rules_->>'otOnlyMaxCalendarWeekHours')::numeric END));
 END IF;
 RETURN result_;
END $function$

