-- Candidate only. Do not apply until company-scoped portal/RLS replacements
-- and the complete multi-company release have been verified together.
-- A legacy call with no company context may resolve only one active identity.
-- With multiple identities it returns NULL instead of selecting one arbitrarily.
CREATE OR REPLACE FUNCTION private.sf_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(e.id))[1] ELSE NULL::uuid END
  FROM public.employees e
  WHERE e.auth_user_id = (SELECT auth.uid())
    AND e.status = 'active'
    AND e.access_status = 'ACTIVE'
    AND e.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = e.company_id
        AND m.user_id = (SELECT auth.uid())
        AND (m.status <> 'ACTIVE'
          OR m.role IN ('VIEWER', 'TIME_TRACKING')
          OR 'read_only' = ANY(m.extra_permissions))
    );
$function$;
