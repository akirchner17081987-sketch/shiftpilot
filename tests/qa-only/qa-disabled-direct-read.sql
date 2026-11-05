-- QA ONLY. Preserve existing manager access while requiring an active profile for self access.
alter policy employees_select on public.employees using (
 (auth_user_id=(select auth.uid()) and status='active' and access_status='ACTIVE' and deleted_at is null)
 or exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
);
alter policy absences_select on public.absences using (
 exists(select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
 or exists(select 1 from public.employees e where e.id=absences.employee_id and e.company_id=absences.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null)
);
alter policy assignments_select on public.shift_assignments using (
 exists(select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
 or (status='PUBLISHED' and published_at is not null and exists(select 1 from public.employees e where e.id=shift_assignments.employee_id and e.company_id=shift_assignments.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null))
);
alter policy time_entries_select on public.time_entries using (
 private.sf_is_manager(company_id,false)
 or exists(select 1 from public.shift_assignments sa join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id
 where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null)
);
