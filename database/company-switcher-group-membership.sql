create or replace function private.company_switcher_groups()
returns table(company_id uuid, group_label text)
language sql stable security definer set search_path = ''
as $$
 select m.company_id, c.configuration->>'companyGroupLabel'
 from public.company_members m
 join private.company_client_configuration c on c.company_id=m.company_id
 where (select auth.uid()) is not null
   and m.user_id=(select auth.uid()) and m.status='ACTIVE'
   and jsonb_typeof(c.configuration->'companyGroupLabel')='string'
   and length(btrim(c.configuration->>'companyGroupLabel')) between 1 and 120
$$;
revoke all on function private.company_switcher_groups() from public, anon;
grant execute on function private.company_switcher_groups() to authenticated;
create or replace function public.company_switcher_groups()
returns table(company_id uuid, group_label text)
language sql stable security invoker set search_path = ''
as $$ select g.company_id, g.group_label from private.company_switcher_groups() g $$;
revoke all on function public.company_switcher_groups() from public, anon;
grant execute on function public.company_switcher_groups() to authenticated;
