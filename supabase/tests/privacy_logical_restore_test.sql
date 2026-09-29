begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

-- Fictitious application-level export/delete/restore cycle. The transaction rolls back.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000','71717171-7171-4171-8171-717171717171',
  'authenticated','authenticated','restore-owner@example.invalid',
  crypt('not-a-real-password',gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);

insert into public.companies(id,name,created_by)
values('72727272-7272-4272-8272-727272727272','Restore Wegwerf-Testmandant',
  '71717171-7171-4171-8171-717171717171');

insert into public.company_members(company_id,user_id,role,status)
values('72727272-7272-4272-8272-727272727272','71717171-7171-4171-8171-717171717171',
  'OWNER','ACTIVE');

insert into public.employees(
  id,company_id,first_name,last_name,personnel_no,contract_end,status,access_status
) values (
  '73737373-7373-4373-8373-737373737373','72727272-7272-4272-8272-727272727272',
  'Rita','Restore','RESTORE-ONLY-001',current_date,'inactive','DISABLED'
);

create temporary table restore_employee_snapshot on commit drop
as select * from public.employees where id='73737373-7373-4373-8373-737373737373';

create temporary table restore_employee_digest(value text) on commit drop;
insert into restore_employee_digest(value)
select md5(row_to_json(s)::text) from restore_employee_snapshot s;

select is((select count(*)::integer from restore_employee_snapshot),1,
  'logical export contains exactly one fictitious employee');

delete from public.employees where id='73737373-7373-4373-8373-737373737373';
select is((select count(*)::integer from public.employees
  where id='73737373-7373-4373-8373-737373737373'),0,
  'source row is absent before restore');

insert into public.employees select * from restore_employee_snapshot;
select is((select count(*)::integer from public.employees
  where id='73737373-7373-4373-8373-737373737373'),1,
  'logical restore recreates exactly one row');

select is(
  (select md5(row_to_json(e)::text) from public.employees e
    where e.id='73737373-7373-4373-8373-737373737373'),
  (select value from restore_employee_digest),
  'restored row matches the exported row exactly'
);

select jsonb_build_object(
  'planned',4,
  'executed',_currtest(),
  'failed',num_failed(),
  'transaction','rolled_back'
) as pgtap_summary;
select * from finish();
rollback;
