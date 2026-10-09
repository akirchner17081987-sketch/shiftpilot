begin;
create function public.publish_schedule_period(p_company_id uuid,p_start_date date,p_end_date date) returns table(published_at timestamptz,assignment_count integer) language sql as $$select * from private.publish_schedule_period_impl(p_company_id,p_start_date,p_end_date)$$;
create function public.manager_bulk_record_time_entries(p_company_id uuid,p_start_date date,p_end_date date,p_note text default '',p_confirm boolean default false) returns jsonb language sql as $$select private.manager_bulk_record_time_entries(p_company_id,p_start_date,p_end_date,p_note,p_confirm)$$;
create function public.fixture_reject(statement text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
  if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception 'FAIL accepted forbidden statement: %',statement; end if;
end $$;
do $$
declare
 owner_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); lead_id uuid:=gen_random_uuid(); time_id uuid:=gen_random_uuid(); portal_id uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid(); other_company uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); new_employee uuid:=gen_random_uuid(); assignment uuid:=gen_random_uuid();
 invitation jsonb; result jsonb; ident uuid; n integer; start_time timestamptz:=now()-interval '3 days'; raw text:='fixture-token-only';
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select id,'authenticated','authenticated',label||id||'@example.invalid','{}','{}',now(),now()
 from (values(owner_id,'owner'),(admin_id,'admin'),(lead_id,'lead'),(time_id,'time'),(portal_id,'portal')) x(id,label);
 insert into public.companies(id,name,created_by,timezone) values(company,'Four roles fixture',owner_id,'Europe/Berlin'),(other_company,'Foreign fixture',owner_id,'Europe/Berlin');
 insert into public.company_members(company_id,user_id,role,status) values(company,owner_id,'OWNER','ACTIVE'),(company,admin_id,'ADMIN','ACTIVE'),(company,time_id,'TIME_TRACKING','ACTIVE');
 insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(company,lead_id,'PLANNER','ACTIVE','TEAM_LEAD','{}');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,status,auth_user_id,access_status)
 values(employee,company,'Personal','Portal','FIX-PORTAL','active',portal_id,'ACTIVE'),(new_employee,company,'New','Employee','FIX-NEW','active',null,'NONE');
 insert into public.shift_templates(company_id,code,name,default_start,default_end) values(company,'FIX','Fixture','08:00','16:00');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,status,created_by)
 values(assignment,company,employee,'FIX',start_time,start_time+interval '8 hours',30,'DRAFT',owner_id);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 execute 'set local role authenticated';
 result:=public.manager_list_access_users(company);
 if jsonb_array_length(result->'users')<>5 then raise exception 'FAIL personal account integration'; end if;
 if result->'users' @> '[{"role":"PLANNER"}]' then raise exception 'FAIL legacy role exposed'; end if;
 perform public.fixture_reject(format('select public.manager_set_access_profile(%L,%L,%L,%L,%L)',company,owner_id,'ADMIN','{}','ACTIVE'),'geschützt');
 perform public.manager_set_access_profile(company,lead_id,'TEAM_LEAD',array['manage_time'],'ACTIVE');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',lead_id,'role','authenticated','aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',lead_id::text,true);
 result:=public.access_profile_context(company);if result->>'role'<>'TEAM_LEAD' then raise exception 'FAIL context';end if;
 perform public.fixture_reject(format('select * from public.publish_schedule_period(%L,current_date,current_date)',company),'veröffentlichen');
 result:=public.manager_save_time_entry(assignment,start_time,start_time+interval '8 hours',30,'Recorded only',false);
 if result->>'status'<>'recorded' then raise exception 'FAIL manage-time-only save';end if;
 perform public.fixture_reject(format('select public.manager_review_time_entry(%L,%L,%L)',assignment,'CONFIRM','Denied'),'bestätigen');
 perform public.fixture_reject(format('select public.manager_bulk_record_time_entries(%L,current_date,current_date,%L,true)',company,'Empty but denied'),'bestätigen');
 perform public.fixture_reject(format('select public.access_profile_context(%L)',other_company),'berechtigt');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 perform public.manager_set_access_profile(company,lead_id,'TEAM_LEAD',array['confirm_time'],'ACTIVE');
 perform set_config('request.jwt.claim.sub',lead_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',lead_id,'role','authenticated','aal','aal2')::text,true);
 result:=public.manager_review_time_entry(assignment,'CONFIRM','Review only');if result->>'status'<>'confirmed' then raise exception 'FAIL confirm-time-only review';end if;
 perform public.fixture_reject(format('select public.manager_save_time_entry(%L,%L,%L,30,%L,false)',assignment,start_time,start_time+interval '8 hours','Denied edit'),'verwalten');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 perform public.manager_set_access_profile(company,lead_id,'TEAM_LEAD',array['publish_schedule'],'ACTIVE');
 perform set_config('request.jwt.claim.sub',lead_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',lead_id,'role','authenticated','aal','aal2')::text,true);
 perform public.publish_schedule_period(company,(start_time at time zone 'Europe/Berlin')::date,(start_time at time zone 'Europe/Berlin')::date);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 perform public.manager_set_access_profile(company,lead_id,'TEAM_LEAD',array['read_only'],'ACTIVE');
 perform set_config('request.jwt.claim.sub',lead_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',lead_id,'role','authenticated','aal','aal2')::text,true);
 select count(*) into n from public.employees where company_id=company;if n<>0 then raise exception 'FAIL read-only personnel exposure';end if;
 result:=public.read_only_schedule_snapshot(company);
 if result->'employees'->0 ? 'email' or result->'employees'->0 ? 'birth_date' or result->'assignments'->0 ? 'note' then raise exception 'FAIL snapshot PII';end if;
 perform public.fixture_reject(format('select * from public.publish_schedule_period(%L,current_date,current_date)',company),'authorized');
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
 perform public.fixture_reject(format('select public.manager_set_access_profile(%L,%L,%L,%L,%L)',company,lead_id,'ADMIN','{}','ACTIVE'),'Inhaber');
 perform public.fixture_reject(format('select public.manager_create_access_invite(%L,%L,%L,%L,%L,null)',company,'admin-new@example.invalid','ADMIN','{}',repeat('a',64)),'Inhaber');
 perform public.fixture_reject(format('select public.manager_create_company_invite(%L,%L,%L,%L)',company,'legacy-admin@example.invalid','ADMIN',repeat('a',64)),'Inhaber');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 invitation:=public.manager_create_access_invite(company,'new@example.invalid','EMPLOYEE','{}',repeat('b',64),new_employee);
 if invitation->>'parameter'<>'employeeInvite' then raise exception 'FAIL portal invite';end if;
 perform public.manager_revoke_access_invite(company,(invitation->>'id')::uuid);
 perform public.manager_set_access_profile(company,portal_id,'TEAM_LEAD','{}','ACTIVE');
 result:=public.manager_list_access_users(company);if jsonb_array_length(result->'users')<>5 then raise exception 'FAIL duplicate personal promotion';end if;
 perform public.manager_set_access_profile(company,portal_id,'EMPLOYEE','{}','DISABLED');
 perform set_config('request.jwt.claim.sub',portal_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',portal_id,'role','authenticated','aal','aal2')::text,true);
 perform public.fixture_reject(format('select public.access_profile_context(%L)',company),'berechtigt');
 perform set_config('request.jwt.claim.sub',time_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',time_id,'role','authenticated','aal','aal2')::text,true);
 result:=public.access_profile_context(company);if result->>'role'<>'EMPLOYEE' or not result->'permissions' @> '["manage_time","confirm_time"]' then raise exception 'FAIL existing time access';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
 perform public.fixture_reject(format('select public.manager_set_access_profile(%L,%L,%L,%L,%L)',company,lead_id,'TEAM_LEAD','{}','ACTIVE'),'MFA_REQUIRED');
 execute 'reset role';
 select count(*) into n from public.audit_events where company_id=company and event_type='USER_ACCESS_CHANGED';if n<5 then raise exception 'FAIL access audit';end if;
end $$;
rollback;
