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

-- Install selection function in the transaction before running this script.
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

-- Draft: explicit-company lists; legacy multi-profile lists fail closed.
create or replace function private.sf_single_active_employee_company() returns uuid
language plpgsql stable security definer set search_path='' as $fn$
declare ids uuid[];
begin
 select array_agg(o.company_id) into ids from private.sf_employee_company_options() o;
 if coalesce(cardinality(ids),0)<>1 then raise exception 'Bitte das Mitarbeiterportal neu laden und ein Unternehmen auswählen' using errcode='42501';end if;
 return ids[1];
end $fn$;
revoke all on function private.sf_single_active_employee_company() from public,anon,authenticated;


-- Draft: production profile functionality with explicit company identity.
CREATE OR REPLACE FUNCTION private.sf_employee_company_profile_impl(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employees%rowtype; c public.companies%rowtype; team text; rhythm jsonb; today date;
begin
  select * into strict e from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
  select * into c from public.companies where id=e.company_id;
  today:=(statement_timestamp() at time zone c.timezone)::date;
  select substring(q from length('__sp:planningTeam=')+1) into team from unnest(e.qualifications) q where q like '__sp:planningTeam=%' limit 1;
  select jsonb_build_object('team',t.team_code,'start',t.start_date,'pattern',t.pattern,'offset',t.start_offset,'mode','required','central',true)
    into rhythm from public.company_planning_teams t where t.company_id=e.company_id and t.team_code=team;
  if rhythm is null then
    select jsonb_build_object('team',coalesce(team,''),'start',coalesce(max(substring(q from length('__sp:rhythmStart=')+1)) filter(where q like '__sp:rhythmStart=%'),''),
      'pattern',case when coalesce(max(substring(q from length('__sp:rhythmPattern=')+1)) filter(where q like '__sp:rhythmPattern=%'),'')='' then array[]::text[] else regexp_split_to_array(upper(max(substring(q from length('__sp:rhythmPattern=')+1)) filter(where q like '__sp:rhythmPattern=%')),'\s*[,;]\s*') end,
      'mode',case when team in ('A','B','C','D','E') then 'required' else coalesce(max(substring(q from length('__sp:rhythmMode=')+1)) filter(where q like '__sp:rhythmMode=%'),'off') end,'central',false)
      into rhythm from unnest(e.qualifications) q;
    rhythm:=rhythm||jsonb_build_object('offset',case when team in ('A','B','C','D','E') then floor((ascii(team)-ascii('A'))*jsonb_array_length(rhythm->'pattern')/5.0)::integer else 0 end);
  end if;
  if team in ('A','B','C','D','E') then
    rhythm:=jsonb_set(rhythm,'{pattern}',(select coalesce(jsonb_agg(coalesce((select s.code from public.shift_templates s
      where s.company_id=e.company_id and s.active and s.requires_planning_team and s.rhythm_alias=upper(trim(a.x))
      order by s.sort_order,s.code limit 1),a.x) order by a.n),'[]'::jsonb)
      from jsonb_array_elements_text(rhythm->'pattern') with ordinality a(x,n)));
  end if;
  return jsonb_build_object('employee',jsonb_build_object('id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,
    'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,'start_date',e.start_date,'contract_end',e.contract_end,'birth_date',e.birth_date,
    'email',e.email,'phone',e.phone,'address',e.address,'zip',e.zip,'city',e.city,'work_time_model',e.work_time_model,'updated_at',e.updated_at,
    'shift_permissions',e.shift_permissions,'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q not like '__sp:%' and not(q=any(e.shift_permissions))),'[]'::jsonb)),
    'company',jsonb_build_object('id',c.id,'name',c.name,'timezone',c.timezone),'as_of',statement_timestamp(),'today',today,
    'login_email',(select email from auth.users where id=auth.uid()),'rhythm',rhythm,
    'details',coalesce((select jsonb_build_object('department',d.department,'job_title',d.job_title,'work_location',d.work_location,'probation_end',d.probation_end)
      from public.employee_personnel_details d where d.employee_id=e.id and d.company_id=e.company_id),'{}'::jsonb),
    'qualifications',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'category',q.category,'title',q.title,'issuer',q.issuer,'issued_on',q.issued_on,'expires_on',q.expires_on,
      'days_until_expiry',q.expires_on-today) order by q.expires_on nulls last,q.title) from public.employee_personnel_qualifications q where q.employee_id=e.id and q.company_id=e.company_id),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'default_start',s.default_start,'default_end',s.default_end,'active',s.active) order by s.sort_order,s.code)
      from public.shift_templates s where s.company_id=e.company_id and(s.active or s.code=any(e.shift_permissions))),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)-'created_by'-'reviewed_by'-'company_id' order by created_at desc) from
      (select * from private.employee_profile_requests where employee_id=e.id and company_id=e.company_id order by (status='pending') desc,created_at desc limit 100) r),'[]'::jsonb));
end;$function$
;
CREATE OR REPLACE FUNCTION private.sf_employee_company_profile_request_impl(p_company uuid, p_category text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employees%rowtype; rid uuid; member record; msg text:=btrim(coalesce(p_message,''));
begin
  select * into strict e from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
  if p_category is null or p_category not in ('personal','contact','employment','planning','qualifications','other') or length(msg) not between 5 and 2000 then
    raise exception 'Bitte Bereich und eine Beschreibung mit 5 bis 2000 Zeichen angeben' using errcode='22023';end if;
  -- Serializes retries and the daily limit for this employee.
  perform pg_advisory_xact_lock(hashtextextended(e.id::text,217));
  if exists(select 1 from private.employee_profile_requests where employee_id=e.id and category=p_category and status='pending') then
    raise exception 'Für diesen Bereich besteht bereits eine offene Anfrage' using errcode='23505';end if;
  if (select count(*) from private.employee_profile_requests where employee_id=e.id and created_at>now()-interval '24 hours')>=20 then
    raise exception 'Heute wurden bereits viele Anfragen gesendet. Bitte die Leitung kontaktieren' using errcode='22023';end if;
  insert into private.employee_profile_requests(company_id,employee_id,category,message,created_by)
    values(e.company_id,e.id,p_category,msg,auth.uid()) returning id into rid;
  for member in select user_id from public.company_members where company_id=e.company_id and status='ACTIVE' and role in('OWNER','ADMIN') loop
    perform private.sf_put_notification(e.company_id,member.user_id,null,'PROFILE_REQUESTED','Profiländerung angefragt',
      concat(e.first_name,' ',e.last_name,' hat eine Korrektur der eigenen Angaben angefragt.'),'employees','profile_request',rid,jsonb_build_object('employee_id',e.id));
  end loop;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
    values(e.company_id,'PROFILE_REQUESTED','profile_request',rid,auth.uid(),'EMPLOYEE',jsonb_build_object('category',p_category,'status','pending'));
  return rid;
end;$function$
;

-- Legacy profile operations may only choose a company when exactly one profile is active.
create or replace function private.employee_profile_identity_impl()
returns public.employees language plpgsql stable security definer set search_path='' as $fn$
declare e public.employees%rowtype; selected_company uuid;
begin
 selected_company:=private.sf_single_active_employee_company();
 select * into strict e from public.employees where id=private.sf_employee_identity_for_company(selected_company) and company_id=selected_company;
 return e;
end $fn$;
create or replace function public.employee_company_profile(p_company uuid) returns jsonb
language sql stable set search_path='' as $fn$ select private.sf_employee_company_profile_impl(p_company) $fn$;
create or replace function public.employee_company_profile_request(p_company uuid,p_category text,p_message text) returns uuid
language sql set search_path='' as $fn$ select private.sf_employee_company_profile_request_impl(p_company,p_category,p_message) $fn$;
revoke all on function private.sf_employee_company_profile_impl(uuid) from public,anon;
revoke all on function private.sf_employee_company_profile_request_impl(uuid,text,text) from public,anon;
revoke all on function public.employee_company_profile(uuid) from public,anon;
revoke all on function public.employee_company_profile_request(uuid,text,text) from public,anon;
grant execute on function private.sf_employee_company_profile_impl(uuid) to authenticated;
grant execute on function private.sf_employee_company_profile_request_impl(uuid,text,text) to authenticated;
grant execute on function public.employee_company_profile(uuid) to authenticated;
grant execute on function public.employee_company_profile_request(uuid,text,text) to authenticated;

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
 
if (public.employee_company_profile(x.a)->'employee'->>'id')::uuid<>x.ea or (public.employee_company_profile(x.b)->'employee'->>'id')::uuid<>x.eb then raise exception 'wrong company profile';end if;
begin perform public.employee_company_profile(x.c);raise exception 'other company profile accepted';exception when insufficient_privilege then null;end;
begin perform public.employee_my_profile();raise exception 'ambiguous legacy profile accepted';exception when insufficient_privilege then null;end;
perform public.employee_company_profile_request(x.a,'contact','QA Test change A');
perform public.employee_company_profile_request(x.b,'contact','QA Test change B');
if jsonb_array_length(public.employee_company_profile(x.a)->'requests')<>1 or jsonb_array_length(public.employee_company_profile(x.b)->'requests')<>1 then raise exception 'profile requests missing';end if;
if public.employee_company_profile(x.a)->'requests'->0->>'message'<>'QA Test change A' or public.employee_company_profile(x.b)->'requests'->0->>'message'<>'QA Test change B' then raise exception 'requests crossed company';end if;
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
 
begin perform public.employee_company_profile(x.a);raise exception 'revoked profile accepted';exception when insufficient_privilege then null;end;
begin perform public.employee_company_profile_request(x.a,'other','QA Denied');raise exception 'revoked profile request accepted';exception when insufficient_privilege then null;end;
if (public.employee_company_profile(x.b)->'employee'->>'id')::uuid<>x.eb then raise exception 'active profile unavailable';end if;
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