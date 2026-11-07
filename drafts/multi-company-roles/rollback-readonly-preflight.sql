-- Read-only aggregate diagnostic. No employee identifiers or personal data are returned.
-- A count of zero is a necessary but not sufficient condition for restoring
-- the old global index or old application behaviour. Recheck while writes are frozen.
select
  (select count(*) from (
    select auth_user_id from public.employees
    where auth_user_id is not null
    group by auth_user_id having count(*) > 1
  ) duplicate_accounts) as accounts_with_multiple_profiles,
  (select count(*) from (
    select company_id,auth_user_id from public.employees
    where auth_user_id is not null
    group by company_id,auth_user_id having count(*) > 1
  ) duplicate_company_accounts) as duplicates_within_company,
  to_regclass('public.employees_auth_user_id_uidx') is not null as old_global_index_present,
  to_regclass('public.employees_company_auth_user_id_uidx') is not null as company_index_present;
