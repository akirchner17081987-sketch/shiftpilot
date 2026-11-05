begin;
set local lock_timeout='3s';set local statement_timeout='20s';
-- Isolated PostgreSQL table with the same relevant columns and index predicates as production.
create temporary table sf_index_test_employees(id uuid primary key,company_id uuid not null,auth_user_id uuid);
create unique index employees_auth_user_id_uidx on sf_index_test_employees(auth_user_id) where auth_user_id is not null;
create temporary table sf_index_fixture(uid uuid,a uuid,b uuid);
insert into sf_index_fixture select gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into sf_index_test_employees select gen_random_uuid(),a,uid from sf_index_fixture;
do $test$ declare x sf_index_fixture%rowtype; denied boolean:=false;begin
select * into x from sf_index_fixture;
begin insert into sf_index_test_employees values(gen_random_uuid(),x.b,x.uid);exception when unique_violation then denied:=true;end;
if not denied then raise exception 'old global uniqueness was not enforced';end if;
end $test$;
create unique index if not exists employees_company_auth_user_id_uidx on sf_index_test_employees(company_id,auth_user_id) where auth_user_id is not null;
drop index pg_temp.employees_auth_user_id_uidx;
do $test$ declare x sf_index_fixture%rowtype;denied boolean:=false;begin
select * into x from sf_index_fixture;
insert into sf_index_test_employees values(gen_random_uuid(),x.b,x.uid);
begin insert into sf_index_test_employees values(gen_random_uuid(),x.b,x.uid);exception when unique_violation then denied:=true;end;
if not denied then raise exception 'same company duplicate accepted';end if;
insert into sf_index_test_employees values(gen_random_uuid(),x.b,null),(gen_random_uuid(),x.b,null);
if (select count(*) from sf_index_test_employees where auth_user_id=x.uid)<>2 then raise exception 'cross company identity not preserved';end if;
end $test$;
rollback;