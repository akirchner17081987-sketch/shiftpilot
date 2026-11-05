-- Run inside a transaction: temporary grants exercise the browser-facing function.
grant execute on function private.qa_create_multi_employee_invite(uuid,uuid[],text,text),public.qa_create_multi_employee_invite(uuid,uuid[],text,text) to authenticated;
do $test$
declare admin uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); ed uuid:=gen_random_uuid(); mail text:='qa-pending-'||gen_random_uuid()::text||'@example.invalid'; other_mail text:='qa-independent-'||gen_random_uuid()::text||'@example.invalid'; rejected boolean; response jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(admin,'qa-admin-'||admin::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',admin),(b,'QA B',admin),(c,'QA C',admin);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a,admin,'OWNER','ACTIVE','OWNER'),(b,admin,'OWNER','ACTIVE','OWNER'),(c,admin,'OWNER','ACTIVE','OWNER');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(ea,a,'QA','A','A',mail),(eb,b,'QA','B','B',mail),(ec,c,'QA','C','C',mail),(ed,c,'QA','D','D',other_mail);
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 rejected:=false;begin perform public.qa_create_multi_employee_invite(a,array[ea,eb],mail,repeat('a',64));exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Invitation accepted without MFA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 response:=public.qa_create_multi_employee_invite(a,array[ea,eb],mail,repeat('a',64));
 if response->>'parameter'<>'employeeInvite' then raise exception 'Invitation was not created'; end if;
 if exists(select 1 from public.qa_invitable_employee_profiles(c,mail) where employee_id=eb) then raise exception 'Reserved target listed as available'; end if;
 rejected:=false;begin perform public.qa_create_multi_employee_invite(c,array[ec,eb],mail,repeat('b',64));exception when raise_exception then if sqlerrm='Eine offene Einladung besteht bereits' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'Second invitation reused a pending profile'; end if;
 rejected:=false;begin perform public.manager_create_access_invite(b,mail,'EMPLOYEE','{}'::text[],repeat('c',64),eb);exception when raise_exception then if sqlerrm='Eine offene Mehrfach-Einladung besteht bereits' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'Single-company invitation reused a pending profile'; end if;
 response:=public.manager_create_access_invite(c,other_mail,'EMPLOYEE','{}'::text[],repeat('d',64),ed);
 if response->>'parameter'<>'employeeInvite' then raise exception 'Independent invitation was blocked'; end if;
 perform set_config('role','postgres',true);
end $test$;
