-- TEST BRANCH ONLY. Synthetic data and changes are rolled back.
begin;
do $test$
declare
 o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
 mail text:='qa-lifecycle-'||u::text||'@example.invalid'; old_token text:=repeat('a',72); new_token text:=repeat('b',72);
 targets jsonb; initial jsonb; renewed jsonb; denied boolean;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  (o,'qa-owner-'||o::text||'@example.invalid',now(),'{}'),(u,mail,now(),'{}');
 insert into public.companies(id,name,created_by) values(a,'QA Lifecycle A',o),(b,'QA Lifecycle B',o);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a,o,'OWNER','ACTIVE','OWNER'),(b,o,'OWNER','ACTIVE','OWNER');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(e,a,'QA','Lifecycle','QA-'||left(e::text,8),mail);
 targets:=jsonb_build_array(jsonb_build_object('company_id',a,'role','EMPLOYEE','employee_id',e),jsonb_build_object('company_id',b,'role','TEAM_LEAD'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
 execute 'set local role authenticated';
 initial:=public.manager_create_multi_access_invite(a,mail,targets,encode(extensions.digest(old_token,'sha256'),'hex'));
 renewed:=public.manager_renew_multi_access_invite(a,(initial->>'id')::uuid,mail,targets,encode(extensions.digest(new_token,'sha256'),'hex'));
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true);
 denied:=false;
 begin perform public.claim_multi_company_invite(old_token); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Old link remains valid after renewal'; end if;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
 perform public.manager_revoke_multi_or_single_invite(a,(renewed->>'id')::uuid);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true);
 denied:=false;
 begin perform public.claim_multi_company_invite(new_token); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Renewed link remains valid after revocation'; end if;
 execute 'reset role';
 if exists(select 1 from public.employees where id=e and auth_user_id=u) or
    exists(select 1 from public.company_members where company_id=b and user_id=u) then
   raise exception 'Revoked invitation granted access';
 end if;
end $test$;
rollback;
