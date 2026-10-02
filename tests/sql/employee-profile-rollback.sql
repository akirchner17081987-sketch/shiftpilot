-- Synthetic accounts only. All records, notifications and decisions are rolled back.
begin;
do $test$
declare u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); manager_u uuid:=gen_random_uuid(); foreign_u uuid:=gen_random_uuid(); planner_u uuid:=gen_random_uuid(); time_u uuid:=gen_random_uuid();
  uid uuid; company uuid; foreign_company uuid; employee uuid; other_e uuid; r jsonb; rid uuid; rejected uuid; negatives integer:=0;
begin
  foreach uid in array array[u,other_u,manager_u,foreign_u,planner_u,time_u] loop
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(uid,'authenticated','authenticated','sf-profile-rollback-'||uid||'@example.invalid','{}','{}',now(),now());
  end loop;
  insert into public.companies(name,created_by,timezone) values('SF Profile Rollback',manager_u,'Europe/Berlin') returning id into company;
  insert into public.companies(name,created_by,timezone) values('SF Profile Foreign',foreign_u,'Europe/Berlin') returning id into foreign_company;
  insert into public.company_members(company_id,user_id,role,status) values(company,manager_u,'OWNER','ACTIVE'),(foreign_company,foreign_u,'OWNER','ACTIVE'),(company,planner_u,'PLANNER','ACTIVE'),(company,time_u,'TIME_TRACKING','ACTIVE') on conflict do nothing;
  insert into public.shift_templates(company_id,code,name,default_start,default_end) values(company,'FD','Frühdienst','06:00','14:00');
  insert into public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,phone,access_status,shift_permissions,qualifications,note)
    values(company,u,'Synthetic','Own','PROFILE-OWN','contact@example.invalid','12345','ACTIVE',array['FD'],array['__sp:planningTeam=A','Sachkunde','__sp:internalSecret=HIDDEN_META'],'HIDDEN_EMPLOYEE_NOTE') returning id into employee;
  insert into public.employees(company_id,auth_user_id,first_name,last_name,personnel_no,email,access_status,shift_permissions)
    values(company,other_u,'Synthetic','Other','PROFILE-OTHER','other@example.invalid','ACTIVE',array['FD']) returning id into other_e;
  insert into public.employee_personnel_details(employee_id,company_id,department,job_title,work_location,private_note,cost_center,emergency_contact_name)
    values(employee,company,'Security','Test role','East','HIDDEN_PERSONNEL_NOTE','HIDDEN_COST_CENTER','HIDDEN_EMERGENCY');
  insert into public.employee_personnel_qualifications(company_id,employee_id,title,expires_on,note,credential_number) values
    (company,employee,'Own certificate',(statement_timestamp() at time zone 'Europe/Berlin')::date+30,'HIDDEN_QUALIFICATION_NOTE','HIDDEN_CREDENTIAL'),
    (company,other_e,'OTHER_CERTIFICATE',null,'','');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',manager_u::text,true);
  insert into public.company_planning_teams(company_id,team_code,start_date,pattern,start_offset) values(company,'A','2026-12-01',array['FD','FD','FREI'],1);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',u::text,true);
  set local role authenticated;
  r:=public.employee_my_profile();
  if r#>>'{employee,id}'<>employee::text or r#>>'{company,id}'<>company::text or r#>>'{details,work_location}'<>'East' or r#>>'{rhythm,team}'<>'A' or r#>>'{rhythm,offset}'<>'1' or r#>>'{rhythm,central}'<>'true' or r#>>'{qualifications,0,days_until_expiry}'<>'30' then raise exception 'Own profile/central rhythm/expiry failed: %',r;end if;
  if r::text like '%HIDDEN_%' or r::text like '%OTHER_CERTIFICATE%' or r->>'login_email'=r#>>'{employee,email}' then raise exception 'Private note, other employee or contact/login separation failed';end if;
  rid:=public.employee_submit_profile_request('contact','Please correct my phone to 56789.');
  rejected:=public.employee_submit_profile_request('planning','Please check my team allocation.');
  r:=public.employee_my_profile();if jsonb_array_length(r->'requests')<>2 or r#>>'{employee,phone}'<>'12345' then raise exception 'Request did not persist or changed personnel data automatically';end if;
  begin perform public.employee_submit_profile_request('contact','Another duplicate correction.');raise exception 'Duplicate accepted';exception when unique_violation then negatives:=negatives+1;end;
  begin perform public.employee_submit_profile_request('illegal','Enough words here.');raise exception 'Invalid category accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  begin perform public.employee_submit_profile_request('other','x');raise exception 'Short message accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  begin perform public.employee_submit_profile_request('other',repeat('x',2001));raise exception 'Long message accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  begin perform public.manager_profile_requests(company);raise exception 'Employee manager access accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  begin perform public.manager_review_profile_request(rid,'completed','Fake approval',true);raise exception 'Employee review accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  begin perform count(*) from private.employee_profile_requests;raise exception 'Direct table access accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',other_u::text,true);
  r:=public.employee_my_profile();if jsonb_array_length(r->'requests')<>0 or r#>>'{employee,id}'<>other_e::text then raise exception 'Cross-employee request leak';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',planner_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',planner_u::text,true);
  begin perform public.manager_profile_requests(company);raise exception 'Planner personnel access accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreign_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',foreign_u::text,true);
  begin perform public.manager_profile_requests(company);raise exception 'Cross-company list accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  begin perform public.manager_review_profile_request(rid,'completed','Cross-company approval',true);raise exception 'Cross-company review accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',manager_u::text,true);
  r:=public.manager_profile_requests(company);if r->>'pending_count'<>'2' or jsonb_array_length(r->'requests')<>2 then raise exception 'Manager queue failed';end if;
  begin perform public.manager_review_profile_request(rid,'completed','Phone was updated',false);raise exception 'Unconfirmed completion accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  begin perform public.manager_review_profile_request(rid,'rejected','no',false);raise exception 'Short response accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  reset role;
  if (select count(*) from public.notifications where entity_id=rid and kind='PROFILE_REQUESTED')<>1 or exists(select 1 from public.notifications where entity_id=rid and user_id=planner_u) then raise exception 'Incorrect manager notification recipients';end if;
  update public.employees set phone='56789' where id=employee;
  set local role authenticated;
  perform public.manager_review_profile_request(rid,'completed','Phone was updated in personnel data.',true);
  perform public.manager_review_profile_request(rejected,'rejected','The existing team allocation is correct.',false);
  begin perform public.manager_review_profile_request(rid,'rejected','Attempt to overwrite history.',false);raise exception 'Repeated review accepted';exception when invalid_parameter_value then negatives:=negatives+1;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',u::text,true);
  r:=public.employee_my_profile();if r#>>'{employee,phone}'<>'56789' or not exists(select 1 from jsonb_array_elements(r->'requests') q where q->>'id'=rid::text and q->>'status'='completed' and q->>'review_note'='Phone was updated in personnel data.') then raise exception 'Employee feedback or updated profile missing';end if;
  perform public.employee_submit_profile_request('contact','A later contact correction is allowed.');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',time_u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',time_u::text,true);
  begin perform public.employee_my_profile();raise exception 'Time-only access accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  reset role;update public.employees set access_status='DISABLED' where id=employee;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',u::text,true);
  set local role authenticated;
  begin perform public.employee_my_profile();raise exception 'Disabled account accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  reset role;set local role anon;
  begin perform public.employee_my_profile();raise exception 'Anonymous access accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  reset role;perform set_config('request.jwt.claims','{}',true);perform set_config('request.jwt.claim.sub','',true);set local role authenticated;
  begin perform private.employee_profile_identity_impl();raise exception 'No identity accepted';exception when insufficient_privilege then negatives:=negatives+1;end;
  reset role;
  if negatives<>17 then raise exception 'Missing negative checks: %',negatives;end if;
  if not exists(select 1 from public.notifications where entity_id=rid and user_id=u and kind='PROFILE_DECISION' and link_view='employee-profile') or (select count(*) from public.audit_events where entity_id=rid)<>2 then raise exception 'Decision notification/audit missing';end if;
  perform set_config('app.profile_qa','PASS: own profile, hidden internal fields, central team rhythm, expiry, contact/login separation, request persistence, duplicate prevention, personnel manager queue, explicit completion, reasoned rejection, own feedback, notifications, audit and 17 security/input negatives. Fixtures rolled back.',true);
end $test$;
select current_setting('app.profile_qa') result;
rollback;
