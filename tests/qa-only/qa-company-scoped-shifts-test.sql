do $qa$
declare u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid();eb uuid:=gen_random_uuid();other uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-shift-'||u::text||'@example.invalid','{}'::jsonb),(outsider,'qa-shift-other-'||outsider::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA foreign',outsider);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(other,a,'QA','Other','QA-O',outsider,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values
 (sa,a,ea,'A',now()+interval '1 day',now()+interval '1 day 8 hours','PUBLISHED',now()),
 (sb,b,eb,'B',now()+interval '1 day',now()+interval '1 day 8 hours','PUBLISHED',now()),
 (gen_random_uuid(),a,ea,'DRAFT',now()+interval '3 days',now()+interval '3 days 8 hours','DRAFT',null),
 (gen_random_uuid(),a,other,'OTHER',now()+interval '4 days',now()+interval '4 days 8 hours','PUBLISHED',now());
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);perform set_config('role','authenticated',true);
 if (select array_agg(id) from public.qa_employee_shifts_scoped(a))<>array[sa] or (select array_agg(id) from public.qa_employee_shifts_scoped(b))<>array[sb] then raise exception 'Shift list crossed company or included draft';end if;
 rejected:=false;begin perform * from public.qa_employee_shifts_scoped(c);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Foreign company shifts accessible';end if;
 perform set_config('role','postgres',true);update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 rejected:=false;begin perform * from public.qa_employee_shifts_scoped(b);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Disabled profile shifts accessible';end if;
 perform set_config('role','postgres',true);
end $qa$;

