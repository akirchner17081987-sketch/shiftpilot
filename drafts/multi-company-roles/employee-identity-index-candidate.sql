-- Draft only: apply atomically only as part of the reviewed multi-company release.
-- Existing global uniqueness must first be replaced with uniqueness per company.
-- Do not install in production until all legacy employee endpoints are company-scoped.
create unique index if not exists employees_company_auth_user_id_uidx
  on public.employees (company_id, auth_user_id)
  where auth_user_id is not null;
drop index if exists public.employees_auth_user_id_uidx;
