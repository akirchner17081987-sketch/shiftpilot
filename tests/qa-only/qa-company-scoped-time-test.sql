do $test$
declare u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); rejected boolean; result jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-time-'||u::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(aa,a,ea,'A',now()-interval '4 hours',now()-interval '2 hours','PUBLISHED',now()-interval '1 day'),(ab,b,eb,'B',now()-interval '4 hours',now()-interval '2 hours','PUBLISHED',now()-interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform public.qa_submit_time_entry_scoped(a,ab,now()-interval '4 hours',now()-interval '2 hours',0,''); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Cross-company time submission accepted'; end if;
 result:=public.qa_submit_time_entry_scoped(a,aa,now()-interval '4 hours',now()-interval '2 hours',0,'QA A');
 if result->>'company_id'<>a::text then raise exception 'Time entry A misassigned'; end if;
 result:=public.qa_submit_time_entry_scoped(b,ab,now()-interval '4 hours',now()-interval '2 hours',0,'QA B');
 if result->>'company_id'<>b::text then raise exception 'Time entry B misassigned'; end if;
 perform set_config('role','postgres',true);
 if (select count(*) from public.time_entries where assignment_id in (aa,ab))<>2 then raise exception 'Time entries missing'; end if;
end $test$;

