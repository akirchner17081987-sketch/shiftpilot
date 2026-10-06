-- Entirely fictitious companies, staff and bookings.
create function public.assert_erasure(ok boolean,message text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'ASSERTION: %',message;end if;end$$;
insert into auth.users(id,email) values('10000000-0000-0000-0000-000000000001','owner@example.invalid'),('10000000-0000-0000-0000-000000000002','planner@example.invalid');
insert into public.companies(id,name) values('20000000-0000-0000-0000-000000000001','Erasure fixture'),('20000000-0000-0000-0000-000000000002','Other fixture');
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
insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,report_snapshot) values
 ('20000000-0000-0000-0000-000000000001','2026-08-01','CLOSED',1,now(),'10000000-0000-0000-0000-000000000001',
 '{"accounts":{"rows":[{"employee_id":"30000000-0000-0000-0000-000000000001","employee_name":"Fixture Employee","minutes":480},{"employee_id":"30000000-0000-0000-0000-000000000002","employee_name":"Fixture Colleague","minutes":480}]},"report":{"employees":[{"employee_id":"30000000-0000-0000-0000-000000000001"},{"employee_id":"30000000-0000-0000-0000-000000000002"}],"details":[{"employee_id":"30000000-0000-0000-0000-000000000001"},{"employee_id":"30000000-0000-0000-0000-000000000002"}]}}');
insert into public.audit_events(company_id,event_type,entity_type,entity_id,new_values) select company_id,'TIME_MONTH_CLOSED','time_month',company_id,to_jsonb(c) from public.time_month_closures c;

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
select 'EMPLOYEE_ERASURE_INTEGRATION_PASSED' as result;
