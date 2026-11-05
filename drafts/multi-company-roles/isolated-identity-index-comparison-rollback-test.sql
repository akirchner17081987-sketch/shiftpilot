begin;
create temporary table sf_old_index_test(id uuid primary key,company_id uuid not null,auth_user_id uuid);
create temporary table sf_new_index_test(id uuid primary key,company_id uuid not null,auth_user_id uuid);
create unique index sf_old_test_uidx on sf_old_index_test(auth_user_id) where auth_user_id is not null;
create unique index sf_new_test_uidx on sf_new_index_test(company_id,auth_user_id) where auth_user_id is not null;
do $test$ declare uid uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();denied boolean;begin
insert into sf_old_index_test values(gen_random_uuid(),a,uid);
denied:=false;begin insert into sf_old_index_test values(gen_random_uuid(),b,uid);exception when unique_violation then denied:=true;end;
if not denied then raise exception 'global identity uniqueness failed';end if;
insert into sf_new_index_test values(gen_random_uuid(),a,uid),(gen_random_uuid(),b,uid);
denied:=false;begin insert into sf_new_index_test values(gen_random_uuid(),b,uid);exception when unique_violation then denied:=true;end;
if not denied then raise exception 'company identity uniqueness failed';end if;
insert into sf_new_index_test values(gen_random_uuid(),a,null),(gen_random_uuid(),a,null);
end $test$;
rollback;