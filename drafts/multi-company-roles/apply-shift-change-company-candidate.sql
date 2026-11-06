-- Draft only, based on the production definition inspected on 06.11.2026.
-- Requires company-options-candidate.sql. Review the current production definition
-- and all application paths before the combined release.
CREATE OR REPLACE FUNCTION public.apply_shift_change(p_change_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select 1 from private.sf_employee_company_options() o
      where o.company_id = r.company_id
        and o.employee_id = r.employee_id
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
          break_minutes=v_break,note=v_note,rhythm_override=nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),version=version+1,last_change_request_id=r.id
      where id=r.assignment_id returning id into v_id;
  elsif r.action = 'CREATE' then
    insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,rhythm_override,status,published_at,version,last_change_request_id,created_by)
    values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),'PUBLISHED',now(),1,r.id,v_actor)
    returning id into v_id;
  else
    v_id := r.assignment_id;
    update public.shift_assignments
      set status='CANCELLED',version=version+1,last_change_request_id=r.id
      where id=r.assignment_id;
  end if;

  update public.shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  -- Assignment and APPLIED request changes are captured by existing audit triggers.
  return v_id;
end
$function$
;

