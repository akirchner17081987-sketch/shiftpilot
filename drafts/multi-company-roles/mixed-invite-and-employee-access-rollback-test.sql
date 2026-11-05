begin;
set local lock_timeout='3s';set local statement_timeout='20s';
-- Draft: managing linked employee access; depends on per-company identity uniqueness migration.
CREATE OR REPLACE FUNCTION private.manager_employee_company_profiles(p_source uuid, p_employee uuid)
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
   and not exists(select 1 from public.company_member_invites i where i.employee_id=e.id and i.status='INVITED' and i.expires_at>now())))
 and not exists(select 1 from public.company_members x where x.company_id=e.company_id and x.user_id=target_user)
 order by c.name,c.id,e.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_set_employee_company_access(p_source uuid, p_employee uuid, p_target uuid, p_enabled boolean)
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
   and not exists(select 1 from public.company_member_invites i where i.employee_id=profile.id and i.status='INVITED' and i.expires_at>now()) then
  update public.employees set auth_user_id=target_user,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=p_target;
 else raise exception 'Das Mitarbeiterprofil kann diesem Konto nicht zugeordnet werden' using errcode='42501'; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
 values(profile.company_id,'EMPLOYEE_COMPANY_ACCESS_CHANGED','employee',profile.id,auth.uid(),
 (select m.access_role from public.company_members m where m.company_id=profile.company_id and m.user_id=auth.uid() and m.status='ACTIVE' limit 1),
 jsonb_build_object('access_status',profile.access_status,'linked',profile.auth_user_id is not null),
 jsonb_build_object('access_status',case when p_enabled then 'ACTIVE' else 'DISABLED' end,'linked',true));
end $function$
;
CREATE OR REPLACE FUNCTION public.manager_employee_company_profiles(p_source uuid, p_employee uuid)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, enabled boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select * from private.manager_employee_company_profiles(p_source,p_employee)$function$
;
CREATE OR REPLACE FUNCTION public.manager_set_employee_company_access(p_source uuid, p_employee uuid, p_target uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manager_set_employee_company_access(p_source,p_employee,p_target,p_enabled)$function$
;

revoke all on function private.manager_employee_company_profiles(uuid,uuid) from public,anon;
revoke all on function private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.manager_employee_company_profiles(uuid,uuid) from public,anon;
revoke all on function public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function private.manager_employee_company_profiles(uuid,uuid) to authenticated;
grant execute on function private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.manager_employee_company_profiles(uuid,uuid) to authenticated;
grant execute on function public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;


create temporary table sf_joined_test(owner_id uuid,user_id uuid,a uuid,b uuid,c uuid,ea uuid,ec uuid,email text,token text);
insert into sf_joined_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'joined-'||gen_random_uuid()::text||'@example.invalid',encode(extensions.gen_random_bytes(32),'hex');
grant select on sf_joined_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select owner_id,'owner-'||owner_id::text||'@example.invalid',now(),'{}'::jsonb from sf_joined_test union all select user_id,email,now(),'{}'::jsonb from sf_joined_test;
insert into public.companies(id,name,created_by) select a,'Joined A',owner_id from sf_joined_test union all select b,'Joined B',owner_id from sf_joined_test union all select c,'Joined C',owner_id from sf_joined_test;
insert into public.company_members(company_id,user_id,role,status,access_role) select a,owner_id,'OWNER','ACTIVE','OWNER' from sf_joined_test union all select b,owner_id,'OWNER','ACTIVE','OWNER' from sf_joined_test union all select c,owner_id,'OWNER','ACTIVE','OWNER' from sf_joined_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,access_status) select ea,a,'Test','A','A-'||left(ea::text,8),email,'NONE' from sf_joined_test union all select ec,c,'Test','C','C-'||left(ec::text,8),email,'NONE' from sf_joined_test;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true) from sf_joined_test;
set local role authenticated;
do $test$ declare x sf_joined_test%rowtype;res jsonb;begin select * into x from sf_joined_test;
res:=public.manager_create_multi_access_invite(x.a,x.email,jsonb_build_array(jsonb_build_object('company_id',x.a,'role','EMPLOYEE','employee_id',x.ea),jsonb_build_object('company_id',x.b,'role','ADMIN')),encode(extensions.digest(x.token,'sha256'),'hex'));
if res is null then raise exception 'invite not created';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',user_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'aal','aal2','role','authenticated')::text,true) from sf_joined_test;
set local role authenticated;
do $test$ declare x sf_joined_test%rowtype;res jsonb;begin select * into x from sf_joined_test;
res:=public.claim_multi_company_invite(x.token);if (res->>'companies')::integer<>2 then raise exception 'mixed invitation failed: %',res;end if;
end $test$;
reset role;
do $verify$ declare x sf_joined_test%rowtype;begin select * into x from sf_joined_test;
if not exists(select 1 from public.employees where id=x.ea and auth_user_id=x.user_id and access_status='ACTIVE') then raise exception 'employee invite missing';end if;
if not exists(select 1 from public.company_members where company_id=x.b and user_id=x.user_id and access_role='ADMIN' and status='ACTIVE') then raise exception 'admin invite missing';end if;
end $verify$;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true) from sf_joined_test;
set local role authenticated;
do $test$ declare x sf_joined_test%rowtype;begin select * into x from sf_joined_test;
if not exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id=x.ec and not enabled) then raise exception 'target employee profile missing';end if;
perform public.manager_set_employee_company_access(x.a,x.ea,x.ec,true);
end $test$;
reset role;
do $verify$ declare x sf_joined_test%rowtype;begin select * into x from sf_joined_test;
if not exists(select 1 from public.employees where id=x.ec and auth_user_id=x.user_id and access_status='ACTIVE') then raise exception 'third company access missing';end if;
if not exists(select 1 from public.company_members where company_id=x.b and user_id=x.user_id and access_role='ADMIN' and status='ACTIVE') then raise exception 'admin role changed';end if;
end $verify$;
rollback;