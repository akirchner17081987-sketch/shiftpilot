create or replace function private.manager_review_time_entry_impl(
  p_assignment_id uuid,
  p_decision text,
  p_comment text default ''
) returns table(status text,message text,version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  te public.time_entries%rowtype;
  old_te public.time_entries%rowtype;
  v_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_decision not in ('CONFIRM','CORRECTION') then raise exception 'Decision must be CONFIRM or CORRECTION'; end if;
  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=a.company_id and cm.user_id=v_user and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für die Zeiterfassung'; end if;
  select * into te from public.time_entries where assignment_id=a.id for update;
  if not found then raise exception 'Noch keine Ist-Zeit vorhanden'; end if;
  old_te:=te;
  select emp.* into e from public.employees emp where emp.id=a.employee_id;

  if v_decision='CONFIRM' then
    if te.actual_start is null or te.actual_end is null then raise exception 'Unvollständige Ist-Zeit kann nicht bestätigt werden'; end if;
    update public.time_entries t set status='confirmed',confirmed_by=v_user,confirmed_at=now(),manager_note=left(coalesce(p_comment,''),1000),
      correction_requested_by=null,correction_requested_at=null,correction_note='',updated_by=v_user,updated_at=now(),version=t.version+1
    where t.assignment_id=a.id returning t.* into te;
    perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,'TIME_ENTRY_CONFIRMED','Arbeitszeit bestätigt',
      'Deine Ist-Zeit für '||a.shift_code||' wurde bestätigt.','employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status','confirmed'));
  else
    if length(trim(coalesce(p_comment,'')))<3 then raise exception 'Bitte einen kurzen Korrekturhinweis angeben'; end if;
    update public.time_entries t set status='correction_requested',correction_requested_by=v_user,correction_requested_at=now(),correction_note=left(p_comment,1000),
      manager_note=left(p_comment,1000),confirmed_by=null,confirmed_at=null,updated_by=v_user,updated_at=now(),version=t.version+1
    where t.assignment_id=a.id returning t.* into te;
    perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,'TIME_ENTRY_CORRECTION','Korrektur der Arbeitszeit erforderlich',
      'Bitte prüfe deine Ist-Zeit für '||a.shift_code||'. Hinweis: '||left(p_comment,500),
      'employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status','correction_requested'));
  end if;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,case when v_decision='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',a.id,v_user,v_role,
    jsonb_build_object('status',old_te.status,'version',old_te.version),
    jsonb_build_object('status',te.status,'version',te.version),
    jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));

  return query select te.status,case when v_decision='CONFIRM' then 'Ist-Zeit bestätigt.' else 'Korrektur wurde angefordert.' end,te.version;
end
$$;;
