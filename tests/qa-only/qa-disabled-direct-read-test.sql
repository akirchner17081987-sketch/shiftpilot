do $test$
declare u uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); absence_b uuid:=gen_random_uuid(); n int;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-rls-'||u::text||'@example.invalid','{}'),(manager,'qa-manager-'||manager::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'DISABLED');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(sa,a,ea,'A',now(),now()+interval '8 hours','PUBLISHED',now()),(sb,b,eb,'B',now(),now()+interval '8 hours','PUBLISHED',now());
 insert into public.absences(id,company_id,employee_id,start_date,end_date,absence_type) values(absence_b,b,eb,current_date,current_date,'Urlaub');
 insert into public.time_entries(assignment_id,company_id) values(sa,a),(sb,b);
 insert into public.company_members(company_id,user_id,role,access_role,status) values(b,manager,'OWNER','OWNER','ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
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
