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


select pg_temp.assert_true((public.qr_independent_login(repeat('e',64),'QR-INDEP-TEST',date '2020-01-15',repeat('f',64))->>'ok')::boolean,'fixture login');
do $$
declare result jsonb;
begin
  perform public.qr_independent_action(repeat('e',64),repeat('f',64),'CLOCK_IN');
  for n in 1..10 loop
    result:=public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_START');
    perform pg_temp.assert_true(jsonb_array_length(result->'breaks')=n,'pause '||n||' stored');
    perform pg_temp.assert_true(pg_temp.expect_rejection($call$select public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_START')$call$),'overlapping pause rejected');
    perform public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_END');
  end loop;
  perform pg_temp.assert_true(pg_temp.expect_rejection($call$select public.qr_independent_action(repeat('e',64),repeat('f',64),'BREAK_START')$call$),'eleventh pause rejected');
  perform pg_temp.assert_true(pg_temp.expect_rejection($call$update public.time_qr_independent_breaks set ordinal=11 where ordinal=10$call$),'table rejects ordinal eleven');
  result:=public.qr_independent_action(repeat('e',64),repeat('f',64),'CLOCK_OUT');
  perform pg_temp.assert_true(result->>'state'='READY','clock-out works after ten pauses');
end;$$;
update public.time_qr_independent_shifts set started_at=ended_at-interval '10 hours' where employee_id='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
update public.time_qr_independent_breaks b set
  started_at=s.started_at+make_interval(mins=>b.ordinal*30),
  ended_at=s.started_at+make_interval(mins=>b.ordinal*30+6)
from public.time_qr_independent_shifts s where s.id=b.shift_id and s.employee_id='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
insert into public.company_members(company_id,user_id,role,status)
values('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2','d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1','TIME_TRACKING','ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1"}',true);
do $$
declare report jsonb;
begin
  report:=public.manager_qr_independent_report('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',current_date-1,current_date+1)->0;
  perform pg_temp.assert_true(jsonb_array_length(report->'breaks')=10,'time-only user sees all ten pauses');
  perform pg_temp.assert_true((report->>'paid_minutes')::integer=600 and (report->>'pause_minutes')::integer=60,'ten paid hours and sixty minutes of pauses');
end;$$;
select 'PASS: pauses 1-10, reject pause 11, overlap guards, time-only report, paid time preserved' as result;
rollback;
