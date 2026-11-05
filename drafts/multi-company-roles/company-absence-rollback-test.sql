begin;
do $test$
declare o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); raw text:=repeat('a',72); mail text:='qa-claim-'||e::text||'@example.invalid'; result jsonb; denied boolean; shift_id uuid:=gen_random_uuid(); shift2 uuid:=gen_random_uuid(); e2 uuid:=gen_random_uuid(); abs1 uuid; abs2 uuid;
begin
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(o,'qa-owner-'||o::text||'@example.invalid',now(),'{}'),(u,mail,null,'{}'),(w,'qa-wrong-'||w::text||'@example.invalid',now(),'{}');
insert into public.companies(id,name,created_by) values(a,'QA claim A',o),(b,'QA claim B',o);
insert into public.company_members(company_id,user_id,role,status,access_role) values(a,o,'OWNER','ACTIVE','OWNER'),(b,o,'OWNER','ACTIVE','OWNER');
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(e,a,'QA','Claim','QAC-'||left(e::text,8),mail);
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
result:=private.manager_create_multi_access_invite(a,mail,jsonb_build_array(jsonb_build_object('company_id',a,'role','EMPLOYEE','employee_id',e),jsonb_build_object('company_id',b,'role','ADMIN')),encode(extensions.digest(raw,'sha256'),'hex'));
if private.multi_invite_email_companies(a,(result->>'id')::uuid,result->>'parameter',encode(extensions.digest(raw,'sha256'),'hex')) <> 'QA claim A, QA claim B' then raise exception 'incorrect company names'; end if;
denied:=false;begin perform private.multi_invite_email_companies(a,gen_random_uuid(),result->>'parameter',encode(extensions.digest(raw,'sha256'),'hex'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'wrong anchor accepted';end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal1','role','authenticated')::text,true);
denied:=false;begin perform private.multi_invite_email_companies(a,(result->>'id')::uuid,result->>'parameter',encode(extensions.digest(raw,'sha256'),'hex'));exception when others then denied:=true;end;if not denied then raise exception 'lookup accepted without MFA';end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
perform set_config('request.jwt.claim.sub',u::text,true);denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'unconfirmed accepted';end if;
update auth.users set email_confirmed_at=now() where id=u;perform set_config('request.jwt.claim.sub',w::text,true);
denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'wrong account accepted';end if;
perform set_config('request.jwt.claim.sub',u::text,true);result:=private.claim_multi_company_invite(raw);
if (result->>'companies')::int<>2 or not exists(select 1 from public.employees where id=e and auth_user_id=u and access_status='ACTIVE') or not exists(select 1 from public.company_members where company_id=b and user_id=u and access_role='ADMIN' and status='ACTIVE') then raise exception 'incomplete grant';end if;

if (select count(*) from public.employee_company_options())<>1 or not exists(select 1 from public.employee_company_options() where company_id=a and employee_id=e) then raise exception 'wrong employee options';end if;
if not exists(select 1 from jsonb_array_elements(public.multi_role_company_options()) z where z->>'company_id'=a::text and z->>'mode'='employee') or not exists(select 1 from jsonb_array_elements(public.multi_role_company_options()) z where z->>'company_id'=b::text and z->>'mode'='manager' and z->>'role'='ADMIN') then raise exception 'mixed roles missing';end if;
if private.sf_employee_identity_for_company(a)<>e then raise exception 'wrong employee identity';end if;
denied:=false;begin perform private.sf_employee_identity_for_company(b);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'manager role incorrectly treated as employee';end if;
perform set_config('request.jwt.claim.sub',o::text,true);
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status) values(e2,b,'QA','Second','QB-'||left(e2::text,8),mail,u,'ACTIVE');
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(shift2,b,e2,'QA',now()-interval '8 hours',now()-interval '1 hour','PUBLISHED',now());
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(shift_id,a,e,'QA',now()-interval '8 hours',now()-interval '1 hour','PUBLISHED',now());
perform set_config('request.jwt.claim.sub',u::text,true);
perform public.employee_submit_time_entry_for_company(a,shift_id,now()-interval '8 hours',now()-interval '1 hour',30,'QA test');
if not exists(select 1 from public.time_entries where assignment_id=shift_id and company_id=a and status='recorded') then raise exception 'time not saved to correct company';end if;
perform public.employee_submit_time_entry_for_company(b,shift2,now()-interval '8 hours',now()-interval '1 hour',30,'QA company B');
if not exists(select 1 from public.time_entries where assignment_id=shift2 and company_id=b and status='recorded') then raise exception 'second company time missing';end if;
denied:=false;begin perform public.employee_submit_time_entry_for_company(b,shift_id,now()-interval '8 hours',now()-interval '1 hour',30,'');exception when others then denied:=true;end;if not denied then raise exception 'cross-company time accepted';end if;
abs1:=public.employee_submit_absence_request_for_company(a,'Urlaub',current_date+40,current_date+40,'QA',true,null,null,'');
abs2:=public.employee_submit_absence_request_for_company(b,'Urlaub',current_date+40,current_date+40,'QA',true,null,null,'');
if not exists(select 1 from public.absences where id=abs1 and company_id=a and employee_id=e and status='Beantragt') or not exists(select 1 from public.absences where id=abs2 and company_id=b and employee_id=e2 and status='Beantragt') then raise exception 'absence assigned to wrong profile';end if;
denied:=false;begin perform public.employee_submit_absence_request_for_company(a,'Urlaub',current_date+40,current_date+40,'QA',true,null,null,'');exception when others then denied:=true;end;if not denied then raise exception 'overlap accepted';end if;
perform set_config('request.jwt.claim.sub',w::text,true);
denied:=false;begin perform public.employee_submit_absence_request_for_company(a,'Urlaub',current_date+41,current_date+41,'QA',true,null,null,'');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'other user absence accepted';end if;
perform set_config('request.jwt.claim.sub',u::text,true);
update public.employees set access_status='DISABLED' where id=e;
denied:=false;begin perform public.employee_submit_absence_request_for_company(a,'Urlaub',current_date+41,current_date+41,'QA',true,null,null,'');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'revoked profile absence accepted';end if;
denied:=false;begin perform public.employee_submit_time_entry_for_company(a,shift_id,now()-interval '8 hours',now()-interval '1 hour',30,'');exception when others then denied:=true;end;if not denied then raise exception 'revoked access time accepted';end if;
denied:=false;begin perform private.sf_employee_identity_for_company(a);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'revoked identity still active';end if;
if exists(select 1 from public.employee_company_options() where employee_id=e) then raise exception 'revoked employee still visible';end if;
if exists(select 1 from jsonb_array_elements(public.multi_role_company_options()) z where z->>'company_id'=a::text and z->>'mode'='employee') then raise exception 'revoked role still visible';end if;
if not exists(select 1 from jsonb_array_elements(public.multi_role_company_options()) z where z->>'company_id'=b::text and z->>'mode'='manager') then raise exception 'unrelated manager access lost';end if;
update public.employees set access_status='ACTIVE' where id=e;
perform set_config('request.jwt.claim.sub',w::text,true);
if (select count(*) from public.employee_company_options())<>0 or jsonb_array_length(public.multi_role_company_options())<>0 then raise exception 'another account saw options';end if;
perform set_config('request.jwt.claim.sub',u::text,true);
denied:=false;begin perform private.claim_multi_company_invite(raw);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'reuse accepted';end if;
if exists(select 1 from private.sf_multi_claim_context) then raise exception 'claim context leaked';end if;
end $test$;





rollback;