-- Employee portal identities are employee-bound, with no mandatory manager membership.
create or replace function private.sf_handover_employee(p_company uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select e.id from public.employees e
 where e.company_id=p_company and e.auth_user_id=(select auth.uid()) and e.deleted_at is null
 and e.status='active' and e.access_status='ACTIVE'
 and not exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=e.auth_user_id
 and (m.status<>'ACTIVE' or m.role in ('TIME_TRACKING','VIEWER'))) limit 1;
$$;
notify pgrst,'reload schema';

