-- Current-schema smoke test. Only generated synthetic tenants; never commit the transaction.
begin;
create temporary table sf_security_fixture(k text primary key,v uuid);
grant select on sf_security_fixture to authenticated;
create function pg_temp.sf_test_actor(u uuid,aal text default 'aal2') returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal',aal)::text,true);
end $$;
create function pg_temp.sf_expect_denied(statement text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
 begin execute statement;
 exception when insufficient_privilege then denied:=true;
 when raise_exception then
  if sqlerrm ~* 'MFA_REQUIRED|berechtigt|unveraenderbar|permission denied' then denied:=true;else raise;end if;
 end;
 if not denied then raise exception 'Forbidden operation accepted: %',statement;end if;
end $$;
do $$
declare owner_ uuid:=gen_random_uuid(); stranger_ uuid:=gen_random_uuid(); employee_user_ uuid:=gen_random_uuid(); company_ uuid:=gen_random_uuid(); foreign_ uuid:=gen_random_uuid(); employee_ uuid:=gen_random_uuid(); assignment_ uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select u,'authenticated','authenticated','security-acceptance-'||u||'@example.invalid','{}','{}',now(),now() from unnest(array[owner_,stranger_,employee_user_]) u;
 perform pg_temp.sf_test_actor(owner_);
 insert into public.companies(id,name,created_by) values(company_,'Synthetic security acceptance',owner_),(foreign_,'Synthetic foreign tenant',stranger_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(company_,owner_,'OWNER','ACTIVE','OWNER'),(foreign_,stranger_,'OWNER','ACTIVE','OWNER') on conflict(company_id,user_id) do update set status='ACTIVE',access_role=excluded.access_role;
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status,shift_permissions)
 values(employee_,company_,'Synthetic','Audit','SEC-1',employee_user_,'ACTIVE',array['SEC']);
 insert into public.company_compliance_policy(company_id,solid_planning_rules) values(company_,'{}') on conflict(company_id) do update set solid_planning_rules='{}';
 insert into public.shift_templates(company_id,code,name,default_start,default_end) values(company_,'SEC','Synthetic security shift','08:00','16:00');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 values(assignment_,company_,employee_,'SEC',date_trunc('day',now())-interval '2 days'+interval '8 hours',date_trunc('day',now())-interval '2 days'+interval '16 hours','DRAFT',owner_);
 insert into sf_security_fixture values('owner',owner_),('stranger',stranger_),('employee_user',employee_user_),('company',company_),('foreign',foreign_),('assignment',assignment_);
end $$;
set local role authenticated;
do $$
declare c uuid:=(select v from sf_security_fixture where k='company'); a uuid:=(select v from sf_security_fixture where k='assignment'); o uuid:=(select v from sf_security_fixture where k='owner'); s timestamptz; e timestamptz;
begin
 perform pg_temp.sf_test_actor(o);
 update public.shift_assignments set break_minutes=15 where id=a;
 select starts_at,ends_at into s,e from public.shift_assignments where id=a;
 perform public.manager_save_time_entry(a,s,e,15,'Synthetic original time entry',false);
 perform public.manager_save_time_entry(a,s+interval '15 minutes',e,15,'Synthetic correction reason',false);
 update public.company_compliance_policy set solid_planning_rules='{"test_security_acceptance":true}'::jsonb where company_id=c;
 if not exists(select 1 from public.audit_events where company_id=c and event_type='UPDATE_SHIFT_ASSIGNMENTS' and actor_id=o and created_at is not null and old_values->>'break_minutes'='0' and new_values->>'break_minutes'='15') then raise exception 'Missing assignment before/after audit';end if;
 if not exists(select 1 from public.audit_events where company_id=c and event_type='TIME_ENTRY_SAVED' and actor_id=o and old_values is not null and new_values is not null and metadata->>'reason'='Synthetic correction reason') then raise exception 'Missing time correction audit';end if;
 if not exists(select 1 from public.audit_events where company_id=c and event_type='PLANNING_RULES_UPDATED' and actor_id=o and old_values is not null and new_values->>'test_security_acceptance'='true') then raise exception 'Missing planning-rule audit';end if;
 perform pg_temp.sf_expect_denied(format('update public.audit_events set event_type=%L where company_id=%L','FORGED',c));
 perform pg_temp.sf_expect_denied(format('delete from public.audit_events where company_id=%L',c));
 perform pg_temp.sf_test_actor(o,'aal1');
 perform pg_temp.sf_expect_denied(format('select public.manager_time_report_bundle(%L,date_trunc(''month'',current_date)::date,null)',c));
 perform pg_temp.sf_test_actor((select v from sf_security_fixture where k='employee_user'),'aal1');
 if exists(select 1 from public.audit_events where company_id=c) then raise exception 'Employee sees administrative audit';end if;
 perform pg_temp.sf_expect_denied(format('select public.manager_central_time_entries(%L,current_date-3,current_date)',c));
 perform pg_temp.sf_test_actor((select v from sf_security_fixture where k='stranger'));
 if exists(select 1 from public.employees where company_id=c) then raise exception 'Foreign employee access';end if;
 if exists(select 1 from public.shift_assignments where company_id=c) then raise exception 'Foreign assignment access';end if;
 if exists(select 1 from public.time_entries where company_id=c) then raise exception 'Foreign time access';end if;
 if exists(select 1 from public.audit_events where company_id=c) then raise exception 'Foreign audit access';end if;
 perform pg_temp.sf_expect_denied(format('select public.manager_central_time_entries(%L,current_date-3,current_date)',c));
end $$;
reset role;
set constraints all immediate;
select jsonb_build_object('result','PASS','checks',13,'scope','assignment/time/rules audit, immutability, MFA, employee and cross-tenant boundaries','data','generated synthetic fixtures; ROLLBACK') result;
rollback;
