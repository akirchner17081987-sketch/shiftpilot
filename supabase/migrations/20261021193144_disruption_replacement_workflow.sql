-- Platform-wide disruption workflow. No tenant data is copied or re-assigned by this migration.
-- Trusted compound requests keep the original employee's attendance attached to the original ID.
create table private.disruption_replacements (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 incident_id uuid not null references public.disruption_incidents(id) on delete cascade,
 change_id uuid not null unique references public.shift_change_requests(id) on delete cascade,
 replacement_employee_id uuid not null references public.employees(id) on delete cascade,
 token uuid not null,
 mode text not null check(mode in ('WHOLE','PARTIAL','REMAINING')),
 source_snapshot jsonb not null,
 replacement_snapshot jsonb not null,
 request_spec jsonb not null,
 consent text not null check(length(trim(consent)) between 1 and 500),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 replacement_assignment_id uuid references public.shift_assignments(id) on delete set null,
 unique(company_id,token)
);
alter table private.disruption_replacements enable row level security;
revoke all on private.disruption_replacements from public,anon,authenticated;
create index disruption_replacements_incident on private.disruption_replacements(incident_id);

-- This internal validator intentionally does not change the shared employee-swap rules.
create or replace function private.sf_disruption_candidate(a public.shift_assignments, target_ uuid, starts_ timestamptz, ends_ timestamptz)
returns jsonb language plpgsql set search_path='' as $$
declare e public.employees;tz_ text;err_ text;r_ jsonb;expected_ text;exception_ boolean:=false;
begin
 select * into e from public.employees where id=target_ and company_id=a.company_id and status='active' and deleted_at is null;
 if e.id is null then return jsonb_build_object('block','Mitarbeiter ist nicht aktiv.');end if;
 if e.id=a.employee_id then return jsonb_build_object('block','Bitte eine andere Ersatzkraft wählen.');end if;
 if not coalesce(a.shift_code=any(e.shift_permissions),false) then return jsonb_build_object('block','Keine Schichtfreigabe.');end if;
 if lower(a.shift_code)='teamleiter' and e.role!~*'teamleiter|schichtleiter' then return jsonb_build_object('block','Teamleiterrolle erforderlich.');end if;
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=a.company_id;
 if e.start_date>(starts_ at time zone tz_)::date or e.contract_end<((ends_-interval '1 microsecond') at time zone tz_)::date then return jsonb_build_object('block','Außerhalb der Vertragslaufzeit.');end if;
 err_:=private.sf_manual_nonrhythm_scope_error(a.company_id,e.id,a.shift_code,starts_,ends_);
 if err_ is not null then return jsonb_build_object('block',err_);end if;
 begin perform public.assert_standard_shift_rules(a.company_id,e.id,starts_,ends_,a.id);
 exception when check_violation or raise_exception then return jsonb_build_object('block',sqlerrm);end;
 r_:=private.sf_month_rhythm(e,(starts_ at time zone tz_)::date);expected_:=r_->>'expected';
 exception_:=r_->>'mode'='required' and expected_ is not null and expected_<>'ALLE'
  and not(coalesce((r_->>'exemptOt')::boolean,false) and a.shift_code in('OT1','OT2','OT3'))
  and not(upper(a.shift_code)=any(regexp_split_to_array(expected_,'[+|/]')));
 return jsonb_build_object('block',null,'rhythm',coalesce(exception_,false),'expected',expected_);
end $$;
revoke all on function private.sf_disruption_candidate(public.shift_assignments,uuid,timestamptz,timestamptz) from public,anon,authenticated;

-- Immutable server-side specification prevents an edited approval request from applying only
-- half of a handover or removing its required approvals. All ordinary requests are unaffected.
create or replace function private.sf_disruption_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare op private.disruption_replacements;spec_ jsonb;
begin
 select * into op from private.disruption_replacements where change_id=old.id;
 if not found then return new;end if;
 spec_:=jsonb_build_object('company_id',new.company_id,'assignment_id',new.assignment_id,'action',new.action,'employee_id',new.employee_id,'base_version',new.base_version,'proposed_snapshot',new.proposed_snapshot,'requires_employee_approval',new.requires_employee_approval,'requires_works_council',new.requires_works_council,'compliance_status',new.compliance_status,'reason_text',new.reason_text);
 if old.status='APPLIED' and new.status<>'APPLIED' then raise exception 'Ein übernommener Vorgang ist abgeschlossen.';end if;
 if spec_ is distinct from op.request_spec then raise exception 'Die Ersatzübernahme muss im ursprünglichen Vorgang neu geprüft werden.';end if;
 if new.status='APPLIED' and old.status<>'APPLIED' then
  if exists(select 1 from public.company_compliance_policy where company_id=op.company_id and works_council_enabled) and not new.requires_works_council then raise exception 'Die erforderlichen Unternehmensfreigaben haben sich geändert. Bitte die Übernahme neu prüfen.';end if;
  if old.status<>'READY_TO_APPLY' or op.replacement_assignment_id is not null then raise exception 'Dieser Vorgang kann nicht erneut angewendet werden.';end if;
  if not exists(select 1 from public.shift_change_approvals where change_request_id=new.id and approval_type='EMPLOYEE' and status='APPROVED') or (new.requires_works_council and not exists(select 1 from public.shift_change_approvals where change_request_id=new.id and approval_type='WORKS_COUNCIL' and status='APPROVED')) or exists(select 1 from public.compliance_findings where change_request_id=new.id and status='BLOCK') then raise exception 'Erforderliche Freigaben fehlen.';end if;
  if not exists(select 1 from public.disruption_incidents where id=op.incident_id and company_id=op.company_id and status='OPEN') then raise exception 'Dieser Störfall ist nicht mehr offen.';end if;
  if not exists(select 1 from public.company_members cm where cm.company_id=op.company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[]))))
   or not private.sf_has_access_permission(op.company_id,'publish_schedule') then raise exception 'Für die Übernahme ist eine Veröffentlichungsberechtigung erforderlich.';end if;
 end if;
 return new;
end $$;
revoke all on function private.sf_disruption_request_guard() from public,anon,authenticated;
create trigger sf_disruption_request_guard before update on public.shift_change_requests for each row execute function private.sf_disruption_request_guard();

create or replace function private.sf_disruption_finish_replacement() returns trigger
language plpgsql security definer set search_path='' as $$
declare op private.disruption_replacements;a public.shift_assignments;child_ uuid;candidate_ jsonb;source_id uuid;
begin
 if new.status<>'APPLIED' or old.status='APPLIED' then return new;end if;
 select * into op from private.disruption_replacements where change_id=new.id for update;
 if not found then return new;end if;
 select * into a from public.shift_assignments where id=new.assignment_id and company_id=op.company_id for update;
 source_id:=a.id;
 if (op.replacement_snapshot->>'endsAt')::timestamptz<=now() or (op.mode='WHOLE' and (op.replacement_snapshot->>'startsAt')::timestamptz<=now()) then raise exception 'Der Dienst ist inzwischen angelaufen oder beendet. Bitte den Übernahmezeitraum neu prüfen.';end if;
 if a.id is null or a.version<>new.base_version+1 or a.last_change_request_id is distinct from new.id then raise exception 'Der ursprüngliche Dienst wurde nicht durch diesen Änderungsantrag übernommen.';end if;
 if new.action='DELETE' then
  if a.status<>'CANCELLED' then raise exception 'Der ursprüngliche Dienst ist noch aktiv.';end if;
 elsif a.status<>'PUBLISHED' or a.employee_id is distinct from (new.proposed_snapshot->>'employeeId')::uuid or a.shift_code is distinct from new.proposed_snapshot->>'type' or a.starts_at is distinct from (new.proposed_snapshot->>'startsAt')::timestamptz or a.ends_at is distinct from (new.proposed_snapshot->>'endsAt')::timestamptz or a.break_minutes is distinct from (new.proposed_snapshot->>'breakMinutes')::int then raise exception 'Der ursprüngliche Dienst entspricht nicht der freigegebenen Übernahme.';end if;
 -- Actual attendance is never migrated to a different employee or silently truncated.
 if op.mode in('WHOLE','REMAINING') and exists(select 1 from public.time_entries where assignment_id=a.id) then raise exception 'Für den ursprünglichen Dienst bestehen Zeitbuchungen. Bitte Teilablösung verwenden.';end if;
 if op.mode='PARTIAL' and exists(select 1 from public.time_entries t where t.assignment_id=a.id and (t.actual_end is null or t.actual_end>(op.replacement_snapshot->>'startsAt')::timestamptz)) then raise exception 'Zeitbuchung zuerst abschließen; der Ablösezeitpunkt darf nicht vor dem gebuchten Ende liegen.';end if;
 -- Recheck the target at application time, including delayed council approvals.
 a.employee_id:=(op.source_snapshot->>'employee_id')::uuid;
 candidate_:=private.sf_disruption_candidate(a,(op.replacement_snapshot->>'employeeId')::uuid,(op.replacement_snapshot->>'startsAt')::timestamptz,(op.replacement_snapshot->>'endsAt')::timestamptz);
 if candidate_->>'block' is not null then raise exception '%',candidate_->>'block';end if;
 if op.mode='WHOLE' then child_:=source_id;
 else
  insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,rhythm_override,status,published_at,version,last_change_request_id,created_by)
  values(op.company_id,(op.replacement_snapshot->>'employeeId')::uuid,op.replacement_snapshot->>'type',(op.replacement_snapshot->>'startsAt')::timestamptz,(op.replacement_snapshot->>'endsAt')::timestamptz,(op.replacement_snapshot->>'breakMinutes')::int,op.replacement_snapshot->>'note',nullif(op.replacement_snapshot->'rhythmOverride','null'::jsonb),'PUBLISHED',now(),1,new.id,auth.uid()) returning id into child_;
 end if;
 update private.disruption_replacements set replacement_assignment_id=child_ where id=op.id;
 update public.disruption_incidents set status='RESOLVED',resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=op.incident_id;
 update public.disruption_offers set status='REVOKED',updated_at=now() where incident_id=op.incident_id and status='OFFERED';
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 values(op.company_id,'DISRUPTION_RESOLVED','disruption_incident',op.incident_id,auth.uid(),'PLANNER',jsonb_build_object('sourceAssignmentId',source_id,'replacementAssignmentId',child_,'changeRequestId',new.id,'mode',op.mode,'consent',op.consent));
 return new;
end $$;
revoke all on function private.sf_disruption_finish_replacement() from public,anon,authenticated;
create trigger sf_disruption_finish_replacement after update on public.shift_change_requests for each row execute function private.sf_disruption_finish_replacement();

-- Authenticated manager API: preview is read-only; COMMIT creates one atomic, reviewable request.
create or replace function private.manager_disruption_replacement_impl(p_company_id uuid,p_assignment_id uuid,p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid_ uuid:=auth.uid();role_ text;action_ text:=coalesce(p_options->>'action','PREVIEW');a public.shift_assignments;e public.employees;
 mode_ text:=coalesce(p_options->>'mode','WHOLE');start_ timestamptz;end_ timestamptz;tz_ text;rows_ jsonb:='[]';c_ jsonb;old_ jsonb;proposed_ jsonb;replacement_ jsonb;spec_ jsonb;op_ private.disruption_replacements;
 target_ uuid;incident_ uuid;request_ uuid;reason_ text:=trim(p_options->>'reason');consent_ text:=trim(p_options->>'consent');token_ uuid;wc_ boolean;publish_ boolean;status_ text;pause_ int;change_action_ text;original_name_ text;
begin
 select cm.role into role_ from public.company_members cm where cm.company_id=p_company_id and cm.user_id=uid_ and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[])));
 if uid_ is null or role_ is null then raise exception 'Keine Planungsberechtigung für dieses Unternehmen.';end if;
 if action_='LIST' then
  select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('replacement_status',r.status,'replacement_mode',o.mode,'replacement_employee',trim(e.first_name||' '||e.last_name)) order by d.created_at desc),'[]') into rows_
  from private.manager_list_disruptions_impl(p_company_id) d
  left join lateral(select x.* from private.disruption_replacements x join public.shift_change_requests y on y.id=x.change_id where x.incident_id=d.id order by x.created_at desc limit 1) o on true
  left join public.shift_change_requests r on r.id=o.change_id left join public.employees e on e.id=(o.replacement_snapshot->>'employeeId')::uuid;
  return rows_;
 end if;
 if action_ not in('PREVIEW','COMMIT') then raise exception 'Ungültige Aktion.';end if;
 if action_='COMMIT' then
  token_:=(p_options->>'token')::uuid;if token_ is null then raise exception 'Vorgangskennung fehlt.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||token_::text,0));
  select * into op_ from private.disruption_replacements where company_id=p_company_id and token=token_;
  if found then
   if (op_.source_snapshot->>'id')::uuid is distinct from p_assignment_id then raise exception 'Vorgangskennung gehört zu einem anderen Dienst.';end if;
   return jsonb_build_object('change_id',op_.change_id,'incident_id',op_.incident_id,'status',(select status from public.shift_change_requests where id=op_.change_id));
  end if;
 end if;
 if action_='COMMIT' then perform id from public.disruption_incidents where company_id=p_company_id and assignment_id=p_assignment_id and status='OPEN' for update;end if;
 if action_='COMMIT' then select * into a from public.shift_assignments where id=p_assignment_id and company_id=p_company_id for update;
 else select * into a from public.shift_assignments where id=p_assignment_id and company_id=p_company_id;end if;
 if a.id is null or a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Veröffentlichter Dienst wurde nicht gefunden.';end if;
 if a.ends_at<=now() then raise exception 'Der Dienst ist bereits beendet.';end if;
 if p_options ? 'version' and (p_options->>'version')::int<>a.version then raise exception 'Der Dienst wurde inzwischen geändert. Bitte neu öffnen.';end if;
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=p_company_id;
 if mode_ not in('WHOLE','PARTIAL','REMAINING') then raise exception 'Ungültiger Übernahmeumfang.';end if;
 start_:=case when mode_='WHOLE' then a.starts_at when nullif(p_options->>'from_local','') is not null then (p_options->>'from_local')::timestamp at time zone tz_ else greatest(a.starts_at,date_trunc('minute',now())+interval '1 minute') end;
 end_:=a.ends_at;
 if start_<a.starts_at or start_>=end_ then raise exception 'Übernahmebeginn muss innerhalb des Dienstes liegen.';end if;
 if mode_='WHOLE' and a.starts_at<=now() then raise exception 'Bei laufenden Diensten bitte Teilablösung oder Restdienst wählen.';end if;
 if mode_='PARTIAL' and start_<=a.starts_at then raise exception 'Für eine Teilablösung muss ein ursprünglicher Abschnitt verbleiben.';end if;
 publish_:=private.sf_has_access_permission(p_company_id,'publish_schedule');
 select trim(first_name||' '||last_name) into original_name_ from public.employees where id=a.employee_id and company_id=p_company_id;
 if action_='PREVIEW' then
  for e in select * from public.employees where company_id=p_company_id and status='active' and deleted_at is null and id<>a.employee_id order by last_name,first_name,id loop
   c_:=private.sf_disruption_candidate(a,e.id,start_,end_);
   rows_:=rows_||jsonb_build_array(jsonb_build_object('employee_id',e.id,'employee_name',trim(e.first_name||' '||e.last_name),'portal',e.auth_user_id is not null and e.access_status='ACTIVE')||c_);
  end loop;
  return jsonb_build_object('assignment',jsonb_build_object('id',a.id,'version',a.version,'employee_name',original_name_,'shift_code',a.shift_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'break_minutes',a.break_minutes,'has_time_entries',exists(select 1 from public.time_entries where assignment_id=a.id)), 'starts_at',start_,'ends_at',end_,'timezone',tz_,'can_publish',publish_,'candidates',rows_);
 end if;
 if not coalesce((p_options->>'agreed')::boolean,false) or coalesce(length(consent_),0) not between 1 and 500 then raise exception 'Bitte die persönliche oder telefonische Zusage ausdrücklich bestätigen und dokumentieren.';end if;
 if coalesce(length(reason_),0) not between 1 and 500 then raise exception 'Bitte einen Grund mit 1 bis 500 Zeichen angeben.';end if;
 target_:=(p_options->>'employee_id')::uuid;
 c_:=private.sf_disruption_candidate(a,target_,start_,end_);
 if c_->>'block' is not null then raise exception '%',c_->>'block';end if;
 if (c_->>'rhythm')::boolean and not coalesce((p_options->>'rhythm_override')::boolean,false) then raise exception 'Die Abweichung vom Rhythmus muss ausdrücklich bestätigt werden.';end if;
 if mode_ in('WHOLE','REMAINING') and exists(select 1 from public.time_entries where assignment_id=a.id) then raise exception 'Für diesen Dienst bestehen Zeitbuchungen. Bitte Teilablösung verwenden.';end if;
 if mode_='PARTIAL' and exists(select 1 from public.time_entries where assignment_id=a.id and (actual_end is null or actual_end>start_)) then raise exception 'Zeitbuchung zuerst abschließen; Ablösung erst ab dem gebuchten Ende möglich.';end if;
 pause_:=coalesce((p_options->>'break_minutes')::int,case when mode_='WHOLE' then a.break_minutes else 0 end);
 if pause_<0 or pause_*60>=extract(epoch from(end_-start_)) then raise exception 'Ungültige Pause für den Ersatzdienst.';end if;
 if mode_='PARTIAL' and a.break_minutes*60>=extract(epoch from(start_-a.starts_at)) then raise exception 'Die ursprüngliche Pause passt nicht in den verbleibenden Abschnitt. Bitte den Dienst zuerst korrigieren.';end if;
 select id into incident_ from public.disruption_incidents where assignment_id=a.id and status='OPEN' for update;
 if incident_ is not null and exists(select 1 from private.disruption_replacements x join public.shift_change_requests r on r.id=x.change_id where x.incident_id=incident_ and r.status not in('REJECTED','SUPERSEDED','CANCELLED','APPLIED')) then raise exception 'Für diesen Störfall wartet bereits eine Ersatzübernahme auf Freigabe.';end if;
 if incident_ is null then
  insert into public.disruption_incidents(company_id,assignment_id,original_employee_id,assignment_version,incident_type,note,status,created_by)
  values(p_company_id,a.id,a.employee_id,a.version,coalesce(p_options->>'incident_type','OTHER'),reason_,'OPEN',uid_) returning id into incident_;
 else
  if not exists(select 1 from public.disruption_incidents where id=incident_ and assignment_version=a.version and original_employee_id=a.employee_id) then raise exception 'Der Störfall bezieht sich auf einen älteren Planstand.';end if;
 end if;
 old_:=jsonb_build_object('employeeId',a.employee_id,'type',a.shift_code,'startsAt',a.starts_at,'endsAt',a.ends_at,'breakMinutes',a.break_minutes,'note',coalesce(a.note,''),'rhythmOverride',a.rhythm_override);
 replacement_:=jsonb_build_object('employeeId',target_,'type',a.shift_code,'startsAt',start_,'endsAt',end_,'breakMinutes',pause_,'note',coalesce(a.note,''),'rhythmOverride',case when (c_->>'rhythm')::boolean then jsonb_build_object('reason',reason_) else null end);
 change_action_:=case when mode_='REMAINING' then 'DELETE' else 'UPDATE' end;
 proposed_:=case when mode_='WHOLE' then replacement_ when mode_='REMAINING' then old_ else old_||jsonb_build_object('endsAt',start_,'rhythmOverride',case when a.rhythm_override is not null then jsonb_build_object('reason',a.rhythm_override->>'reason') else null end) end;
 select coalesce(works_council_enabled,false) into wc_ from public.company_compliance_policy where company_id=p_company_id;wc_:=coalesce(wc_,false);
 status_:=case when wc_ then 'PENDING_WORKS_COUNCIL' else 'READY_TO_APPLY' end;
 request_:=gen_random_uuid();
 insert into public.shift_change_requests(id,company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
 values(request_,p_company_id,a.id,change_action_,target_,a.version,old_,proposed_,'Störfall-Ersatz',reason_||' · '||mode_||' · Ersatz '||(select trim(first_name||' '||last_name) from public.employees where id=target_ and company_id=p_company_id)||' ab '||to_char(start_ at time zone tz_,'DD.MM.YYYY HH24:MI')||' bis '||to_char(end_ at time zone tz_,'DD.MM.YYYY HH24:MI')||' · Pause Ersatz: '||pause_::text||' Min.'||case when (c_->>'rhythm')::boolean then ' · Bestätigte Rhythmusausnahme: '||reason_ else '' end||' · Zusage: '||consent_,'NO',greatest(0,floor(extract(epoch from(start_-now()))/60))::int,'REVIEW',status_,true,wc_,uid_);
 insert into public.shift_change_approvals(company_id,change_request_id,approval_type,required,status,decided_by,decided_at,comment)
 values(p_company_id,request_,'EMPLOYEE',true,'APPROVED',uid_,now(),'Zusage durch Disposition dokumentiert: '||consent_);
 if wc_ then insert into public.shift_change_approvals(company_id,change_request_id,approval_type,required,status) values(p_company_id,request_,'WORKS_COUNCIL',true,'PENDING');end if;
 spec_:=jsonb_build_object('company_id',p_company_id,'assignment_id',a.id,'action',change_action_,'employee_id',target_,'base_version',a.version,'proposed_snapshot',proposed_,'requires_employee_approval',true,'requires_works_council',wc_,'compliance_status','REVIEW','reason_text',(select reason_text from public.shift_change_requests where id=request_));
 insert into private.disruption_replacements(company_id,incident_id,change_id,replacement_employee_id,token,mode,source_snapshot,replacement_snapshot,request_spec,consent,created_by)
 values(p_company_id,incident_,request_,target_,token_,mode_,to_jsonb(a),replacement_,spec_,consent_,uid_);
 -- Supersede the initial automatic approval notification with the truthful documented state.
 update public.notifications set title='Ersatzübernahme dokumentiert',message='Die Disposition hat deine Zusage dokumentiert. '||case when wc_ then 'Weitere Freigabe steht aus.' else 'Die Übernahme wird im Dienstplan gespeichert.' end
 where company_id=p_company_id and entity_type='shift_change_request' and entity_id=request_ and kind='SHIFT_CHANGE_REQUEST';
 update public.disruption_offers set status='REVOKED',updated_at=now() where incident_id=incident_ and status='OFFERED';
 if not wc_ and publish_ then perform public.apply_shift_change(request_);status_:='APPLIED';end if;
 return jsonb_build_object('change_id',request_,'incident_id',incident_,'status',status_,'needs_publish',not publish_);
end $$;
create or replace function public.manager_disruption_replacement(p_company_id uuid,p_assignment_id uuid default null,p_options jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.manager_disruption_replacement_impl(p_company_id,p_assignment_id,p_options)$$;
revoke all on function private.manager_disruption_replacement_impl(uuid,uuid,jsonb),public.manager_disruption_replacement(uuid,uuid,jsonb) from public,anon;
grant execute on function private.manager_disruption_replacement_impl(uuid,uuid,jsonb),public.manager_disruption_replacement(uuid,uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.manager_create_disruption_impl(p_company_id uuid, p_assignment_id uuid, p_incident_type text, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_role text; v_assignment public.shift_assignments%rowtype; v_id uuid; v_type text:=upper(trim(coalesce(p_incident_type,'')));
begin
  select cm.role into v_role from public.company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[]))) limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  if v_type not in ('SICKNESS','NO_SHOW','EMERGENCY','OTHER') then raise exception 'Ungültige Störfallart'; end if;
  select * into v_assignment from public.shift_assignments where id=p_assignment_id and company_id=p_company_id for update;
  if v_assignment.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if v_assignment.status<>'PUBLISHED' or v_assignment.published_at is null then raise exception 'Nur veröffentlichte Schichten können als Störfall gemeldet werden'; end if;
  if v_assignment.ends_at<=now() then raise exception 'Die Schicht ist bereits beendet'; end if;
  if exists(select 1 from public.disruption_incidents d where d.assignment_id=v_assignment.id and d.status='OPEN') then raise exception 'Für diese Schicht besteht bereits ein offener Störfall'; end if;
  insert into public.disruption_incidents(company_id,assignment_id,original_employee_id,assignment_version,incident_type,note,status,created_by)
  values(p_company_id,v_assignment.id,v_assignment.employee_id,v_assignment.version,v_type,left(coalesce(p_note,''),1000),'OPEN',v_uid) returning id into v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
  values(p_company_id,'DISRUPTION_CREATED','disruption_incident',v_id,v_uid,v_role,jsonb_build_object('assignmentId',v_assignment.id,'incidentType',v_type,'status','OPEN'));
  return v_id;
end $function$

;
CREATE OR REPLACE FUNCTION private.manager_list_disruption_candidates_impl(p_incident_id uuid)
 RETURNS TABLE(employee_id uuid, employee_name text, employee_role text, score integer, planned_hours numeric, reasons text[], offer_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype;
begin
  select * into v_incident from public.disruption_incidents where id=p_incident_id;
  if v_incident.id is null then raise exception 'Störfall nicht gefunden'; end if;
  if not exists(select 1 from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id;
  return query with candidate as (
    select e.*,coalesce((select sum(extract(epoch from (s.ends_at-s.starts_at))/3600-s.break_minutes/60.0) from public.shift_assignments s where s.employee_id=e.id and s.status='PUBLISHED' and s.starts_at>=date_trunc('week',v_assignment.starts_at) and s.starts_at<date_trunc('week',v_assignment.starts_at)+interval '7 days'),0)::numeric(7,2) hours,
      case when lower(v_assignment.shift_code)='teamleiter' and e.role!~*'teamleiter|schichtleiter' then 'Teamleiterrolle erforderlich' else private.sf_swap_candidate_reason(v_assignment.id,e.id) end block_reason
    from public.employees e where e.company_id=v_incident.company_id and e.status='active' and e.id<>v_incident.original_employee_id and e.auth_user_id is not null
  )
  select c.id,trim(c.first_name||' '||c.last_name),c.role,(100-least(45,round(c.hours)::integer)+case when c.role~*'teamleiter|schichtleiter' then 5 else 0 end)::integer,c.hours,
    array['Schichtfreigabe vorhanden','Ruhezeit und Verfügbarkeit geprüft',trim(to_char(c.hours,'FM999990D0'))||' h in der Schichtwoche geplant']::text[],case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end
  from candidate c left join public.disruption_offers x on x.incident_id=v_incident.id and x.employee_id=c.id
  where c.block_reason is null and (private.sf_disruption_candidate(v_assignment,c.id,v_assignment.starts_at,v_assignment.ends_at)->>'block') is null and not coalesce((private.sf_disruption_candidate(v_assignment,c.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) order by 4 desc,c.last_name,c.first_name;
end $function$

;
CREATE OR REPLACE FUNCTION private.sf_send_disruption_offers(p_incident_id uuid, p_employee_ids uuid[], p_retry boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_role text; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype; v_employee_id uuid; v_reason text; v_count integer:=0; v_offer_id uuid; v_hours numeric; v_score integer;
begin
  if coalesce(array_length(p_employee_ids,1),0)=0 then raise exception 'Keine Ersatzkräfte ausgewählt'; end if;
  if array_length(p_employee_ids,1)>10 then raise exception 'Maximal 10 Ersatzkräfte pro Anfrage'; end if;
  select * into v_incident from public.disruption_incidents where id=p_incident_id for update;
  if v_incident.id is null or v_incident.status<>'OPEN' then raise exception 'Der Störfall ist nicht mehr offen'; end if;
  select cm.role into v_role from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[]))) limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;
  if exists(select 1 from private.disruption_replacements x join public.shift_change_requests r on r.id=x.change_id where x.incident_id=v_incident.id and r.status not in('REJECTED','SUPERSEDED','CANCELLED')) then raise exception 'Eine Ersatzübernahme ist bereits in Bearbeitung.';end if;
  if exists(select 1 from public.disruption_offers where incident_id=v_incident.id and status='ACCEPTED') then raise exception 'Es liegt bereits eine Zusage vor. Bitte die Übernahme abschließen.';end if;
  for v_employee_id in select distinct unnest(p_employee_ids) loop
    if exists(select 1 from public.disruption_offers x where x.incident_id=v_incident.id and x.employee_id=v_employee_id and (not p_retry or x.status='ACCEPTED' or (x.status='OFFERED' and x.expires_at>now()))) then continue;end if;
    if p_retry and not exists(select 1 from public.disruption_offers x where x.incident_id=v_incident.id and x.employee_id=v_employee_id and (x.status in('DECLINED','EXPIRED','REVOKED') or (x.status='OFFERED' and x.expires_at<=now()))) then continue;end if;
    if p_retry then insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values) select v_incident.company_id,'DISRUPTION_OFFER_RETRIED','disruption_offer',x.id,v_uid,v_role,to_jsonb(x) from public.disruption_offers x where x.incident_id=v_incident.id and x.employee_id=v_employee_id;end if;
    select * into v_employee from public.employees where id=v_employee_id and company_id=v_incident.company_id and status='active';
    if v_employee.id is null or v_employee.auth_user_id is null then raise exception 'Ersatzkraft ist nicht aktiv erreichbar'; end if;
    if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception '% ist keine Teamleitung',trim(v_employee.first_name||' '||v_employee.last_name); end if;
    v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%: %',trim(v_employee.first_name||' '||v_employee.last_name),v_reason; end if;
    if (private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'block') is not null or coalesce((private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) then raise exception 'Diese Ersatzkraft benötigt eine neue manuelle Prüfung unter Ersatz übernehmen.';end if;
    select coalesce(sum(extract(epoch from (s.ends_at-s.starts_at))/3600-s.break_minutes/60.0),0) into v_hours from public.shift_assignments s where s.employee_id=v_employee.id and s.status='PUBLISHED' and s.starts_at>=date_trunc('week',v_assignment.starts_at) and s.starts_at<date_trunc('week',v_assignment.starts_at)+interval '7 days';
    v_score:=100-least(45,round(v_hours)::integer)+case when v_employee.role~*'teamleiter|schichtleiter' then 5 else 0 end;
    insert into public.disruption_offers(incident_id,company_id,employee_id,rank_score,rank_reasons,status,offered_by,offered_at,expires_at,responded_at,employee_comment,updated_at)
    values(v_incident.id,v_incident.company_id,v_employee.id,v_score,array['Schichtfreigabe vorhanden','Ruhezeit und Verfügbarkeit geprüft',trim(to_char(v_hours,'FM999990D0'))||' h in der Schichtwoche geplant'],'OFFERED',v_uid,now(),least(v_assignment.starts_at,now()+interval '4 hours'),null,'',now())
    on conflict(incident_id,employee_id) do update set rank_score=excluded.rank_score,rank_reasons=excluded.rank_reasons,status='OFFERED',offered_by=v_uid,offered_at=now(),expires_at=excluded.expires_at,responded_at=null,employee_comment='',updated_at=now() returning id into v_offer_id;
    insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
    values(v_incident.company_id,v_employee.auth_user_id,v_employee.id,'DISRUPTION_OFFER','Dringende Ersatzanfrage',v_assignment.shift_code||' · '||to_char(v_assignment.starts_at at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI'),'employee-disruptions','disruption_offer',v_offer_id,jsonb_build_object('incidentId',v_incident.id,'assignmentId',v_assignment.id)) on conflict do nothing;
    if p_retry then update public.notifications set is_read=false,read_at=null,created_at=now(),title='Erneute Ersatzanfrage',message=v_assignment.shift_code||' · '||to_char(v_assignment.starts_at at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI') where company_id=v_incident.company_id and entity_type='disruption_offer' and entity_id=v_offer_id and user_id=v_employee.auth_user_id;end if;
    v_count:=v_count+1;
  end loop;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata) values(v_incident.company_id,'DISRUPTION_OFFERS_SENT','disruption_incident',v_incident.id,v_uid,v_role,jsonb_build_object('count',v_count,'employeeIds',p_employee_ids,'explicitRetry',p_retry));
  return v_count;
end $function$

;
revoke all on function private.sf_send_disruption_offers(uuid,uuid[],boolean) from public,anon,authenticated;
create or replace function private.manager_send_disruption_offers_impl(p_incident_id uuid,p_employee_ids uuid[]) returns integer language sql security definer set search_path='' as $$select private.sf_send_disruption_offers(p_incident_id,p_employee_ids,false)$$;
create or replace function private.manager_retry_disruption_offer_impl(p_incident_id uuid,p_employee_id uuid,p_confirmed boolean) returns integer language plpgsql security definer set search_path='' as $$begin if p_confirmed is distinct from true then raise exception 'Erneute Anfrage bitte ausdrücklich bestätigen.';end if;return private.sf_send_disruption_offers(p_incident_id,array[p_employee_id],true);end $$;
create or replace function public.manager_retry_disruption_offer(p_incident_id uuid,p_employee_id uuid,p_confirmed boolean) returns integer language sql security invoker set search_path='' as $$select private.manager_retry_disruption_offer_impl(p_incident_id,p_employee_id,p_confirmed)$$;
revoke all on function private.manager_retry_disruption_offer_impl(uuid,uuid,boolean),public.manager_retry_disruption_offer(uuid,uuid,boolean) from public,anon;
grant execute on function private.manager_retry_disruption_offer_impl(uuid,uuid,boolean),public.manager_retry_disruption_offer(uuid,uuid,boolean) to authenticated;
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
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.auth_user_id=v_uid and e.status='active';
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

-- A source UPDATE cannot commit on its own: the replacement and completed request
-- must exist in the same transaction. This also protects direct table/API callers.
create or replace function private.sf_disruption_assignment_complete() returns trigger
language plpgsql security definer set search_path='' as $$
declare op private.disruption_replacements;
begin
 select * into op from private.disruption_replacements where change_id=new.last_change_request_id and (source_snapshot->>'id')::uuid=new.id;
 if found and (op.replacement_assignment_id is null or not exists(select 1 from public.shift_change_requests where id=op.change_id and status='APPLIED')) then raise exception 'Eine Ersatzübernahme muss vollständig und gemeinsam gespeichert werden.';end if;
 return new;
end $$;
revoke all on function private.sf_disruption_assignment_complete() from public,anon,authenticated;
create constraint trigger sf_disruption_assignment_complete after update on public.shift_assignments deferrable initially deferred for each row execute function private.sf_disruption_assignment_complete();

create or replace function private.sf_disruption_cancel_pending() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='OPEN' and new.status in('CANCELLED','SUPERSEDED') then
  update public.shift_change_requests r set status=case when new.status='CANCELLED' then 'CANCELLED' else 'SUPERSEDED' end where r.id in(select change_id from private.disruption_replacements where incident_id=new.id) and r.status not in('APPLIED','REJECTED','CANCELLED','SUPERSEDED');
 end if;return new;
end $$;
revoke all on function private.sf_disruption_cancel_pending() from public,anon,authenticated;
create trigger sf_disruption_cancel_pending after update on public.disruption_incidents for each row execute function private.sf_disruption_cancel_pending();

CREATE OR REPLACE FUNCTION private.manager_cancel_disruption_impl(p_incident_id uuid, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_role text; v_incident public.disruption_incidents%rowtype;
begin
  select * into v_incident from public.disruption_incidents where id=p_incident_id for update;
  if v_incident.id is null then raise exception 'Störfall nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[]))) limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  if v_incident.status<>'OPEN' then raise exception 'Der Störfall ist bereits abgeschlossen'; end if;
  update public.disruption_incidents set status='CANCELLED',note=left(concat_ws(' · ',nullif(note,''),nullif(p_comment,'')),1000),resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  update public.disruption_offers set status='REVOKED',updated_at=now() where incident_id=v_incident.id and status='OFFERED';
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values) values(v_incident.company_id,'DISRUPTION_CANCELLED','disruption_incident',v_incident.id,v_uid,v_role,jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $function$
;

create index disruption_replacements_target on private.disruption_replacements(replacement_employee_id);
create index disruption_replacements_assignment on private.disruption_replacements(replacement_assignment_id);
