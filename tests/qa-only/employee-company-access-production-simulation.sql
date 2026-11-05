-- Isolated QA only: already uses company-scoped index and exposes QA profile functions.
begin;
-- Prepare explicit per-company employee access; release with verified portal integration.
-- Permit one account to have at most one employee profile in each company.
-- QA already uses company-scoped uniqueness.
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

do $x$ declare u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();denied boolean:=false;begin
insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-unique-'||u::text||'@example.invalid','{}');
insert into public.companies(id,name,created_by) values(a,'QA index A',u),(b,'QA index B',u);
insert into public.employees(company_id,first_name,last_name,personnel_no,auth_user_id) values(a,'A','A','1',u),(b,'B','B','2',u);
begin insert into public.employees(company_id,first_name,last_name,personnel_no,auth_user_id) values(a,'C','C','3',u);exception when unique_violation then denied:=true;end;
if not denied then raise exception 'Duplicate profile in same company accepted';end if;end $x$;
do $test$
declare admin uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); ex uuid:=gen_random_uuid(); denied boolean; n integer; mail text;
begin
 mail:='qa-staff-'||staff::text||'@example.invalid';
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (admin,'qa-admin-'||admin::text||'@example.invalid',now(),'{}'),(staff,mail,null,'{}'),(other,'qa-other-'||other::text||'@example.invalid',now(),'{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',admin),(b,'QA B',admin),(c,'QA C',other);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(a,admin,'OWNER','OWNER','ACTIVE'),(b,admin,'ADMIN','ADMIN','ACTIVE');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
 values(ea,a,'Test','A','A',mail,staff,'ACTIVE'),(eb,b,'Test','B','B',mail,null,'NONE'),(ec,c,'Test','C','C',mail,null,'NONE'),(ex,b,'Different','B','X','other@example.invalid',null,'NONE');
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal1','role','authenticated')::text,true);
 denied:=false;begin perform public.manager_set_employee_company_access(a,ea,eb,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Missing MFA accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 denied:=false; begin perform public.manager_set_employee_company_access(a,ea,eb,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unverified email accepted'; end if;
 perform set_config('role','postgres',true);
 update auth.users set email_confirmed_at=now() where id=staff;
 perform set_config('role','authenticated',true);
 select count(*) into n from public.manager_employee_company_profiles(a,ea) where employee_id=eb and enabled=false;
 if n<>1 then raise exception 'candidate missing'; end if;
 denied:=false; begin perform public.manager_set_employee_company_access(a,ea,ex,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'mismatched address accepted'; end if;
 denied:=false; begin perform public.manager_set_employee_company_access(a,ea,ec,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unmanaged company accepted'; end if;
 perform public.manager_set_employee_company_access(a,ea,eb,true);
 perform set_config('role','postgres',true);
 if not exists(select 1 from public.audit_events where company_id=b and entity_id=eb and actor_id=admin and event_type='EMPLOYEE_COMPANY_ACCESS_CHANGED') then raise exception 'Missing access audit entry'; end if;
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.employee_company_options() where company_id=b;
 if n<>1 then raise exception 'new company was not linked'; end if;
 perform set_config('role','postgres',true);
end $test$;

do $test$
declare admin uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); ex uuid:=gen_random_uuid();
 denied boolean; n integer;
begin
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 insert into auth.users(id,email,raw_user_meta_data) values
 (admin,'qa-admin-'||admin::text||'@example.invalid','{}'),(staff,'qa-staff-'||staff::text||'@example.invalid','{}'),(stranger,'qa-other-'||stranger::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',admin),(b,'QA B',admin),(c,'QA C',stranger);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(a,admin,'OWNER','OWNER','ACTIVE'),(b,admin,'ADMIN','ADMIN','ACTIVE');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status)
 values(ea,a,'Test','A','A',staff,'ACTIVE'),(eb,b,'Test','B','B',staff,'ACTIVE'),(ec,c,'Test','C','C',staff,'ACTIVE'),(ex,b,'Other','B','X',stranger,'ACTIVE');
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.manager_employee_company_profiles(a,ea);
 if n<>2 then raise exception 'expected exactly the two manageable profiles, got %',n; end if;
 denied:=false; begin perform public.manager_set_employee_company_access(a,ea,ec,false); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unmanaged company accepted'; end if;
 denied:=false; begin perform public.manager_set_employee_company_access(a,ea,ex,false); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'another employee accepted'; end if;
 perform public.manager_set_employee_company_access(a,ea,eb,false);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.employee_company_options() where company_id=b;
 if n<>0 then raise exception 'disabled company still selectable'; end if;
 denied:=false; begin perform public.qa_employee_profile_scoped(b); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'disabled profile still accessible through scoped API'; end if;
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform public.manager_set_employee_company_access(a,ea,eb,true);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.employee_company_options() where company_id=b;
 if n<>1 then raise exception 're-enabled profile not selectable'; end if;
 perform set_config('role','postgres',true);
end $test$;

rollback;
