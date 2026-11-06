-- Isolated test database only. All synthetic records are rolled back.
begin;
do $setup$
declare owner_ uuid:=gen_random_uuid(); person_ uuid:=gen_random_uuid(); foreign_ uuid:=gen_random_uuid(); a_ uuid:=gen_random_uuid(); b_ uuid:=gen_random_uuid(); c_ uuid:=gen_random_uuid(); ea_ uuid:=gen_random_uuid(); eb_ uuid:=gen_random_uuid(); ec_ uuid:=gen_random_uuid(); token_ text:=repeat('c',72); mail_ text:='mixed-'||person_||'@example.invalid';
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(owner_,'owner-'||owner_||'@example.invalid',now(),'{}'),(person_,mail_,now(),'{}'),(foreign_,'foreign-'||foreign_||'@example.invalid',now(),'{}');
 insert into public.companies(id,name,created_by) values(a_,'Synthetic mixed A',owner_),(b_,'Synthetic mixed B',owner_),(c_,'Synthetic mixed C',owner_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a_,owner_,'OWNER','ACTIVE','OWNER'),(b_,owner_,'OWNER','ACTIVE','OWNER'),(c_,owner_,'OWNER','ACTIVE','OWNER');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id) values(ea_,a_,'Synthetic','A','A-'||left(ea_::text,8),mail_,null),(eb_,b_,'Synthetic','B','B-'||left(eb_::text,8),mail_,null),(ec_,c_,'Synthetic','C','C-'||left(ec_::text,8),'foreign-'||foreign_||'@example.invalid',foreign_);
 perform set_config('request.jwt.claim.sub',owner_::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_,'role','authenticated','aal','aal2')::text,true);
 perform private.manager_create_multi_access_invite(a_,mail_,jsonb_build_array(jsonb_build_object('company_id',a_,'role','EMPLOYEE','employee_id',ea_),jsonb_build_object('company_id',b_,'role','TEAM_LEAD','employee_id',eb_)),encode(extensions.digest(token_,'sha256'),'hex'));
 perform set_config('test.person',person_::text,true);perform set_config('test.a',a_::text,true);perform set_config('test.b',b_::text,true);perform set_config('test.ea',ea_::text,true);perform set_config('test.eb',eb_::text,true);perform set_config('test.ec',ec_::text,true);perform set_config('test.token',token_,true);
end $setup$;
select set_config('request.jwt.claim.sub',current_setting('test.person'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.person'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $test$
declare answer jsonb;roles_ jsonb;a_ uuid:=current_setting('test.a')::uuid;b_ uuid:=current_setting('test.b')::uuid;ea_ uuid:=current_setting('test.ea')::uuid;eb_ uuid:=current_setting('test.eb')::uuid;ec_ uuid:=current_setting('test.ec')::uuid; denied boolean:=false;
begin
 answer:=public.claim_multi_company_invite(current_setting('test.token'));
 if (answer->>'companies')::int<>2 then raise exception 'invitation did not grant both companies';end if;
 if (select count(*) from public.employee_company_options() where (company_id=a_ and employee_id=ea_) or (company_id=b_ and employee_id=eb_))<>2 then raise exception 'incorrect employee profile mapping';end if;
 roles_:=public.multi_role_company_options();
 if not exists(select 1 from jsonb_array_elements(roles_) x where x->>'company_id'=b_::text and x->>'mode'='manager' and x->>'role' in ('PLANNER','DISPATCHER','VIEWER')) then raise exception 'team leader role missing';end if;
 if exists(select 1 from public.employees where id=ec_) then raise exception 'foreign employee visible';end if;
 begin perform public.claim_multi_company_invite(current_setting('test.token'));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'invitation replay allowed';end if;
end $test$;
reset role;
do $negative$
declare denied boolean:=false;
begin
 if exists(select 1 from private.sf_multi_claim_context) then raise exception 'claim context leaked';end if;
 begin
  update public.employees set email='unrelated-change@example.invalid' where id=current_setting('test.eb')::uuid;
 exception when others then
  if sqlerrm not like '%Teamleiter-Zuordnung%' then raise;end if; denied:=true;
 end;
 if not denied then raise exception 'team leader changed protected identity';end if;
end $negative$;
update public.employees set access_status='DISABLED' where id=current_setting('test.eb')::uuid;
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.employee_company_options() where employee_id=current_setting('test.eb')::uuid) then raise exception 'disabled profile visible';end if;
 if not exists(select 1 from public.employee_company_options() where employee_id=current_setting('test.ea')::uuid) then raise exception 'unrelated profile unavailable';end if;
 if not exists(select 1 from jsonb_array_elements(public.multi_role_company_options()) x where x->>'company_id'=current_setting('test.b') and x->>'mode'='manager') then raise exception 'team leader role removed with employee access';end if;
end $test$;
reset role;
rollback;
