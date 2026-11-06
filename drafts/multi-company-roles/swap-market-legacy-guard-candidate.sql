-- Draft: apply active company-specific identity checks to legacy swap and marketplace actions.
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
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
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
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
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

CREATE OR REPLACE FUNCTION private.employee_claim_shift_marketplace_impl(p_offer_id uuid, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype; s public.shift_swap_requests%rowtype; a public.shift_assignments%rowtype; v_reason text;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_offer_id for update;
  if s.id is null or s.status<>'MARKET_OPEN' then raise exception 'Dieses Angebot ist nicht mehr verfügbar'; end if;
  perform private.sf_employee_identity_for_company(s.company_id);
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
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(s.company_id)<>s.target_employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Anfrage' using errcode='42501'; end if;
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
