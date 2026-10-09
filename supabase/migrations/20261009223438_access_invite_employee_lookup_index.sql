create index company_member_invites_employee_id_idx on public.company_member_invites(employee_id) where employee_id is not null;
