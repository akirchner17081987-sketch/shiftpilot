create or replace function public.apply_shift_change(p_change_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  r public.shift_change_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_id uuid;
  v_employee uuid;
  v_type text;
  v_start timestamptz;
  v_end timestamptz;
  v_break integer;
  v_note text;
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_manager boolean := false;
  v_employee_owner boolean := false;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select * into r
  from public.shift_change_requests
  where id = p_change_id
  for update;
  if not found then raise exception 'Change request not found'; end if;

  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = r.company_id
    and cm.user_id = v_actor
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER')
  limit 1;
  v_manager := v_actor_role is not null;

  if not v_manager then
    select exists(
      select 1 from public.employees e
      where e.id = r.employee_id
        and e.auth_user_id = v_actor
        and e.status = 'active'
    ) into v_employee_owner;
    if v_employee_owner then v_actor_role := 'EMPLOYEE'; end if;
  end if;

  if not v_manager and not v_employee_owner then raise exception 'Not authorized'; end if;
  if r.status <> 'READY_TO_APPLY' then raise exception 'Change request is not READY_TO_APPLY'; end if;
  if r.compliance_status = 'BLOCK' then raise exception 'Blocked compliance request cannot be applied'; end if;

  if r.requires_employee_approval and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id = r.id and x.approval_type = 'EMPLOYEE' and x.status = 'APPROVED'
  ) then raise exception 'Employee approval missing'; end if;

  if r.requires_works_council and not exists(
    select 1 from public.shift_change_approvals x
    where x.change_request_id = r.id and x.approval_type = 'WORKS_COUNCIL' and x.status = 'APPROVED'
  ) then raise exception 'Works council approval missing'; end if;

  if exists(select 1 from public.compliance_findings f where f.change_request_id = r.id and f.status = 'BLOCK') then
    raise exception 'Blocking compliance finding exists';
  end if;

  if r.action in ('UPDATE','DELETE') then
    select * into a from public.shift_assignments where id = r.assignment_id for update;
    if not found then
      update public.shift_change_requests set status = 'SUPERSEDED' where id = r.id;
      raise exception 'Original assignment no longer exists';
    end if;
    if a.version <> r.base_version then
      update public.shift_change_requests set status = 'SUPERSEDED' where id = r.id;
      raise exception 'Assignment version changed';
    end if;
  end if;

  if r.action in ('CREATE','UPDATE') then
    v_employee := (r.proposed_snapshot->>'employeeId')::uuid;
    v_type := r.proposed_snapshot->>'type';
    v_start := (r.proposed_snapshot->>'startsAt')::timestamptz;
    v_end := (r.proposed_snapshot->>'endsAt')::timestamptz;
    v_break := coalesce((r.proposed_snapshot->>'breakMinutes')::integer,0);
    v_note := coalesce(r.proposed_snapshot->>'note','');
    perform public.assert_standard_shift_rules(r.company_id,v_employee,v_start,v_end,case when r.action='UPDATE' then r.assignment_id else null end);
  end if;

  if r.action = 'UPDATE' then
    update public.shift_assignments
      set employee_id=v_employee,shift_code=v_type,starts_at=v_start,ends_at=v_end,
          break_minutes=v_break,note=v_note,version=version+1,last_change_request_id=r.id
      where id=r.assignment_id returning id into v_id;
  elsif r.action = 'CREATE' then
    insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,status,published_at,version,last_change_request_id,created_by)
    values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,'PUBLISHED',now(),1,r.id,v_actor)
    returning id into v_id;
  else
    v_id := r.assignment_id;
    update public.shift_assignments
      set status='CANCELLED',version=version+1,last_change_request_id=r.id
      where id=r.assignment_id;
  end if;

  update public.shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(r.company_id,'SHIFT_CHANGE_APPLIED','shift_change_request',r.id,v_actor,v_actor_role,r.old_snapshot,r.proposed_snapshot,jsonb_build_object('assignment_id',v_id,'action',r.action));
  return v_id;
end
$function$;

create or replace function public.employee_respond_to_shift_change(
  p_change_id uuid,
  p_decision text,
  p_comment text default ''
)
returns table(status text, applied boolean, message text, assignment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  r public.shift_change_requests%rowtype;
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_status text;
  v_assignment uuid;
  v_apply_error text;
begin
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
$function$;

revoke all on function public.apply_shift_change(uuid) from public, anon;
grant execute on function public.apply_shift_change(uuid) to authenticated;
revoke all on function public.employee_respond_to_shift_change(uuid,text,text) from public, anon;
grant execute on function public.employee_respond_to_shift_change(uuid,text,text) to authenticated;;
