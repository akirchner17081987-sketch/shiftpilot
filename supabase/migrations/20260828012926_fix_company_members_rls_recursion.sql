create schema if not exists private;

create or replace function private.is_company_creator(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.companies c
       where c.id = p_company_id
         and c.created_by = (select auth.uid())
     );
$$;

revoke all on function private.is_company_creator(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_company_creator(uuid) to authenticated;

drop policy if exists company_members_insert on public.company_members;
create policy company_members_insert
on public.company_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_company_creator(company_id)
);
;
