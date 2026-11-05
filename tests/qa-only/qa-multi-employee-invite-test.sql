do $test$
declare owner_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); token text:='synthetic-multi-token'; res jsonb; rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(owner_id,'qa-owner-'||owner_id::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA test A',owner_id),(b,'QA test B',owner_id);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a,owner_id,'OWNER','ACTIVE','OWNER'),(b,owner_id,'OWNER','ACTIVE','OWNER');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(ea,a,'QA','A','QA-A','qa-multi@example.invalid'),(eb,b,'QA','B','QA-B','qa-multi@example.invalid');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal1','role','authenticated')::text,true);
 rejected:=false;
 begin perform private.qa_create_multi_employee_invite(a,array[ea,eb],'qa-multi@example.invalid',repeat('a',64)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Missing MFA accepted'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
 if (select count(*) from private.qa_invitable_employee_profiles(a,'qa-multi@example.invalid') where employee_id in (ea,eb))<>2 then raise exception 'Available profiles not listed'; end if;
 if exists(select 1 from private.qa_invitable_employee_profiles(a,'other@example.invalid')) then raise exception 'Unrelated profiles listed'; end if;
 update public.company_members set status='DISABLED' where company_id=b and user_id=owner_id;
 if exists(select 1 from private.qa_invitable_employee_profiles(a,'qa-multi@example.invalid') where employee_id=eb) then raise exception 'Unauthorized profile listed'; end if;
 rejected:=false;
 begin perform private.qa_create_multi_employee_invite(a,array[ea,eb],'qa-multi@example.invalid',repeat('a',64)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Missing company permission accepted'; end if;
 update public.company_members set status='ACTIVE' where company_id=b and user_id=owner_id;
 rejected:=false;
 begin perform private.qa_create_multi_employee_invite(a,array[ea,ea],'qa-multi@example.invalid',repeat('a',64)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Duplicate profile accepted'; end if;
 rejected:=false;
 begin perform private.qa_create_multi_employee_invite(a,array[ea,eb],'wrong@example.invalid',repeat('b',64)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Wrong profile email accepted'; end if;
 res:=private.qa_create_multi_employee_invite(a,array[ea,eb],'qa-multi@example.invalid',encode(extensions.digest(token,'sha256'),'hex'));
 rejected:=false;
 begin insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'wrong@example.invalid',jsonb_build_object('sf_employee_invite',token)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Wrong signup email accepted'; end if;
 update public.employees set status='inactive' where id=eb;
 rejected:=false;
 begin insert into auth.users(id,email,raw_user_meta_data) values(new_id,'qa-multi@example.invalid',jsonb_build_object('sf_employee_invite',token)); exception when others then rejected:=true; end;
 if not rejected or exists(select 1 from public.employees where id=ea and auth_user_id is not null)
    or exists(select 1 from auth.users where id=new_id) then raise exception 'Invalid profile did not roll back signup'; end if;
 update public.employees set status='active' where id=eb;
 insert into auth.users(id,email,raw_user_meta_data) values(new_id,'qa-multi@example.invalid',jsonb_build_object('sf_employee_invite',token));
 if (select count(*) from public.employees where auth_user_id=new_id and id in (ea,eb))<>2 then raise exception 'Profiles not linked'; end if;
end $test$;

