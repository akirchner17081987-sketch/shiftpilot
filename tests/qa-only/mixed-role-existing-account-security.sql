begin;
do $test$
declare o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); raw text:=repeat('a',72); mail text:='qa-claim-'||e::text||'@example.invalid'; result jsonb; denied boolean;
begin
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(o,'qa-owner-'||o::text||'@example.invalid',now(),'{}'),(u,mail,null,'{}'),(w,'qa-wrong-'||w::text||'@example.invalid',now(),'{}');
insert into public.companies(id,name,created_by) values(a,'QA claim A',o),(b,'QA claim B',o);
insert into public.company_members(company_id,user_id,role,status,access_role) values(a,o,'OWNER','ACTIVE','OWNER'),(b,o,'OWNER','ACTIVE','OWNER');
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(e,a,'QA','Claim','QAC-'||left(e::text,8),mail);
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
result:=private.manager_create_multi_access_invite(a,mail,jsonb_build_array(jsonb_build_object('company_id',a,'role','EMPLOYEE','employee_id',e),jsonb_build_object('company_id',b,'role','ADMIN')),encode(extensions.digest(raw,'sha256'),'hex'));
perform set_config('request.jwt.claim.sub',u::text,true);denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'unconfirmed accepted';end if;
update auth.users set email_confirmed_at=now() where id=u;perform set_config('request.jwt.claim.sub',w::text,true);
denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'wrong account accepted';end if;
perform set_config('request.jwt.claim.sub',u::text,true);result:=private.claim_multi_company_invite(raw);
if (result->>'companies')::int<>2 or not exists(select 1 from public.employees where id=e and auth_user_id=u and access_status='ACTIVE') or not exists(select 1 from public.company_members where company_id=b and user_id=u and access_role='ADMIN' and status='ACTIVE') then raise exception 'incomplete grant';end if;
denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'reuse accepted';end if;
if exists(select 1 from private.qa_mixed_claim_context) then raise exception 'claim context leaked';end if;
end $test$;rollback;