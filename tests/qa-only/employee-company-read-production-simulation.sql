-- Isolated QA only. Simulate production's existing restrictive policies; revert everything.
begin;
create policy sf_employee_active_read on public.employees as restrictive for select to authenticated using (private.sf_is_manager(company_id,false) or id=(select private.sf_employee_id()));
create policy sf_assignment_active_read on public.shift_assignments as restrictive for select to authenticated using (private.sf_is_manager(company_id,false) or employee_id=(select private.sf_employee_id()));
create policy sf_time_capability_read on public.time_entries as restrictive for select to authenticated using (private.sf_can_manage_time(company_id) or exists(select 1 from public.shift_assignments sa where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and sa.employee_id=(select private.sf_employee_id())));
-- Scope employee self reads to the authenticated user's active profile in the row's company.
-- Manager and time-capability checks remain in place.
alter policy employees_select on public.employees using (
 (auth_user_id=(select auth.uid()) and status='active' and access_status='ACTIVE' and deleted_at is null)
 or exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
);
alter policy absences_select on public.absences using (
 exists(select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
 or exists(select 1 from public.employees e where e.id=absences.employee_id and e.company_id=absences.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null)
);
alter policy assignments_select on public.shift_assignments using (
 exists(select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE')
 or (status='PUBLISHED' and published_at is not null and exists(select 1 from public.employees e where e.id=shift_assignments.employee_id and e.company_id=shift_assignments.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null))
);
alter policy time_entries_select on public.time_entries using (
 private.sf_is_manager(company_id,false)
 or exists(select 1 from public.shift_assignments sa join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id
 where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null)
);

alter policy sf_employee_active_read on public.employees using (private.sf_is_manager(company_id,false) or (auth_user_id=(select auth.uid()) and status='active' and access_status='ACTIVE' and deleted_at is null and not exists(select 1 from public.company_members m where m.company_id=employees.company_id and m.user_id=(select auth.uid()) and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)))));
alter policy sf_assignment_active_read on public.shift_assignments using (private.sf_is_manager(company_id,false) or exists(select 1 from public.employees e where e.id=shift_assignments.employee_id and e.company_id=shift_assignments.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null));
alter policy sf_time_capability_read on public.time_entries using (private.sf_can_manage_time(company_id) or exists(select 1 from public.shift_assignments sa join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null));

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
 insert into public.company_members(company_id,user_id,role,access_role,status,extra_permissions) values(b,u,'VIEWER','TEAM_LEAD','DISABLED',array['read_only']);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.employees where id=eb; if n<>0 then raise exception 'Disabled membership exposed profile'; end if;
 select count(*) into n from public.shift_assignments where id=sb; if n<>0 then raise exception 'Disabled membership exposed shift'; end if;
 select count(*) into n from public.time_entries where assignment_id=sb; if n<>0 then raise exception 'Disabled membership exposed time'; end if;
 perform set_config('role','postgres',true);
 update public.company_members set status='ACTIVE' where company_id=b and user_id=u;
 perform set_config('role','authenticated',true);
 select count(*) into n from public.employees where id=eb; if n<>0 then raise exception 'Viewer membership exposed profile'; end if;
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
