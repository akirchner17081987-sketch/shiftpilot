do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); result jsonb; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-wage-'||u::text||'@example.invalid','{}'),(other,'qa-wage-other-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA C',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(sa,a,ea,'O1','2026-01-05 08:00Z','2026-01-05 16:00Z','PUBLISHED',now()),(sb,b,eb,'O1','2026-01-06 08:00Z','2026-01-06 10:00Z','PUBLISHED',now());
 insert into public.time_entries(assignment_id,company_id,actual_start,actual_end,status,break_minutes) values(sa,a,'2026-01-05 08:00Z','2026-01-05 16:00Z','confirmed',0),(sb,b,'2026-01-06 08:00Z','2026-01-06 10:00Z','confirmed',0);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 result:=public.qa_employee_wage_month_scoped(a,'2026-01-01');if result->>'employee_id'<>ea::text or (result->'totals'->>'paid_seconds')::numeric<>28800 then raise exception 'Wrong A wage preview'; end if;
 result:=public.qa_employee_wage_month_scoped(b,'2026-01-01');if result->>'employee_id'<>eb::text or (result->'totals'->>'paid_seconds')::numeric<>7200 then raise exception 'Wrong B wage preview'; end if;
 denied:=false;begin perform public.qa_employee_wage_month_scoped(c,'2026-01-01');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign company wage preview accessible'; end if;
 perform set_config('role','postgres',true);update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.qa_employee_wage_month_scoped(b,'2026-01-01');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Disabled company wage preview accessible'; end if;
 perform set_config('role','postgres',true);
end $test$;
