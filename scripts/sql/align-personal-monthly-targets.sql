-- Administrative alignment for companies that already plan by personal monthly hours.
-- Existing personal-method dates, closed months and unrelated companies are preserved.
WITH candidates AS MATERIALIZED (
  SELECT s.company_id, to_jsonb(s) AS previous_settings,
    greatest(date_trunc('month', now() AT TIME ZONE 'Europe/Berlin')::date,
      (SELECT (max(c.month_start) + interval '1 month')::date
       FROM public.time_month_closures c
       WHERE c.company_id=s.company_id AND c.status='CLOSED')) AS effective_month
  FROM public.time_account_settings s
  JOIN public.company_compliance_policy p ON p.company_id=s.company_id
  WHERE s.target_method='WEEKDAYS_5'
    AND p.solid_planning_rules->>'monthlyHoursOnly'='true'
  FOR UPDATE OF s
), updated AS (
  UPDATE public.time_account_settings s
  SET target_method='PERSONAL_MONTHLY',target_method_from=c.effective_month,
      updated_at=now(),updated_by=NULL
  FROM candidates c WHERE c.company_id=s.company_id
  RETURNING s.company_id,to_jsonb(s) AS new_settings,c.previous_settings,c.effective_month
), logged AS (
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,
    actor_id,actor_role,old_values,new_values,metadata)
  SELECT company_id,'TIME_ACCOUNT_TARGET_METHOD_UPDATED','company',company_id,
    NULL,'SYSTEM',previous_settings,new_settings,
    jsonb_build_object('source','personal-review-20261027','effectiveMonth',effective_month)
  FROM updated RETURNING company_id
)
SELECT c.name,u.effective_month FROM updated u
JOIN public.companies c ON c.id=u.company_id
JOIN logged l ON l.company_id=u.company_id;
