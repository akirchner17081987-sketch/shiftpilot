-- Isolated QA-only fixture; all changes are rolled back.
begin;
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

-- Draft: require active company identity before loading portal summary, company profile or leave balance.
CREATE OR REPLACE FUNCTION private.employee_home_summary_impl(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
 v_now timestamptz:=statement_timestamp(); v_timezone text; v_next jsonb; v_qr jsonb; v_sites jsonb;
 v_changes integer; v_replacements integer; v_feedback integer; v_swaps integer; v_handover integer; v_wishes integer; v_wish_month text;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if v_uid is null or p_company_id is null then
  raise exception 'Bitte mit einem Mitarbeiterzugang anmelden' using errcode='42501';
 end if;
 if private.sf_has_time_only_login() then
  raise exception 'Dieser Zugang ist nur für die Zeiterfassung' using errcode='42501';
 end if;
 select e.* into v_employee from public.employees e
 where e.auth_user_id=v_uid and e.company_id=p_company_id
  and e.status='active' and e.access_status='ACTIVE'
  and not exists(select 1 from public.company_members m where m.company_id=e.company_id
   and m.user_id=v_uid and m.status<>'ACTIVE')
 order by e.id limit 1;
 if not found then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 select coalesce(c.timezone,'Europe/Berlin') into v_timezone from public.companies c where c.id=p_company_id;
 select jsonb_build_object('id',a.id,'shift_code',a.shift_code,'name',coalesce(t.name,a.shift_code),
  'starts_at',a.starts_at,'ends_at',a.ends_at,'break_minutes',a.break_minutes,
  'site_name',nullif(l.name,''),'site_address',coalesce(l.address,'')) into v_next
 from public.shift_assignments a
 left join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 left join public.company_locations l on l.id=t.site_id and l.company_id=a.company_id
 where a.company_id=p_company_id and a.employee_id=v_employee.id
  and a.status='PUBLISHED' and a.published_at is not null and a.ends_at>v_now
 order by a.starts_at,a.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'name',l.name,'address',coalesce(l.address,'')) order by t.code),'[]'::jsonb) into v_sites
 from public.shift_templates t join public.company_locations l on l.id=t.site_id and l.company_id=t.company_id
 where t.company_id=p_company_id;
 select jsonb_build_object('id',s.id,'started_at',s.started_at,'terminal_name',t.name,
  'location_note',coalesce(t.location_note,''),
  'state',case when exists(select 1 from public.time_qr_independent_breaks b where b.shift_id=s.id and b.ended_at is null) then 'BREAK' else 'RUNNING' end,
  'attendance_seconds',greatest(0,extract(epoch from(v_now-s.started_at))),
  'pause_seconds',coalesce((select sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))) from public.time_qr_independent_breaks b where b.shift_id=s.id),0)) into v_qr
 from public.time_qr_independent_shifts s
 join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
 where s.company_id=p_company_id and s.employee_id=v_employee.id and s.ended_at is null
 order by s.started_at desc,s.id limit 1;
 select count(*)::integer into v_changes from public.shift_change_requests r
 where r.company_id=p_company_id and r.employee_id=v_employee.id and r.requires_employee_approval
  and r.status not in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED')
  and not exists(select 1 from public.shift_change_approvals a where a.change_request_id=r.id
   and a.approval_type='EMPLOYEE' and a.status<>'PENDING');
 select count(*)::integer into v_replacements from public.disruption_offers o
 join public.disruption_incidents i on i.id=o.incident_id and i.company_id=o.company_id
 join public.shift_assignments a on a.id=i.assignment_id and a.company_id=o.company_id
 where o.company_id=p_company_id and o.employee_id=v_employee.id and o.status='OFFERED'
  and o.expires_at>v_now and i.status='OPEN' and a.ends_at>v_now;
 select count(*)::integer into v_feedback from public.notifications n
 where n.company_id=p_company_id and n.user_id=v_uid and n.employee_id=v_employee.id and not n.is_read
  and n.kind in ('ABSENCE_DECISION','ABSENCE_REQUEST_APPROVED','ABSENCE_REQUEST_REJECTED','PROFILE_DECISION');
 select count(*)::integer into v_swaps from public.shift_swap_requests r
 join public.shift_assignments a on a.id=r.assignment_id and a.company_id=r.company_id
 where r.company_id=p_company_id and r.target_employee_id=v_employee.id
  and r.status='PENDING_COLLEAGUE' and a.status='PUBLISHED' and a.published_at is not null and a.ends_at>v_now;
 select count(*)::integer,to_char(min(greatest(w.start_date,(v_now at time zone v_timezone)::date)),'YYYY-MM') into v_wishes,v_wish_month
 from public.planning_wishes w where w.company_id=p_company_id and w.employee_id=v_employee.id
  and w.status='RELEASE_REQUESTED' and w.end_date>=(v_now at time zone v_timezone)::date;
 with own_boards as (
  select b.* from public.shift_handovers b where b.company_id=p_company_id and b.state='WORKING'
   and b.ends_at>=((v_now at time zone v_timezone)::date-7)::timestamp at time zone v_timezone
   and b.starts_at<((v_now at time zone v_timezone)::date+8)::timestamp at time zone v_timezone
   and exists(select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
    where a.company_id=p_company_id and a.employee_id=v_employee.id and a.status='PUBLISHED' and a.published_at is not null
     and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at and t.site_id is not distinct from b.site_id)
 ) select ((select count(*) from public.shift_handovers src join own_boards b on b.id=src.target_id
    where src.company_id=p_company_id and src.state='SENT' and src.received_at is null)
   +(select count(*) from public.shift_handover_items i join own_boards b on b.id=i.board_id
    where i.company_id=p_company_id and i.responsible_employee_id=v_employee.id and i.status in ('OPEN','IN_PROGRESS')))::integer into v_handover;
 return jsonb_build_object('employee_id',v_employee.id,'company_id',p_company_id,'as_of',v_now,
  'timezone',coalesce(v_timezone,'Europe/Berlin'),'next_shift',v_next,'qr',v_qr,'sites',v_sites,'wish_month',v_wish_month,
  'tasks',jsonb_build_object('changes',v_changes,'replacements',v_replacements,'feedback',v_feedback,'swaps',v_swaps,'handover',v_handover,'wishes',v_wishes));
end;$function$
;

CREATE OR REPLACE FUNCTION private.employee_my_company_profile(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if auth.uid() is null or not exists(select 1 from public.employees e where e.company_id=p_company_id and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null) then raise exception using errcode='42501',message='Kein aktiver Mitarbeiterzugang für dieses Unternehmen.'; end if;
 select jsonb_build_object('company_id',c.id,'name',c.name,'timezone',c.timezone,'display_location',coalesce(p.display_location,''),'logo_data_url',coalesce(p.logo_data_url,''),'contacts',coalesce((select jsonb_agg(x) from jsonb_array_elements(p.contacts)x where x->>'visible_to_employees'='true'),'[]'::jsonb)) into result from public.companies c left join public.company_profiles p on p.company_id=c.id where c.id=p_company_id;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.employee_my_leave_account(p_company_id uuid, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e uuid;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Mitarbeiterzugang' using errcode='42501'; end if;
 select id into e from public.employees b where b.company_id=p_company_id and b.auth_user_id=auth.uid()
  and b.status='active' and b.access_status='ACTIVE' and b.deleted_at is null
  and not exists(select 1 from public.company_members m where m.company_id=b.company_id and m.user_id=auth.uid() and m.status<>'ACTIVE')
 order by id limit 1;
 if e is null then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return private.leave_account_bundle(e,p_year);
end;$function$
;

-- Install selection function in the transaction before running this script.
create temporary table sf_rls_test (owner_id uuid, user_id uuid, other_user uuid, a uuid, b uuid, c uuid, ea uuid, eb uuid, ec uuid, sa uuid, sb uuid, sc uuid);
insert into sf_rls_test select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on sf_rls_test to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select owner_id,'rls-owner-'||owner_id||'@example.invalid',now(),'{}'::jsonb from sf_rls_test
union all select user_id,'rls-user-'||user_id||'@example.invalid',now(),'{}'::jsonb from sf_rls_test
union all select other_user,'rls-other-'||other_user||'@example.invalid',now(),'{}'::jsonb from sf_rls_test;
insert into public.companies(id,name,created_by)
select a,'RLS A',owner_id from sf_rls_test union all select b,'RLS B',owner_id from sf_rls_test union all select c,'RLS C',owner_id from sf_rls_test;
insert into public.company_members(company_id,user_id,role,status,access_role)
select a,owner_id,'OWNER','ACTIVE','OWNER' from sf_rls_test union all select b,owner_id,'OWNER','ACTIVE','OWNER' from sf_rls_test union all select c,owner_id,'OWNER','ACTIVE','OWNER' from sf_rls_test;
insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status)
select ea,a,'QA','One','A-'||left(ea::text,8),user_id,'ACTIVE' from sf_rls_test
union all select eb,b,'QA','Two','B-'||left(eb::text,8),user_id,'ACTIVE' from sf_rls_test
union all select ec,c,'QA','Other','C-'||left(ec::text,8),other_user,'ACTIVE' from sf_rls_test;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true) from sf_rls_test;
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sa,a,ea,'QA',now()-interval '1 day',now()-interval '16 hours','PUBLISHED',now() from sf_rls_test
union all select sb,b,eb,'QA',now()-interval '1 day',now()-interval '16 hours','PUBLISHED',now() from sf_rls_test
union all select sc,c,ec,'QA',now()-interval '1 day',now()-interval '16 hours','PUBLISHED',now() from sf_rls_test;
insert into public.time_entries(assignment_id,company_id) select sa,a from sf_rls_test union all select sb,b from sf_rls_test union all select sc,c from sf_rls_test;
-- Reproduce only the three production restrictive policies and the production function grant; other QA policies differ.
grant execute on function private.sf_employee_id() to authenticated;
create policy sf_employee_active_read on public.employees as restrictive for select to authenticated using(private.sf_is_manager(company_id,false) or id=(select private.sf_employee_id()));
create policy sf_assignment_active_read on public.shift_assignments as restrictive for select to authenticated using(private.sf_is_manager(company_id,false) or employee_id=(select private.sf_employee_id()));
create policy sf_time_capability_read on public.time_entries as restrictive for select to authenticated using(private.sf_can_manage_time(company_id) or exists(select 1 from public.shift_assignments sa where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id and sa.employee_id=(select private.sf_employee_id())));
select set_config('request.jwt.claim.sub',user_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2')::text,true) from sf_rls_test;
set local role authenticated;
do $test$ declare x record; n int; begin
 select * into x from sf_rls_test;
 select count(*) into n from public.employees where id in (x.ea,x.eb); if n<>1 then raise exception 'baseline expected one visible employee, got %',n; end if;
 select count(*) into n from public.shift_assignments where id in (x.sa,x.sb); if n<>1 then raise exception 'baseline expected one visible assignment, got %',n; end if;
 select count(*) into n from public.time_entries where assignment_id in (x.sa,x.sb); if n<>1 then raise exception 'baseline expected one visible time entry, got %',n; end if;
end $test$;
reset role;
-- Insert candidate ALTER POLICY statements here.
-- Draft: install only after migration and full authorization review.
-- Existing permissive policies and manager/time-manager capabilities remain in force.
-- sf_employee_company_options() checks the authenticated user, active/deleted state,
-- and the company's disabled/read-only/time-only restrictions.
alter policy sf_employee_active_read on public.employees
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=employees.company_id and o.employee_id=employees.id));

alter policy sf_assignment_active_read on public.shift_assignments
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=shift_assignments.company_id and o.employee_id=shift_assignments.employee_id));

alter policy sf_time_capability_read on public.time_entries
 using (private.sf_can_manage_time(company_id) or
   exists(select 1 from public.shift_assignments sa
     join private.sf_employee_company_options() o on o.company_id=sa.company_id and o.employee_id=sa.employee_id
     where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id));

set local role authenticated;
do $test$ declare x record; n int; begin
 select * into x from sf_rls_test;
 if (public.employee_my_company_profile(x.a)->>'company_id')::uuid<>x.a or (public.employee_my_company_profile(x.b)->>'company_id')::uuid<>x.b then raise exception 'wrong company profile';end if;
if (public.employee_home_summary(x.a)->>'employee_id')::uuid<>x.ea or (public.employee_home_summary(x.b)->>'employee_id')::uuid<>x.eb then raise exception 'wrong home summary';end if;
perform public.employee_my_leave_account(x.a,extract(year from current_date)::int);
perform public.employee_my_leave_account(x.b,extract(year from current_date)::int);
select count(*) into n from public.employees where id in (x.ea,x.eb); if n<>2 then raise exception 'expected two employee profiles, got %',n; end if;
 select count(*) into n from public.shift_assignments where id in (x.sa,x.sb); if n<>2 then raise exception 'expected two assignments, got %',n; end if;
 select count(*) into n from public.time_entries where assignment_id in (x.sa,x.sb); if n<>2 then raise exception 'expected two time entries, got %',n; end if;
 if exists(select 1 from public.employees where id=x.ec) or exists(select 1 from public.shift_assignments where id=x.sc) or exists(select 1 from public.time_entries where assignment_id=x.sc) then raise exception 'other user data visible';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true) from sf_rls_test;
update public.employees set access_status='DISABLED' where id=(select ea from sf_rls_test);
select set_config('request.jwt.claim.sub',user_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2')::text,true) from sf_rls_test;
set local role authenticated;
do $test$ declare x record; begin
 select * into x from sf_rls_test;
 begin perform public.employee_my_company_profile(x.a);raise exception 'revoked profile access accepted';exception when insufficient_privilege then null;end;
begin perform public.employee_home_summary(x.a);raise exception 'revoked summary access accepted';exception when insufficient_privilege then null;end;
begin perform public.employee_my_leave_account(x.a,extract(year from current_date)::int);raise exception 'revoked leave access accepted';exception when insufficient_privilege then null;end;
if exists(select 1 from public.employees where id=x.ea) or exists(select 1 from public.shift_assignments where id=x.sa) or exists(select 1 from public.time_entries where assignment_id=x.sa) then raise exception 'revoked company data visible';end if;
 if not exists(select 1 from public.employees where id=x.eb) or not exists(select 1 from public.shift_assignments where id=x.sb) or not exists(select 1 from public.time_entries where assignment_id=x.sb) then raise exception 'other active company data missing';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true) from sf_rls_test;
set local role authenticated;
do $test$ declare x record; n int; begin
 select * into x from sf_rls_test;
 select count(*) into n from public.employees where id in (x.ea,x.eb,x.ec);if n<>3 then raise exception 'manager employee access changed: %',n;end if;
 select count(*) into n from public.shift_assignments where id in (x.sa,x.sb,x.sc);if n<>3 then raise exception 'manager assignment access changed: %',n;end if;
 select count(*) into n from public.time_entries where assignment_id in (x.sa,x.sb,x.sc);if n<>3 then raise exception 'manager time access changed: %',n;end if;
end $test$;
reset role;
rollback;