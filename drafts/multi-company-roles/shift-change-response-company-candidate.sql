-- Draft: scope approval to the active employee in the request company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION public.employee_respond_to_shift_change(p_change_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, applied boolean, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.shift_change_requests%rowtype;
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_status text;
  v_assignment uuid;
  v_apply_error text;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
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
      and e.company_id = r.company_id
      and e.id = private.sf_employee_identity_for_company(r.company_id)
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
$function$
;
