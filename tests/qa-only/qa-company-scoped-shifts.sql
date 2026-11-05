-- QA ONLY: upcoming published shifts for the authenticated employee in one company.
create function private.qa_employee_shifts_scoped(p_company uuid)
returns table(id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 return query select a.id,a.shift_code,a.starts_at,a.ends_at from public.shift_assignments a
 where a.company_id=p_company and a.employee_id=emp and a.status='PUBLISHED' and a.published_at is not null
 and a.ends_at>=statement_timestamp() and a.starts_at<statement_timestamp()+interval '90 days'
 order by a.starts_at,a.id limit 100;
end $$;
revoke all on function private.qa_employee_shifts_scoped(uuid) from public,anon;
grant execute on function private.qa_employee_shifts_scoped(uuid) to authenticated;
create function public.qa_employee_shifts_scoped(p_company uuid)
returns table(id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz)
language sql stable set search_path='' as $$select * from private.qa_employee_shifts_scoped(p_company)$$;
revoke all on function public.qa_employee_shifts_scoped(uuid) from public,anon;
grant execute on function public.qa_employee_shifts_scoped(uuid) to authenticated;

