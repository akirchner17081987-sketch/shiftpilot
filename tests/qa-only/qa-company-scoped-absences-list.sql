-- QA ONLY. Show the authenticated employee's own absence records for one company.
create function private.qa_employee_absences_scoped(p_company uuid)
returns table(id uuid,absence_type text,start_date date,end_date date,status text,full_day boolean,start_time time,end_time time)
language plpgsql stable security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 return query select a.id,a.absence_type,a.start_date,a.end_date,a.status,a.full_day,a.start_time,a.end_time
 from public.absences a where a.company_id=p_company and a.employee_id=emp
 order by a.start_date desc,a.id limit 100;
end $$;
revoke all on function private.qa_employee_absences_scoped(uuid) from public,anon;
grant execute on function private.qa_employee_absences_scoped(uuid) to authenticated;
create function public.qa_employee_absences_scoped(p_company uuid)
returns table(id uuid,absence_type text,start_date date,end_date date,status text,full_day boolean,start_time time,end_time time)
language sql stable set search_path='' as $$
 select * from private.qa_employee_absences_scoped(p_company)
$$;
revoke all on function public.qa_employee_absences_scoped(uuid) from public,anon;
grant execute on function public.qa_employee_absences_scoped(uuid) to authenticated;

