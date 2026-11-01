-- Opt-in primitives for the shared regional day-service rule.
-- No company settings are changed by this migration.
CREATE OR REPLACE FUNCTION private.sf_regional_day_allowed(
  company_ uuid, employee_ uuid, day_ date, code_ text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE rule_ jsonb; site_ text; state_ text; special_ boolean;
BEGIN
  SELECT solid_planning_rules->'regionalDayStaffing' INTO rule_
    FROM public.company_compliance_policy WHERE company_id=company_;
  IF rule_ IS NULL THEN RETURN NULL; END IF;
  IF NOT (coalesce(rule_->'weekdayCodes','[]'::jsonb) ? code_
       OR coalesce(rule_->'specialCodes','[]'::jsonb) ? code_) THEN RETURN NULL; END IF;
  SELECT substring(q FROM 11) INTO site_
    FROM public.employees e CROSS JOIN LATERAL unnest(e.qualifications) q
    WHERE e.company_id=company_ AND e.id=employee_ AND left(q,10)='__sp:team='
    LIMIT 1;
  SELECT value INTO state_ FROM jsonb_each_text(coalesce(rule_->'statesBySite','{}'::jsonb))
    WHERE lower(trim(key))=lower(trim(site_)) LIMIT 1;
  IF state_ IS NULL THEN RETURN false; END IF;
  special_:=extract(isodow FROM day_)::int IN (6,7)
    OR EXISTS(SELECT 1 FROM private.sf_public_holidays(extract(year FROM day_)::int,state_) h WHERE h.holiday_date=day_);
  RETURN CASE WHEN special_ THEN coalesce(rule_->'specialCodes','[]'::jsonb) ? code_
              ELSE coalesce(rule_->'weekdayCodes','[]'::jsonb) ? code_ END;
END $function$;
REVOKE ALL ON FUNCTION private.sf_regional_day_allowed(uuid,uuid,date,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sf_regional_day_filled(company_ uuid, day_ date)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
  SELECT count(DISTINCT a.employee_id)::integer
  FROM public.company_compliance_policy p
  JOIN public.companies c ON c.id=p.company_id
  JOIN public.shift_assignments a ON a.company_id=p.company_id
  WHERE p.company_id=company_ AND p.solid_planning_rules ? 'regionalDayStaffing'
    AND a.status<>'CANCELLED' AND (a.starts_at AT TIME ZONE c.timezone)::date=day_
    AND (coalesce(p.solid_planning_rules->'regionalDayStaffing'->'weekdayCodes','[]'::jsonb) ? a.shift_code
      OR coalesce(p.solid_planning_rules->'regionalDayStaffing'->'specialCodes','[]'::jsonb) ? a.shift_code)
$function$;
REVOKE ALL ON FUNCTION private.sf_regional_day_filled(uuid,date) FROM PUBLIC,anon,authenticated;
