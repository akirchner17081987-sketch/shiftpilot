-- Draft: explicit-company lists; legacy multi-profile lists fail closed.
create or replace function private.sf_single_active_employee_company() returns uuid
language plpgsql stable security definer set search_path='' as $fn$
declare ids uuid[];
begin
 select array_agg(o.company_id) into ids from private.sf_employee_company_options() o;
 if coalesce(cardinality(ids),0)<>1 then raise exception 'Bitte das Mitarbeiterportal neu laden und ein Unternehmen auswählen' using errcode='42501';end if;
 return ids[1];
end $fn$;
revoke all on function private.sf_single_active_employee_company() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sf_list_shift_swaps_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  v_employee_id:=private.sf_employee_identity_for_company(p_company_id);
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
  where s.company_id=p_company_id and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
$function$
;
CREATE OR REPLACE FUNCTION private.sf_list_shift_marketplace_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp
  from public.employees e
  where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
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

create or replace function private.employee_list_shift_swaps_impl() RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function private.employee_list_shift_marketplace_impl() RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function public.employee_list_shift_swaps_for_company(p_company_id uuid) RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(p_company_id)
$fn$;
create or replace function public.employee_list_shift_marketplace_for_company(p_company_id uuid) RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(p_company_id)
$fn$;
revoke all on function private.sf_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function private.sf_list_shift_marketplace_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_marketplace_for_company(uuid) from public,anon;
grant execute on function private.sf_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function private.sf_list_shift_marketplace_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_marketplace_for_company(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.employee_list_shift_swap_candidates_impl(p_assignment_id uuid)
 RETURNS TABLE(employee_id uuid, display_name text, employee_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  return query
  select e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),coalesce(e.role,'Mitarbeiter')
  from public.employees e
  where e.company_id=a.company_id
    and e.id<>a.employee_id
    and e.status='active'
    and e.auth_user_id is not null
    and private.sf_swap_candidate_reason(a.id,e.id) is null
  order by e.last_name,e.first_name;
end
$function$
;
