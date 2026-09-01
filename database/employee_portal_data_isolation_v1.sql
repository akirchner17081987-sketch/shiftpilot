-- SchichtFunk – Mitarbeiterportal-Datenisolierung V1
-- Aktive Mitarbeiter lesen ausschließlich ihre eigenen Personaldaten und
-- die über ihre Mitarbeiter-ID verknüpften Portalvorgänge.

alter table public.employees enable row level security;
alter table public.companies enable row level security;
alter table public.absences enable row level security;
alter table public.shift_change_requests enable row level security;
alter table public.shift_change_approvals enable row level security;
alter table public.time_entries enable row level security;
alter table public.shift_templates enable row level security;
alter table public.company_compliance_policy enable row level security;

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
for select to authenticated
using (
  (auth_user_id = (select auth.uid()) and status = 'active')
  or exists (
    select 1 from public.company_members cm
    where cm.company_id = employees.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
);

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.company_members cm
    where cm.company_id = companies.id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id = companies.id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = absences.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id = absences.employee_id
      and e.company_id = absences.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists change_requests_select on public.shift_change_requests;
create policy change_requests_select on public.shift_change_requests
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = shift_change_requests.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id = shift_change_requests.employee_id
      and e.company_id = shift_change_requests.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists approvals_select on public.shift_change_approvals;
create policy approvals_select on public.shift_change_approvals
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = shift_change_approvals.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1
    from public.shift_change_requests cr
    join public.employees e on e.id = cr.employee_id
    where cr.id = shift_change_approvals.change_request_id
      and cr.company_id = shift_change_approvals.company_id
      and e.company_id = shift_change_approvals.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = time_entries.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1
    from public.shift_assignments sa
    join public.employees e on e.id = sa.employee_id
    where sa.id = time_entries.assignment_id
      and sa.company_id = time_entries.company_id
      and e.company_id = time_entries.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists shift_templates_select on public.shift_templates;
create policy shift_templates_select on public.shift_templates
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = shift_templates.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id = shift_templates.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

drop policy if exists compliance_policy_select on public.company_compliance_policy;
create policy compliance_policy_select on public.company_compliance_policy
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_compliance_policy.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id = company_compliance_policy.company_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'active'
  )
);

notify pgrst, 'reload schema';
