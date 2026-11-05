begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create temporary table sf_claim_test(manager_id uuid,employee_user uuid,a uuid,b uuid,ea uuid,eb uuid,offer_a uuid,offer_b uuid,claim_id uuid,work_date date);
insert into sf_claim_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,(now() at time zone 'Europe/Berlin')::date+30;
grant select,update on sf_claim_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select manager_id,'mgr-'||manager_id::text||'@example.invalid',now(),'{}'::jsonb from sf_claim_test union all
select employee_user,'emp-'||employee_user::text||'@example.invalid',now(),'{}'::jsonb from sf_claim_test;
insert into public.companies(id,name,created_by)
select a,'Claim Test A',manager_id from sf_claim_test union all select b,'Claim Test B',manager_id from sf_claim_test;
insert into public.company_members(company_id,user_id,role,status,access_role)
select a,manager_id,'OWNER','ACTIVE','OWNER' from sf_claim_test union all select b,manager_id,'OWNER','ACTIVE','OWNER' from sf_claim_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status,shift_permissions,weekly_hours)
select ea,a,'Test','A','A-'||left(ea::text,8),'emp@example.invalid',employee_user,'ACTIVE',array['O1'],40 from sf_claim_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'emp@example.invalid',employee_user,'ACTIVE',array['O1'],40 from sf_claim_test;
insert into public.shift_templates(company_id,code,name,default_start,default_end)
select a,'O1','Test',time '08:00',time '16:00' from sf_claim_test union all select b,'O1','Test',time '08:00',time '16:00' from sf_claim_test;
insert into public.global_staffing_requirements(company_id,shift_code,required_count)
select a,'O1',1 from sf_claim_test union all select b,'O1',1 from sf_claim_test;
insert into public.open_shift_market_offers(id,company_id,work_date,shift_code,starts_at,ends_at,remaining_count,created_by)
select offer_a,a,work_date,'O1',(work_date+time '08:00') at time zone 'Europe/Berlin',(work_date+time '16:00') at time zone 'Europe/Berlin',1,manager_id from sf_claim_test union all
select offer_b,b,work_date,'O1',(work_date+time '08:00') at time zone 'Europe/Berlin',(work_date+time '16:00') at time zone 'Europe/Berlin',1,manager_id from sf_claim_test;
select set_config('request.jwt.claim.sub',employee_user::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',employee_user,'aal','aal2','role','authenticated')::text,true) from sf_claim_test;
set local role authenticated;
do $test$ declare x sf_claim_test%rowtype;res jsonb;denied boolean:=false;begin
select * into x from sf_claim_test;
begin perform public.employee_claim_open_shift_for_company(x.a,x.offer_b,'wrong company');exception when others then denied:=true;end;
if not denied then raise exception 'foreign company offer accepted';end if;
res:=public.employee_claim_open_shift_for_company(x.a,x.offer_a,'test');
if res->>'status'<>'PENDING_MANAGER' then raise exception 'claim not pending: %',res;end if;
update sf_claim_test set claim_id=(res->>'id')::uuid;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',manager_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'aal','aal2','role','authenticated')::text,true) from sf_claim_test;
set local role authenticated;
do $test$ declare x sf_claim_test%rowtype;res jsonb;begin select * into x from sf_claim_test;
res:=public.manager_review_open_shift_claim(x.claim_id,'APPROVE','test',true);
if res->>'status'<>'APPLIED' then raise exception 'claim not applied: %',res;end if;
end $test$;
reset role;
do $verify$ declare x sf_claim_test%rowtype;begin select * into x from sf_claim_test;
if not exists(select 1 from public.open_shift_market_claims c join public.shift_assignments s on s.id=c.assignment_id and s.company_id=x.a and s.employee_id=x.ea where c.id=x.claim_id and c.status='APPLIED') then raise exception 'assignment not created for selected company';end if;
if exists(select 1 from public.open_shift_market_claims where offer_id=x.offer_b) then raise exception 'foreign claim created';end if;
end $verify$;
rollback;