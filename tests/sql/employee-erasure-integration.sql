-- Entirely fictitious companies, staff and bookings.
create function public.assert_erasure(ok boolean,message text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'ASSERTION: %',message;end if;end$$;
insert into auth.users(id,email) values('10000000-0000-0000-0000-000000000001','owner@example.invalid'),('10000000-0000-0000-0000-000000000002','planner@example.invalid');
insert into public.companies(id,name,created_by) values('20000000-0000-0000-0000-000000000001','Erasure fixture','10000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002','Other fixture','10000000-0000-0000-0000-000000000001');
insert into public.company_members(company_id,user_id,role,status) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','OWNER','ACTIVE'),('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','PLANNER','ACTIVE');
insert into public.employees(id,company_id,legacy_id,first_name,last_name,personnel_no) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','erasure-target','Fixture','Employee','9001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','erasure-colleague','Fixture','Colleague','9002'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','other-company','Fixture','Employee','9001');
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,created_by) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','TEST','2026-08-01 06:00+02','2026-08-01 14:00+02','PUBLISHED','10000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','TEST','2026-08-01 06:00+02','2026-08-01 14:00+02','PUBLISHED','10000000-0000-0000-0000-000000000001');
insert into public.time_entries(assignment_id,company_id,actual_start,actual_end,status) select id,company_id,starts_at,ends_at,'confirmed' from public.shift_assignments;
insert into public.absences(company_id,employee_id,start_date,end_date,absence_type) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-08-02','2026-08-02','Urlaub');
insert into public.employee_personnel_details(employee_id,company_id,private_note) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','fictitious private data');
insert into public.employee_personnel_documents(company_id,employee_id,title,file_name,storage_path) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Fixture','fixture.pdf','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/fixture.pdf');
insert into storage.objects(bucket_id,name) values('personnel-documents','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/fixture.pdf');
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active,pilot_employee_id) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Fixture terminal','\x1234',true,'30000000-0000-0000-0000-000000000001');
insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at) values('61000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','2026-08-01 06:00+02');
insert into public.time_qr_independent_events(shift_id,action,punched_at,request_id) values('61000000-0000-0000-0000-000000000001','CLOCK_IN','2026-08-01 06:00+02',repeat('a',64));
insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at) values('61000000-0000-0000-0000-000000000001',1,'2026-08-01 10:00+02');
insert into public.time_qr_independent_sessions(token_hash,company_id,employee_id,terminal_id,expires_at) values('\x5678','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',now()+interval '1 hour');
insert into public.time_qr_pilot_employees(terminal_id,employee_id,company_id) values('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,punch_type) values('20000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CLOCK_IN');
insert into public.time_qr_breaks(company_id,terminal_id,assignment_id,employee_id,started_at) values('20000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-08-01 10:00+02');
insert into public.notifications(id,company_id,user_id,employee_id,kind,title,entity_type,entity_id) values('62000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','SCHEDULE_PUBLISHED','Fixture Employee','assignment','40000000-0000-0000-0000-000000000001');
insert into private.push_dispatches(notification_id) values('62000000-0000-0000-0000-000000000001');
insert into public.shift_templates(company_id,code,name,default_start,default_end,responsible_employee_id,responsible_only,allowed_personnel_nos,exclusive_employees) values('20000000-0000-0000-0000-000000000001','ONLY','Fixture Employee shift','06:00','14:00','30000000-0000-0000-0000-000000000001',true,ARRAY['9001'],true);
insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,report_snapshot) values
 ('20000000-0000-0000-0000-000000000001','2026-08-01','CLOSED',1,now(),'10000000-0000-0000-0000-000000000001',
 '{"accounts":{"rows":[{"employee_id":"30000000-0000-0000-0000-000000000001","employee_name":"Fixture Employee","minutes":480},{"employee_id":"30000000-0000-0000-0000-000000000002","employee_name":"Fixture Colleague","minutes":480}]},"report":{"employees":[{"employee_id":"30000000-0000-0000-0000-000000000001"},{"employee_id":"30000000-0000-0000-0000-000000000002"}],"details":[{"employee_id":"30000000-0000-0000-0000-000000000001"},{"employee_id":"30000000-0000-0000-0000-000000000002"}]}}');
insert into public.audit_events(company_id,event_type,entity_type,entity_id,new_values) select company_id,'TIME_MONTH_CLOSED','time_month',company_id,to_jsonb(c) from public.time_month_closures c;

update public.employees set status='inactive',access_status='DISABLED',deleted_at=now() where legacy_id='erasure-target';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.role','authenticated',false);
select public.assert_erasure(not has_function_privilege('anon','public.owner_employee_erasure_list(uuid)','EXECUTE'),'anon cannot list erasure candidates');
select public.assert_erasure(not has_function_privilege('authenticated','public.server_commit_employee_erasure(uuid,uuid)','EXECUTE'),'browser cannot execute privileged erase');
do $$begin
 begin delete from public.time_entries where assignment_id='40000000-0000-0000-0000-000000000001';raise exception 'ASSERTION: ordinary closed-month delete succeeded';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 begin delete from public.audit_events;raise exception 'ASSERTION: ordinary audit delete succeeded';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
do $$begin
 begin perform public.owner_employee_erasure_preview('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');raise exception 'ASSERTION: planner erasure allowed';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$begin
 begin perform public.owner_employee_erasure_preview('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003');raise exception 'ASSERTION: cross-company erasure allowed';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.role','service_role',false);
do $$declare preview jsonb;job jsonb;
begin
 preview:=public.owner_employee_erasure_preview('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
 perform public.assert_erasure(preview#>>'{counts,time_entries}'='1','preview includes accounting evidence');
 begin perform public.server_stage_employee_erasure('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Wrong name',true,preview->>'fingerprint');raise exception 'ASSERTION: wrong name accepted';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 begin perform public.server_stage_employee_erasure('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Fixture Employee',true,repeat('0',32));raise exception 'ASSERTION: stale preview accepted';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 job:=public.server_stage_employee_erasure('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Fixture Employee',true,preview->>'fingerprint');
 begin perform public.server_commit_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');raise exception 'ASSERTION: remaining file accepted';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 perform public.assert_erasure(exists(select 1 from public.time_entries where assignment_id='40000000-0000-0000-0000-000000000001'),'failed commit rolls back accounting deletion');
 begin update public.employees set note='late write' where id='30000000-0000-0000-0000-000000000001';raise exception 'ASSERTION: pending erasure accepts edits';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 -- Only schema-fixture metadata exists; no real storage service or object is used.
 delete from storage.objects where name='20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/fixture.pdf';
 perform public.server_commit_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');
 perform public.assert_erasure((public.server_finish_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001')->>'complete')::boolean,'verified completion');
end$$;
select public.assert_erasure(not exists(select 1 from public.employees where id='30000000-0000-0000-0000-000000000001'),'profile removed');
select public.assert_erasure(exists(select 1 from public.employees where id='30000000-0000-0000-0000-000000000003'),'same person in other company preserved');
select public.assert_erasure(exists(select 1 from public.shift_assignments where id='40000000-0000-0000-0000-000000000002'),'colleague duty preserved');
select public.assert_erasure((select count(*) from public.time_entries)=1,'colleague time entry preserved');
select public.assert_erasure((select count(*) from public.audit_events where entity_type='time_entries')=1,'employee-only time audits erased entirely; colleague audit preserved');
select public.assert_erasure((select status='CLOSED' and revision=1 and jsonb_array_length(report_snapshot#>'{accounts,rows}')=1 from public.time_month_closures),'shared closure preserved and scrubbed');
select public.assert_erasure(not exists(select 1 from public.audit_events where to_jsonb(audit_events)::text like '%30000000-0000-0000-0000-000000000001%' or to_jsonb(audit_events)::text like '%Fixture Employee%'),'personal audit payloads removed');
select public.assert_erasure(exists(select 1 from public.audit_events where event_type='TIME_MONTH_CLOSED' and new_values::text like '%Fixture Colleague%'),'mixed audit event retains colleague');
select public.assert_erasure((select count(*) from private.employee_erasure_jobs)=0 and (select count(*) from private.employee_erasure_context)=0,'no completed job or personal context retained');
do $$begin
 begin insert into public.employees(company_id,legacy_id,first_name,last_name) values('20000000-0000-0000-0000-000000000001','erasure-target','Fixture','Employee');raise exception 'ASSERTION: stale browser restored erased employee';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 begin perform public.manager_upsert_employees_checked('20000000-0000-0000-0000-000000000001',0,'[]');raise exception 'ASSERTION: stale generation accepted';
 exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
end$$;
select public.assert_erasure(public.employee_roster_generation('20000000-0000-0000-0000-000000000001')=1,'company-wide generation advanced without employee tombstone');
select public.assert_erasure(private.sf_erasure_scrub('{"employee_id":"different-person","employee_name":"Fixture Employee"}',ARRAY['30000000-0000-0000-0000-000000000001'],ARRAY['Fixture Employee'])='{"employee_id":"different-person","employee_name":"Fixture Employee"}'::jsonb,'same-name colleague remains intact');
select public.assert_erasure((select count(*) from public.time_qr_independent_shifts)=0 and (select count(*) from public.time_qr_independent_breaks)=0 and (select count(*) from public.time_qr_independent_events)=0 and (select count(*) from public.time_qr_independent_sessions)=0,'QR bookings, pauses, events and sessions erased');
select public.assert_erasure((select count(*) from public.time_qr_breaks)=0 and (select count(*) from public.time_qr_punches)=0 and (select count(*) from public.time_qr_pilot_employees)=0,'scheduled QR evidence erased');
select public.assert_erasure((select pilot_employee_id is null from public.time_qr_terminals),'terminal retained without pilot link');
select public.assert_erasure((select responsible_employee_id is null and not active and not exclusive_employees and cardinality(allowed_personnel_nos)=0 from public.shift_templates),'strict shared template retained safely without target');
select public.assert_erasure((select count(*) from private.push_dispatches)=0 and (select count(*) from public.notifications)=0,'notifications and dispatches erased');
-- Authenticated callers can still read the owner preview and insert new colleagues after refreshing.
set role authenticated;
select public.assert_erasure(jsonb_array_length(public.owner_employee_erasure_list('20000000-0000-0000-0000-000000000001'))=1,'owner list callable by authenticated role');
select public.manager_upsert_employees_checked('20000000-0000-0000-0000-000000000001',1,'[{"company_id":"20000000-0000-0000-0000-000000000001","legacy_id":"auth-target","first_name":"Auth","last_name":"Fixture","personnel_no":"9003"}]');
update public.employees set note='ordinary update survives erasure guards' where legacy_id='erasure-colleague';
reset role;
-- A dedicated employee account is revoked at staging and completion waits for Auth API removal.
insert into auth.users(id,email) values('10000000-0000-0000-0000-000000000003','employee@example.invalid');
insert into auth.sessions(id,user_id) values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
insert into auth.audit_log_entries(id,payload) values
 ('80000000-0000-0000-0000-000000000001','{"actor_id":"10000000-0000-0000-0000-000000000003","actor_username":"employee@example.invalid","action":"login"}'),
 ('80000000-0000-0000-0000-000000000002','{"actor_id":"10000000-0000-0000-0000-000000000001","actor_username":"owner@example.invalid","action":"login"}');
insert into public.company_members(company_id,user_id,role,status) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','VIEWER','ACTIVE');
update public.employees set auth_user_id='10000000-0000-0000-0000-000000000003',access_status='ACTIVE',email='employee@example.invalid' where legacy_id='auth-target';
do $$declare preview jsonb;job jsonb;target uuid;begin
 select id into target from public.employees where legacy_id='auth-target';
 preview:=public.owner_employee_erasure_preview('20000000-0000-0000-0000-000000000001',target);
 perform public.assert_erasure((preview->>'delete_auth')::boolean,'dedicated employee login included');
 job:=public.server_stage_employee_erasure('20000000-0000-0000-0000-000000000001',target,'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','Auth Fixture',true,preview->>'fingerprint');
 perform public.assert_erasure(not exists(select 1 from auth.sessions where user_id='10000000-0000-0000-0000-000000000003'),'employee sessions revoked before deletion');
 perform public.server_commit_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');
 begin perform public.server_finish_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');raise exception 'ASSERTION: remaining auth account accepted';exception when others then if sqlerrm like 'ASSERTION:%' then raise;end if;end;
 -- Auth schema fixture only; production exclusively calls auth.admin.deleteUser.
 delete from auth.users where id='10000000-0000-0000-0000-000000000003';
 perform public.assert_erasure((public.server_finish_employee_erasure((job->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001')->>'verified')::boolean,'erasure finishes after Auth API');
end$$;
select public.assert_erasure(not exists(select 1 from public.employees where legacy_id='auth-target') and not exists(select 1 from public.company_members where user_id='10000000-0000-0000-0000-000000000003'),'dedicated employee and membership erased');
select public.assert_erasure(not exists(select 1 from auth.audit_log_entries where id='80000000-0000-0000-0000-000000000001'),'employee Auth JSON audit removed');
select public.assert_erasure(exists(select 1 from auth.audit_log_entries where id='80000000-0000-0000-0000-000000000002' and payload::jsonb->>'actor_username'='owner@example.invalid'),'other Auth JSON audit preserved');
select 'EMPLOYEE_ERASURE_INTEGRATION_PASSED' as result;
