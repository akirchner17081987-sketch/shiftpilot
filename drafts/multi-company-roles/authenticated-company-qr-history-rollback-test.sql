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

CREATE OR REPLACE FUNCTION private.sf_list_shift_swaps_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  v_employee_id:=private.sf_employee_identity_for_company(p_company_id);
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  return query
  select s.id,
         case when s.original_employee_id=v_employee_id then 'OUTGOING' else 'INCOMING' end,
         s.status,
         s.assignment_id,
         a.shift_code,
         a.starts_at,
         a.ends_at,
         trim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,'')),
         s.reason,s.colleague_comment,s.manager_comment,s.requested_at
  from public.shift_swap_requests s
  left join public.shift_assignments a on a.id=s.assignment_id
  join public.employees orig on orig.id=s.original_employee_id
  join public.employees targ on targ.id=s.target_employee_id
  join public.employees o on o.id=case when s.original_employee_id=v_employee_id then s.target_employee_id else s.original_employee_id end
  where s.company_id=p_company_id and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
$function$
;
CREATE OR REPLACE FUNCTION private.sf_list_shift_marketplace_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp
  from public.employees e
  where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query
  select s.id,s.original_employee_id=v_emp.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,
    trim(o.first_name||' '||o.last_name),o.role,s.reason,s.requested_at,
    (s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id and private.sf_swap_candidate_reason(a.id,v_emp.id) is null),
    case when s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id then private.sf_swap_candidate_reason(a.id,v_emp.id) else null end
  from public.shift_swap_requests s
  join public.shift_assignments a on a.id=s.assignment_id
  join public.employees o on o.id=s.original_employee_id
  where s.company_id=v_emp.company_id
    and (s.status='MARKET_OPEN' or s.original_employee_id=v_emp.id or s.target_employee_id=v_emp.id)
  order by case when s.status='MARKET_OPEN' then 0 else 1 end,s.requested_at desc
  limit 100;
end $function$
;

create or replace function private.employee_list_shift_swaps_impl() RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function private.employee_list_shift_marketplace_impl() RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function public.employee_list_shift_swaps_for_company(p_company_id uuid) RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(p_company_id)
$fn$;
create or replace function public.employee_list_shift_marketplace_for_company(p_company_id uuid) RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(p_company_id)
$fn$;
revoke all on function private.sf_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function private.sf_list_shift_marketplace_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_marketplace_for_company(uuid) from public,anon;
grant execute on function private.sf_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function private.sf_list_shift_marketplace_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_marketplace_for_company(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.employee_list_shift_swap_candidates_impl(p_assignment_id uuid)
 RETURNS TABLE(employee_id uuid, display_name text, employee_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  return query
  select e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),coalesce(e.role,'Mitarbeiter')
  from public.employees e
  where e.company_id=a.company_id
    and e.id<>a.employee_id
    and e.status='active'
    and e.auth_user_id is not null
    and private.sf_swap_candidate_reason(a.id,e.id) is null
  order by e.last_name,e.first_name;
end
$function$
;

-- Draft: QR history is explicitly scoped to the chosen company.
CREATE OR REPLACE FUNCTION private.sf_qr_bookings_for_company(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_timezone text;
  v_month date;
  v_next date;
  v_now timestamptz:=statement_timestamp();
  v_rows jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees
    where id=private.sf_employee_identity_for_company(p_company_id)
      and company_id=p_company_id;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=v_employee.company_id;
  if p_month is not null and (p_month < date '1900-01-01' or p_month >= date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023';
  end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_timezone)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc,x.id) filter(where x.position<=500),'[]'::jsonb),count(*)
  into v_rows,v_count from (
    select s.id,s.started_at,s.ended_at,t.name terminal_name,
      row_number() over(order by s.started_at desc,s.id) position,
      round(greatest(0,extract(epoch from (coalesce(s.ended_at,v_now)-s.started_at)))/60)::integer attendance_minutes,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at,
        'minutes',round(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))/60)::integer) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      (select coalesce(round(sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at))))/60),0)::integer
        from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at >= (v_month::timestamp at time zone v_timezone)
      and s.started_at < (v_next::timestamp at time zone v_timezone)
    order by s.started_at desc,s.id limit 501
  ) x;
  return jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_timezone,'as_of',v_now,
    'rows',v_rows,'truncated',v_count>500);
end;$function$
;
create or replace function private.employee_my_qr_bookings_impl(p_month date default null)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(private.sf_single_active_employee_company(),p_month)
$fn$;
create or replace function public.employee_my_qr_bookings_for_company(p_company_id uuid,p_month date default null)
returns jsonb language sql stable set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(p_company_id,p_month)
$fn$;
revoke all on function private.sf_qr_bookings_for_company(uuid,date) from public,anon;
revoke all on function public.employee_my_qr_bookings_for_company(uuid,date) from public,anon;
grant execute on function private.sf_qr_bookings_for_company(uuid,date) to authenticated;
grant execute on function public.employee_my_qr_bookings_for_company(uuid,date) to authenticated;

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

create temporary table sf_qr_test(ta uuid,tb uuid,tc uuid,qa uuid,qb uuid,qc uuid);
insert into sf_qr_test values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on sf_qr_test to authenticated;
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active)
select ta,a,'Terminal A',extensions.digest(ta::text,'sha256'),false from sf_qr_test,sf_rls_test
union all select tb,b,'Terminal B',extensions.digest(tb::text,'sha256'),false from sf_qr_test,sf_rls_test
union all select tc,c,'Terminal C',extensions.digest(tc::text,'sha256'),false from sf_qr_test,sf_rls_test;
insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at)
select qa,a,ea,ta,now() from sf_qr_test,sf_rls_test
union all select qb,b,eb,tb,now() from sf_qr_test,sf_rls_test
union all select qc,c,ec,tc,now() from sf_qr_test,sf_rls_test;
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
 
if (public.employee_my_qr_bookings_for_company(x.a,null)->>'employee_id')::uuid<>x.ea or (public.employee_my_qr_bookings_for_company(x.b,null)->>'employee_id')::uuid<>x.eb then raise exception 'wrong QR history identity';end if;
if jsonb_array_length(public.employee_my_qr_bookings_for_company(x.a,null)->'rows')<>1 or jsonb_array_length(public.employee_my_qr_bookings_for_company(x.b,null)->'rows')<>1 then raise exception 'QR history rows missing';end if;
if (public.employee_my_qr_bookings_for_company(x.a,null)->'rows'->0->>'id')::uuid<>(select qa from sf_qr_test) or (public.employee_my_qr_bookings_for_company(x.b,null)->'rows'->0->>'id')::uuid<>(select qb from sf_qr_test) then raise exception 'QR history company crossed';end if;
begin perform public.employee_my_qr_bookings_for_company(x.c,null);raise exception 'other user QR history accepted';exception when insufficient_privilege then null;end;
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
 begin perform public.employee_my_qr_bookings_for_company(x.a,null);raise exception 'revoked QR history accepted';exception when insufficient_privilege then null;end;
if (public.employee_my_qr_bookings_for_company(x.b,null)->>'employee_id')::uuid<>x.eb then raise exception 'active QR history lost';end if;
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