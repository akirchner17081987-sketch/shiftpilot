-- Company-specific employee swaps and disruption offers, including legacy access checks.
-- Scope employee swap and disruption access to the selected active company.
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
  if private.sf_employee_identity_for_company(s.company_id) is distinct from s.original_employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
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
  if private.sf_employee_identity_for_company(s.company_id) is distinct from s.target_employee_id then
    raise exception 'Diese Tauschanfrage gehört nicht zum angemeldeten Mitarbeiter' using errcode='42501';
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
CREATE OR REPLACE FUNCTION private.employee_respond_disruption_offer_impl(p_offer_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_decision text:=upper(trim(coalesce(p_decision,''))); v_pre public.disruption_offers%rowtype; v_offer public.disruption_offers%rowtype; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype; v_reason text; v_change_id uuid; v_result uuid; v_old jsonb; v_new jsonb;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_decision not in ('ACCEPT','DECLINE') then raise exception 'Ungültige Entscheidung'; end if;
  select * into v_pre from public.disruption_offers where id=p_offer_id; if v_pre.id is null then raise exception 'Angebot nicht gefunden'; end if;
  select * into v_incident from public.disruption_incidents where id=v_pre.incident_id for update;
  select * into v_offer from public.disruption_offers where id=p_offer_id for update;
  if private.sf_employee_identity_for_company(v_offer.company_id) is distinct from v_offer.employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.company_id=v_offer.company_id;
  if v_employee.id is null then raise exception 'Dieses Angebot gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if v_offer.status<>'OFFERED' then raise exception 'Dieses Angebot wurde bereits beantwortet'; end if;
  if v_decision='DECLINE' then update public.disruption_offers set status='DECLINED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id; return query select 'DECLINED'::text,'Anfrage abgelehnt. Die Disposition wurde informiert.'::text,v_incident.assignment_id; return; end if;
  if v_incident.status<>'OPEN' then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Der Störfall wurde bereits abgeschlossen'; end if;
  if v_offer.expires_at<=now() then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Das Angebot ist abgelaufen'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then update public.disruption_incidents set status='SUPERSEDED',resolved_at=now(),updated_at=now() where id=v_incident.id; update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.status='OFFERED'; raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;
  if exists(select 1 from private.disruption_replacements x join public.shift_change_requests r on r.id=x.change_id where x.incident_id=v_incident.id and r.status not in('REJECTED','SUPERSEDED','CANCELLED')) then raise exception 'Eine Ersatzübernahme ist bereits in Bearbeitung.';end if;
  if exists(select 1 from public.time_entries t where t.assignment_id=v_assignment.id) then raise exception 'Für den ursprünglichen Dienst bestehen Zeitbuchungen. Bitte die Disposition um eine Teilablösung bitten.';end if;
  if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception 'Teamleiterrolle erforderlich'; end if;
  v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%',v_reason; end if;
  
  v_reason:=private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'block';
  if v_reason is not null then raise exception '%',v_reason;end if;
  if coalesce((private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) then
   raise exception 'Der Rhythmus hat sich geändert. Bitte die Disposition um eine neue Prüfung bitten.';
  end if;
 if exists(select 1 from public.company_compliance_policy where company_id=v_incident.company_id and works_council_enabled) then
   update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
   update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
   insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id)
   select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Zusage zur Ersatzübernahme','Zusage eingegangen. Bitte Ersatzübernahme mit erforderlicher Betriebsratsfreigabe abschließen.','disruptions','disruption_incident',v_incident.id from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER');
   return query select 'ACCEPTED_PENDING'::text,'Zusage gespeichert. Der Dienstplan wird nach den erforderlichen Freigaben aktualisiert.'::text,v_assignment.id;return;
  end if;
  v_old:=jsonb_build_object('employeeId',v_assignment.employee_id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  v_new:=jsonb_build_object('employeeId',v_employee.id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(v_incident.company_id,v_assignment.id,'UPDATE',v_employee.id,v_assignment.version,v_old,v_new,'Störfall-Ersatz',left('Störfall-Autopilot #'||v_incident.id::text,2000),'NO',greatest(0,floor(extract(epoch from(v_assignment.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid) returning id into v_change_id;
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
CREATE OR REPLACE FUNCTION private.sf_company_employee_list_swaps(p_company uuid)
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
  v_employee_id:=private.sf_employee_identity_for_company(p_company);
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
  where s.company_id=p_company and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
$function$
;
CREATE OR REPLACE FUNCTION private.sf_company_employee_list_offers(p_company uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 perform private.sf_employee_identity_for_company(p_company);
 select * into v_employee from public.employees e where e.id=private.sf_employee_identity_for_company(p_company) and e.company_id=p_company;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
revoke all on function private.sf_company_employee_list_swaps(uuid),private.sf_company_employee_list_offers(uuid) from public,anon;
grant execute on function private.sf_company_employee_list_swaps(uuid),private.sf_company_employee_list_offers(uuid) to authenticated;
create or replace function public.employee_company_list_swaps(p_company uuid)
returns table(id uuid,direction text,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,other_employee_name text,reason text,colleague_comment text,manager_comment text,requested_at timestamptz)
language sql set search_path='' as $$ select * from private.sf_company_employee_list_swaps(p_company) $$;
create or replace function public.employee_company_list_offers(p_company uuid)
returns table(offer_id uuid,offer_status text,incident_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,incident_type text,note text,expires_at timestamptz,employee_comment text)
language sql set search_path='' as $$ select * from private.sf_company_employee_list_offers(p_company) $$;
create or replace function public.employee_company_cancel_swap(p_company uuid,p_swap uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_employee_identity_for_company(p_company);
 if not exists(select 1 from public.shift_swap_requests s where s.id=p_swap and s.company_id=p_company) then raise exception 'Tauschanfrage nicht verfügbar' using errcode='42501';end if;
 return private.employee_cancel_shift_swap_impl(p_swap);
end $$;
create or replace function public.employee_company_respond_swap(p_company uuid,p_swap uuid,p_decision text,p_comment text default '') returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_employee_identity_for_company(p_company);
 if not exists(select 1 from public.shift_swap_requests s where s.id=p_swap and s.company_id=p_company) then raise exception 'Tauschanfrage nicht verfügbar' using errcode='42501';end if;
 return private.employee_respond_shift_swap_impl(p_swap,p_decision,p_comment);
end $$;
create or replace function public.employee_company_respond_offer(p_company uuid,p_offer uuid,p_decision text,p_comment text default '')
returns table(status text,message text,assignment_id uuid) language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_employee_identity_for_company(p_company);
 if not exists(select 1 from public.disruption_offers o where o.id=p_offer and o.company_id=p_company) then raise exception 'Angebot nicht verfügbar' using errcode='42501';end if;
 return query select * from private.employee_respond_disruption_offer_impl(p_offer,p_decision,p_comment);
end $$;
revoke all on function public.employee_company_list_swaps(uuid),public.employee_company_list_offers(uuid),public.employee_company_cancel_swap(uuid,uuid),public.employee_company_respond_swap(uuid,uuid,text,text),public.employee_company_respond_offer(uuid,uuid,text,text) from public,anon;
grant execute on function public.employee_company_list_swaps(uuid),public.employee_company_list_offers(uuid),public.employee_company_cancel_swap(uuid,uuid),public.employee_company_respond_swap(uuid,uuid,text,text),public.employee_company_respond_offer(uuid,uuid,text,text) to authenticated;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.id=private.sf_employee_id();
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;

CREATE OR REPLACE FUNCTION private.employee_list_shift_swaps_impl()
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
  v_employee_id:=private.sf_employee_id();
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
  where s.company_id=(select e.company_id from public.employees e where e.id=v_employee_id) and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
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
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id) is distinct from a.employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  select * into req from public.employees where id=a.employee_id and company_id=a.company_id;
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
  if private.sf_employee_identity_for_company(a.company_id) is distinct from a.employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  select * into req from public.employees where id=a.employee_id and company_id=a.company_id;
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
create or replace function public.employee_company_swap_candidates(p_company uuid,p_assignment uuid)
returns table(employee_id uuid,display_name text,employee_role text) language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_employee_identity_for_company(p_company);
 if not exists(select 1 from public.shift_assignments a where a.id=p_assignment and a.company_id=p_company) then raise exception 'Schicht nicht verfügbar' using errcode='42501';end if;
 return query select * from private.employee_list_shift_swap_candidates_impl(p_assignment);
end $$;
create or replace function public.employee_company_create_swap(p_company uuid,p_assignment uuid,p_target uuid,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_employee_identity_for_company(p_company);
 if not exists(select 1 from public.shift_assignments a where a.id=p_assignment and a.company_id=p_company) then raise exception 'Schicht nicht verfügbar' using errcode='42501';end if;
 if not exists(select 1 from public.employees e where e.id=p_target and e.company_id=p_company and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null and e.auth_user_id is not null) then raise exception 'Mitarbeiter nicht verfügbar' using errcode='42501';end if;
 return private.employee_create_shift_swap_impl(p_assignment,p_target,p_reason);
end $$;
revoke all on function public.employee_company_swap_candidates(uuid,uuid),public.employee_company_create_swap(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.employee_company_swap_candidates(uuid,uuid),public.employee_company_create_swap(uuid,uuid,uuid,text) to authenticated;
