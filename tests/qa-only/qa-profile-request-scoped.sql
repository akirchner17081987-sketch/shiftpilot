-- QA ONLY: use selected company for profile correction requests.
CREATE OR REPLACE FUNCTION private.qa_submit_profile_request_scoped(p_company uuid, p_category text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employees%rowtype; rid uuid; member record; msg text:=btrim(coalesce(p_message,''));
begin
  select * into strict e from public.employees where id=private.qa_employee_identity(p_company);
  if p_category is null or p_category not in ('personal','contact','employment','planning','qualifications','other') or length(msg) not between 5 and 2000 then
    raise exception 'Bitte Bereich und eine Beschreibung mit 5 bis 2000 Zeichen angeben' using errcode='22023';end if;
  -- Serializes retries and the daily limit for this employee.
  perform pg_advisory_xact_lock(hashtextextended(e.id::text,217));
  if exists(select 1 from private.employee_profile_requests where employee_id=e.id and category=p_category and status='pending') then
    raise exception 'Für diesen Bereich besteht bereits eine offene Anfrage' using errcode='23505';end if;
  if (select count(*) from private.employee_profile_requests where employee_id=e.id and created_at>now()-interval '24 hours')>=20 then
    raise exception 'Heute wurden bereits viele Anfragen gesendet. Bitte die Leitung kontaktieren' using errcode='22023';end if;
  insert into private.employee_profile_requests(company_id,employee_id,category,message,created_by)
    values(e.company_id,e.id,p_category,msg,auth.uid()) returning id into rid;
  for member in select user_id from public.company_members where company_id=e.company_id and status='ACTIVE' and role in('OWNER','ADMIN') loop
    perform private.sf_put_notification(e.company_id,member.user_id,null,'PROFILE_REQUESTED','Profiländerung angefragt',
      concat(e.first_name,' ',e.last_name,' hat eine Korrektur der eigenen Angaben angefragt.'),'employees','profile_request',rid,jsonb_build_object('employee_id',e.id));
  end loop;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
    values(e.company_id,'PROFILE_REQUESTED','profile_request',rid,auth.uid(),'EMPLOYEE',jsonb_build_object('category',p_category,'status','pending'));
  return rid;
end;$function$
;

revoke all on function private.qa_submit_profile_request_scoped(uuid,text,text) from public,anon;
grant execute on function private.qa_submit_profile_request_scoped(uuid,text,text) to authenticated;
create function public.qa_submit_profile_request_scoped(p_company uuid,p_category text,p_message text)
returns uuid language sql set search_path='' as $$select private.qa_submit_profile_request_scoped(p_company,p_category,p_message)$$;
revoke all on function public.qa_submit_profile_request_scoped(uuid,text,text) from public,anon;
grant execute on function public.qa_submit_profile_request_scoped(uuid,text,text) to authenticated;

