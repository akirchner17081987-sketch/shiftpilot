-- QA only: guard the target company for employee actions.
CREATE OR REPLACE FUNCTION private.employee_claim_shift_marketplace_impl(p_offer_id uuid, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype; s public.shift_swap_requests%rowtype; a public.shift_assignments%rowtype; v_reason text;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_offer_id for update;
  if s.id is null or s.status<>'MARKET_OPEN' then raise exception 'Dieses Angebot ist nicht mehr verfügbar'; end if;
  perform private.qa_employee_identity(s.company_id);
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
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  perform private.qa_employee_identity(a.company_id);
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
CREATE OR REPLACE FUNCTION private.employee_offer_shift_marketplace_impl(p_assignment_id uuid, p_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); a public.shift_assignments%rowtype; e public.employees%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  perform private.qa_employee_identity(a.company_id);
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
  perform private.qa_employee_identity(a.company_id);
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
