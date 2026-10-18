-- Run each DO/SELECT block separately through the management SQL interface.
-- Fictitious employee/user rows and all request, notification and audit writes
-- are rolled back inside each block. No interactive Auth login is performed.
-- These are the exact request-context RPC checks executed on 18 October 2026.

do $$ declare u uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); c uuid:='3dbc2d99-78d7-4b82-bcaf-fe11db8213d3'; o uuid; r uuid; s jsonb; b jsonb; evidence jsonb; begin
select user_id into o from public.company_members where company_id=c and role='OWNER' and status='ACTIVE' limit 1;
if o is null then raise exception 'Kein Testkontext';end if;
begin
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(u,'qa-leave-'||u||'@example.invalid','{}','{}');
insert into public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status) values(e,c,u,'Fiktiv','Rollback Urlaub','QA-LEAVE-'||u,'Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE');
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
perform public.manager_save_leave_account(c,e,2027,30,0,0,'Fiktiver Rollbacktest');
perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
r:=public.employee_submit_absence_request_for_company(c,'Urlaub','2027-01-11','2027-01-15','Fiktiver Rollbacktest');
b:=public.employee_my_leave_account(c,2027);if(b->>'remaining')::numeric<>30 then raise exception 'Offener Antrag falsch abgezogen';end if;
select private.leave_absence_snapshot(a) into s from public.absences a where id=r;
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
perform public.manager_approve_leave_request(r,'[{"year":2027,"days":3}]',s,'Fiktiver Genehmigungstest');
b:=public.manager_leave_account(c,e,2027);if(b->>'remaining')::numeric<>27 then raise exception 'Genehmigung falsch abgezogen';end if;
evidence:=jsonb_build_object('pending_remaining',30,'approved_days',b->'approved_days','approved_remaining',b->'remaining','passed',true);
raise exception using errcode='P7777',message='ROLLBACK_TEST';
exception when sqlstate 'P7777' then null;end;
perform set_config('sf.leave_simple_test',evidence::text,false);
end;$$;select current_setting('sf.leave_simple_test')::jsonb as test_result;

do $$ declare u uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); c uuid:='1f23f5a3-1cbb-430f-af90-36ed34004440'; o uuid; r uuid; s jsonb; b jsonb; evidence jsonb; begin
select user_id into o from public.company_members where company_id=c and role='OWNER' and status='ACTIVE' limit 1;
if o is null then raise exception 'Kein Testkontext';end if;
begin
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(u,'qa-leave-'||u||'@example.invalid','{}','{}');
insert into public.employees(id,company_id,auth_user_id,first_name,last_name,personnel_no,role,employment,work_time_model,status,access_status) values(e,c,u,'Fiktiv','Rollback Urlaub','QA-LEAVE-'||u,'Mitarbeiter','Vollzeit','SHIFT','active','ACTIVE');
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
perform public.manager_save_leave_account(c,e,2027,30,0,0,'Fiktiver Rollbacktest');
perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
r:=public.employee_submit_absence_request_for_company(c,'Urlaub','2027-01-11','2027-01-15','Fiktiver Rollbacktest');
b:=public.employee_my_leave_account(c,2027);if(b->>'remaining')::numeric<>30 then raise exception 'Offener Antrag falsch abgezogen';end if;
begin perform public.employee_submit_absence_request_for_company('3dbc2d99-78d7-4b82-bcaf-fe11db8213d3','Urlaub','2027-02-01','2027-02-02');raise exception 'Falsches Unternehmen zugelassen';exception when others then if sqlerrm not like '%Kein aktiver Mitarbeiterzugang%' then raise;end if;end;
select private.leave_absence_snapshot(a) into s from public.absences a where id=r;
perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
perform public.manager_approve_leave_request(r,'[{"year":2027,"days":3}]',s,'Fiktiver Genehmigungstest');
b:=public.manager_leave_account(c,e,2027);if(b->>'remaining')::numeric<>27 then raise exception 'Genehmigung falsch abgezogen';end if;
evidence:=jsonb_build_object('pending_remaining',30,'approved_days',b->'approved_days','approved_remaining',b->'remaining','passed',true);
delete from public.absences where id=r;
b:=public.manager_leave_account(c,e,2027);if(b->>'remaining')::numeric<>30 then raise exception 'Löschung gibt Tage nicht frei';end if;
evidence:=evidence||jsonb_build_object('after_delete_remaining',b->'remaining','foreign_company_blocked',true);
raise exception using errcode='P7777',message='ROLLBACK_TEST';
exception when sqlstate 'P7777' then null;end;
perform set_config('sf.leave_simple_test',evidence::text,false);
end;$$;select current_setting('sf.leave_simple_test')::jsonb as test_result;

