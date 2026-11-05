begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
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

create temporary table sf_manage_test(owner_id uuid,target_id uuid,other_id uuid,a uuid,b uuid,c uuid,ea uuid,eb uuid,ec uuid,ew uuid,ep uuid,email text);
insert into sf_manage_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'test-'||gen_random_uuid()::text||'@example.invalid';
grant select on sf_manage_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select owner_id,'owner-'||owner_id::text||'@example.invalid',now(),'{}'::jsonb from sf_manage_test
union all select target_id,email,now(),'{}'::jsonb from sf_manage_test
union all select other_id,'other-'||other_id::text||'@example.invalid',now(),'{}'::jsonb from sf_manage_test;
insert into public.companies(id,name,created_by) select a,'Manage test A',owner_id from sf_manage_test union all select b,'Manage test B',owner_id from sf_manage_test union all select c,'Manage test C',other_id from sf_manage_test;
insert into public.company_members(company_id,user_id,role,status,access_role) select a,owner_id,'OWNER','ACTIVE','OWNER' from sf_manage_test union all select b,owner_id,'OWNER','ACTIVE','OWNER' from sf_manage_test union all select c,other_id,'OWNER','ACTIVE','OWNER' from sf_manage_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),email,target_id,'ACTIVE' from sf_manage_test
union all select eb,b,'Test','B','B-'||left(eb::text,8),email,null,'NONE' from sf_manage_test
union all select ec,c,'Test','C','C-'||left(ec::text,8),email,null,'NONE' from sf_manage_test
union all select ew,b,'Test','Wrong','W-'||left(ew::text,8),'wrong@example.invalid',null,'NONE' from sf_manage_test
union all select ep,b,'Test','Pending','P-'||left(ep::text,8),email,null,'NONE' from sf_manage_test;
insert into public.employee_access_invites(company_id,employee_id,email,token_hash,created_by)
select b,ep,email,encode(extensions.digest(ep::text,'sha256'),'hex'),owner_id from sf_manage_test;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true) from sf_manage_test;
update auth.users set email_confirmed_at=null where id=(select target_id from sf_manage_test);
set local role authenticated;
do $unverified$ declare x sf_manage_test%rowtype;denied boolean:=false;begin
 select * into x from sf_manage_test;
 if has_function_privilege('anon','public.manager_set_employee_company_access(uuid,uuid,uuid,boolean)','execute') then raise exception 'anonymous management accepted';end if;
 if exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id=x.eb) then raise exception 'unconfirmed account target visible';end if;
 begin perform public.manager_set_employee_company_access(x.a,x.ea,x.eb,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'unconfirmed account linked';end if;
end $unverified$;
reset role;
update auth.users set email_confirmed_at=now() where id=(select target_id from sf_manage_test);
set local role authenticated;
do $test$ declare x sf_manage_test%rowtype;denied boolean;begin
 select * into x from sf_manage_test;
 if not exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id=x.eb and enabled=false) then raise exception 'matching target missing';end if;
 if exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id in (x.ec,x.ew,x.ep)) then raise exception 'unauthorized or reserved target visible';end if;
 denied:=false;begin perform public.manager_set_employee_company_access(x.a,x.ea,x.ec,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'unauthorized company accepted';end if;
 denied:=false;begin perform public.manager_set_employee_company_access(x.a,x.ea,x.ew,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'wrong email accepted';end if;
 denied:=false;begin perform public.manager_set_employee_company_access(x.a,x.ea,x.ep,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'pending invite bypassed';end if;
 perform public.manager_set_employee_company_access(x.a,x.ea,x.eb,true);
 if not exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id=x.eb and enabled) then raise exception 'access not enabled';end if;
 perform public.manager_set_employee_company_access(x.a,x.ea,x.eb,false);
 if not exists(select 1 from public.manager_employee_company_profiles(x.a,x.ea) where employee_id=x.eb and not enabled) then raise exception 'access not disabled';end if;
 perform public.manager_set_employee_company_access(x.a,x.ea,x.eb,true);
end $test$;
reset role;
do $check$ declare x sf_manage_test%rowtype;begin
 select * into x from sf_manage_test;
 if not exists(select 1 from public.employees where id=x.eb and company_id=x.b and auth_user_id=x.target_id and access_status='ACTIVE') then raise exception 'access not restored';end if;
 if (select count(*) from public.audit_events where entity_id=x.eb and event_type='EMPLOYEE_COMPANY_ACCESS_CHANGED')<>3 then raise exception 'audit missing';end if;
 if exists(select 1 from public.employees where id in (x.ec,x.ew,x.ep) and auth_user_id is not null) then raise exception 'unexpected account link';end if;
end $check$;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal1','role','authenticated')::text,true) from sf_manage_test;
set local role authenticated;
do $test$ declare x sf_manage_test%rowtype;denied boolean:=false;begin select * into x from sf_manage_test;
 begin perform public.manager_set_employee_company_access(x.a,x.ea,x.eb,false);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'management without MFA accepted';end if;
end $test$;
reset role;
rollback;