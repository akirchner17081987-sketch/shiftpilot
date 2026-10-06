-- Fictitious companies/users only. This transaction always rolls back.
begin;
insert into public.companies(id,name,timezone) values ('11111111-1111-1111-1111-111111111111','Fiktives Unternehmen A','Europe/Berlin'),('22222222-2222-2222-2222-222222222222','Fiktives Unternehmen B','Europe/Berlin');
insert into public.company_members(company_id,user_id,role,status) values
('11111111-1111-1111-1111-111111111111','10000000-0000-0000-0000-000000000001','OWNER','ACTIVE'),
('11111111-1111-1111-1111-111111111111','10000000-0000-0000-0000-000000000002','TIME_TRACKING','ACTIVE');
insert into public.employees(id,company_id,first_name,last_name,auth_user_id,legacy_id,start_date) values
('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Fiktive','Testperson A','10000000-0000-0000-0000-000000000003','fiktiv-a','2020-01-01'),
('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Fiktive','Testperson Nacht',null,'fiktiv-nacht','2020-01-01'),
('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Fiktive','Fremde Testperson',null,'fiktiv-b','2020-01-01');
insert into public.time_qr_terminals(id,company_id,name) values
('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Fiktives Terminal A'),
('dddddddd-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Fiktives Terminal B');
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status) values
('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Fiktiv','2026-09-01 06:00Z','2026-09-01 14:00Z','PUBLISHED'),
('cccccccc-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Fiktiv','2026-09-02 06:00Z','2026-09-02 10:00Z','PUBLISHED');
insert into public.time_entries(assignment_id,company_id,actual_start,actual_end,break_minutes,status) values
('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-09-01 06:00Z','2026-09-01 14:00Z',60,'confirmed');
insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at,ended_at) values
('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','2026-09-01 06:00Z','2026-09-01 14:00Z'),
('eeeeeeee-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','2026-09-02 06:00Z','2026-09-02 10:00Z'),
('eeeeeeee-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','2026-09-03 06:00Z',null),
('eeeeeeee-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002','2026-09-01 06:00Z','2026-09-01 16:00Z'),
('eeeeeeee-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001','2026-09-30 20:00Z','2026-10-01 04:00Z'),
('eeeeeeee-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001','2026-03-28 21:00Z','2026-03-29 04:00Z');
insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at,ended_at) values('eeeeeeee-0000-0000-0000-000000000001',1,'2026-09-01 10:00Z','2026-09-01 11:00Z');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$declare v jsonb;a jsonb;r jsonb;x integer;begin
  if private.sf_confirmed_work_minutes('aaaaaaaa-0000-0000-0000-000000000001','2026-09-01','2026-09-30')<>720 then raise exception 'Overlaps/paid pauses/running exclusion failed';end if;
  if private.sf_confirmed_work_minutes('aaaaaaaa-0000-0000-0000-000000000002','2026-09-01','2026-09-30')<>120 or private.sf_confirmed_work_minutes('aaaaaaaa-0000-0000-0000-000000000002','2026-10-01','2026-10-31')<>360 then raise exception 'Company timezone/month clipping failed';end if;
  if private.sf_confirmed_work_minutes('aaaaaaaa-0000-0000-0000-000000000002','2026-03-28','2026-03-29')<>420 then raise exception 'DST elapsed duration failed';end if;
  v:=public.manager_central_time_entries('11111111-1111-1111-1111-111111111111','2026-09-01','2026-09-30');
  if jsonb_array_length(v->'qr_rows')<>4 or jsonb_array_length(v->'rows')<>2 then raise exception 'Central row scope failed';end if;
  select z into a from jsonb_array_elements(v->'qr_rows') z where z->>'id'='eeeeeeee-0000-0000-0000-000000000001';
  if (a->>'pause_minutes')::numeric<>60 or a->>'matched_assignment_id'<>'cccccccc-0000-0000-0000-000000000001' then raise exception 'QR detail/matching failed';end if;
  a:=public.manager_monthly_time_accounts('11111111-1111-1111-1111-111111111111','2026-09-01');
  select (z->>'confirmed_work_minutes')::integer into x from jsonb_array_elements(a->'rows') z where z->>'employee_id'='aaaaaaaa-0000-0000-0000-000000000001';
  if x<>720 then raise exception 'Monthly account is inconsistent';end if;
  r:=public.manager_time_report_bundle('11111111-1111-1111-1111-111111111111','2026-09-01');
  select sum((z->>'confirmed_actual_minutes')::integer) into x from jsonb_array_elements(r->'details') z where z->>'employee_id'='aaaaaaaa-0000-0000-0000-000000000001';
  if x<>720 then raise exception 'Daily report is inconsistent';end if;
  v:=private.manager_bulk_record_time_entries('11111111-1111-1111-1111-111111111111','2026-09-01','2026-09-30','Fiktiver Test',true);
  if (v->>'updated')::integer<>0 or (select count(*) from public.time_entries)<>1 then raise exception 'Bulk added plan time over QR';end if;
  v:=public.manager_time_month_status('11111111-1111-1111-1111-111111111111','2026-09-01');
  if (v->>'open_qr_shifts')::integer<>1 or (v->>'can_close')::boolean then raise exception 'Open QR month guard failed';end if;
  begin perform public.manager_central_time_entries('22222222-2222-2222-2222-222222222222','2026-09-01','2026-09-30');raise exception 'Foreign company was readable';exception when insufficient_privilege then null;end;
  if has_function_privilege('anon','public.manager_central_time_entries(uuid,date,date)','EXECUTE') or has_function_privilege('authenticated','private.sf_paid_time_ranges(uuid,uuid,timestamptz,timestamptz)','EXECUTE') then raise exception 'Function execute grants leak';end if;
  raise notice 'PASS: deduplication, paid pauses, unplanned QR, running exclusion, month/DST, accounts/report, bulk and company scopes';
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$declare v jsonb;begin
 v:=public.manager_central_time_entries('11111111-1111-1111-1111-111111111111','2026-09-01','2026-09-30');
 if jsonb_array_length(v->'qr_rows')<>4 then raise exception 'Time-only central access failed';end if;
 raise notice 'PASS: restricted time tracking role can read central QR';
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$declare v jsonb;begin
 v:=public.employee_my_time_account_month('2026-09-01');
 if (v->>'confirmed_work_minutes')::integer<>720 then raise exception 'Employee account failed';end if;
 begin perform public.manager_central_time_entries('11111111-1111-1111-1111-111111111111','2026-09-01','2026-09-30');raise exception 'Employee gained manager access';exception when insufficient_privilege then null;end;
 raise notice 'PASS: employee reads own account and cannot use central manager RPC';
end$$;
insert into public.time_month_closures(company_id,month_start,status,report_snapshot) values('11111111-1111-1111-1111-111111111111','2026-08-01','CLOSED','{"accounts":{"rows":[{"employee_id":"aaaaaaaa-0000-0000-0000-000000000001","confirmed_work_minutes":123}]},"report":{"employees":[{"employee_id":"aaaaaaaa-0000-0000-0000-000000000001","confirmed_work_minutes":123}],"details":[{"employee_id":"aaaaaaaa-0000-0000-0000-000000000001","work_date":"2026-08-01","confirmed_actual_minutes":123}]}}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$declare v jsonb;begin
 if private.sf_confirmed_work_minutes('aaaaaaaa-0000-0000-0000-000000000001','2026-08-01','2026-08-31')<>123 then raise exception 'Frozen account changed';end if;
 v:=public.manager_time_report_bundle('11111111-1111-1111-1111-111111111111','2026-08-01');
 if (v#>>'{employees,0,confirmed_work_minutes}')::integer<>123 then raise exception 'Frozen report changed';end if;
 v:=public.manager_central_time_entries('11111111-1111-1111-1111-111111111111','2026-08-01','2026-08-31');
 if (v#>>'{confirmed_summary,0,confirmed_seconds}')::integer is null then raise exception 'Frozen central summary missing';end if;
 raise notice 'PASS: archived months remain frozen';
end$$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.manager_central_time_entries('11111111-1111-1111-1111-111111111111','2026-09-01','2026-09-30');raise exception 'Anonymous manager access';exception when insufficient_privilege then null;end;
 raise notice 'PASS: no anonymous manager access';
end$$;
rollback;
