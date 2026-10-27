-- Avoid collision with the PL/pgSQL employee record e. Existing permission checks and grants are preserved.
CREATE OR REPLACE FUNCTION private.manager_disruption_replacement_impl(p_company_id uuid, p_assignment_id uuid, p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid_ uuid:=auth.uid();role_ text;action_ text:=coalesce(p_options->>'action','PREVIEW');a public.shift_assignments;e public.employees;
 mode_ text:=coalesce(p_options->>'mode','WHOLE');start_ timestamptz;end_ timestamptz;tz_ text;rows_ jsonb:='[]';c_ jsonb;old_ jsonb;proposed_ jsonb;replacement_ jsonb;spec_ jsonb;op_ private.disruption_replacements;
 target_ uuid;incident_ uuid;request_ uuid;reason_ text:=trim(p_options->>'reason');consent_ text:=trim(p_options->>'consent');token_ uuid;wc_ boolean;publish_ boolean;status_ text;pause_ int;change_action_ text;original_name_ text;
begin
 select cm.role into role_ from public.company_members cm where cm.company_id=p_company_id and cm.user_id=uid_ and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER') and not('read_only'=any(coalesce(cm.extra_permissions,'{}'::text[])));
 if uid_ is null or role_ is null then raise exception 'Keine Planungsberechtigung für dieses Unternehmen.';end if;
 if action_='LIST' then
  select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('replacement_status',r.status,'replacement_mode',o.mode,'replacement_employee',trim(replacement_employee.first_name||' '||replacement_employee.last_name)) order by d.created_at desc),'[]') into rows_
  from private.manager_list_disruptions_impl(p_company_id) d
  left join lateral(select x.* from private.disruption_replacements x join public.shift_change_requests y on y.id=x.change_id where x.incident_id=d.id order by x.created_at desc limit 1) o on true
  left join public.shift_change_requests r on r.id=o.change_id left join public.employees replacement_employee on replacement_employee.id=(o.replacement_snapshot->>'employeeId')::uuid;
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
end $function$;
