-- Draft: install only after migration and full authorization review.
-- Existing permissive policies and manager/time-manager capabilities remain in force.
-- sf_employee_company_options() checks the authenticated user, active/deleted state,
-- and the company's disabled/read-only/time-only restrictions.
alter policy sf_employee_active_read on public.employees
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=employees.company_id and o.employee_id=employees.id));

alter policy sf_assignment_active_read on public.shift_assignments
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=shift_assignments.company_id and o.employee_id=shift_assignments.employee_id));

alter policy sf_time_capability_read on public.time_entries
 using (private.sf_can_manage_time(company_id) or
   exists(select 1 from public.shift_assignments sa
     join private.sf_employee_company_options() o on o.company_id=sa.company_id and o.employee_id=sa.employee_id
     where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id));
