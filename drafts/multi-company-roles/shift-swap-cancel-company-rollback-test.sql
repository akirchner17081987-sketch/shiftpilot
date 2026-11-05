begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
drop index if exists public.employees_auth_user_id_uidx;
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: scope cancellation to the active profile in the offer's company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_cancel_shift_swap_impl(p_swap_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.company_id=s.company_id and e.id=private.sf_employee_identity_for_company(s.company_id)) then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $function$
;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;
insert into public.shift_swap_requests(id,company_id,original_employee_id,assignment_version,status)
select sa,a,ea,1,'MARKET_OPEN' from sf_cancel_test union all select sb,b,eb,1,'MARKET_OPEN' from sf_cancel_test;
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_cancel_shift_swap(x.sb); exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'cancel allowed for disabled company';end if;
 if public.employee_cancel_shift_swap(x.sa)<>'CANCELLED' then raise exception 'active company cancellation failed';end if;
end $test$;
reset role;
do $verify$ declare x sf_cancel_test%rowtype;begin select * into x from sf_cancel_test;
 if (select status from public.shift_swap_requests where id=x.sb)<>'MARKET_OPEN' then raise exception 'disabled offer modified';end if;
 if (select status from public.shift_swap_requests where id=x.sa)<>'CANCELLED' then raise exception 'active offer not cancelled';end if;
end $verify$;
rollback;