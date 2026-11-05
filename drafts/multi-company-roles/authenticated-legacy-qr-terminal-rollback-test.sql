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

-- Draft: legacy QR terminal selects the active profile for its own company.
CREATE OR REPLACE FUNCTION private.sf_qr_time_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_employee uuid;
  v_terminal public.time_qr_terminals%rowtype;
  v_assignment public.shift_assignments%rowtype;
  v_open_punch public.time_qr_punches%rowtype;
  v_company_timezone text;
  v_candidate_count integer := 0;
  v_entry_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Ungültiger QR-Code'; end if;
  select t.* into v_terminal from public.time_qr_terminals t where t.token_hash = extensions.digest(lower(p_token), 'sha256') and t.is_active = true limit 1;
  if not found then raise exception 'QR-Terminal ist ungültig oder deaktiviert'; end if;
  v_employee := private.sf_employee_identity_for_company(v_terminal.company_id);
  select p.* into v_open_punch
  from public.time_qr_punches p join public.shift_assignments a on a.id = p.assignment_id
  where p.employee_id = v_employee and p.terminal_id = v_terminal.id and p.company_id = v_terminal.company_id
    and p.punch_type = 'CLOCK_IN' and a.company_id = v_terminal.company_id
    and not exists (select 1 from public.time_qr_punches o where o.assignment_id = p.assignment_id and o.employee_id = p.employee_id and o.punch_type = 'CLOCK_OUT' and o.punched_at > p.punched_at)
  order by p.punched_at desc limit 1;
  if found then
    select a.* into v_assignment from public.shift_assignments a
    where a.id = v_open_punch.assignment_id and a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null;
    if not found then raise exception 'Die zugehörige veröffentlichte Schicht wurde nicht gefunden'; end if;
    if v_now > v_assignment.ends_at + pg_catalog.make_interval(mins => v_terminal.end_window_minutes) then raise exception 'Das Zeitfenster zum Ausstempeln ist abgelaufen. Bitte Korrektur durch die Einsatzleitung anfordern'; end if;
    select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
    if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_OUT','state','RUNNING','clocked_in_at',v_open_punch.punched_at);
  end if;
  select count(*) into v_candidate_count from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at;
  if v_candidate_count = 0 then raise exception 'Aktuell gibt es an diesem Terminal keine passende veröffentlichte Schicht';
  elsif v_candidate_count > 1 then raise exception 'Mehrere passende Schichten gefunden. Bitte Einsatzleitung kontaktieren'; end if;
  select a.* into v_assignment from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at limit 1;
  select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
  if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
  if exists (select 1 from public.time_qr_punches p where p.assignment_id = v_assignment.id and p.employee_id = v_employee and p.punch_type = 'CLOCK_OUT') then
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  select te.status into v_entry_status from public.time_entries te where te.assignment_id = v_assignment.id;
  if found then
    if v_entry_status = 'open' then raise exception 'Für diese Schicht existiert bereits eine offene Zeitbuchung ohne passenden QR-Start. Bitte Einsatzleitung kontaktieren'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_IN','state','READY');
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_assert_qr_pilot_access(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee_id uuid;
  v_terminal public.time_qr_terminals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst mit dem persönlichen Mitarbeiterkonto anmelden';
  end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Ungültiger QR-Code';
  end if;

  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.token_hash=extensions.digest(lower(p_token),'sha256')
    and t.is_active=true
  limit 1;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  v_employee_id := private.sf_employee_identity_for_company(v_terminal.company_id);

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id=p.employee_id
     and e.company_id=p.company_id
     and e.status='active'
     and e.auth_user_id is not null
    where p.terminal_id=v_terminal.id
      and p.company_id=v_terminal.company_id
      and p.employee_id=v_employee_id
  ) then
    raise exception 'Dieses QR-Terminal ist aktuell nur für ausdrücklich freigegebene Pilot-Mitarbeiter nutzbar';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sf_enforce_qr_punch_pilot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=new.terminal_id
    and t.company_id=new.company_id
    and t.is_active=true;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id=new.employee_id
      and e.company_id=new.company_id
      and e.status='active'
      and e.auth_user_id=new.auth_user_id
      and new.auth_user_id=(select auth.uid())
  ) then
    raise exception 'Mitarbeiterkonto ist für diese QR-Buchung nicht berechtigt';
  end if;

  if private.sf_employee_identity_for_company(new.company_id)<>new.employee_id then
    raise exception 'Mitarbeiterkonto ist für dieses Unternehmen nicht aktiv' using errcode='42501';
  end if;

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    where p.terminal_id=new.terminal_id
      and p.company_id=new.company_id
      and p.employee_id=new.employee_id
  ) then
    raise exception 'Mitarbeiter ist für dieses QR-Pilot-Terminal nicht freigegeben';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.employee_clock_from_qr(p_token text, p_expected_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  perform private.sf_assert_qr_pilot_access(p_token);
  return private.employee_clock_from_qr_unchecked(p_token, p_expected_action);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.employee_qr_time_status(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx jsonb;
  v_break_start timestamptz;
  v_break_seconds numeric;
  v_tracking boolean;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  select coalesce(bool_or(p.break_tracking_enabled),false) into v_tracking
  from public.time_qr_punches p
  where p.assignment_id=(v_ctx->>'assignment_id')::uuid
    and p.employee_id=(v_ctx->>'employee_id')::uuid
    and p.punch_type='CLOCK_IN';
  if v_tracking and v_ctx->>'state'='RUNNING' then
    select b.started_at into v_break_start from public.time_qr_breaks b
    where b.assignment_id=(v_ctx->>'assignment_id')::uuid
      and b.employee_id=(v_ctx->>'employee_id')::uuid and b.ended_at is null
    limit 1;
    select coalesce(sum(extract(epoch from (coalesce(b.ended_at,clock_timestamp())-b.started_at))),0)
    into v_break_seconds from public.time_qr_breaks b
    where b.assignment_id=(v_ctx->>'assignment_id')::uuid
      and b.employee_id=(v_ctx->>'employee_id')::uuid;
  end if;
  return jsonb_build_object(
    'terminal_name',v_ctx->>'terminal_name','location_note',v_ctx->>'location_note',
    'assignment_id',v_ctx->>'assignment_id','shift_code',v_ctx->>'shift_code',
    'planned_start',v_ctx->>'planned_start','planned_end',v_ctx->>'planned_end',
    'planned_break_minutes',(v_ctx->>'planned_break_minutes')::integer,
    'action',v_ctx->>'action','state',v_ctx->>'state','clocked_in_at',v_ctx->>'clocked_in_at',
    'break_tracking_enabled',coalesce(v_tracking,false),
    'break_started_at',v_break_start,'break_seconds',coalesce(round(v_break_seconds),0)
  );
end;$function$
;CREATE OR REPLACE FUNCTION private.employee_clock_from_qr_unchecked(p_token text, p_expected_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx jsonb;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_company_id uuid;
  v_employee_id uuid;
  v_terminal_id uuid;
  v_assignment_id uuid;
  v_assignment public.shift_assignments%rowtype;
  v_entry public.time_entries%rowtype;
  v_result jsonb;
  v_last_punch timestamptz;
  v_elapsed_minutes numeric;
  v_break_minutes integer;
  v_break_tracking boolean;
begin
  v_ctx := private.sf_qr_time_context(p_token);
  v_company_id := (v_ctx->>'company_id')::uuid;
  v_employee_id := (v_ctx->>'employee_id')::uuid;
  v_terminal_id := (v_ctx->>'terminal_id')::uuid;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;
  v_action := upper(coalesce(v_ctx->>'action',''));

  if v_action not in ('CLOCK_IN','CLOCK_OUT') then
    raise exception 'Diese Schicht ist bereits vollständig gebucht';
  end if;
  if upper(coalesce(p_expected_action,'')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text || ':' || v_terminal_id::text,0));
  v_ctx := private.sf_qr_time_context(p_token);
  v_action := upper(coalesce(v_ctx->>'action',''));
  if upper(coalesce(p_expected_action,'')) <> v_action then
    raise exception 'Buchungsstatus hat sich geändert. Bitte QR-Code erneut öffnen';
  end if;
  v_assignment_id := (v_ctx->>'assignment_id')::uuid;

  select max(p.punched_at) into v_last_punch
  from public.time_qr_punches p
  where p.employee_id=v_employee_id and p.terminal_id=v_terminal_id;
  if v_last_punch is not null and v_now-v_last_punch < interval '20 seconds' then
    raise exception 'QR-Code wurde gerade bereits gebucht. Bitte kurz warten';
  end if;

  select a.* into v_assignment
  from public.shift_assignments a
  where a.id=v_assignment_id
    and a.employee_id=v_employee_id
    and a.company_id=v_company_id
    and a.status='PUBLISHED'
    and a.published_at is not null
  for update;
  if not found then raise exception 'Veröffentlichte Schicht wurde nicht gefunden'; end if;

  if v_action='CLOCK_IN' then
    select te.* into v_entry from public.time_entries te where te.assignment_id=v_assignment_id for update;
    if found then raise exception 'Für diese Schicht existiert bereits eine Zeitbuchung'; end if;

    insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at,break_tracking_enabled)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),'CLOCK_IN',v_now,true);

    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      employee_note,manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      correction_requested_by,correction_requested_at,updated_at,updated_by,version
    ) values(
      v_assignment_id,v_company_id,v_now,null,v_assignment.break_minutes,'open',
      'QR-Zeiterfassung','','EMPLOYEE','',null,null,null,null,null,v_now,auth.uid(),1
    ) returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    values(v_company_id,'TIME_QR_CLOCK_IN','time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',v_result,
      jsonb_build_object('terminal_id',v_terminal_id,'terminal_name',v_ctx->>'terminal_name'));
  else
    select te.* into v_entry from public.time_entries te where te.assignment_id=v_assignment_id for update;
    if not found or v_entry.status <> 'open' or v_entry.actual_start is null or v_entry.actual_end is not null then
      raise exception 'Keine offene QR-Zeitbuchung für diese Schicht gefunden';
    end if;

    if exists (select 1 from public.time_qr_breaks b where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is null) then
      raise exception 'Bitte zuerst die laufende Pause beenden';
    end if;
    select coalesce(bool_or(p.break_tracking_enabled),false) into v_break_tracking
    from public.time_qr_punches p
    where p.assignment_id=v_assignment_id and p.employee_id=v_employee_id and p.punch_type='CLOCK_IN';
    v_elapsed_minutes := extract(epoch from (v_now - v_entry.actual_start))/60.0;
    if v_break_tracking then
      select coalesce(round(sum(extract(epoch from (b.ended_at-b.started_at)))/60),0)::integer
      into v_break_minutes from public.time_qr_breaks b
      where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is not null;
    else
      -- Preserve the planned pause for a QR shift already running before this rollout.
      v_break_minutes := case when v_elapsed_minutes <= 0 or coalesce(v_assignment.break_minutes,0) >= v_elapsed_minutes
        then 0 else coalesce(v_assignment.break_minutes,0) end;
    end if;

    perform private.sf_validate_time_values(v_entry.actual_start,v_now,v_break_minutes);

    insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),'CLOCK_OUT',v_now);

    update public.time_entries
    set actual_end=v_now,
        break_minutes=v_break_minutes,
        status='recorded',
        employee_note=case when btrim(coalesce(employee_note,''))='' then 'QR-Zeiterfassung' else employee_note end,
        source='EMPLOYEE',
        correction_note='',
        submitted_at=v_now,
        confirmed_by=null,
        confirmed_at=null,
        correction_requested_by=null,
        correction_requested_at=null,
        updated_at=v_now,
        updated_by=auth.uid(),
        version=version+1
    where assignment_id=v_assignment_id
    returning to_jsonb(time_entries.*) into v_result;

    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    values(v_company_id,'TIME_QR_CLOCK_OUT','time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',v_result,
      jsonb_build_object(
        'terminal_id',v_terminal_id,
        'terminal_name',v_ctx->>'terminal_name',
        'planned_break_minutes',coalesce(v_assignment.break_minutes,0),
        'applied_break_minutes',v_break_minutes,
        'short_test_adjustment',v_break_minutes <> coalesce(v_assignment.break_minutes,0)
      ));
  end if;

  return jsonb_build_object(
    'ok',true,
    'action',v_action,
    'punched_at',v_now,
    'terminal_name',v_ctx->>'terminal_name',
    'assignment_id',v_assignment_id,
    'shift_code',v_assignment.shift_code,
    'time_entry',v_result
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.employee_qr_break_from_qr(p_token text, p_expected_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx jsonb;
  v_now timestamptz;
  v_action text:=upper(coalesce(p_expected_action,''));
  v_company_id uuid;
  v_employee_id uuid;
  v_terminal_id uuid;
  v_assignment_id uuid;
  v_last_punch timestamptz;
  v_break public.time_qr_breaks%rowtype;
  v_entry public.time_entries%rowtype;
  v_tracking boolean;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_action not in ('BREAK_START','BREAK_END') then raise exception 'Ungültige Pausenbuchung'; end if;
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  if v_ctx->>'state'<>'RUNNING' then raise exception 'Keine laufende QR-Arbeitszeit gefunden'; end if;
  v_employee_id:=(v_ctx->>'employee_id')::uuid;
  v_terminal_id:=(v_ctx->>'terminal_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text||':'||v_terminal_id::text,0));
  perform private.sf_assert_qr_pilot_access(p_token);
  v_ctx:=private.sf_qr_time_context(p_token);
  if v_ctx->>'state'<>'RUNNING' then raise exception 'Buchungsstatus hat sich geändert'; end if;
  v_now:=clock_timestamp();
  v_company_id:=(v_ctx->>'company_id')::uuid;
  v_assignment_id:=(v_ctx->>'assignment_id')::uuid;

  select te.* into v_entry from public.time_entries te
  where te.assignment_id=v_assignment_id for update;
  if not found or v_entry.status<>'open' or v_entry.actual_start is null or v_entry.actual_end is not null then
    raise exception 'Keine offene QR-Zeitbuchung gefunden';
  end if;
  select coalesce(bool_or(p.break_tracking_enabled),false) into v_tracking
  from public.time_qr_punches p where p.assignment_id=v_assignment_id
    and p.employee_id=v_employee_id and p.punch_type='CLOCK_IN';
  if not v_tracking then raise exception 'Pausenbuchung für diese bereits laufende Schicht noch nicht verfügbar'; end if;
  select max(p.punched_at) into v_last_punch from public.time_qr_punches p
  where p.employee_id=v_employee_id and p.terminal_id=v_terminal_id;
  if v_last_punch is not null and v_now-v_last_punch < interval '20 seconds' then
    raise exception 'QR-Code wurde gerade bereits gebucht. Bitte kurz warten';
  end if;
  select b.* into v_break from public.time_qr_breaks b
  where b.assignment_id=v_assignment_id and b.employee_id=v_employee_id and b.ended_at is null
  for update;
  if v_action='BREAK_START' then
    if found then raise exception 'Eine Pause läuft bereits'; end if;
    insert into public.time_qr_breaks(company_id,terminal_id,assignment_id,employee_id,started_at)
    values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,v_now);
  else
    if not found then raise exception 'Keine laufende Pause gefunden'; end if;
    update public.time_qr_breaks set ended_at=v_now where id=v_break.id;
  end if;
  insert into public.time_qr_punches(company_id,terminal_id,assignment_id,employee_id,auth_user_id,punch_type,punched_at)
  values(v_company_id,v_terminal_id,v_assignment_id,v_employee_id,auth.uid(),v_action,v_now);
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company_id,'TIME_QR_'||v_action,'time_entry',v_assignment_id,auth.uid(),'EMPLOYEE',
    jsonb_build_object('action',v_action,'punched_at',v_now),
    jsonb_build_object('terminal_id',v_terminal_id,'terminal_name',v_ctx->>'terminal_name'));
  return jsonb_build_object('ok',true,'action',v_action,'punched_at',v_now);
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

create temporary table sf_qr_test(ta uuid,tb uuid,tc uuid,qa uuid,qb uuid,qc uuid);
insert into sf_qr_test values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on sf_qr_test to authenticated;
insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active)
select ta,a,'Terminal A',extensions.digest(repeat('a',64),'sha256'),false from sf_qr_test,sf_rls_test
union all select tb,b,'Terminal B',extensions.digest(repeat('b',64),'sha256'),false from sf_qr_test,sf_rls_test
union all select tc,c,'Terminal C',extensions.digest(repeat('c',64),'sha256'),false from sf_qr_test,sf_rls_test;
insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at)
select qa,a,ea,ta,now() from sf_qr_test,sf_rls_test
union all select qb,b,eb,tb,now() from sf_qr_test,sf_rls_test
union all select qc,c,ec,tc,now() from sf_qr_test,sf_rls_test;

update public.time_qr_terminals set pilot_mode=false,is_active=true where id in (select ta from sf_qr_test union all select tb from sf_qr_test union all select tc from sf_qr_test);
create temporary table sf_terminal_test(sha uuid,shb uuid);
insert into sf_terminal_test values(gen_random_uuid(),gen_random_uuid());
grant select on sf_terminal_test to authenticated;
insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at)
select sha,a,ea,'QA',now()-interval '5 minutes',now()+interval '1 hour','PUBLISHED',now() from sf_terminal_test,sf_rls_test
union all select shb,b,eb,'QA',now()-interval '5 minutes',now()+interval '1 hour','PUBLISHED',now() from sf_terminal_test,sf_rls_test;
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

if (public.employee_qr_time_status(repeat('a',64))->>'assignment_id')::uuid<>(select sha from sf_terminal_test) or (public.employee_qr_time_status(repeat('b',64))->>'assignment_id')::uuid<>(select shb from sf_terminal_test) then raise exception 'terminal resolved wrong company';end if;
begin perform public.employee_qr_time_status(repeat('c',64));raise exception 'other company terminal accepted';exception when insufficient_privilege then null;end;
if public.employee_clock_from_qr(repeat('a',64),'CLOCK_IN')->>'action'<>'CLOCK_IN' then raise exception 'QR clock-in failed';end if;
if public.employee_qr_time_status(repeat('a',64))->>'state'<>'RUNNING' then raise exception 'QR clock-in not reflected';end if;
if public.employee_clock_from_qr(repeat('b',64),'CLOCK_IN')->>'action'<>'CLOCK_IN' then raise exception 'company B QR clock-in failed';end if;
if public.employee_qr_time_status(repeat('b',64))->>'state'<>'RUNNING' then raise exception 'company B QR clock-in not reflected';end if;
select count(*) into n from public.employees where id in (x.ea,x.eb); if n<>2 then raise exception 'expected two employee profiles, got %',n; end if;
 select count(*) into n from public.shift_assignments where id in (x.sa,x.sb); if n<>2 then raise exception 'expected two assignments, got %',n; end if;
 select count(*) into n from public.time_entries where assignment_id in (x.sa,x.sb); if n<>2 then raise exception 'expected two time entries, got %',n; end if;
 if exists(select 1 from public.employees where id=x.ec) or exists(select 1 from public.shift_assignments where id=x.sc) or exists(select 1 from public.time_entries where assignment_id=x.sc) then raise exception 'other user data visible';end if;
end $test$;
reset role;
-- Advance fixture punch timestamps to exercise the anti-repeat window without waiting.
update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=(select sha from sf_terminal_test);
set local role authenticated;
do $test$ begin
 if public.employee_qr_break_from_qr(repeat('a',64),'BREAK_START')->>'action'<>'BREAK_START' then raise exception 'break start failed';end if;
end $test$;
reset role;
update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=(select sha from sf_terminal_test);
set local role authenticated;
do $test$ begin
 if public.employee_qr_break_from_qr(repeat('a',64),'BREAK_END')->>'action'<>'BREAK_END' then raise exception 'break end failed';end if;
end $test$;
reset role;
update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=(select sha from sf_terminal_test);
set local role authenticated;
do $test$ begin
 if public.employee_clock_from_qr(repeat('a',64),'CLOCK_OUT')->>'action'<>'CLOCK_OUT' then raise exception 'clock out failed';end if;
 if public.employee_qr_time_status(repeat('a',64))->>'state'<>'COMPLETED' then raise exception 'clock out not reflected';end if;
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
if public.employee_qr_time_status(repeat('b',64))->>'state'<>'RUNNING' then raise exception 'other active QR terminal lost';end if;
begin perform public.employee_qr_time_status(repeat('a',64));raise exception 'revoked terminal accepted';exception when insufficient_privilege then null;end;
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