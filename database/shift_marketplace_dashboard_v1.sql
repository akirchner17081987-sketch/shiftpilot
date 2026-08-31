-- Vollständiger, rollenbeschränkter Datenfeed für das Marktplatz-Dashboard.
create or replace function private.manager_list_shift_marketplace_impl(p_company_id uuid)
returns table(id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,claimed_by text,reason text,colleague_comment text,requested_at timestamptz)
language plpgsql security definer set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid();
begin
  if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=v_uid and status='ACTIVE' and role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then
    raise exception 'Keine Berechtigung';
  end if;
  return query
  select s.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,
    trim(o.first_name||' '||o.last_name),
    nullif(trim(coalesce(t.first_name,'')||' '||coalesce(t.last_name,'')),''),
    s.reason,s.colleague_comment,s.requested_at
  from public.shift_swap_requests s
  join public.shift_assignments a on a.id=s.assignment_id
  join public.employees o on o.id=s.original_employee_id
  left join public.employees t on t.id=s.target_employee_id
  where s.company_id=p_company_id
  order by case when s.status='PENDING_MANAGER' then 0 when s.status='MARKET_OPEN' then 1 else 2 end,s.requested_at desc
  limit 100;
end $$;
