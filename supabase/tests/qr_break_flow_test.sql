-- Transactional fixture; no test data remains in production.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
  'authenticated','authenticated','qr-break-test@example.invalid',
  crypt('test-only-password',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
insert into public.companies(id,name,created_by)
values('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2','QR Break Transaction Test','c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1');
insert into public.employees(id,company_id,first_name,last_name,personnel_no,status,auth_user_id,access_status)
values('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3','c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
  'Test','Pause','QR-PAUSE-TEST','active','c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1','ACTIVE');
insert into public.shift_templates(company_id,code,name,default_start,default_end)
values('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2','QRT','QR Test','08:00','16:00');
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,
  break_minutes,status,published_at,created_by)
values('c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4','c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
  'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3','QRT',now()-interval '20 minutes',now()+interval '2 hours',
  30,'PUBLISHED',now()-interval '1 hour','c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1');
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active,pilot_mode,created_by,updated_by)
values('c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5','c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
  'QR Break Test',extensions.digest(repeat('c',64),'sha256'),true,false,
  'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1','c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1');

create function pg_temp.assert_rejected(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Unexpectedly accepted an invalid QR transition';
exception
  when others then
    if sqlerrm='Unexpectedly accepted an invalid QR transition' then raise; end if;
    return 'PASS: invalid QR transition rejected';
end;$$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1"}',true);
select public.employee_clock_from_qr(repeat('c',64),'CLOCK_IN');

-- Artificially age audit punches to pass the 20-second duplicate guard.
set local role postgres;
update public.time_qr_punches set punched_at=now()-interval '10 minutes'
where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
update public.time_entries set actual_start=now()-interval '30 minutes'
where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
set local role authenticated;
select public.employee_qr_break_from_qr(repeat('c',64),'BREAK_START');

set local role postgres;
update public.time_qr_punches set punched_at=now()-interval '10 minutes'
where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4' and punch_type='BREAK_START';
update public.time_qr_breaks set started_at=now()-interval '10 minutes'
where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
set local role authenticated;
select pg_temp.assert_rejected($call$select public.employee_qr_break_from_qr(repeat('c',64),'BREAK_START')$call$);
select pg_temp.assert_rejected($call$select public.employee_clock_from_qr(repeat('c',64),'CLOCK_OUT')$call$);
select public.employee_qr_break_from_qr(repeat('c',64),'BREAK_END');

set local role postgres;
update public.time_qr_punches set punched_at=now()-interval '1 minute'
where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4' and punch_type='BREAK_END';
set local role authenticated;
select public.employee_clock_from_qr(repeat('c',64),'CLOCK_OUT');

set local role postgres;
select case when (select break_minutes from public.time_entries
  where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4') between 9 and 11
  and (select count(*) from public.time_qr_punches
    where assignment_id='c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4')=4
  then 'PASS: actual break and four events' else 'FAIL' end as qr_break_result;
rollback;
