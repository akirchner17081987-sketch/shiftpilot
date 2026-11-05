-- QA ONLY: simulate production restrictive policies and verify both active profiles, revocation and manager access.
-- Run in the isolated QA database only; all test data and policies roll back.
begin;
create policy qa_test_employee_active on public.employees as restrictive for select to authenticated using (private.sf_is_manager(company_id,false) or (auth_user_id=(select auth.uid()) and status='active' and access_status='ACTIVE' and deleted_at is null));
create policy qa_test_assignment_active on public.shift_assignments as restrictive for select to authenticated using (private.sf_is_manager(company_id,false) or exists(select 1 from public.employees e where e.id=shift_assignments.employee_id and e.company_id=shift_assignments.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null));
create policy qa_test_time_capability on public.time_entries as restrictive for select to authenticated using (private.sf_can_manage_time(company_id) or exists(select 1 from public.shift_assignments sa join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null));
do $test$
declare u uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); absence_b uuid:=gen_random_uuid(); n int;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-rls-'||u::text||'@example.invalid','{}'),(manager,'qa-manager-'||manager::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(sa,a,ea,'A',now(),now()+interval '8 hours','PUBLISHED',now()),(sb,b,eb,'B',now(),now()+interval '8 hours','PUBLISHED',now());
 insert into public.absences(id,company_id,employee_id,start_date,end_date,absence_type) values(absence_b,b,eb,current_date,current_date,'Urlaub');
 insert into public.time_entries(assignment_id,company_id) values(sa,a),(sb,b);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(b,manager,'OWNER','OWNER','ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.employees where id in (ea,eb); if n<>2 then raise exception 'Both active profiles must be visible'; end if;
 select count(*) into n from public.shift_assignments where id in (sa,sb); if n<>2 then raise exception 'Both active company shifts must be visible'; end if;
 select count(*) into n from public.time_entries where assignment_id in (sa,sb); if n<>2 then raise exception 'Both active company time entries must be visible'; end if;
 perform set_config('role','postgres',true);
 update public.employees set access_status='DISABLED' where id=eb;
 perform set_config('role','authenticated',true);
 select count(*) into n from public.employees where id=eb; if n<>0 then raise exception 'Disabled employee record visible'; end if;
 select count(*) into n from public.shift_assignments where id=sb; if n<>0 then raise exception 'Disabled company shift visible'; end if;
 select count(*) into n from public.absences where id=absence_b; if n<>0 then raise exception 'Disabled company absence visible'; end if;
 select count(*) into n from public.time_entries where assignment_id=sb; if n<>0 then raise exception 'Disabled company time entry visible'; end if;
 select count(*) into n from public.shift_assignments where id=sa; if n<>1 then raise exception 'Active company shift hidden'; end if;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'aal','aal2','role','authenticated')::text,true);
 select count(*) into n from public.employees where id=eb; if n<>1 then raise exception 'Manager cannot see employee'; end if;
 select count(*) into n from public.shift_assignments where id=sb; if n<>1 then raise exception 'Manager cannot see shift'; end if;
 select count(*) into n from public.absences where id=absence_b; if n<>1 then raise exception 'Manager cannot see absence'; end if;
 select count(*) into n from public.time_entries where assignment_id=sb; if n<>1 then raise exception 'Manager cannot see time'; end if;
 perform set_config('role','postgres',true);
end $test$;


rollback;
