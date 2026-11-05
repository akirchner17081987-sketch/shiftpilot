-- QA ONLY. Only previously linked profiles can be enabled or disabled.
-- This does not claim to protect legacy employee endpoints.
create function private.qa_managed_employee_profiles(p_source uuid,p_employee uuid)
returns table(company_id uuid,company_name text,employee_id uuid,enabled boolean)
language plpgsql stable security definer set search_path='' as $$
declare target_user uuid;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id into target_user from public.employees e
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 return query
 select c.id,c.name,e.id,e.access_status='ACTIVE'
 from public.employees e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=e.company_id and m.user_id=auth.uid()
 where e.auth_user_id=target_user and e.deleted_at is null and e.status='active'
 and m.status='ACTIVE' and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')
 and not exists(select 1 from public.company_members x where x.company_id=e.company_id and x.user_id=target_user)
 order by c.name,c.id;
end $$;

create function private.qa_set_employee_profile_access(p_source uuid,p_employee uuid,p_target uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target_user uuid; target_company uuid; target_status text;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or p_enabled is null or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id into target_user from public.employees e
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null for update;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 select e.company_id,e.access_status into target_company,target_status from public.employees e
 where e.id=p_target and e.auth_user_id=target_user and e.deleted_at is null and e.status='active' for update;
 if target_company is null or not private.can_manage_company_users(target_company)
 or exists(select 1 from public.company_members x where x.company_id=target_company and x.user_id=target_user)
 then raise exception 'Nicht berechtigt für dieses Mitarbeiterprofil' using errcode='42501'; end if;
 if target_status not in ('ACTIVE','DISABLED') then raise exception 'Der Profilzugang kann nicht geändert werden'; end if;
 update public.employees set access_status=case when p_enabled then 'ACTIVE' else 'DISABLED' end,updated_at=now() where id=p_target;
end $$;

revoke all on function private.qa_managed_employee_profiles(uuid,uuid),private.qa_set_employee_profile_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function private.qa_managed_employee_profiles(uuid,uuid),private.qa_set_employee_profile_access(uuid,uuid,uuid,boolean) to authenticated;
create function public.qa_managed_employee_profiles(p_source uuid,p_employee uuid)
returns table(company_id uuid,company_name text,employee_id uuid,enabled boolean)
language sql stable set search_path='' as $$select * from private.qa_managed_employee_profiles(p_source,p_employee)$$;
create function public.qa_set_employee_profile_access(p_source uuid,p_employee uuid,p_target uuid,p_enabled boolean)
returns void language sql set search_path='' as $$select private.qa_set_employee_profile_access(p_source,p_employee,p_target,p_enabled)$$;
revoke all on function public.qa_managed_employee_profiles(uuid,uuid),public.qa_set_employee_profile_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.qa_managed_employee_profiles(uuid,uuid),public.qa_set_employee_profile_access(uuid,uuid,uuid,boolean) to authenticated;
