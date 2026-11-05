-- Draft: company-scoped disruption list; legacy calls reject ambiguous accounts.
-- Requires employee-company-identity-candidate.sql. Not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_for_company_impl(p_company_id uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_company uuid; v_count integer;
begin
 select count(*),min(company_id::text)::uuid into v_count,v_company from private.sf_employee_company_options();
 if v_count<>1 then raise exception 'Bitte das Unternehmen für den Mitarbeiterzugang auswählen' using errcode='42501'; end if;
 return query select * from private.employee_list_disruption_offers_for_company_impl(v_company);
end $function$;
CREATE OR REPLACE FUNCTION public.employee_list_disruption_offers_for_company(p_company_id uuid)
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text) LANGUAGE sql SET search_path TO '' AS $function$
 select * from private.employee_list_disruption_offers_for_company_impl(p_company_id)
$function$;
revoke all on function private.employee_list_disruption_offers_for_company_impl(uuid) from public,anon;
revoke all on function public.employee_list_disruption_offers_for_company(uuid) from public,anon;
grant execute on function private.employee_list_disruption_offers_for_company_impl(uuid) to authenticated;
grant execute on function public.employee_list_disruption_offers_for_company(uuid) to authenticated;
