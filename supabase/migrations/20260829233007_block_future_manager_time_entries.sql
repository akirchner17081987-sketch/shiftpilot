create or replace function private.manager_save_time_entry_impl(
  p_assignment_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer,
  p_note text default '',
  p_confirm boolean default false
) returns table(status text,message text,version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  old_te public.time_entries%rowtype;
  new_te public.time_entries%rowtype;
  v_role text;
  v_break integer := greatest(0,coalesce(p_break_minutes,0));
  v_minutes numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id for update;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=a.company_id and cm.user_id=v_user and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für die Zeiterfassung'; end if;
  if p_actual_start is null or p_actual_end is null or p_actual_end<=p_actual_start then raise exception 'Ungültige Ist-Zeit'; end if;
  if p_actual_start>now()+interval '5 minutes' or p_actual_end>now()+interval '5 minutes' then raise exception 'Ist-Zeit darf nicht in der Zukunft liegen'; end if;
  if p_actual_end-p_actual_start>interval '24 hours' then raise exception 'Arbeitszeit über 24 Stunden ist nicht plausibel'; end if;
  if p_actual_start<a.starts_at-interval '24 hours' or p_actual_end>a.ends_at+interval '36 hours' then raise exception 'Die Ist-Zeit liegt zu weit außerhalb der geplanten Schicht'; end if;
  v_minutes:=extract(epoch from(p_actual_end-p_actual_start))/60.0;
  if v_break>floor(v_minutes) then raise exception 'Die Pause darf nicht länger als die Arbeitszeit sein'; end if;
  select emp.* into e from public.employees emp where emp.id=a.employee_id;
  select * into old_te from public.time_entries where assignment_id=a.id for update;

  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,updated_by,updated_at,
    employee_note,manager_note,source,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,correction_note,version
  ) values(
    a.id,a.company_id,p_actual_start,p_actual_end,v_break,case when p_confirm then 'confirmed' else 'recorded' end,v_user,now(),
    coalesce(old_te.employee_note,''),left(coalesce(p_note,''),1000),'MANAGER',coalesce(old_te.submitted_at,now()),
    case when p_confirm then v_user else null end,case when p_confirm then now() else null end,
    null,null,'',case when old_te.assignment_id is null then 1 else old_te.version+1 end
  )
  on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,break_minutes=excluded.break_minutes,
    status=excluded.status,updated_by=v_user,updated_at=now(),manager_note=excluded.manager_note,source='MANAGER',
    submitted_at=coalesce(public.time_entries.submitted_at,now()),confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,correction_note='',version=public.time_entries.version+1
  returning * into new_te;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,'TIME_ENTRY_MANAGER_UPDATED','time_entry',a.id,v_user,v_role,
    case when old_te.assignment_id is null then null else jsonb_build_object('actualStart',old_te.actual_start,'actualEnd',old_te.actual_end,'breakMinutes',old_te.break_minutes,'status',old_te.status,'version',old_te.version) end,
    jsonb_build_object('actualStart',new_te.actual_start,'actualEnd',new_te.actual_end,'breakMinutes',new_te.break_minutes,'status',new_te.status,'version',new_te.version),
    jsonb_build_object('comment',left(coalesce(p_note,''),1000),'confirmed',p_confirm));

  perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,
    case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_UPDATED' end,
    case when p_confirm then 'Arbeitszeit bestätigt' else 'Arbeitszeit aktualisiert' end,
    case when p_confirm then 'Deine Ist-Zeit für '||a.shift_code||' wurde bestätigt.' else 'Die Verwaltung hat deine Ist-Zeit für '||a.shift_code||' aktualisiert.' end,
    'employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status',new_te.status));

  return query select new_te.status,case when p_confirm then 'Ist-Zeit gespeichert und bestätigt.' else 'Ist-Zeit gespeichert.' end,new_te.version;
end
$$;;
