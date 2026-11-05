do $test$
declare u uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); emp uuid:=gen_random_uuid(); result jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-profile-team-'||u::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(company,'QA A',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status,qualifications) values(emp,company,'QA','A','A',u,'ACTIVE',array['__sp:planningTeam=A','__sp:rhythmPattern=O1,O3']);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 result:=public.qa_employee_profile_scoped(company);
 if result->'employee'->>'id'<>emp::text or result->'rhythm'->>'team'<>'A' then raise exception 'Planning team profile failed'; end if;
 perform set_config('role','postgres',true);
end $test$;
