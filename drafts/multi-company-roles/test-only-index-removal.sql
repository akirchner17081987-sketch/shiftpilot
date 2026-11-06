-- TEST DATABASE ONLY: multi-company-productionlike-validation (ulnyoanzjywbpuprfcaq).
-- Do not run against production. The company-scoped unique index must already exist.
-- No employee records are deleted. This step permits one account to have profiles
-- in different test companies while retaining uniqueness within each company.
begin;
do $guard$
begin
 if not exists (select 1 from auth.users where email='synthetic-migration-owner@example.invalid')
    or not exists (select 1 from public.companies where name='Synthetic migration fixture') then
   raise exception 'STOP: expected synthetic test database markers are missing';
 end if;
 if not exists (select 1 from pg_indexes where schemaname='public'
   and indexname='employees_company_auth_user_id_uidx'
   and indexdef ilike 'CREATE UNIQUE INDEX%') then
   raise exception 'STOP: unique company-scoped index is missing';
 end if;
 if not exists (select 1 from pg_indexes where schemaname='public'
   and indexname='employees_auth_user_id_uidx'
   and indexdef ilike 'CREATE UNIQUE INDEX%') then
   raise exception 'STOP: expected global index is missing or changed';
 end if;
end $guard$;
drop index public.employees_auth_user_id_uidx;
commit;
