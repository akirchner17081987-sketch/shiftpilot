-- Draft: production profile functionality with explicit company identity.
CREATE OR REPLACE FUNCTION private.sf_employee_company_profile_impl(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employees%rowtype; c public.companies%rowtype; team text; rhythm jsonb; today date;
begin
  select * into strict e from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
  select * into c from public.companies where id=e.company_id;
  today:=(statement_timestamp() at time zone c.timezone)::date;
  select substring(q from length('__sp:planningTeam=')+1) into team from unnest(e.qualifications) q where q like '__sp:planningTeam=%' limit 1;
  select jsonb_build_object('team',t.team_code,'start',t.start_date,'pattern',t.pattern,'offset',t.start_offset,'mode','required','central',true)
    into rhythm from public.company_planning_teams t where t.company_id=e.company_id and t.team_code=team;
  if rhythm is null then
    select jsonb_build_object('team',coalesce(team,''),'start',coalesce(max(substring(q from length('__sp:rhythmStart=')+1)) filter(where q like '__sp:rhythmStart=%'),''),
      'pattern',case when coalesce(max(substring(q from length('__sp:rhythmPattern=')+1)) filter(where q like '__sp:rhythmPattern=%'),'')='' then array[]::text[] else regexp_split_to_array(upper(max(substring(q from length('__sp:rhythmPattern=')+1)) filter(where q like '__sp:rhythmPattern=%')),'\s*[,;]\s*') end,
      'mode',case when team in ('A','B','C','D','E') then 'required' else coalesce(max(substring(q from length('__sp:rhythmMode=')+1)) filter(where q like '__sp:rhythmMode=%'),'off') end,'central',false)
      into rhythm from unnest(e.qualifications) q;
    rhythm:=rhythm||jsonb_build_object('offset',case when team in ('A','B','C','D','E') then floor((ascii(team)-ascii('A'))*jsonb_array_length(rhythm->'pattern')/5.0)::integer else 0 end);
  end if;
  if team in ('A','B','C','D','E') then
    rhythm:=jsonb_set(rhythm,'{pattern}',(select coalesce(jsonb_agg(coalesce((select s.code from public.shift_templates s
      where s.company_id=e.company_id and s.active and s.requires_planning_team and s.rhythm_alias=upper(trim(a.x))
      order by s.sort_order,s.code limit 1),a.x) order by a.n),'[]'::jsonb)
      from jsonb_array_elements_text(rhythm->'pattern') with ordinality a(x,n)));
  end if;
  return jsonb_build_object('employee',jsonb_build_object('id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,
    'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,'start_date',e.start_date,'contract_end',e.contract_end,'birth_date',e.birth_date,
    'email',e.email,'phone',e.phone,'address',e.address,'zip',e.zip,'city',e.city,'work_time_model',e.work_time_model,'updated_at',e.updated_at,
    'shift_permissions',e.shift_permissions,'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q not like '__sp:%' and not(q=any(e.shift_permissions))),'[]'::jsonb)),
    'company',jsonb_build_object('id',c.id,'name',c.name,'timezone',c.timezone),'as_of',statement_timestamp(),'today',today,
    'login_email',(select email from auth.users where id=auth.uid()),'rhythm',rhythm,
    'details',coalesce((select jsonb_build_object('department',d.department,'job_title',d.job_title,'work_location',d.work_location,'probation_end',d.probation_end)
      from public.employee_personnel_details d where d.employee_id=e.id and d.company_id=e.company_id),'{}'::jsonb),
    'qualifications',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'category',q.category,'title',q.title,'issuer',q.issuer,'issued_on',q.issued_on,'expires_on',q.expires_on,
      'days_until_expiry',q.expires_on-today) order by q.expires_on nulls last,q.title) from public.employee_personnel_qualifications q where q.employee_id=e.id and q.company_id=e.company_id),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'default_start',s.default_start,'default_end',s.default_end,'active',s.active) order by s.sort_order,s.code)
      from public.shift_templates s where s.company_id=e.company_id and(s.active or s.code=any(e.shift_permissions))),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)-'created_by'-'reviewed_by'-'company_id' order by created_at desc) from
      (select * from private.employee_profile_requests where employee_id=e.id and company_id=e.company_id order by (status='pending') desc,created_at desc limit 100) r),'[]'::jsonb));
end;$function$
;
CREATE OR REPLACE FUNCTION private.sf_employee_company_profile_request_impl(p_company uuid, p_category text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employees%rowtype; rid uuid; member record; msg text:=btrim(coalesce(p_message,''));
begin
  select * into strict e from public.employees where id=private.sf_employee_identity_for_company(p_company) and company_id=p_company;
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

-- Legacy profile operations may only choose a company when exactly one profile is active.
create or replace function private.employee_profile_identity_impl()
returns public.employees language plpgsql stable security definer set search_path='' as $fn$
declare e public.employees%rowtype; selected_company uuid;
begin
 selected_company:=private.sf_single_active_employee_company();
 select * into strict e from public.employees where id=private.sf_employee_identity_for_company(selected_company) and company_id=selected_company;
 return e;
end $fn$;
create or replace function public.employee_company_profile(p_company uuid) returns jsonb
language sql stable set search_path='' as $fn$ select private.sf_employee_company_profile_impl(p_company) $fn$;
create or replace function public.employee_company_profile_request(p_company uuid,p_category text,p_message text) returns uuid
language sql set search_path='' as $fn$ select private.sf_employee_company_profile_request_impl(p_company,p_category,p_message) $fn$;
revoke all on function private.sf_employee_company_profile_impl(uuid) from public,anon;
revoke all on function private.sf_employee_company_profile_request_impl(uuid,text,text) from public,anon;
revoke all on function public.employee_company_profile(uuid) from public,anon;
revoke all on function public.employee_company_profile_request(uuid,text,text) from public,anon;
grant execute on function private.sf_employee_company_profile_impl(uuid) to authenticated;
grant execute on function private.sf_employee_company_profile_request_impl(uuid,text,text) to authenticated;
grant execute on function public.employee_company_profile(uuid) to authenticated;
grant execute on function public.employee_company_profile_request(uuid,text,text) to authenticated;
