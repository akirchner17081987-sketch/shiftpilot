-- Review/test candidate only; not a production migration.
create or replace function private.employee_company_switcher_groups()
returns table(company_id uuid, group_label text)
language sql stable security definer set search_path = ''
as $$
  select ids.company_id, btrim(cfg.configuration->>'companyGroupLabel')
  from (
    select o.company_id from private.sf_employee_company_options() o
    union
    select m.company_id from public.company_members m
      where m.user_id=(select auth.uid()) and m.status='ACTIVE'
  ) ids
  join private.company_client_configuration cfg on cfg.company_id=ids.company_id
  where (select auth.uid()) is not null
    and jsonb_typeof(cfg.configuration->'companyGroupLabel')='string'
    and length(btrim(cfg.configuration->>'companyGroupLabel')) between 1 and 120
$$;
revoke all on function private.employee_company_switcher_groups() from public, anon;
grant execute on function private.employee_company_switcher_groups() to authenticated;
create or replace function public.employee_company_switcher_groups()
returns table(company_id uuid, group_label text)
language sql stable security invoker set search_path = ''
as $$ select g.company_id,g.group_label from private.employee_company_switcher_groups() g $$;
revoke all on function public.employee_company_switcher_groups() from public, anon;
grant execute on function public.employee_company_switcher_groups() to authenticated;
