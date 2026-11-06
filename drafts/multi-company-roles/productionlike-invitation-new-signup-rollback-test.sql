-- Isolated test database only; no email is sent; synthetic data is rolled back.
begin;
do $test$
declare o uuid:=gen_random_uuid();u uuid; a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ea uuid;eb uuid; mail text; raw text; anchor uuid; it integer; rejected boolean; bad uuid;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(o,'sign-owner-'||o::text||'@example.invalid',now(),'{}');
 insert into public.companies(id,name,created_by) values(a,'Synthetic signup A',o),(b,'Synthetic signup B',o);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a,o,'OWNER','ACTIVE','OWNER'),(b,o,'OWNER','ACTIVE','OWNER');
 for it in 1..2 loop
  u:=gen_random_uuid();ea:=gen_random_uuid();eb:=gen_random_uuid();mail:='signup-'||u::text||'@example.invalid';raw:=repeat(case when it=1 then 'd' else 'e' end,72);anchor:=case when it=1 then a else b end;
  insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,role) values(ea,a,'Synthetic','A','A-'||left(ea::text,8),mail,'Sicherheitsmitarbeiter'),(eb,b,'Synthetic','B','B-'||left(eb::text,8),mail,'Teamleiter');
  perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
  perform private.manager_create_multi_access_invite(anchor,mail,jsonb_build_array(jsonb_build_object('company_id',a,'role','EMPLOYEE','employee_id',ea),jsonb_build_object('company_id',b,'role','TEAM_LEAD','employee_id',eb)),encode(extensions.digest(raw,'sha256'),'hex'));
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  bad:=gen_random_uuid();rejected:=false;
  begin insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(bad,'wrong-'||bad::text||'@example.invalid',null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));exception when others then rejected:=true;end;
  if not rejected then raise exception 'wrong-email signup accepted';end if;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,mail,null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));
  if (select count(*) from public.employees where id in(ea,eb) and auth_user_id=u and access_status='ACTIVE')<>2 then raise exception 'signup did not link both profiles';end if;
  if not exists(select 1 from public.company_members where company_id=b and user_id=u and access_role='TEAM_LEAD' and status='ACTIVE') then raise exception 'team leader membership missing';end if;
  if not exists(select 1 from private.multi_company_invitation_groups where token_hash=encode(extensions.digest(raw,'sha256'),'hex') and claimed_by=u and claimed_at is not null) then raise exception 'group not claimed';end if;
  update auth.users set email='released-'||u::text||'@example.invalid' where id=u;
  bad:=gen_random_uuid();rejected:=false;
  begin insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(bad,mail,null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));exception when others then rejected:=true;end;
  if not rejected then raise exception 'signup replay allowed';end if;
 end loop;
end $test$;
rollback;
