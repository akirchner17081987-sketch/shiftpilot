create or replace function private.employee_list_shift_swaps_impl()
returns table(
  id uuid,
  direction text,
  status text,
  assignment_id uuid,
  shift_code text,
  starts_at timestamptz,
  ends_at timestamptz,
  other_employee_name text,
  reason text,
  colleague_comment text,
  manager_comment text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.id into v_employee_id from public.employees e where e.auth_user_id=v_uid and e.status='active' limit 1;
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
  where s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id
  order by s.requested_at desc
  limit 50;
end
$$;

create or replace function public.employee_list_shift_swaps()
returns table(
  id uuid,
  direction text,
  status text,
  assignment_id uuid,
  shift_code text,
  starts_at timestamptz,
  ends_at timestamptz,
  other_employee_name text,
  reason text,
  colleague_comment text,
  manager_comment text,
  requested_at timestamptz
)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select * from private.employee_list_shift_swaps_impl() $$;

revoke all on function public.employee_list_shift_swaps() from public,anon;
grant execute on function public.employee_list_shift_swaps() to authenticated;
revoke all on function private.employee_list_shift_swaps_impl() from public,anon;
grant execute on function private.employee_list_shift_swaps_impl() to authenticated;;
