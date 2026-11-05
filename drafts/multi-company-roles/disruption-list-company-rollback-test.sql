begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
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

-- Draft: company-scoped disruption list; legacy calls reject ambiguous accounts.
-- Requires employee-company-identity-candidate.sql. Not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_for_company_impl(p_company_id uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_company uuid; v_count integer;
begin
 select count(*),min(company_id::text)::uuid into v_count,v_company from private.sf_employee_company_options();
 if v_count<>1 then raise exception 'Bitte das Unternehmen für den Mitarbeiterzugang auswählen' using errcode='42501'; end if;
 return query select * from private.employee_list_disruption_offers_for_company_impl(v_company);
end $function$;
CREATE OR REPLACE FUNCTION public.employee_list_disruption_offers_for_company(p_company_id uuid)
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text) LANGUAGE sql SET search_path TO '' AS $function$
 select * from private.employee_list_disruption_offers_for_company_impl(p_company_id)
$function$;
revoke all on function private.employee_list_disruption_offers_for_company_impl(uuid) from public,anon;
revoke all on function public.employee_list_disruption_offers_for_company(uuid) from public,anon;
grant execute on function private.employee_list_disruption_offers_for_company_impl(uuid) to authenticated;
grant execute on function public.employee_list_disruption_offers_for_company(uuid) to authenticated;

create temporary table sf_cancel_test(u uuid,a uuid,b uuid,ea uuid,eb uuid,sa uuid,sb uuid);
insert into sf_cancel_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_cancel_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select u,'cancel-'||u::text||'@example.invalid',now(),'{}'::jsonb from sf_cancel_test;
insert into public.companies(id,name,created_by) select a,'Test A',u from sf_cancel_test union all select b,'Test B',u from sf_cancel_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,email,auth_user_id,access_status)
select ea,a,'Test','A','A-'||left(ea::text,8),'cancel@example.invalid',u,'ACTIVE' from sf_cancel_test union all
select eb,b,'Test','B','B-'||left(eb::text,8),'cancel@example.invalid',u,'DISABLED' from sf_cancel_test;


alter table sf_cancel_test add column ia uuid default gen_random_uuid(),add column ib uuid default gen_random_uuid(),add column oa uuid default gen_random_uuid(),add column ob uuid default gen_random_uuid();
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sa,a,ea,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test union all
select sb,b,eb,'O1',now()+interval '2 days',now()+interval '2 days 8 hours','PUBLISHED',now() from sf_cancel_test;
insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by)
select ia,a,sa,ea,1,'OTHER',u from sf_cancel_test union all select ib,b,sb,eb,1,'OTHER',u from sf_cancel_test;
insert into public.disruption_offers(id,company_id,incident_id,employee_id,offered_by,expires_at)
select oa,a,ia,ea,u,now()+interval '1 day' from sf_cancel_test union all select ob,b,ib,eb,u,now()+interval '1 day' from sf_cancel_test;

update public.employees set access_status='ACTIVE' where id=(select eb from sf_cancel_test);
select set_config('request.jwt.claim.sub',u::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal2','role','authenticated')::text,true) from sf_cancel_test;
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype; denied boolean:=false;begin
 select * into x from sf_cancel_test;
 if (select count(*) from public.employee_list_disruption_offers_for_company(x.a) where offer_id=x.oa)<>1 then raise exception 'company A offer missing';end if;
 if exists(select 1 from public.employee_list_disruption_offers_for_company(x.a) where offer_id=x.ob) then raise exception 'company B offer visible in company A';end if;
 if (select count(*) from public.employee_list_disruption_offers_for_company(x.b) where offer_id=x.ob)<>1 then raise exception 'company B offer missing';end if;
 begin perform public.employee_list_disruption_offers();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ambiguous legacy list accepted';end if;
 if has_function_privilege('anon','public.employee_list_disruption_offers_for_company(uuid)','execute') then raise exception 'anonymous list access';end if;
end $test$;
reset role;
update public.employees set access_status='DISABLED' where id=(select eb from sf_cancel_test);
set local role authenticated;
do $test$ declare x sf_cancel_test%rowtype;denied boolean:=false;begin
 select * into x from sf_cancel_test;
 begin perform public.employee_list_disruption_offers_for_company(x.b);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'disabled company list accepted';end if;
 if (select count(*) from public.employee_list_disruption_offers() where offer_id=x.oa)<>1 then raise exception 'single company legacy list failed';end if;
end $test$;
reset role;
rollback;