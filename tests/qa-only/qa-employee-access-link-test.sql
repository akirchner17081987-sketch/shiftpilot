do $test$
declare admin uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); ex uuid:=gen_random_uuid(); denied boolean; n integer; mail text;
begin
 mail:='qa-staff-'||staff::text||'@example.invalid';
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (admin,'qa-admin-'||admin::text||'@example.invalid',now(),'{}'),(staff,mail,now(),'{}'),(other,'qa-other-'||other::text||'@example.invalid',now(),'{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',admin),(b,'QA B',admin),(c,'QA C',other);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(a,admin,'OWNER','OWNER','ACTIVE'),(b,admin,'ADMIN','ADMIN','ACTIVE');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
 values(ea,a,'Test','A','A',mail,staff,'ACTIVE'),(eb,b,'Test','B','B',mail,null,'NONE'),(ec,c,'Test','C','C',mail,null,'NONE'),(ex,b,'Different','B','X','other@example.invalid',null,'NONE');
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.qa_managed_employee_profiles(a,ea) where employee_id=eb and enabled=false;
 if n<>1 then raise exception 'candidate missing'; end if;
 denied:=false; begin perform public.qa_set_employee_profile_access(a,ea,ex,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'mismatched address accepted'; end if;
 denied:=false; begin perform public.qa_set_employee_profile_access(a,ea,ec,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unmanaged company accepted'; end if;
 perform public.qa_set_employee_profile_access(a,ea,eb,true);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.qa_employee_company_options() where company_id=b;
 if n<>1 then raise exception 'new company was not linked'; end if;
 perform set_config('role','postgres',true);
end $test$;
