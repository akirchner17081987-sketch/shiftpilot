-- QA database only. Uses fictional data and rolls everything back.
begin;
do $test$
declare
  owner_id uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); foreign_company uuid:=gen_random_uuid();
  ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); n int;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,'qa-owner-'||owner_id||'@example.invalid',now(),'{}'),
    (user_id,'qa-user-'||user_id||'@example.invalid',now(),'{}'),
    (other_id,'qa-other-'||other_id||'@example.invalid',now(),'{}');
  insert into public.companies(id,name,created_by) values
    (a,'QA fixture A',owner_id),(b,'QA fixture B',owner_id),(foreign_company,'QA fixture foreign',owner_id);
  insert into public.company_members(company_id,user_id,role,status,access_role) values
    (a,owner_id,'OWNER','ACTIVE','OWNER'),(b,owner_id,'OWNER','ACTIVE','OWNER'),(foreign_company,owner_id,'OWNER','ACTIVE','OWNER');
  insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values
    (ea,a,'QA','A','QA-A-'||left(ea::text,8),user_id,'ACTIVE'),
    (eb,b,'QA','B','QA-B-'||left(eb::text,8),user_id,'ACTIVE'),
    (ec,foreign_company,'QA','C','QA-C-'||left(ec::text,8),other_id,'ACTIVE');
  insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values
    (sa,a,ea,'QA',now(),now()+interval '8 hours','PUBLISHED',now()),
    (sb,b,eb,'QA',now(),now()+interval '8 hours','PUBLISHED',now()),
    (sc,foreign_company,ec,'QA',now(),now()+interval '8 hours','PUBLISHED',now());
  perform set_config('request.jwt.claim.sub',user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2')::text,true);
  perform set_config('role','authenticated',true);
  select count(*) into n from public.shift_assignments where id=sa and company_id=a;
  if n<>1 then raise exception 'A shift unavailable'; end if;
  select count(*) into n from public.shift_assignments where id=sb and company_id=b;
  if n<>1 then raise exception 'B shift unavailable'; end if;
  select count(*) into n from public.shift_assignments where id=sc;
  if n<>0 then raise exception 'Foreign shift visible'; end if;
  perform set_config('role','none',true);
  update public.employees set access_status='DISABLED' where id=eb;
  perform set_config('role','authenticated',true);
  select count(*) into n from public.shift_assignments where id=sb;
  if n<>0 then raise exception 'Disabled B shift visible'; end if;
  select count(*) into n from public.shift_assignments where id=sa;
  if n<>1 then raise exception 'A shift lost after B disable'; end if;
  perform set_config('role','none',true);
end $test$;
rollback;
