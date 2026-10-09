CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits(company_ uuid, employee_ uuid, month_ date, exclude_ uuid DEFAULT NULL::uuid, start_ timestamp with time zone DEFAULT NULL::timestamp with time zone, end_ timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE policy_ public.company_compliance_policy; e_ public.employees; tz_ text; a_ timestamptz; b_ timestamptz;
 hours_ numeric; calendar_ numeric; count_ integer; target_ numeric; limit_ numeric; rows_ jsonb;eight_ boolean;err_ text;
BEGIN
 SELECT * INTO policy_ FROM public.company_compliance_policy WHERE company_id=company_;

 IF coalesce((policy_.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2 AND coalesce((policy_.solid_planning_rules->>'enabled')::boolean,false) THEN
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
  a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
  target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
  SELECT count(*)>0 AND bool_and(extract(epoch FROM(t.default_end-t.default_start+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END))/3600<=8) INTO eight_
   FROM public.shift_templates t WHERE t.company_id=company_ AND t.active AND t.code=ANY(e_.shift_permissions);
  WITH duties AS (
   SELECT a.starts_at,a.ends_at,EXISTS(SELECT 1 FROM public.open_shift_market_claims c WHERE c.assignment_id=a.id AND c.employee_id=employee_ AND c.company_id=company_ AND c.status='APPLIED') market_approved
    FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND a.id IS DISTINCT FROM exclude_ AND a.starts_at<b_ AND a.ends_at>a_
   UNION ALL SELECT start_,end_,false WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
  ) SELECT coalesce(jsonb_agg(to_jsonb(duties)),'[]') INTO rows_ FROM duties;
  err_:=private.sf_confirmed_month_error(rows_,month_,tz_,(e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180),target_,eight_,start_ IS NOT NULL);
  IF err_ IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=err_;END IF;
  RETURN;
 END IF;
 IF policy_.monthly_planning_max_hours IS NULL AND policy_.monthly_planning_max_shifts IS NULL THEN RETURN; END IF;
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;
 b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 SELECT coalesce((SELECT nullif(substr(q,19),'')::numeric FROM unnest(e_.qualifications) q WHERE q LIKE '__sp:monthlyHours=%' LIMIT 1),e_.weekly_hours*4.348) INTO target_;
 limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
  THEN coalesce(policy_.monthly_planning_max_hours,220) ELSE least(coalesce(policy_.monthly_planning_max_hours,180),target_) END;
 WITH duties AS (
  SELECT starts_at s,ends_at e FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_
   AND status<>'CANCELLED' AND id IS DISTINCT FROM exclude_ AND starts_at<b_ AND ends_at>a_
  UNION ALL SELECT start_,end_ WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
 ) SELECT count(*) FILTER(WHERE s>=a_),coalesce(sum(extract(epoch FROM e-s)/3600) FILTER(WHERE s>=a_),0),
   coalesce(sum(extract(epoch FROM least(e,b_)-greatest(s,a_))/3600),0) INTO count_,hours_,calendar_ FROM duties;
 IF policy_.monthly_planning_max_shifts IS NOT NULL AND count_>policy_.monthly_planning_max_shifts THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Maximal %s Schichten pro Monat (Personalnummer %s).',policy_.monthly_planning_max_shifts,e_.personnel_no);
 END IF;
 IF hours_>limit_+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden überschritten (Personalnummer %s).',limit_,e_.personnel_no);
 END IF;
 IF policy_.monthly_planning_max_hours IS NOT NULL AND calendar_>policy_.monthly_planning_max_hours+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten (Personalnummer %s).',policy_.monthly_planning_max_hours,e_.personnel_no);
 END IF;
END $function$

