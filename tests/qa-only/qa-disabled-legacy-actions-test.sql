do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid();
 swap_id uuid:=gen_random_uuid(); incident uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-disabled-'||u::text||'@example.invalid','{}'),(other,'qa-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values
 (ea,a,'Test','A','A',u,'ACTIVE'),(eb,b,'Test','B','B',u,'DISABLED'),(peer,b,'Other','B','X',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at) values(ab,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z');
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(swap_id,b,ab,eb,peer,1,'PENDING_COLLEAGUE');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(incident,b,ab,eb,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(offer,incident,b,eb,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_cancel_shift_swap(swap_id); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Disabled company could cancel a swap'; end if;
 denied:=false;begin perform public.employee_respond_disruption_offer(offer,'DECLINE',''); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Disabled company could respond to a disruption'; end if;
 perform set_config('role','postgres',true);
end $test$;
