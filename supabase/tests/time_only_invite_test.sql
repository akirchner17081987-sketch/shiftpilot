begin;
do $$
declare
 owner_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid(); fixture_company uuid:=gen_random_uuid();
 raw_token text:=gen_random_uuid()::text||gen_random_uuid()::text; mail text; invite_id uuid; actual_role text;
begin
 mail:='time-role-invite-'||new_id||'@example.invalid';
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(owner_id,'authenticated','authenticated','time-role-owner-'||owner_id||'@example.invalid','{}','{}',now(),now());
 insert into public.companies(id,name,created_by) values(fixture_company,'Invite rollback fixture',owner_id);
 insert into public.company_members(company_id,user_id,role,status) values(fixture_company,owner_id,'OWNER','ACTIVE');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 execute 'set local role authenticated';
 invite_id:=public.manager_create_company_invite(fixture_company,mail,'TIME_TRACKING',encode(extensions.digest(raw_token,'sha256'),'hex'));
 execute 'reset role';
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(new_id,'authenticated','authenticated',mail,'{}',jsonb_build_object('sf_company_invite',raw_token,'role','OWNER'),now(),now());
 select cm.role into actual_role from public.company_members cm where cm.company_id=fixture_company and cm.user_id=new_id;
 if actual_role is distinct from 'TIME_TRACKING' then raise exception 'FAIL invite role %',actual_role;end if;
 if not exists(select 1 from public.company_member_invites where id=invite_id and status='CLAIMED' and claimed_by=new_id) then raise exception 'FAIL invite claim';end if;
end $$;
rollback;
