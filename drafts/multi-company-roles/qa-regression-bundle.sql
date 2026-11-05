-- QA ONLY: run the entire file with stop-on-error. Each test rolls back.

-- existing employee access
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

-- mixed invitation and employee access
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

-- open shift claim and approval
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create temporary table sf_claim_test(manager_id uuid,employee_user uuid,a uuid,b uuid,ea uuid,eb uuid,offer_a uuid,offer_b uuid,claim_id uuid,work_date date);
insert into sf_claim_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,(now() at time zone 'Europe/Berlin')::date+30;
grant select,update on sf_claim_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select manager_id,'mgr-'||manager_id::text||'@example.invalid',now(),'{}'::jsonb from sf_claim_test union all
select employee_user,'emp-'||employee_user::text||'@example.invalid',now(),'{}'::jsonb from sf_claim_test;
insert into public.companies(id,name,created_by)
select a,'Claim Test A',manager_id from sf_claim_test union all select b,'Claim Test B',manager_id from sf_claim_test;
insert into public.company_members(company_id,user_id,role,status,access_role)
select a,manager_id,'OWNER','ACTIVE','OWNER' from sf_claim_test union all select b,manager_id,'OWNER','ACTIVE','OWNER' from sf_claim_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status,shift_permissions,weekly_hours)
select ea,a,'Test','A','A-'||left(ea::text,8),'emp@example.invalid',employee_user,'ACTIVE',array['O1'],40 from sf_claim_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'emp@example.invalid',employee_user,'ACTIVE',array['O1'],40 from sf_claim_test;
insert into public.shift_templates(company_id,code,name,default_start,default_end)
select a,'O1','Test',time '08:00',time '16:00' from sf_claim_test union all select b,'O1','Test',time '08:00',time '16:00' from sf_claim_test;
insert into public.global_staffing_requirements(company_id,shift_code,required_count)
select a,'O1',1 from sf_claim_test union all select b,'O1',1 from sf_claim_test;
insert into public.open_shift_market_offers(id,company_id,work_date,shift_code,starts_at,ends_at,remaining_count,created_by)
select offer_a,a,work_date,'O1',(work_date+time '08:00') at time zone 'Europe/Berlin',(work_date+time '16:00') at time zone 'Europe/Berlin',1,manager_id from sf_claim_test union all
select offer_b,b,work_date,'O1',(work_date+time '08:00') at time zone 'Europe/Berlin',(work_date+time '16:00') at time zone 'Europe/Berlin',1,manager_id from sf_claim_test;
select set_config('request.jwt.claim.sub',employee_user::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',employee_user,'aal','aal2','role','authenticated')::text,true) from sf_claim_test;
set local role authenticated;
do $test$ declare x sf_claim_test%rowtype;res jsonb;denied boolean:=false;begin
select * into x from sf_claim_test;
begin perform public.employee_claim_open_shift_for_company(x.a,x.offer_b,'wrong company');exception when others then denied:=true;end;
if not denied then raise exception 'foreign company offer accepted';end if;
res:=public.employee_claim_open_shift_for_company(x.a,x.offer_a,'test');
if res->>'status'<>'PENDING_MANAGER' then raise exception 'claim not pending: %',res;end if;
update sf_claim_test set claim_id=(res->>'id')::uuid;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',manager_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'aal','aal2','role','authenticated')::text,true) from sf_claim_test;
set local role authenticated;
do $test$ declare x sf_claim_test%rowtype;res jsonb;begin select * into x from sf_claim_test;
res:=public.manager_review_open_shift_claim(x.claim_id,'APPROVE','test',true);
if res->>'status'<>'APPLIED' then raise exception 'claim not applied: %',res;end if;
end $test$;
reset role;
do $verify$ declare x sf_claim_test%rowtype;begin select * into x from sf_claim_test;
if not exists(select 1 from public.open_shift_market_claims c join public.shift_assignments s on s.id=c.assignment_id and s.company_id=x.a and s.employee_id=x.ea where c.id=x.claim_id and c.status='APPLIED') then raise exception 'assignment not created for selected company';end if;
if exists(select 1 from public.open_shift_market_claims where offer_id=x.offer_b) then raise exception 'foreign claim created';end if;
end $verify$;
rollback;

-- swap cancellation
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: scope cancellation to the active profile in the offer's company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_cancel_shift_swap_impl(p_swap_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.company_id=s.company_id and e.id=private.sf_employee_identity_for_company(s.company_id)) then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $function$
;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;
insert into public.shift_swap_requests(id,company_id,original_employee_id,assignment_version,status)
select sa,a,ea,1,'MARKET_OPEN' from sf_cancel_test union all select sb,b,eb,1,'MARKET_OPEN' from sf_cancel_test;
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_cancel_shift_swap(x.sb); exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'cancel allowed for disabled company';end if;
 if public.employee_cancel_shift_swap(x.sa)<>'CANCELLED' then raise exception 'active company cancellation failed';end if;
end $test$;
reset role;
do $verify$ declare x sf_cancel_test%rowtype;begin select * into x from sf_cancel_test;
 if (select status from public.shift_swap_requests where id=x.sb)<>'MARKET_OPEN' then raise exception 'disabled offer modified';end if;
 if (select status from public.shift_swap_requests where id=x.sa)<>'CANCELLED' then raise exception 'active offer not cancelled';end if;
end $verify$;
rollback;

-- shift change response
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: scope approval to the active employee in the request company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION public.employee_respond_to_shift_change(p_change_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, applied boolean, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.shift_change_requests%rowtype;
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_status text;
  v_assignment uuid;
  v_apply_error text;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED'; end if;

  select * into r
  from public.shift_change_requests
  where id = p_change_id
  for update;
  if not found then raise exception 'Change request not found'; end if;

  if not exists(
    select 1 from public.employees e
    where e.id = r.employee_id
      and e.company_id = r.company_id
      and e.id = private.sf_employee_identity_for_company(r.company_id)
  ) then raise exception 'This change request does not belong to the signed-in employee'; end if;

  if not r.requires_employee_approval then raise exception 'Employee approval is not required for this request'; end if;
  if r.status in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED') then raise exception 'Change request is already completed'; end if;

  insert into public.shift_change_approvals(company_id,change_request_id,approval_type,required,status,decided_by,decided_at,comment)
  values(r.company_id,r.id,'EMPLOYEE',true,v_decision,v_user,now(),left(coalesce(p_comment,''),500))
  on conflict(change_request_id,approval_type)
  do update set status=excluded.status,decided_by=excluded.decided_by,decided_at=excluded.decided_at,comment=excluded.comment;

  if v_decision = 'REJECTED' then
    update public.shift_change_requests set status='REJECTED',rejected_at=now() where id=r.id;
    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
    values(r.company_id,'EMPLOYEE_REJECTED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('comment',left(coalesce(p_comment,''),500)));
    return query select 'REJECTED'::text,false,'Änderung abgelehnt. Die bisherige Planung bleibt bestehen.'::text,null::uuid;
    return;
  end if;

  if r.requires_works_council and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id=r.id and x.approval_type='WORKS_COUNCIL' and x.status='APPROVED'
  ) then
    v_status := 'PENDING_WORKS_COUNCIL';
  else
    v_status := 'READY_TO_APPLY';
  end if;

  update public.shift_change_requests set status=v_status,rejected_at=null where id=r.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  values(r.company_id,'EMPLOYEE_APPROVED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('comment',left(coalesce(p_comment,''),500),'next_status',v_status));

  if v_status = 'READY_TO_APPLY' then
    begin
      v_assignment := public.apply_shift_change(r.id);
    exception when others then
      v_apply_error := sqlerrm;
    end;

    if v_apply_error is null then
      return query select 'APPLIED'::text,true,'Änderung bestätigt und übernommen.'::text,v_assignment;
    else
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(r.company_id,'SHIFT_CHANGE_AUTO_APPLY_FAILED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('error',v_apply_error));
      return query select 'READY_TO_APPLY'::text,false,('Bestätigt. Die automatische Übernahme wartet auf Prüfung: '||v_apply_error)::text,null::uuid;
    end if;
  end if;

  return query select v_status,false,'Änderung bestätigt. Es fehlt noch eine weitere Freigabe.'::text,null::uuid;
end
$function$
;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;

insert into public.shift_change_requests(id,company_id,employee_id,action,proposed_snapshot,reason_code,compliance_status,status,requires_employee_approval)
select sa,a,ea,'CREATE','{}'::jsonb,'TEST','GREEN','PENDING_EMPLOYEE',true from sf_cancel_test union all
select sb,b,eb,'CREATE','{}'::jsonb,'TEST','GREEN','PENDING_EMPLOYEE',true from sf_cancel_test;
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false; actual text;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_respond_to_shift_change(x.sb,'REJECTED','test');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'decision allowed for disabled company';end if;
 select status into actual from public.employee_respond_to_shift_change(x.sa,'REJECTED','test');
 if actual<>'REJECTED' then raise exception 'active company rejection failed';end if;
end $test$;
reset role;
do $verify$ declare x sf_cancel_test%rowtype;begin select * into x from sf_cancel_test;
 if (select status from public.shift_change_requests where id=x.sb)<>'PENDING_EMPLOYEE' then raise exception 'disabled request modified';end if;
 if (select status from public.shift_change_requests where id=x.sa)<>'REJECTED' then raise exception 'active request not rejected';end if;
end $verify$;
rollback;

-- swap candidates
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: candidate lookup requires an active employee in the assignment company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_shift_swap_candidates_impl(p_assignment_id uuid)
 RETURNS TABLE(employee_id uuid, display_name text, employee_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into req from public.employees where id=a.employee_id and company_id=a.company_id and id=private.sf_employee_identity_for_company(a.company_id);
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  return query
  select e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),coalesce(e.role,'Mitarbeiter')
  from public.employees e
  where e.company_id=a.company_id
    and e.id<>a.employee_id
    and e.status='active'
    and e.auth_user_id is not null
    and private.sf_swap_candidate_reason(a.id,e.id) is null
  order by e.last_name,e.first_name;
end
$function$
;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;

insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sa,a,ea,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test union all
select sb,b,eb,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test;
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype;denied boolean:=false;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_list_shift_swap_candidates(x.sb);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'candidates visible for disabled company';end if;
 perform public.employee_list_shift_swap_candidates(x.sa);
end $test$;
reset role;
rollback;

-- disruption response
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: require active employee identity in the disruption offer's company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_respond_disruption_offer_impl(p_offer_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_decision text:=upper(trim(coalesce(p_decision,''))); v_pre public.disruption_offers%rowtype; v_offer public.disruption_offers%rowtype; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype; v_reason text; v_change_id uuid; v_result uuid; v_old jsonb; v_new jsonb;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_decision not in ('ACCEPT','DECLINE') then raise exception 'Ungültige Entscheidung'; end if;
  select * into v_pre from public.disruption_offers where id=p_offer_id; if v_pre.id is null then raise exception 'Angebot nicht gefunden'; end if;
  select * into v_incident from public.disruption_incidents where id=v_pre.incident_id for update;
  select * into v_offer from public.disruption_offers where id=p_offer_id for update;
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.company_id=v_offer.company_id and e.id=private.sf_employee_identity_for_company(v_offer.company_id);
  if v_employee.id is null then raise exception 'Dieses Angebot gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if v_offer.status<>'OFFERED' then raise exception 'Dieses Angebot wurde bereits beantwortet'; end if;
  if v_decision='DECLINE' then update public.disruption_offers set status='DECLINED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id; return query select 'DECLINED'::text,'Anfrage abgelehnt. Die Disposition wurde informiert.'::text,v_incident.assignment_id; return; end if;
  if v_incident.status<>'OPEN' then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Der Störfall wurde bereits abgeschlossen'; end if;
  if v_offer.expires_at<=now() then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Das Angebot ist abgelaufen'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then update public.disruption_incidents set status='SUPERSEDED',resolved_at=now(),updated_at=now() where id=v_incident.id; update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.status='OFFERED'; raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;
  if exists(select 1 from private.disruption_replacements x join public.shift_change_requests r on r.id=x.change_id where x.incident_id=v_incident.id and r.status not in('REJECTED','SUPERSEDED','CANCELLED')) then raise exception 'Eine Ersatzübernahme ist bereits in Bearbeitung.';end if;
  if exists(select 1 from public.time_entries t where t.assignment_id=v_assignment.id) then raise exception 'Für den ursprünglichen Dienst bestehen Zeitbuchungen. Bitte die Disposition um eine Teilablösung bitten.';end if;
  if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception 'Teamleiterrolle erforderlich'; end if;
  v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%',v_reason; end if;
  
  v_reason:=private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'block';
  if v_reason is not null then raise exception '%',v_reason;end if;
  if coalesce((private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) then
   raise exception 'Der Rhythmus hat sich geändert. Bitte die Disposition um eine neue Prüfung bitten.';
  end if;
 if exists(select 1 from public.company_compliance_policy where company_id=v_incident.company_id and works_council_enabled) then
   update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
   update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
   insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id)
   select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Zusage zur Ersatzübernahme','Zusage eingegangen. Bitte Ersatzübernahme mit erforderlicher Betriebsratsfreigabe abschließen.','disruptions','disruption_incident',v_incident.id from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER');
   return query select 'ACCEPTED_PENDING'::text,'Zusage gespeichert. Der Dienstplan wird nach den erforderlichen Freigaben aktualisiert.'::text,v_assignment.id;return;
  end if;
  v_old:=jsonb_build_object('employeeId',v_assignment.employee_id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  v_new:=jsonb_build_object('employeeId',v_employee.id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(v_incident.company_id,v_assignment.id,'UPDATE',v_employee.id,v_assignment.version,v_old,v_new,'Störfall-Ersatz',left('Störfall-Autopilot #'||v_incident.id::text,2000),'NO',greatest(0,floor(extract(epoch from(v_assignment.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid) returning id into v_change_id;
  v_result:=public.apply_shift_change(v_change_id);
  update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
  update public.disruption_incidents set status='RESOLVED',resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) values(v_incident.company_id,'DISRUPTION_RESOLVED','disruption_incident',v_incident.id,v_uid,'EMPLOYEE',jsonb_build_object('employeeId',v_incident.original_employee_id),jsonb_build_object('employeeId',v_employee.id),jsonb_build_object('assignmentId',v_result,'changeRequestId',v_change_id));
  insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Störfall gelöst',trim(v_employee.first_name||' '||v_employee.last_name)||' übernimmt '||v_assignment.shift_code,'disruptions','disruption_incident',v_incident.id,jsonb_build_object('assignmentId',v_result)
  from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER');
  return query select 'ACCEPTED'::text,'Schicht übernommen und Dienstplan sofort aktualisiert.'::text,v_result;
end $function$
;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;


alter table sf_cancel_test add column ia uuid default gen_random_uuid(),add column ib uuid default gen_random_uuid(),add column oa uuid default gen_random_uuid(),add column ob uuid default gen_random_uuid();
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sa,a,ea,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test union all
select sb,b,eb,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test;
insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by)
select ia,a,sa,ea,1,'OTHER',u from sf_cancel_test union all select ib,b,sb,eb,1,'OTHER',u from sf_cancel_test;
insert into public.disruption_offers(id,company_id,incident_id,employee_id,offered_by,expires_at)
select oa,a,ia,ea,u,now()+interval '1 day' from sf_cancel_test union all select ob,b,ib,eb,u,now()+interval '1 day' from sf_cancel_test;
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false;actual text;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_respond_disruption_offer(x.ob,'DECLINE','test');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'response allowed for disabled company';end if;
 select status into actual from public.employee_respond_disruption_offer(x.oa,'DECLINE','test');
 if actual<>'DECLINED' then raise exception 'active company decline failed';end if;
end $test$;
reset role;
do $verify$ declare x sf_cancel_test%rowtype;begin select * into x from sf_cancel_test;
 if (select status from public.disruption_offers where id=x.ob)<>'OFFERED' then raise exception 'disabled offer modified';end if;
 if (select status from public.disruption_offers where id=x.oa)<>'DECLINED' then raise exception 'active offer not declined';end if;
end $verify$;
rollback;

-- disruption list
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: company-scoped disruption list; legacy calls reject ambiguous accounts.
-- Requires employee-company-identity-candidate.sql. Not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_for_company_impl(p_company_id uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_company uuid; v_count integer;
begin
 select count(*),min(company_id::text)::uuid into v_count,v_company from private.sf_employee_company_options();
 if v_count<>1 then raise exception 'Bitte das Unternehmen für den Mitarbeiterzugang auswählen' using errcode='42501'; end if;
 return query select * from private.employee_list_disruption_offers_for_company_impl(v_company);
end $function$;
CREATE OR REPLACE FUNCTION public.employee_list_disruption_offers_for_company(p_company_id uuid)
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text) LANGUAGE sql SET search_path TO '' AS $function$
 select * from private.employee_list_disruption_offers_for_company_impl(p_company_id)
$function$;
revoke all on function private.employee_list_disruption_offers_for_company_impl(uuid) from public,anon;
revoke all on function public.employee_list_disruption_offers_for_company(uuid) from public,anon;
grant execute on function private.employee_list_disruption_offers_for_company_impl(uuid) to authenticated;
grant execute on function public.employee_list_disruption_offers_for_company(uuid) to authenticated;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;


alter table sf_cancel_test add column ia uuid default gen_random_uuid(),add column ib uuid default gen_random_uuid(),add column oa uuid default gen_random_uuid(),add column ob uuid default gen_random_uuid();
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sa,a,ea,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test union all
select sb,b,eb,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test;
insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by)
select ia,a,sa,ea,1,'OTHER',u from sf_cancel_test union all select ib,b,sb,eb,1,'OTHER',u from sf_cancel_test;
insert into public.disruption_offers(id,company_id,incident_id,employee_id,offered_by,expires_at)
select oa,a,ia,ea,u,now()+interval '1 day' from sf_cancel_test union all select ob,b,ib,eb,u,now()+interval '1 day' from sf_cancel_test;

update public.employees set access_status='ACTIVE' where id=(select eb from sf_cancel_test);
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false;begin
 select * into x from sf_cancel_test;
 if (select count(*) from public.employee_list_disruption_offers_for_company(x.a) where offer_id=x.oa)<>1 then raise exception 'company A offer missing';end if;
 if exists(select 1 from public.employee_list_disruption_offers_for_company(x.a) where offer_id=x.ob) then raise exception 'company B offer visible in company A';end if;
 if (select count(*) from public.employee_list_disruption_offers_for_company(x.b) where offer_id=x.ob)<>1 then raise exception 'company B offer missing';end if;
 begin perform public.employee_list_disruption_offers();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ambiguous legacy list accepted';end if;
 if has_function_privilege('anon','public.employee_list_disruption_offers_for_company(uuid)','execute') then raise exception 'anonymous list access';end if;
end $test$;
reset role;
update public.employees set access_status='DISABLED' where id=(select eb from sf_cancel_test);
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype;denied boolean:=false;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_list_disruption_offers_for_company(x.b);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'disabled company list accepted';end if;
 if (select count(*) from public.employee_list_disruption_offers() where offer_id=x.oa)<>1 then raise exception 'single company legacy list failed';end if;
end $test$;
reset role;
rollback;