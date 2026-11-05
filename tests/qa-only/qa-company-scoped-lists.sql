-- QA ONLY: company-scoped lists, derived from the existing implementation.
CREATE OR REPLACE FUNCTION private.qa_employee_list_disruption_offers_scoped_impl(p_company uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees e where e.id=private.qa_employee_identity(p_company);
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,d.id,a.shift_code,a.starts_at,a.ends_at,d.incident_type,d.note,x.expires_at,x.employee_comment
  from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id join public.shift_assignments a on a.id=d.assignment_id
  where x.employee_id=v_employee.id and x.company_id=v_employee.company_id order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
revoke all on function private.qa_employee_list_disruption_offers_scoped_impl(uuid) from public,anon;
grant execute on function private.qa_employee_list_disruption_offers_scoped_impl(uuid) to authenticated;
CREATE OR REPLACE FUNCTION private.qa_employee_list_shift_marketplace_scoped_impl(p_company uuid)
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp from public.employees e where e.id=private.qa_employee_identity(p_company);
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query
  select s.id,s.original_employee_id=v_emp.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,
    trim(o.first_name||' '||o.last_name),o.role,s.reason,s.requested_at,
    (s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id and private.sf_swap_candidate_reason(a.id,v_emp.id) is null),
    case when s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id then private.sf_swap_candidate_reason(a.id,v_emp.id) else null end
  from public.shift_swap_requests s
  join public.shift_assignments a on a.id=s.assignment_id
  join public.employees o on o.id=s.original_employee_id
  where s.company_id=v_emp.company_id
    and (s.status='MARKET_OPEN' or s.original_employee_id=v_emp.id or s.target_employee_id=v_emp.id)
  order by case when s.status='MARKET_OPEN' then 0 else 1 end,s.requested_at desc
  limit 100;
end $function$
;
revoke all on function private.qa_employee_list_shift_marketplace_scoped_impl(uuid) from public,anon;
grant execute on function private.qa_employee_list_shift_marketplace_scoped_impl(uuid) to authenticated;
CREATE OR REPLACE FUNCTION private.qa_employee_list_shift_swaps_scoped_impl(p_company uuid)
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  v_employee_id:=private.qa_employee_identity(p_company);
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  return query
  select s.id,
         case when s.original_employee_id=v_employee_id then 'OUTGOING' else 'INCOMING' end,
         s.status,
         s.assignment_id,
         a.shift_code,
         a.starts_at,
         a.ends_at,
         trim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,'')),
         s.reason,s.colleague_comment,s.manager_comment,s.requested_at
  from public.shift_swap_requests s
  left join public.shift_assignments a on a.id=s.assignment_id
  join public.employees orig on orig.id=s.original_employee_id
  join public.employees targ on targ.id=s.target_employee_id
  join public.employees o on o.id=case when s.original_employee_id=v_employee_id then s.target_employee_id else s.original_employee_id end
  where s.company_id=p_company and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
$function$
;
revoke all on function private.qa_employee_list_shift_swaps_scoped_impl(uuid) from public,anon;
grant execute on function private.qa_employee_list_shift_swaps_scoped_impl(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.qa_employee_list_disruption_offers_scoped(p_company uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$select * from private.qa_employee_list_disruption_offers_scoped_impl(p_company)$function$
;
revoke all on function public.qa_employee_list_disruption_offers_scoped(uuid) from public,anon;
grant execute on function public.qa_employee_list_disruption_offers_scoped(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.qa_employee_list_shift_marketplace_scoped(p_company uuid)
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$select * from private.qa_employee_list_shift_marketplace_scoped_impl(p_company)$function$
;
revoke all on function public.qa_employee_list_shift_marketplace_scoped(uuid) from public,anon;
grant execute on function public.qa_employee_list_shift_marketplace_scoped(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.qa_employee_list_shift_swaps_scoped(p_company uuid)
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select * from private.qa_employee_list_shift_swaps_scoped_impl(p_company) $function$
;
revoke all on function public.qa_employee_list_shift_swaps_scoped(uuid) from public,anon;
grant execute on function public.qa_employee_list_shift_swaps_scoped(uuid) to authenticated;


