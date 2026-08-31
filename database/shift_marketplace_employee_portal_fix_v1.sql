-- Behebt die Mehrdeutigkeit zwischen Rückgabespalte "status" und employees.status.
create or replace function private.employee_list_shift_marketplace_impl()
returns table(id uuid,is_own boolean,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,employee_role text,reason text,requested_at timestamptz,can_take boolean,block_reason text)
language plpgsql security definer set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp
  from public.employees e
  where e.auth_user_id=v_uid and e.status='active'
  limit 1;
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
end $$;
