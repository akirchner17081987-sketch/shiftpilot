-- Isolated QA database only. Dependencies and test data are rolled back.
begin;
CREATE OR REPLACE FUNCTION private.sf_paid_time_ranges(p_company_id uuid, p_employee_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(employee_id uuid, paid_range tstzrange)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with accepted as (
    select e.id employee_id,te.actual_start a,
      te.actual_end-make_interval(mins=>greatest(0,te.break_minutes)) b
    from public.time_entries te
    join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id
    join public.employees e on e.id=sa.employee_id and e.company_id=te.company_id
    where te.company_id=p_company_id and (p_employee_id is null or e.id=p_employee_id)
      and te.status='confirmed' and te.actual_start is not null and te.actual_end is not null
      and te.actual_end<=statement_timestamp() and te.actual_start<p_to and te.actual_end>p_from
    union all
    select s.employee_id,s.started_at,s.ended_at
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
    where s.company_id=p_company_id and (p_employee_id is null or s.employee_id=p_employee_id)
      and s.ended_at is not null and s.ended_at<=statement_timestamp()
      and s.started_at<p_to and s.ended_at>p_from
  ), clipped as (
    select employee_id,case when least(b,p_to)>greatest(a,p_from)
      then tstzrange(greatest(a,p_from),least(b,p_to),'[)') else 'empty'::tstzrange end r
    from accepted where p_to>p_from
  )
  select employee_id,unnest(range_agg(r)) from clipped where not isempty(r) group by employee_id;
$function$
;
CREATE OR REPLACE FUNCTION private.sf_paid_work_seconds(p_employee_id uuid, p_from date, p_to date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(extract(epoch from(upper(r.paid_range)-lower(r.paid_range)))),0)
  from public.employees e join public.companies c on c.id=e.company_id
  cross join lateral private.sf_paid_time_ranges(e.company_id,e.id,
    p_from::timestamp at time zone coalesce(c.timezone,'Europe/Berlin'),
    (p_to+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin')) r
  where e.id=p_employee_id and p_to>=p_from;
$function$
;
-- Derived from production functions; require an explicitly authorized company.
CREATE OR REPLACE FUNCTION private.sf_employee_identity_for_company(p_company uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
declare v_ids uuid[];
begin
 if auth.uid() is null or p_company is null or private.sf_has_time_only_login() then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
 select array_agg(e.id) into v_ids from public.employees e where e.company_id=p_company and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
 and not exists(select 1 from public.company_members m where m.company_id=e.company_id and m.user_id=auth.uid() and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)));
 if coalesce(cardinality(v_ids),0)<>1 then raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return v_ids[1];
end $$;
CREATE OR REPLACE FUNCTION private.sf_confirmed_work_minutes(p_employee_id uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_month date; v_end date; v_from date; v_to date; v_snapshot jsonb; v_seconds numeric:=0; v_saved jsonb;
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select company_id into v_company from public.employees where id=p_employee_id;
  if v_company is null then return 0; end if;
  if auth.uid() is not null and not private.sf_can_manage_time(v_company)
    and private.sf_employee_identity_for_company(v_company) is distinct from p_employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  for v_month in select d::date from generate_series(date_trunc('month',p_from),date_trunc('month',p_to),interval '1 month') d loop
    v_end:=(v_month+interval '1 month - 1 day')::date;
    v_from:=greatest(v_month,p_from);v_to:=least(v_end,p_to);v_saved:=null;
    select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=v_month and status='CLOSED';
    if v_snapshot is not null and v_from=v_month and v_to=v_end then
      select x into v_saved from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=p_employee_id::text limit 1;
    end if;
    if v_saved is not null then v_seconds:=v_seconds+coalesce((v_saved->>'confirmed_work_minutes')::numeric,0)*60;
    elsif v_snapshot is not null then
      v_seconds:=v_seconds+(select coalesce(sum(coalesce((x->>'confirmed_actual_minutes')::numeric,0)),0)*60
        from jsonb_array_elements(coalesce(v_snapshot#>'{report,details}',v_snapshot->'details','[]'::jsonb)) x
        where x->>'employee_id'=p_employee_id::text and (x->>'work_date')::date between v_from and v_to);
    else v_seconds:=v_seconds+private.sf_paid_work_seconds(p_employee_id,v_from,v_to); end if;
  end loop;
  return round(v_seconds/60)::integer;
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_employee_company_time_account_month(p_company uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_identity_for_company(p_company); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb; v_snapshot jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  v_company:=p_company;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=date_trunc('month',coalesce(p_month,current_date))::date and status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=v_employee::text limit 1;
    if v_row is not null then return v_row||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,'federal_state',coalesce(v_snapshot#>>'{accounts,settings,federal_state}','DE'),'holidays',coalesce(v_snapshot#>'{report,holidays}',v_snapshot->'holidays','[]'::jsonb)); end if;
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION private.sf_employee_company_submit_time_entry(p_company uuid, p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  v_employee:=private.sf_employee_identity_for_company(p_company);
  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and company_id=p_company and employee_id=v_employee and status='PUBLISHED' for update;
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
$function$;

REVOKE ALL ON FUNCTION private.sf_employee_identity_for_company(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sf_employee_company_time_account_month(uuid,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_company_time_account_month(uuid,date),private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.employee_company_time_account_month(p_company uuid,p_month date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT private.sf_employee_company_time_account_month(p_company,p_month) $$;
CREATE OR REPLACE FUNCTION public.employee_company_submit_time_entry(p_company uuid,p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer,p_note text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT private.sf_employee_company_submit_time_entry(p_company,p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note) $$;
REVOKE ALL ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.sf_require_active_employee_access()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF private.sf_employee_id() IS NULL THEN
  RAISE EXCEPTION 'Kein aktiver Mitarbeiterzugang gefunden' USING ERRCODE='42501';
 END IF;
END;
$function$
;
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
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); ib uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); ob uuid:=gen_random_uuid(); rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-list-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-list-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA foreign',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(ca,a,'Other','A','QA-CA',other,'ACTIVE'),(cb,b,'Other','B','QA-CB',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at) values(aa,a,ea,'A','2030-02-01 08:00Z','2030-02-01 16:00Z'),(ab,b,eb,'B','2030-02-01 08:00Z','2030-02-01 16:00Z');
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(sa,a,aa,ea,ca,1,'PENDING_COLLEAGUE'),(sb,b,ab,eb,cb,1,'PENDING_COLLEAGUE');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(ia,a,aa,ea,1,'OTHER',u),(ib,b,ab,eb,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(oa,ia,a,ea,u,now()+interval '1 day'),(ob,ib,b,eb,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 if (select array_agg(id) from public.employee_company_list_swaps(a))<>array[sa] or (select array_agg(id) from public.employee_company_list_swaps(b))<>array[sb] then raise exception 'Swap list crossed companies'; end if;
 if (select array_agg(offer_id) from public.employee_company_list_offers(a))<>array[oa] or (select array_agg(offer_id) from public.employee_company_list_offers(b))<>array[ob] then raise exception 'Offer list crossed companies'; end if;
 rejected:=false;
 begin perform * from public.employee_company_list_swaps(c); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company list accessible'; end if;
 perform set_config('role','postgres',true);
 update public.employees set access_status='DISABLED' where id=eb;
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform * from public.employee_company_list_offers(b); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Disabled profile list accessible'; end if;
 perform set_config('role','postgres',true);
end $test$;


select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); rejected boolean; outcome text;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-actions-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-actions-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(ca,a,'Other','A','QA-CA',other,'ACTIVE'),(cb,b,'Other','B','QA-CB',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at) values(aa,a,ea,'A','2030-02-01 08:00Z','2030-02-01 16:00Z'),(ab,b,cb,'B','2030-02-01 08:00Z','2030-02-01 16:00Z');
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(sa,a,aa,ea,ca,1,'PENDING_COLLEAGUE'),(sb,b,ab,cb,eb,1,'PENDING_COLLEAGUE');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(ia,a,aa,ea,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(oa,ia,a,ea,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform public.employee_company_cancel_swap(b,sa); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company swap cancellation accepted'; end if;
 rejected:=false;
 begin perform public.employee_company_respond_swap(a,sb,'REJECT'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company swap response accepted'; end if;
 rejected:=false;
 begin perform public.employee_company_respond_offer(b,oa,'DECLINE'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company offer response accepted'; end if;
 outcome:=public.employee_company_cancel_swap(a,sa); if outcome<>'CANCELLED' then raise exception 'Cancellation failed'; end if;
 outcome:=public.employee_company_respond_swap(b,sb,'REJECT'); if outcome<>'REJECTED_COLLEAGUE' then raise exception 'Swap response failed'; end if;
 select status into outcome from public.employee_company_respond_offer(a,oa,'DECLINE'); if outcome<>'DECLINED' then raise exception 'Offer response failed'; end if;
 perform set_config('role','postgres',true);
 if (select status from public.shift_swap_requests where id=sa)<>'CANCELLED' or (select status from public.shift_swap_requests where id=sb)<>'REJECTED_COLLEAGUE' or (select status from public.disruption_offers where id=oa)<>'DECLINED' then raise exception 'Wrong state'; end if;
end $test$;


select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); rejected boolean; outcome text;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-actions-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-actions-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(ca,a,'Other','A','QA-CA',other,'ACTIVE'),(cb,b,'Other','B','QA-CB',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at) values(aa,a,ea,'A','2030-02-01 08:00Z','2030-02-01 16:00Z'),(ab,b,cb,'B','2030-02-01 08:00Z','2030-02-01 16:00Z');
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(sa,a,aa,ea,ca,1,'PENDING_COLLEAGUE'),(sb,b,ab,cb,eb,1,'PENDING_COLLEAGUE');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(ia,a,aa,ea,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(oa,ia,a,ea,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 update public.employees set access_status='DISABLED' where id=eb;
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform public.employee_respond_shift_swap(sb,'REJECT',''); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Disabled profile responded to swap'; end if;
 perform set_config('role','postgres',true);
 update public.employees set access_status='ACTIVE' where id=eb;
 perform set_config('role','authenticated',true);
 outcome:=public.employee_respond_shift_swap(sb,'REJECT','');
 if outcome<>'REJECTED_COLLEAGUE' then raise exception 'Active profile could not respond'; end if;
 perform set_config('role','postgres',true);
end $test$;




select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); as1 uuid:=gen_random_uuid(); as2 uuid:=gen_random_uuid(); as3 uuid:=gen_random_uuid(); foreign_shift uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); result uuid; status_result text; n int; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-swap-'||u::text||'@example.invalid','{}'),(other,'qa-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status,shift_permissions) values
 (ea,a,'QA','A','A',u,'ACTIVE',array['O1']),(eb,b,'QA','B','B',u,'ACTIVE',array['O1']),(target,b,'QA','Target','T',other,'ACTIVE',array['O1']),(disabled,b,'QA','Disabled','D',null,'DISABLED',array['O1']);
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values
 (as1,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z','PUBLISHED',now()),(as2,b,eb,'O1','2030-01-03 08:00Z','2030-01-03 16:00Z','PUBLISHED',now()),(as3,b,target,'O1','2030-01-05 08:00Z','2030-01-05 16:00Z','PUBLISHED',now()),(foreign_shift,a,ea,'O1','2030-01-07 08:00Z','2030-01-07 16:00Z','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,assignment_version,status) values(offer,b,as3,target,1,'MARKET_OPEN');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_company_create_swap(b,as1,disabled,'');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled target accepted'; end if;
 denied:=false;begin perform public.employee_company_swap_candidates(a,as1);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company candidate lookup allowed'; end if;
 select count(*) into n from public.employee_company_swap_candidates(b,as1) where employee_id=target;
 if n<>1 then raise exception 'Eligible colleague missing'; end if;
 result:=public.employee_company_create_swap(b,as1,target,'test'); if result is null then raise exception 'Swap creation failed'; end if;
 perform set_config('role','postgres',true);
end $test$;

select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); peer_shift uuid:=gen_random_uuid();
 swap_id uuid:=gen_random_uuid(); market_id uuid:=gen_random_uuid(); incident uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-disabled-'||u::text||'@example.invalid','{}'),(other,'qa-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values
 (ea,a,'Test','A','A',u,'ACTIVE'),(eb,b,'Test','B','B',u,'DISABLED'),(peer,b,'Other','B','X',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(ab,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z','PUBLISHED',now()),(peer_shift,b,peer,'O1','2030-01-02 08:00Z','2030-01-02 16:00Z','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(swap_id,b,ab,eb,peer,1,'PENDING_COLLEAGUE'),(market_id,b,peer_shift,peer,null,1,'MARKET_OPEN');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(incident,b,ab,eb,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(offer,incident,b,eb,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_cancel_shift_swap(swap_id); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Disabled company could cancel a swap'; end if;
 denied:=false;begin perform public.employee_respond_disruption_offer(offer,'DECLINE',''); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Disabled company could respond to a disruption'; end if;
 perform set_config('role','postgres',true);
end $test$;

select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); shift_b uuid:=gen_random_uuid(); shift_market uuid:=gen_random_uuid(); request_b uuid:=gen_random_uuid(); market_b uuid:=gen_random_uuid(); incident uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); absence_id uuid; n integer; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-legacy-'||u::text||'@example.invalid','{}'),(other,'qa-legacy-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(eb,b,'QA','B','B',u,'DISABLED'),(ea,a,'QA','A','A',u,'ACTIVE'),(peer,b,'QA','Peer','P',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(shift_b,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z','PUBLISHED',now()),(shift_market,b,eb,'O1','2030-01-03 08:00Z','2030-01-03 16:00Z','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(request_b,b,shift_b,eb,peer,1,'PENDING_COLLEAGUE'),(market_b,b,shift_market,eb,null,1,'MARKET_OPEN');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(incident,b,shift_b,eb,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(offer,incident,b,eb,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 select count(*) into n from public.employee_list_shift_swaps();if n<>0 then raise exception 'Revoked swaps visible'; end if;
 select count(*) into n from public.employee_list_disruption_offers();if n<>0 then raise exception 'Revoked disruption offers visible'; end if;
 denied:=false;begin perform public.employee_list_shift_swap_candidates(shift_b);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked candidates visible'; end if;
 perform set_config('role','postgres',true);
end $test$;

rollback;