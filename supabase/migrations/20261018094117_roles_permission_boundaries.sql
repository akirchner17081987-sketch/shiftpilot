-- Active employee identity is shared by legacy portal RPCs and direct row policies.
CREATE OR REPLACE FUNCTION private.sf_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id FROM public.employees e
 WHERE e.auth_user_id=(SELECT auth.uid()) AND e.status='active'
   AND e.access_status='ACTIVE' AND e.deleted_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=e.company_id
     AND m.user_id=(SELECT auth.uid()) AND m.status<>'ACTIVE')
 ORDER BY e.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.sf_employee_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_id() TO authenticated;

CREATE OR REPLACE FUNCTION private.sf_require_active_employee_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.sf_employee_id() IS NULL THEN
  RAISE EXCEPTION 'Kein aktiver Mitarbeiterzugang gefunden' USING ERRCODE='42501';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.sf_require_active_employee_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_require_active_employee_access() TO authenticated;

-- Intersect all older permissive policies; do not grant any new row access.
CREATE POLICY sf_employee_active_read ON public.employees AS RESTRICTIVE FOR SELECT TO authenticated
 USING(private.sf_is_manager(company_id,false) OR id=(SELECT private.sf_employee_id()));
CREATE POLICY sf_assignment_active_read ON public.shift_assignments AS RESTRICTIVE FOR SELECT TO authenticated
 USING(private.sf_is_manager(company_id,false) OR employee_id=(SELECT private.sf_employee_id()));
CREATE POLICY sf_time_capability_read ON public.time_entries AS RESTRICTIVE FOR SELECT TO authenticated
 USING(private.sf_can_manage_time(company_id) OR EXISTS(
  SELECT 1 FROM public.shift_assignments sa WHERE sa.id=time_entries.assignment_id
   AND sa.company_id=time_entries.company_id AND sa.employee_id=(SELECT private.sf_employee_id())));
CREATE POLICY sf_opening_capability_read ON public.time_account_openings AS RESTRICTIVE FOR SELECT TO authenticated
 USING(private.sf_can_manage_time(company_id));

-- Preserve original function bodies, signatures, grants and audit behavior.
-- A strict allowlist and recognizable top-level BEGIN prevent silent patch drift.
DO $$ DECLARE item record;definition text;changed text;guard_ text;seen integer:=0;
BEGIN
 FOR item IN SELECT p.oid,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang WHERE l.lanname='plpgsql' AND (
 (n.nspname='private' AND p.proname=ANY(ARRAY[
 'employee_cancel_shift_swap_impl','employee_claim_shift_marketplace_impl','employee_create_shift_swap_impl',
 'employee_list_disruption_offers_impl','employee_list_shift_marketplace_impl','employee_list_shift_swap_candidates_impl',
 'employee_list_shift_swaps_impl','employee_offer_shift_marketplace_impl','employee_respond_disruption_offer_impl','employee_respond_shift_swap_impl',
 'manager_monthly_time_accounts_impl','manager_set_time_account_opening_impl','manager_set_time_account_target_method_impl',
 'manager_update_time_account_settings_impl','manager_update_time_account_settings_v2_impl'])) OR
 (n.nspname='public' AND p.proname=ANY(ARRAY['employee_respond_to_shift_change','manager_monthly_time_accounts','manager_time_month_status',
 'manager_set_time_account_opening','manager_update_time_account_settings','manager_update_time_account_settings_v2'])))
 LOOP
  seen:=seen+1;definition:=pg_get_functiondef(item.oid);
  IF item.proname LIKE 'employee_%' THEN
   guard_:='PERFORM private.sf_require_active_employee_access();';
  ELSIF item.proname IN ('manager_monthly_time_accounts','manager_monthly_time_accounts_impl','manager_time_month_status') THEN
   guard_:='IF NOT private.sf_can_manage_time(p_company_id) THEN RAISE EXCEPTION ''Zeitberechtigung fehlt'' USING ERRCODE=''42501''; END IF;';
  ELSE
   guard_:=format('PERFORM private.sf_assert_aal2(%L);',item.proname);
  END IF;
  IF strpos(definition,guard_)>0 THEN CONTINUE; END IF;
  changed:=regexp_replace(definition,E'(\n[ \t]*begin[ \t]*\n)',E'\\1  '||guard_||E'\n','i');
  IF changed=definition THEN RAISE EXCEPTION 'Unrecognized function body: %.%',item.nspname,item.proname; END IF;
  EXECUTE changed;
 END LOOP;
 IF seen<>21 THEN RAISE EXCEPTION 'Expected 21 guarded functions, found %',seen; END IF;
END $$;
NOTIFY pgrst,'reload schema';
