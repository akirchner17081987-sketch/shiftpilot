CREATE OR REPLACE FUNCTION private.manager_link_existing_staff_profile(p_company uuid,p_user uuid,p_employee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor text; member_role text; mail text; person public.employees%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR private.sf_request_aal() IS DISTINCT FROM 'aal2' OR private.can_manage_company_users(p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,7041));
 SELECT m.role INTO actor FROM public.company_members m WHERE m.company_id=p_company AND m.user_id=auth.uid() AND m.status='ACTIVE';
 SELECT m.access_role,lower(trim(u.email)) INTO member_role,mail FROM public.company_members m JOIN auth.users u ON u.id=m.user_id WHERE m.company_id=p_company AND m.user_id=p_user AND m.status='ACTIVE' AND u.email_confirmed_at IS NOT NULL FOR UPDATE OF m;
 IF member_role IS DISTINCT FROM 'TEAM_LEAD' OR mail IS NULL OR mail='' OR p_user=auth.uid() THEN RAISE EXCEPTION 'Zugang nicht verfügbar' USING ERRCODE='42501'; END IF;
 SELECT * INTO person FROM public.employees e WHERE e.id=p_employee AND e.company_id=p_company AND e.deleted_at IS NULL AND e.status='active' FOR UPDATE;
 IF NOT FOUND OR person.auth_user_id IS NOT NULL OR person.access_status<>'NONE' OR lower(trim(coalesce(person.email,'')))<>mail
 OR EXISTS(SELECT 1 FROM public.employees e WHERE e.company_id=p_company AND e.auth_user_id=p_user AND e.deleted_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.employee_access_invites i WHERE i.employee_id=p_employee AND i.claimed_at IS NULL AND i.expires_at>now())
 OR EXISTS(SELECT 1 FROM public.company_member_invites i WHERE i.employee_id=p_employee AND i.status='INVITED' AND i.expires_at>now())
 THEN RAISE EXCEPTION 'Profil nicht verfügbar oder E-Mail stimmt nicht mit dem bestätigten Zugang überein' USING ERRCODE='42501'; END IF;
 UPDATE public.employees SET auth_user_id=p_user,access_status='ACTIVE',access_linked_at=now(),updated_at=now() WHERE id=p_employee;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
 VALUES(p_company,'EMPLOYEE_PROFILE_LINKED','employee',p_employee,auth.uid(),actor,jsonb_build_object('linked',false),jsonb_build_object('linked',true,'user_id',p_user));
END $fn$;
CREATE OR REPLACE FUNCTION public.manager_link_existing_staff_profile(p_company uuid,p_user uuid,p_employee uuid) RETURNS void LANGUAGE sql SET search_path='' AS $fn$ SELECT private.manager_link_existing_staff_profile(p_company,p_user,p_employee) $fn$;
REVOKE ALL ON FUNCTION private.manager_link_existing_staff_profile(uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.manager_link_existing_staff_profile(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.manager_link_existing_staff_profile(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_link_existing_staff_profile(uuid,uuid,uuid) TO authenticated;
