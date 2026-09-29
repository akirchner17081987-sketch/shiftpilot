-- A former employee account switched to TIME_TRACKING must not retain employee-portal RPC access.
CREATE OR REPLACE FUNCTION private.employee_cancel_shift_swap_impl(p_swap_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.auth_user_id=v_uid and e.status='active') then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_claim_shift_marketplace_impl(p_offer_id uuid, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype; s public.shift_swap_requests%rowtype; a public.shift_assignments%rowtype; v_reason text;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_offer_id for update;
  if s.id is null or s.status<>'MARKET_OPEN' then raise exception 'Dieses Angebot ist nicht mehr verfügbar'; end if;
  select * into v_emp from public.employees where auth_user_id=v_uid and company_id=s.company_id and status='active' limit 1;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  if v_emp.id=s.original_employee_id then raise exception 'Eigene Schichten können nicht übernommen werden'; end if;
  select * into a from public.shift_assignments where id=s.assignment_id for update;
  if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' or a.starts_at<=now() then
    update public.shift_swap_requests set status='SUPERSEDED',updated_at=now() where id=s.id;
    raise exception 'Die Schicht wurde verändert und ist nicht mehr verfügbar';
  end if;
  v_reason:=private.sf_swap_candidate_reason(a.id,v_emp.id);
  if v_reason is not null then raise exception '%',v_reason; end if;
  update public.shift_swap_requests set target_employee_id=v_emp.id,status='PENDING_MANAGER',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,'SHIFT_MARKET_CLAIMED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status','MARKET_OPEN'),jsonb_build_object('status','PENDING_MANAGER','targetEmployeeId',v_emp.id),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));
  return 'PENDING_MANAGER';
end $function$
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
CREATE OR REPLACE FUNCTION private.employee_create_shift_swap_impl(p_assignment_id uuid, p_target_employee_id uuid, p_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
  v_reason text;
  v_id uuid;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits eine Tauschanfrage';
  end if;

  v_reason:=private.sf_swap_candidate_reason(a.id,p_target_employee_id);
  if v_reason is not null then raise exception '%',v_reason; end if;

  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,p_target_employee_id,a.version,'PENDING_COLLEAGUE',left(coalesce(p_reason,''),1000),v_uid)
  returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(a.company_id,'SHIFT_SWAP_REQUESTED','shift_swap_request',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('assignmentId',a.id,'fromEmployeeId',a.employee_id,'toEmployeeId',p_target_employee_id,'status','PENDING_COLLEAGUE'),
    jsonb_build_object('reason',left(coalesce(p_reason,''),1000)));

  return v_id;
end
$function$
;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  select * into v_employee from public.employees e where e.auth_user_id=v_uid and e.status='active' limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,d.id,a.shift_code,a.starts_at,a.ends_at,d.incident_type,d.note,x.expires_at,x.employee_comment
  from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id join public.shift_assignments a on a.id=d.assignment_id
  where x.employee_id=v_employee.id and x.company_id=v_employee.company_id order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_list_shift_marketplace_impl()
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp
  from public.employees e
  where e.auth_user_id=v_uid and e.status='active'
  limit 1;
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
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
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
CREATE OR REPLACE FUNCTION private.employee_list_shift_swaps_impl()
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.id into v_employee_id from public.employees e where e.auth_user_id=v_uid and e.status='active' limit 1;
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
  where s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id
  order by s.requested_at desc
  limit 50;
end
$function$
;
CREATE OR REPLACE FUNCTION public.employee_my_time_account_month(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_id(); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  select e.company_id into v_company from public.employees e where e.id=v_employee;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=v_company;
  v_state:=coalesce(v_state,'DE');
  select to_jsonb(r) into v_row from private.sf_time_account_rows(v_company,p_month,v_employee) r;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from coalesce(p_month,current_date))::integer,v_state) h
    where h.holiday_date>=date_trunc('month',coalesce(p_month,current_date))::date
      and h.holiday_date<(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  return coalesce(v_row,'{}'::jsonb)||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,
    'federal_state',v_state,'holidays',v_holidays);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.employee_my_time_account_month_impl(p_month date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_employee_id uuid;
  v_company_id uuid;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_row jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  select e.id,e.company_id into v_employee_id,v_company_id from public.employees e
  where e.auth_user_id=auth.uid() and e.access_status='ACTIVE' order by e.updated_at desc limit 1;
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=v_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=v_employee_id::text limit 1;
    return v_row;
  end if;
  return private.time_account_row_v1(v_employee_id,v_month);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.employee_offer_shift_marketplace_impl(p_assignment_id uuid, p_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); a public.shift_assignments%rowtype; e public.employees%rowtype; v_id uuid;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into e from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if e.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können angeboten werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht angeboten werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits ein Angebot';
  end if;
  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,null,a.version,'MARKET_OPEN',left(coalesce(p_reason,''),1000),v_uid) returning id into v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
  values(a.company_id,'SHIFT_MARKET_OFFERED','shift_swap_request',v_id,v_uid,'EMPLOYEE',jsonb_build_object('assignmentId',a.id,'status','MARKET_OPEN'));
  return v_id;
end $function$
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
;
CREATE OR REPLACE FUNCTION private.employee_respond_disruption_offer_impl(p_offer_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_decision text:=upper(trim(coalesce(p_decision,''))); v_pre public.disruption_offers%rowtype; v_offer public.disruption_offers%rowtype; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype; v_reason text; v_change_id uuid; v_result uuid; v_old jsonb; v_new jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_decision not in ('ACCEPT','DECLINE') then raise exception 'Ungültige Entscheidung'; end if;
  select * into v_pre from public.disruption_offers where id=p_offer_id; if v_pre.id is null then raise exception 'Angebot nicht gefunden'; end if;
  select * into v_incident from public.disruption_incidents where id=v_pre.incident_id for update;
  select * into v_offer from public.disruption_offers where id=p_offer_id for update;
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.auth_user_id=v_uid and e.status='active';
  if v_employee.id is null then raise exception 'Dieses Angebot gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if v_offer.status<>'OFFERED' then raise exception 'Dieses Angebot wurde bereits beantwortet'; end if;
  if v_decision='DECLINE' then update public.disruption_offers set status='DECLINED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id; return query select 'DECLINED'::text,'Anfrage abgelehnt. Die Disposition wurde informiert.'::text,v_incident.assignment_id; return; end if;
  if v_incident.status<>'OPEN' then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Der Störfall wurde bereits abgeschlossen'; end if;
  if v_offer.expires_at<=now() then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Das Angebot ist abgelaufen'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then update public.disruption_incidents set status='SUPERSEDED',resolved_at=now(),updated_at=now() where id=v_incident.id; update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.status='OFFERED'; raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;
  if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception 'Teamleiterrolle erforderlich'; end if;
  v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%',v_reason; end if;
  v_old:=jsonb_build_object('employeeId',v_assignment.employee_id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  v_new:=jsonb_build_object('employeeId',v_employee.id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(v_incident.company_id,v_assignment.id,'UPDATE',v_employee.id,v_assignment.version,v_old,v_new,'Störfall-Ersatz',left('Störfall-Autopilot #'||v_incident.id::text||case when v_incident.note<>'' then ' · '||v_incident.note else '' end,2000),'NO',greatest(0,floor(extract(epoch from(v_assignment.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid) returning id into v_change_id;
  v_result:=public.apply_shift_change(v_change_id);
  update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
  update public.disruption_incidents set status='RESOLVED',resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) values(v_incident.company_id,'DISRUPTION_RESOLVED','disruption_incident',v_incident.id,v_uid,'EMPLOYEE',jsonb_build_object('employeeId',v_incident.original_employee_id),jsonb_build_object('employeeId',v_employee.id),jsonb_build_object('assignmentId',v_result,'changeRequestId',v_change_id));
  insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Störfall gelöst',trim(v_employee.first_name||' '||v_employee.last_name)||' übernimmt '||v_assignment.shift_code,'disruptions','disruption_incident',v_incident.id,jsonb_build_object('assignmentId',v_result)
  from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER');
  return query select 'ACCEPTED'::text,'Schicht übernommen und Dienstplan sofort aktualisiert.'::text,v_result;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_respond_shift_swap_impl(p_swap_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  s public.shift_swap_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_decision text:=upper(trim(coalesce(p_decision,'')));
  v_reason text;
  v_status text;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.target_employee_id and e.auth_user_id=v_uid and e.status='active') then
    raise exception 'Diese Tauschanfrage gehört nicht zum angemeldeten Mitarbeiter';
  end if;
  if s.status<>'PENDING_COLLEAGUE' then raise exception 'Diese Tauschanfrage wartet nicht mehr auf deine Entscheidung'; end if;

  if v_decision='REJECT' then
    v_status:='REJECTED_COLLEAGUE';
  else
    select * into a from public.shift_assignments where id=s.assignment_id;
    if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason','assignment_changed'));
      return 'SUPERSEDED';
    end if;
    v_reason:=private.sf_swap_candidate_reason(a.id,s.target_employee_id);
    if v_reason is not null then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason',v_reason));
      return 'SUPERSEDED';
    end if;
    v_status:='PENDING_MANAGER';
  end if;

  update public.shift_swap_requests
  set status=v_status,colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now()
  where id=s.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,case when v_status='PENDING_MANAGER' then 'SHIFT_SWAP_COLLEAGUE_APPROVED' else 'SHIFT_SWAP_COLLEAGUE_REJECTED' end,
    'shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status',v_status),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));

  return v_status;
end
$function$
;
CREATE OR REPLACE FUNCTION public.employee_respond_to_shift_change(p_change_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, applied boolean, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.shift_change_requests%rowtype;
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_status text;
  v_assignment uuid;
  v_apply_error text;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED'; end if;

  select * into r
  from public.shift_change_requests
  where id = p_change_id
  for update;
  if not found then raise exception 'Change request not found'; end if;

  if not exists(
    select 1 from public.employees e
    where e.id = r.employee_id
      and e.auth_user_id = v_user
      and e.status = 'active'
  ) then raise exception 'This change request does not belong to the signed-in employee'; end if;

  if not r.requires_employee_approval then raise exception 'Employee approval is not required for this request'; end if;
  if r.status in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED') then raise exception 'Change request is already completed'; end if;

  insert into public.shift_change_approvals(company_id,change_request_id,approval_type,required,status,decided_by,decided_at,comment)
  values(r.company_id,r.id,'EMPLOYEE',true,v_decision,v_user,now(),left(coalesce(p_comment,''),500))
  on conflict(change_request_id,approval_type)
  do update set status=excluded.status,decided_by=excluded.decided_by,decided_at=excluded.decided_at,comment=excluded.comment;

  if v_decision = 'REJECTED' then
    update public.shift_change_requests set status='REJECTED',rejected_at=now() where id=r.id;
    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
    values(r.company_id,'EMPLOYEE_REJECTED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('comment',left(coalesce(p_comment,''),500)));
    return query select 'REJECTED'::text,false,'Änderung abgelehnt. Die bisherige Planung bleibt bestehen.'::text,null::uuid;
    return;
  end if;

  if r.requires_works_council and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id=r.id and x.approval_type='WORKS_COUNCIL' and x.status='APPROVED'
  ) then
    v_status := 'PENDING_WORKS_COUNCIL';
  else
    v_status := 'READY_TO_APPLY';
  end if;

  update public.shift_change_requests set status=v_status,rejected_at=null where id=r.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  values(r.company_id,'EMPLOYEE_APPROVED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('comment',left(coalesce(p_comment,''),500),'next_status',v_status));

  if v_status = 'READY_TO_APPLY' then
    begin
      v_assignment := public.apply_shift_change(r.id);
    exception when others then
      v_apply_error := sqlerrm;
    end;

    if v_apply_error is null then
      return query select 'APPLIED'::text,true,'Änderung bestätigt und übernommen.'::text,v_assignment;
    else
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(r.company_id,'SHIFT_CHANGE_AUTO_APPLY_FAILED','shift_change_request',r.id,v_user,'EMPLOYEE',jsonb_build_object('error',v_apply_error));
      return query select 'READY_TO_APPLY'::text,false,('Bestätigt. Die automatische Übernahme wartet auf Prüfung: '||v_apply_error)::text,null::uuid;
    end if;
  end if;

  return query select v_status,false,'Änderung bestätigt. Es fehlt noch eine weitere Freigabe.'::text,null::uuid;
end
$function$
;
CREATE OR REPLACE FUNCTION private.employee_submit_absence_request_impl(p_absence_type text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_full_day boolean DEFAULT true, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_time_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_id uuid;
  v_type text := btrim(coalesce(p_absence_type,''));
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_type not in ('Urlaub','Krank','Frei','Fortbildung','Sperrzeit','Sonderurlaub','Sonstiges') then
    raise exception 'Ungültige Abwesenheitsart';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Bitte einen gültigen Zeitraum wählen';
  end if;
  if (p_end_date - p_start_date) > 366 then raise exception 'Der Zeitraum ist zu lang'; end if;
  if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then
    raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.auth_user_id=v_uid and e.status='active'
  limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  -- Serialize absence submissions for the same employee. Without this lock,
  -- concurrent requests can both pass the overlap check before either inserts.
  perform pg_advisory_xact_lock(
    hashtextextended('absence-request:' || v_employee.id::text, 0)
  );

  if exists (
    select 1 from public.absences a
    where a.employee_id=v_employee.id
      and a.status in ('Beantragt','Genehmigt','Erfasst')
      and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  insert into public.absences(
    company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,
    start_time,end_time,time_note,note,request_source,requested_by,requested_at
  ) values (
    v_employee.company_id,v_employee.id,null,p_start_date,p_end_date,v_type,'Beantragt',coalesce(p_full_day,true),
    case when coalesce(p_full_day,true) then null else p_start_time end,
    case when coalesce(p_full_day,true) then null else p_end_time end,
    coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',v_uid,now()
  ) returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_employee.company_id,'ABSENCE_REQUEST_CREATED','absence',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('status','Beantragt','type',v_type,'startDate',p_start_date,'endDate',p_end_date),
    jsonb_build_object('source','EMPLOYEE_PORTAL'));

  return v_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.employee_submit_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  v_employee:=private.sf_employee_id();
  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and employee_id=v_employee and status='PUBLISHED' for update;
  if not found then raise exception 'Schicht nicht gefunden oder nicht berechtigt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    employee_note,manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    'recorded',coalesce(p_note,''),'','EMPLOYEE','',now(),null,null,null,null,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,break_minutes=excluded.break_minutes,
    status='recorded',employee_note=excluded.employee_note,source='EMPLOYEE',correction_note='',submitted_at=now(),
    confirmed_by=null,confirmed_at=null,correction_requested_by=null,correction_requested_at=null,
    updated_at=now(),updated_by=auth.uid(),version=public.time_entries.version+1
  returning to_jsonb(time_entries.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_assignment.company_id,'TIME_ENTRY_SUBMITTED','time_entry',p_assignment_id,auth.uid(),'EMPLOYEE',v_result,'{}'::jsonb);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.employee_submit_time_entry_impl(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text DEFAULT ''::text)
 RETURNS TABLE(status text, message text, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  old_te public.time_entries%rowtype;
  new_te public.time_entries%rowtype;
  v_break integer := greatest(0,coalesce(p_break_minutes,0));
  v_event text;
  v_minutes numeric;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_actual_start is null or p_actual_end is null then raise exception 'Tatsächlicher Beginn und tatsächliches Ende sind erforderlich'; end if;
  if p_actual_end <= p_actual_start then raise exception 'Das tatsächliche Ende muss nach dem Beginn liegen'; end if;
  if p_actual_end > now() + interval '5 minutes' then raise exception 'Eine Arbeitszeit kann nicht in der Zukunft enden'; end if;
  if p_actual_start > now() + interval '5 minutes' then raise exception 'Eine Arbeitszeit kann nicht in der Zukunft beginnen'; end if;
  if p_actual_end - p_actual_start > interval '24 hours' then raise exception 'Arbeitszeit über 24 Stunden ist nicht plausibel'; end if;
  v_minutes := extract(epoch from (p_actual_end-p_actual_start))/60.0;
  if v_break > floor(v_minutes) then raise exception 'Die Pause darf nicht länger als die Arbeitszeit sein'; end if;

  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id for update;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  if a.status <> 'PUBLISHED' and a.published_at is null then raise exception 'Ist-Zeit kann nur für veröffentlichte Schichten gemeldet werden'; end if;

  select emp.* into e from public.employees emp
  where emp.id=a.employee_id and emp.auth_user_id=v_user and emp.status='active';
  if not found then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;

  if p_actual_start < a.starts_at - interval '24 hours' or p_actual_end > a.ends_at + interval '36 hours' then
    raise exception 'Die Ist-Zeit liegt zu weit außerhalb der geplanten Schicht';
  end if;

  select * into old_te from public.time_entries where assignment_id=a.id for update;
  if found and old_te.status='confirmed' then
    raise exception 'Diese Ist-Zeit ist bereits bestätigt und kann nur durch die Verwaltung geändert werden';
  end if;
  v_event := case when found then 'TIME_ENTRY_RESUBMITTED' else 'TIME_ENTRY_RECORDED' end;

  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,updated_by,updated_at,
    employee_note,manager_note,source,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,correction_note,version
  ) values(
    a.id,a.company_id,p_actual_start,p_actual_end,v_break,'recorded',v_user,now(),
    left(coalesce(p_note,''),1000),'','EMPLOYEE',now(),null,null,null,null,'',
    case when old_te.assignment_id is null then 1 else old_te.version+1 end
  )
  on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,
    actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,
    status='recorded',
    updated_by=v_user,
    updated_at=now(),
    employee_note=excluded.employee_note,
    manager_note='',
    source='EMPLOYEE',
    submitted_at=now(),
    confirmed_by=null,
    confirmed_at=null,
    correction_requested_by=null,
    correction_requested_at=null,
    correction_note='',
    version=public.time_entries.version+1
  returning * into new_te;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,v_event,'time_entry',a.id,v_user,'EMPLOYEE',
    case when old_te.assignment_id is null then null else jsonb_build_object('actualStart',old_te.actual_start,'actualEnd',old_te.actual_end,'breakMinutes',old_te.break_minutes,'status',old_te.status,'version',old_te.version) end,
    jsonb_build_object('actualStart',new_te.actual_start,'actualEnd',new_te.actual_end,'breakMinutes',new_te.break_minutes,'status',new_te.status,'version',new_te.version),
    jsonb_build_object('shiftCode',a.shift_code,'employeeId',a.employee_id));

  perform private.sf_notify_managers(
    a.company_id,'TIME_ENTRY_REVIEW','Ist-Zeit wartet auf Prüfung',
    trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,''))||' hat die Ist-Zeit für '||a.shift_code||' gemeldet.',
    'time','time_entry',a.id,
    jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id,'status','recorded')
  );

  return query select new_te.status,'Ist-Zeit gespeichert und zur Prüfung gesendet.'::text,new_te.version;
end
$function$
;
notify pgrst,'reload schema';
