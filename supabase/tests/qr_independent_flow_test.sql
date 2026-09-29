-- Transactional fixture: no employee, terminal, or booking remains after rollback.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1',
'authenticated','authenticated','qr-independent-test@example.invalid',crypt('test-only',gen_salt('bf')),now(),
'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
insert into public.companies(id,name,created_by)
values('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2','QR Independent Test','d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1');
insert into public.employees(id,company_id,first_name,last_name,personnel_no,start_date,status,access_status)
values('d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3','d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
'Fiktiv','QR','QR-INDEP-TEST',date '2020-01-15','active','NONE');
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active,pilot_mode,created_by,updated_by)
values('d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4','d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
'Fiktives Terminal',extensions.digest(repeat('e',64),'sha256'),true,false,
'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1','d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1');

create function pg_temp.expect_rejection(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then return true;
end;$$;
create function pg_temp.assert_true(p_value boolean,p_message text) returns text language plpgsql as $$
begin
  if p_value is distinct from true then raise exception '%',p_message; end if;
  return 'PASS: '||p_message;
end;$$;

select pg_temp.assert_true((public.qr_independent_login(repeat('e',64),'QR-INDEP-TEST',date '2020-01-16',repeat('f',64))->>'ok')::boolean=false,'wrong entry date rejected');
select pg_temp.assert_true((public.qr_independent_login(repeat('e',64),'QR-INDEP-TEST',date '2020-01-15',repeat('f',64))->>'ok')::boolean,'correct credentials');
select pg_temp.assert_true(pg_temp.expect_rejection($call$select public.qr_independent_action(repeat('e',64),repeat('a',64),'STATUS')$call$),'wrong session rejected');
select public.qr_independent_action(repeat('e',64),repeat('f',64),'CLOCK_IN');
select public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_START');
select pg_temp.assert_true(pg_temp.expect_rejection($call$select public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_START')$call$),'overlapping break rejected');
select pg_temp.assert_true(pg_temp.expect_rejection($call$select public.qr_independent_action(repeat('e',64),repeat('f',64),'CLOCK_OUT')$call$),'clock-out during break rejected');
-- Shift and pause duration are adjusted inside the disposable transaction only.
update public.time_qr_independent_shifts set started_at=clock_timestamp()-interval '10 hours' where employee_id='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
update public.time_qr_independent_breaks set started_at=clock_timestamp()-interval '1 hour';
select public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_END');
select public.qr_independent_action(repeat('e',64),repeat('f',64),'CLOCK_OUT');
select pg_temp.assert_true((select round(extract(epoch from (ended_at-started_at))/60)::integer
  from public.time_qr_independent_shifts where employee_id='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3') between 599 and 601
  and (select round(extract(epoch from (ended_at-started_at))/60)::integer from public.time_qr_independent_breaks) between 59 and 61
  and (select count(*) from public.time_qr_independent_events)=4
  and (select count(*) from public.shift_assignments where employee_id='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3')=0
,'10h paid, 1h pause, 9h work, four events, no shift assignment');
select pg_temp.assert_true(not has_function_privilege('anon','public.qr_independent_login(text,text,date,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.qr_independent_action(text,text,text)','EXECUTE')
,'service-only action access');
rollback;
