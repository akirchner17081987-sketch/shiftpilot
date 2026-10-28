-- Revalidate a digital offer when it is answered, and finish the notification chain.
-- Existing private writers retain their authorization checks and grants.
do $patch$
declare s text; old_ text; new_ text;
begin
 s:=pg_get_functiondef('private.sf_disruption_candidate(public.shift_assignments,uuid,timestamptz,timestamptz)'::regprocedure);
 s:=replace(s,'exception_ boolean:=false;','exception_ boolean:=false;month_ date;');
 s:=replace(s,$old$lower(a.shift_code)='teamleiter'$old$,$new$a.shift_code ~* '^(TL-LE|TL-RE|TEAMLEITER)$'$new$);
 old_:='err_:=private.sf_manual_nonrhythm_scope_error';
 if position(old_ in s)=0 then raise exception 'Unexpected disruption validator definition';end if;
 s:=replace(s,old_,$code$if exists(select 1 from public.shift_templates t where t.company_id=a.company_id and t.code=a.shift_code and t.responsible_only and t.responsible_employee_id is distinct from e.id) then return jsonb_build_object('block','Nur die hinterlegte verantwortliche Person ist für diesen Dienst freigegeben.');end if;
 err_:=private.sf_manual_nonrhythm_scope_error$code$);
 old_:='exception when check_violation or raise_exception then return jsonb_build_object(''block'',sqlerrm);end;';
 if position(old_ in s)=0 then raise exception 'Unexpected disruption rule exception definition';end if;
 s:=replace(s,old_,$code$
  for month_ in select d::date from generate_series(date_trunc('month',starts_ at time zone tz_),date_trunc('month',(ends_-interval '1 microsecond') at time zone tz_),interval '1 month') d loop
   perform private.sf_assert_month_planning_limits(a.company_id,e.id,month_,a.id,starts_,ends_);
  end loop;
 exception when check_violation or raise_exception then
 return jsonb_build_object('block',case sqlerrm
  when 'Shift overlaps another assignment' then 'Bereits ein anderer Dienst im Zeitraum.'
  when 'Shift overlaps an approved absence' then 'Genehmigte Abwesenheit im Zeitraum.'
  when 'Standard minimum rest period not met before shift' then 'Ruhezeit vor dem Dienst reicht nicht aus.'
  when 'Standard minimum rest period not met after shift' then 'Ruhezeit nach dem Dienst reicht nicht aus.'
  when 'Standard maximum shift duration exceeded' then 'Die zulässige Dienstdauer wird überschritten.'
  else sqlerrm end);end;
 $code$);
 execute s;
 s:=pg_get_functiondef('private.manager_list_disruption_candidates_impl(uuid)'::regprocedure);
 old_:='and e.auth_user_id is not null';
 if position(old_ in s)=0 then raise exception 'Unexpected disruption candidate definition';end if;
 execute replace(s,old_,old_||' and e.access_status=''ACTIVE'' and e.deleted_at is null');
 s:=pg_get_functiondef('private.sf_send_disruption_offers(uuid,uuid[],boolean)'::regprocedure);
 old_:='if v_employee.id is null or v_employee.auth_user_id is null then';
 if position(old_ in s)=0 then raise exception 'Unexpected disruption offer definition';end if;
 execute replace(s,old_,'if v_employee.id is null or v_employee.auth_user_id is null or v_employee.access_status is distinct from ''ACTIVE'' or v_employee.deleted_at is not null then');
 s:=pg_get_functiondef('private.employee_respond_disruption_offer_impl(uuid,text,text)'::regprocedure);
 old_:='if exists(select 1 from public.company_compliance_policy where company_id=v_incident.company_id and works_council_enabled) then';
 new_:=$code$
  v_reason:=private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'block';
  if v_reason is not null then raise exception '%',v_reason;end if;
  if coalesce((private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) then
   raise exception 'Der Rhythmus hat sich geändert. Bitte die Disposition um eine neue Prüfung bitten.';
  end if;
 $code$||old_;
 if position(old_ in s)=0 then raise exception 'Unexpected disruption response definition';end if;
 s:=replace(s,old_,new_);
 -- Keep private absence notes in the incident, not in the replacement's change request.
 s:=replace(s,'||case when v_incident.note<>'''' then '' · ''||v_incident.note else '''' end','');
 execute s;
 -- Include the authoritative shift location in the preview, rather than a cached client lookup.
 s:=pg_get_functiondef('private.manager_disruption_replacement_impl(uuid,uuid,jsonb)'::regprocedure);
 old_:='''break_minutes'',a.break_minutes,''has_time_entries''';
 new_:='''break_minutes'',a.break_minutes,''site'',(select l.name from public.shift_templates t left join public.company_locations l on l.id=t.site_id and l.company_id=t.company_id where t.company_id=a.company_id and t.code=a.shift_code),''has_time_entries''';
 if position(old_ in s)=0 then raise exception 'Unexpected disruption preview definition';end if;
 execute replace(s,old_,new_);
end $patch$;

-- Trigger-only writer: no client can execute it or create notifications directly.
create or replace function private.sf_disruption_status_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare user_ uuid;employee_ uuid;
begin
 if tg_table_name='disruption_offers' and new.status='DECLINED' and old.status is distinct from new.status then
  perform private.sf_notify_managers(new.company_id,'DISRUPTION_RESPONSE','Ersatzanfrage abgelehnt',
   'Eine Ersatzanfrage wurde abgelehnt. Bitte die verbleibende Besetzungslücke prüfen.',
   'disruptions','disruption_offer',new.id,jsonb_build_object('incidentId',new.incident_id));
 elsif tg_table_name='disruption_incidents' and new.status='RESOLVED' and old.status is distinct from new.status then
  select e.auth_user_id,e.id into user_,employee_ from public.employees e
   where e.id=new.original_employee_id and e.company_id=new.company_id and e.status='active' and e.access_status='ACTIVE';
  perform private.sf_put_notification(new.company_id,user_,employee_,'DISRUPTION_REPLACED','Vertretung eingetragen',
   'Für deinen betroffenen Dienst wurde eine Vertretung eingetragen. Den aktuellen Stand findest du im Dienstplan.',
   'employee-shifts','disruption_incident',new.id,'{}');
 end if;
 return new;
end $$;
revoke all on function private.sf_disruption_status_notification() from public,anon,authenticated;
create trigger sf_disruption_offer_response_notification after update of status on public.disruption_offers
for each row execute function private.sf_disruption_status_notification();
create trigger sf_disruption_resolution_notification after update of status on public.disruption_incidents
for each row execute function private.sf_disruption_status_notification();
