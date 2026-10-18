CREATE OR REPLACE FUNCTION private.sf_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id FROM public.employees e
 WHERE e.auth_user_id=(SELECT auth.uid()) AND e.status='active'
   AND e.access_status='ACTIVE' AND e.deleted_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=e.company_id
     AND m.user_id=(SELECT auth.uid()) AND (m.status<>'ACTIVE'
       OR m.role IN ('VIEWER','TIME_TRACKING') OR 'read_only'=ANY(m.extra_permissions)))
 ORDER BY e.id LIMIT 1;
$$;