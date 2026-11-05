-- Prepare explicit per-company employee access; release with verified portal integration.
-- Permit one account to have at most one employee profile in each company.
drop index if exists public.employees_auth_user_id_uidx;
create unique index if not exists employees_company_auth_user_id_uidx on public.employees (company_id,auth_user_id) where auth_user_id is not null;
create function private.manager_employee_company_profiles(p_source uuid,p_employee uuid)
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

create function private.manager_set_employee_company_access(p_source uuid,p_employee uuid,p_target uuid,p_enabled boolean)
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

revoke all on function private.manager_employee_company_profiles(uuid,uuid),private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function private.manager_employee_company_profiles(uuid,uuid),private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;
create function public.manager_employee_company_profiles(p_source uuid,p_employee uuid)
returns table(company_id uuid,company_name text,employee_id uuid,enabled boolean)
language sql stable set search_path='' as $$select * from private.manager_employee_company_profiles(p_source,p_employee)$$;
create function public.manager_set_employee_company_access(p_source uuid,p_employee uuid,p_target uuid,p_enabled boolean)
returns void language sql set search_path='' as $$select private.manager_set_employee_company_access(p_source,p_employee,p_target,p_enabled)$$;
revoke all on function public.manager_employee_company_profiles(uuid,uuid),public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.manager_employee_company_profiles(uuid,uuid),public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;

create or replace function private.manager_employee_company_profiles(p_source uuid,p_employee uuid)
returns table(company_id uuid,company_name text,employee_id uuid,enabled boolean)
language plpgsql stable security definer set search_path='' as $$
declare target_user uuid; verified_email text;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id,case when u.email_confirmed_at is not null then lower(trim(u.email)) end
 into target_user,verified_email from public.employees e join auth.users u on u.id=e.auth_user_id
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 return query select c.id,c.name,e.id,(e.auth_user_id=target_user and e.access_status='ACTIVE')
 from public.employees e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=e.company_id and m.user_id=auth.uid()
 where e.deleted_at is null and e.status='active' and m.status='ACTIVE'
 and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')
 and (e.auth_user_id=target_user or (e.auth_user_id is null and e.access_status='NONE'
   and verified_email is not null and lower(trim(e.email))=verified_email
   and not exists(select 1 from public.employees linked where linked.company_id=e.company_id and linked.auth_user_id=target_user and linked.deleted_at is null)
   and not exists(select 1 from public.employee_access_invites i where i.employee_id=e.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=e.id and i.status='INVITED' and i.expires_at>now())))
 and not exists(select 1 from public.company_members x where x.company_id=e.company_id and x.user_id=target_user)
 order by c.name,c.id,e.id;
end $$;

create or replace function private.manager_set_employee_company_access(p_source uuid,p_employee uuid,p_target uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target_user uuid; verified_email text; profile public.employees%rowtype;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or p_enabled is null or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id,case when u.email_confirmed_at is not null then lower(trim(u.email)) end
 into target_user,verified_email from public.employees e join auth.users u on u.id=e.auth_user_id
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null for update of e;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 select * into profile from public.employees e where e.id=p_target and e.deleted_at is null and e.status='active' for update;
 if not found or not private.can_manage_company_users(profile.company_id)
 or exists(select 1 from public.company_members x where x.company_id=profile.company_id and x.user_id=target_user)
 then raise exception 'Nicht berechtigt für dieses Mitarbeiterprofil' using errcode='42501'; end if;
 if profile.auth_user_id=target_user and profile.access_status in ('ACTIVE','DISABLED') then
  update public.employees set access_status=case when p_enabled then 'ACTIVE' else 'DISABLED' end,updated_at=now() where id=p_target;
 elsif profile.auth_user_id is null and p_enabled and profile.access_status='NONE' and verified_email is not null
   and lower(trim(profile.email))=verified_email
   and not exists(select 1 from public.employees linked where linked.company_id=profile.company_id and linked.auth_user_id=target_user and linked.deleted_at is null)
   and not exists(select 1 from public.employee_access_invites i where i.employee_id=profile.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=profile.id and i.status='INVITED' and i.expires_at>now()) then
  update public.employees set auth_user_id=target_user,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=p_target;
 else raise exception 'Das Mitarbeiterprofil kann diesem Konto nicht zugeordnet werden' using errcode='42501'; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
 values(profile.company_id,'EMPLOYEE_COMPANY_ACCESS_CHANGED','employee',profile.id,auth.uid(),
 (select m.access_role from public.company_members m where m.company_id=profile.company_id and m.user_id=auth.uid() and m.status='ACTIVE' limit 1),
 jsonb_build_object('access_status',profile.access_status,'linked',profile.auth_user_id is not null),
 jsonb_build_object('access_status',case when p_enabled then 'ACTIVE' else 'DISABLED' end,'linked',true));
end $$;

create or replace function private.sf_employee_company_options() returns table(company_id uuid,company_name text,employee_id uuid)
language sql stable security definer set search_path='' as $$
 select c.id,c.name,e.id from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null and not private.sf_has_time_only_login() and e.auth_user_id=auth.uid()
 and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
 and not exists(select 1 from public.company_members m where m.company_id=e.company_id and m.user_id=auth.uid() and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)))
 order by c.name,c.id
$$;
revoke all on function private.sf_employee_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
create or replace function public.employee_company_options() returns table(company_id uuid,company_name text,employee_id uuid)
language sql stable set search_path='' as $$select * from private.sf_employee_company_options()$$;
revoke all on function public.employee_company_options() from public,anon;
grant execute on function public.employee_company_options() to authenticated;
