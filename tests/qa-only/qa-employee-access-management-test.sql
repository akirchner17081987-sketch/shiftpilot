do $test$
declare admin uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); ex uuid:=gen_random_uuid();
 denied boolean; n integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (admin,'qa-admin-'||admin::text||'@example.invalid','{}'),(staff,'qa-staff-'||staff::text||'@example.invalid','{}'),(stranger,'qa-other-'||stranger::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',admin),(b,'QA B',admin),(c,'QA C',stranger);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(a,admin,'OWNER','OWNER','ACTIVE'),(b,admin,'ADMIN','ADMIN','ACTIVE');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status)
 values(ea,a,'Test','A','A',staff,'ACTIVE'),(eb,b,'Test','B','B',staff,'ACTIVE'),(ec,c,'Test','C','C',staff,'ACTIVE'),(ex,b,'Other','B','X',stranger,'ACTIVE');
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.qa_managed_employee_profiles(a,ea);
 if n<>2 then raise exception 'expected exactly the two manageable profiles, got %',n; end if;
 denied:=false; begin perform public.qa_set_employee_profile_access(a,ea,ec,false); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unmanaged company accepted'; end if;
 denied:=false; begin perform public.qa_set_employee_profile_access(a,ea,ex,false); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'another employee accepted'; end if;
 perform public.qa_set_employee_profile_access(a,ea,eb,false);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.qa_employee_company_options() where company_id=b;
 if n<>0 then raise exception 'disabled company still selectable'; end if;
 denied:=false; begin perform public.qa_employee_profile_scoped(b); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'disabled profile still accessible through scoped API'; end if;
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'aal','aal2','role','authenticated')::text,true);
 perform public.qa_set_employee_profile_access(a,ea,eb,true);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'aal','aal1','role','authenticated')::text,true);
 select count(*) into n from public.qa_employee_company_options() where company_id=b;
 if n<>1 then raise exception 're-enabled profile not selectable'; end if;
 perform set_config('role','postgres',true);
end $test$;
