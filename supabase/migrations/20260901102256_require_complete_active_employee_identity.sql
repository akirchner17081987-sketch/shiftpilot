alter table public.employees
  drop constraint if exists employees_active_identity_complete_check;

alter table public.employees
  add constraint employees_active_identity_complete_check
  check (
    status <> 'active'
    or (
      btrim(first_name) <> ''
      and btrim(last_name) <> ''
      and btrim(coalesce(personnel_no, '')) <> ''
      and btrim(role) <> ''
      and btrim(employment) <> ''
      and btrim(work_time_model) <> ''
    )
  );

comment on constraint employees_active_identity_complete_check on public.employees is
  'Active employees require complete identity and core employment data. Optional contact and address fields remain nullable.';
