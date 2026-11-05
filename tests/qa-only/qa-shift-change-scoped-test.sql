do $test$
declare u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid(); status_result text; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-change-'||u::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 insert into public.shift_change_requests(id,company_id,employee_id,action,proposed_snapshot,reason_code,compliance_status,status,requires_employee_approval) values(ra,a,ea,'CREATE','{}','Test','GREEN','PENDING_EMPLOYEE',true),(rb,b,eb,'CREATE','{}','Test','GREEN','PENDING_EMPLOYEE',true);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 denied:=false;begin perform public.qa_respond_change_scoped(a,rb,'REJECTED');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-company response accepted'; end if;
 perform set_config('role','postgres',true);update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_respond_to_shift_change(rb,'REJECTED');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Legacy response accepted revoked profile'; end if;
 perform set_config('role','postgres',true);update public.employees set access_status='ACTIVE' where id=eb;perform set_config('role','authenticated',true);
 select status into status_result from public.qa_respond_change_scoped(b,rb,'REJECTED');
 if status_result<>'REJECTED' then raise exception 'Valid response failed'; end if;
 perform set_config('role','postgres',true);
end $test$;
