-- TEST ENVIRONMENT ONLY. List only matching, available profiles in companies managed by the caller.
create function private.qa_invitable_employee_profiles(p_source uuid,p_email text)
returns table(company_id uuid,company_name text,employee_id uuid,first_name text,last_name text)
language plpgsql stable security definer set search_path = '' as $$
declare mail text:=lower(trim(coalesce(p_email,'')));
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 if mail !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Ungültige E-Mail'; end if;
 return query select c.id,c.name,e.id,e.first_name,e.last_name
 from public.employees e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=c.id and m.user_id=auth.uid()
 where m.status='ACTIVE' and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')
 and e.status='active' and e.deleted_at is null and e.auth_user_id is null and e.access_status<>'DISABLED'
 and lower(trim(coalesce(e.email,'')))=mail
 and not exists(select 1 from public.employee_access_invites i where i.company_id=e.company_id and lower(i.email)=mail and i.claimed_at is null and i.expires_at>now())
 and not exists(select 1 from public.company_member_invites i where i.company_id=e.company_id and lower(i.email)=mail and i.status='INVITED' and i.expires_at>now())
 order by c.name,e.last_name,e.first_name,e.id;
end $$;
revoke all on function private.qa_invitable_employee_profiles(uuid,text) from public,anon;
grant execute on function private.qa_invitable_employee_profiles(uuid,text) to authenticated;
create function public.qa_invitable_employee_profiles(p_source uuid,p_email text)
returns table(company_id uuid,company_name text,employee_id uuid,first_name text,last_name text)
language sql stable set search_path = '' as $$
 select * from private.qa_invitable_employee_profiles(p_source,p_email)
$$;
revoke all on function public.qa_invitable_employee_profiles(uuid,text) from public,anon;
grant execute on function public.qa_invitable_employee_profiles(uuid,text) to authenticated;

