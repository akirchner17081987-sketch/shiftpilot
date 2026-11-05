-- QA ONLY: reserve each selected profile while an invitation is pending.
CREATE OR REPLACE FUNCTION private.qa_create_multi_employee_invite(p_source uuid, p_employees uuid[], p_email text, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employees%rowtype; source_employee uuid; result jsonb; invite uuid; mail text:=lower(trim(coalesce(p_email,'')));
begin
  if auth.uid() is null or private.sf_request_aal()<>'aal2' then raise exception 'Zwei-Faktor-Bestätigung erforderlich' using errcode='42501'; end if;
  if p_source is null or p_employees is null or cardinality(p_employees)<2 or cardinality(p_employees)>20
     or array_position(p_employees,null) is not null
     or cardinality(p_employees)<>(select count(distinct x) from unnest(p_employees) x)
  then raise exception 'Ungültige Profilauswahl'; end if;
  if exists(select 1 from auth.users u where lower(u.email)=mail) then raise exception 'Für diese E-Mail besteht bereits ein Konto'; end if;
  if (select count(*) from public.employees e where e.id=any(p_employees))<>cardinality(p_employees)
     or (select count(distinct e.company_id) from public.employees e where e.id=any(p_employees))<>cardinality(p_employees)
  then raise exception 'Ein Profil pro Unternehmen erforderlich'; end if;
  for emp in select * from public.employees where id=any(p_employees) order by company_id,id for update loop
    perform pg_advisory_xact_lock(hashtextextended(emp.company_id::text,7041));
    if not private.can_manage_company_users(emp.company_id) then raise exception 'Nicht berechtigt für ein ausgewähltes Unternehmen' using errcode='42501'; end if;
    if emp.status<>'active' or emp.deleted_at is not null or emp.auth_user_id is not null
       or emp.access_status='DISABLED' or lower(trim(coalesce(emp.email,'')))<>mail
    then raise exception 'Mitarbeiterprofil nicht verfügbar oder E-Mail stimmt nicht überein'; end if;
    if exists(select 1 from public.employee_access_invites i where i.company_id=emp.company_id and lower(i.email)=mail and i.claimed_at is null and i.expires_at>now())
       or exists(select 1 from public.company_member_invites i where i.company_id=emp.company_id and lower(i.email)=mail and i.status='INVITED' and i.expires_at>now())
       or exists(select 1 from private.qa_employee_invite_targets t join public.employee_access_invites i on i.id=t.invite_id where t.employee_id=emp.id and i.claimed_at is null and i.expires_at>now())
    then raise exception 'Eine offene Einladung besteht bereits'; end if;
    if emp.company_id=p_source then source_employee:=emp.id; end if;
  end loop;
  if source_employee is null then raise exception 'Quellunternehmen fehlt'; end if;
  result:=private.manager_create_access_invite(p_source,mail,'EMPLOYEE','{}'::text[],p_token_hash,source_employee);
  if result->>'parameter'<>'employeeInvite' then raise exception 'Ungültige Einladungsart'; end if;
  invite:=(result->>'id')::uuid;
  delete from private.qa_employee_invite_targets where invite_id=invite;
  insert into private.qa_employee_invite_targets(invite_id,company_id,employee_id)
    select invite,e.company_id,e.id from public.employees e where e.id=any(p_employees) and e.id<>source_employee;
  return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.qa_invitable_employee_profiles(p_source uuid, p_email text)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, first_name text, last_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 and not exists(select 1 from private.qa_employee_invite_targets t join public.employee_access_invites i on i.id=t.invite_id where t.employee_id=e.id and i.claimed_at is null and i.expires_at>now())
 order by c.name,e.last_name,e.first_name,e.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.qa_managed_employee_profiles(p_source uuid, p_employee uuid)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and not exists(select 1 from private.qa_employee_invite_targets t join public.employee_access_invites i on i.id=t.invite_id where t.employee_id=e.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=e.id and i.status='INVITED' and i.expires_at>now())))
 and not exists(select 1 from public.company_members x where x.company_id=e.company_id and x.user_id=target_user)
 order by c.name,c.id,e.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.qa_set_employee_profile_access(p_source uuid, p_employee uuid, p_target uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and not exists(select 1 from private.qa_employee_invite_targets t join public.employee_access_invites i on i.id=t.invite_id where t.employee_id=profile.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=profile.id and i.status='INVITED' and i.expires_at>now()) then
  update public.employees set auth_user_id=target_user,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=p_target;
 else raise exception 'Das Mitarbeiterprofil kann diesem Konto nicht zugeordnet werden' using errcode='42501'; end if;
end $function$
;
