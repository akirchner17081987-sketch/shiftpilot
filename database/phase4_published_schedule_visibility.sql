-- Phase 4: Mitarbeiter dürfen ausschließlich ihren veröffentlichten Dienstplan lesen.
-- Die zusätzliche Client-Filterung ist Komfort; diese RLS-Regel ist die Sicherheitsgrenze.
drop policy if exists assignments_select on public.shift_assignments;

create policy assignments_select
on public.shift_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = shift_assignments.company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
  )
  or (
    shift_assignments.status = 'PUBLISHED'
    and shift_assignments.published_at is not null
    and exists (
      select 1
      from public.employees e
      where e.id = shift_assignments.employee_id
        and e.auth_user_id = (select auth.uid())
        and e.status = 'active'
    )
  )
);

