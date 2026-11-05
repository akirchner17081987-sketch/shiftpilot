do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ra uuid; rb uuid; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-profile-'||u::text||'@example.invalid','{}'),(other,'qa-profile-other-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA C',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 ra:=public.qa_submit_profile_request_scoped(a,'contact','Bitte Daten ändern');rb:=public.qa_submit_profile_request_scoped(b,'contact','Bitte Daten ändern');
 denied:=false;begin perform public.qa_submit_profile_request_scoped(c,'contact','Bitte Daten ändern');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company accepted'; end if;
 denied:=false;begin perform public.qa_submit_profile_request_scoped(a,'contact','Bitte Daten ändern');exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate request accepted'; end if;
 perform set_config('role','postgres',true);
 if not exists(select 1 from private.employee_profile_requests where id=ra and employee_id=ea and company_id=a) or not exists(select 1 from private.employee_profile_requests where id=rb and employee_id=eb and company_id=b) then raise exception 'Wrong employee profile'; end if;
 update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.qa_submit_profile_request_scoped(b,'other','Bitte Daten ändern');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled company accepted'; end if;
 perform set_config('role','postgres',true);
end $test$;
