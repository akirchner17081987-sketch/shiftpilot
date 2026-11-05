do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); row_data jsonb; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-time-'||u::text||'@example.invalid','{}'),(other,'qa-time-other-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE'),(stranger,a,'Other','A','X',other,'ACTIVE');
 insert into public.time_month_closures(company_id,month_start,status,closed_at,closed_by,report_snapshot) values
 (a,'2030-01-01','CLOSED',now(),u,jsonb_build_object('employees',jsonb_build_array(jsonb_build_object('employee_id',stranger,'target_minutes',999),jsonb_build_object('employee_id',ea,'target_minutes',111)))),
 (b,'2030-01-01','CLOSED',now(),u,jsonb_build_object('employees',jsonb_build_array(jsonb_build_object('employee_id',eb,'target_minutes',222))));
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 row_data:=public.qa_employee_time_account_scoped(a,'2030-01-15');if row_data->>'employee_id'<>ea::text or (row_data->>'target_minutes')::int<>111 then raise exception 'Wrong A closed snapshot'; end if;
 row_data:=public.qa_employee_time_account_scoped(b,'2030-01-01');if row_data->>'employee_id'<>eb::text or (row_data->>'target_minutes')::int<>222 then raise exception 'Wrong B closed snapshot'; end if;
 row_data:=public.qa_employee_time_account_scoped(b,'2030-02-01');if row_data->>'employee_id'<>eb::text then raise exception 'Wrong B open month'; end if;
 perform set_config('role','postgres',true);update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.qa_employee_time_account_scoped(b,'2030-01-01');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked closed snapshot accessible'; end if;
 perform set_config('role','postgres',true);
end $test$;
