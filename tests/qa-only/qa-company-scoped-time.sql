-- QA ONLY: copy the current time submission with explicit company selection.
CREATE OR REPLACE FUNCTION private.qa_submit_time_entry_scoped(p_company uuid, p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  v_employee:=private.qa_employee_identity(p_company);
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
$function$
;
revoke all on function private.qa_submit_time_entry_scoped(uuid,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function private.qa_submit_time_entry_scoped(uuid,uuid,timestamptz,timestamptz,integer,text) to authenticated;
create function public.qa_submit_time_entry_scoped(p_company uuid,p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer,p_note text) returns jsonb language sql set search_path='' as $$select private.qa_submit_time_entry_scoped(p_company,p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note)$$;
revoke all on function public.qa_submit_time_entry_scoped(uuid,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.qa_submit_time_entry_scoped(uuid,uuid,timestamptz,timestamptz,integer,text) to authenticated;


