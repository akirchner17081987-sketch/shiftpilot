-- Isolated QA database only. Install production-derived dependencies within a rolled-back transaction.
begin;
CREATE OR REPLACE FUNCTION private.sf_paid_time_ranges(p_company_id uuid, p_employee_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(employee_id uuid, paid_range tstzrange)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with accepted as (
    select e.id employee_id,te.actual_start a,
      te.actual_end-make_interval(mins=>greatest(0,te.break_minutes)) b
    from public.time_entries te
    join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id
    join public.employees e on e.id=sa.employee_id and e.company_id=te.company_id
    where te.company_id=p_company_id and (p_employee_id is null or e.id=p_employee_id)
      and te.status='confirmed' and te.actual_start is not null and te.actual_end is not null
      and te.actual_end<=statement_timestamp() and te.actual_start<p_to and te.actual_end>p_from
    union all
    select s.employee_id,s.started_at,s.ended_at
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
    where s.company_id=p_company_id and (p_employee_id is null or s.employee_id=p_employee_id)
      and s.ended_at is not null and s.ended_at<=statement_timestamp()
      and s.started_at<p_to and s.ended_at>p_from
  ), clipped as (
    select employee_id,case when least(b,p_to)>greatest(a,p_from)
      then tstzrange(greatest(a,p_from),least(b,p_to),'[)') else 'empty'::tstzrange end r
    from accepted where p_to>p_from
  )
  select employee_id,unnest(range_agg(r)) from clipped where not isempty(r) group by employee_id;
$function$
;
CREATE OR REPLACE FUNCTION private.sf_paid_work_seconds(p_employee_id uuid, p_from date, p_to date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(extract(epoch from(upper(r.paid_range)-lower(r.paid_range)))),0)
  from public.employees e join public.companies c on c.id=e.company_id
  cross join lateral private.sf_paid_time_ranges(e.company_id,e.id,
    p_from::timestamp at time zone coalesce(c.timezone,'Europe/Berlin'),
    (p_to+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin')) r
  where e.id=p_employee_id and p_to>=p_from;
$function$
;
-- Derived from production functions; require an explicitly authorized company.
CREATE OR REPLACE FUNCTION private.sf_employee_identity_for_company(p_company uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
declare v_ids uuid[];
begin
 if auth.uid() is null or p_company is null or private.sf_has_time_only_login() then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
 select array_agg(e.id) into v_ids from public.employees e where e.company_id=p_company and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
 and not exists(select 1 from public.company_members m where m.company_id=e.company_id and m.user_id=auth.uid() and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)));
 if coalesce(cardinality(v_ids),0)<>1 then raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return v_ids[1];
end $$;
CREATE OR REPLACE FUNCTION private.sf_confirmed_work_minutes(p_employee_id uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_month date; v_end date; v_from date; v_to date; v_snapshot jsonb; v_seconds numeric:=0; v_saved jsonb;
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select company_id into v_company from public.employees where id=p_employee_id;
  if v_company is null then return 0; end if;
  if auth.uid() is not null and not private.sf_can_manage_time(v_company)
    and private.sf_employee_identity_for_company(v_company) is distinct from p_employee_id then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  for v_month in select d::date from generate_series(date_trunc('month',p_from),date_trunc('month',p_to),interval '1 month') d loop
    v_end:=(v_month+interval '1 month - 1 day')::date;
    v_from:=greatest(v_month,p_from);v_to:=least(v_end,p_to);v_saved:=null;
    select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=v_month and status='CLOSED';
    if v_snapshot is not null and v_from=v_month and v_to=v_end then
      select x into v_saved from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=p_employee_id::text limit 1;
    end if;
    if v_saved is not null then v_seconds:=v_seconds+coalesce((v_saved->>'confirmed_work_minutes')::numeric,0)*60;
    elsif v_snapshot is not null then
      v_seconds:=v_seconds+(select coalesce(sum(coalesce((x->>'confirmed_actual_minutes')::numeric,0)),0)*60
        from jsonb_array_elements(coalesce(v_snapshot#>'{report,details}',v_snapshot->'details','[]'::jsonb)) x
        where x->>'employee_id'=p_employee_id::text and (x->>'work_date')::date between v_from and v_to);
    else v_seconds:=v_seconds+private.sf_paid_work_seconds(p_employee_id,v_from,v_to); end if;
  end loop;
  return round(v_seconds/60)::integer;
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_employee_company_time_account_month(p_company uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_identity_for_company(p_company); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb; v_snapshot jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  v_company:=p_company;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=v_company and month_start=date_trunc('month',coalesce(p_month,current_date))::date and status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(coalesce(v_snapshot#>'{accounts,rows}',v_snapshot->'employees','[]'::jsonb)) x where x->>'employee_id'=v_employee::text limit 1;
    if v_row is not null then return v_row||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,'federal_state',coalesce(v_snapshot#>>'{accounts,settings,federal_state}','DE'),'holidays',coalesce(v_snapshot#>'{report,holidays}',v_snapshot->'holidays','[]'::jsonb)); end if;
  end if;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=v_company;
  v_state:=coalesce(v_state,'DE');
  select to_jsonb(r) into v_row from private.sf_time_account_rows(v_company,p_month,v_employee) r;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from coalesce(p_month,current_date))::integer,v_state) h
    where h.holiday_date>=date_trunc('month',coalesce(p_month,current_date))::date
      and h.holiday_date<(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  return coalesce(v_row,'{}'::jsonb)||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,
    'federal_state',v_state,'holidays',v_holidays);
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_employee_company_submit_time_entry(p_company uuid, p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  v_employee:=private.sf_employee_identity_for_company(p_company);
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
$function$;

REVOKE ALL ON FUNCTION private.sf_employee_identity_for_company(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sf_employee_company_time_account_month(uuid,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_company_time_account_month(uuid,date),private.sf_employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.employee_company_time_account_month(p_company uuid,p_month date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT private.sf_employee_company_time_account_month(p_company,p_month) $$;
CREATE OR REPLACE FUNCTION public.employee_company_submit_time_entry(p_company uuid,p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer,p_note text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT private.sf_employee_company_submit_time_entry(p_company,p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note) $$;
REVOKE ALL ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_company_time_account_month(uuid,date),public.employee_company_submit_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text) TO authenticated;
-- The selected company is verified before returning or changing employee profile data.
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
REVOKE ALL ON FUNCTION private.sf_employee_company_profile_impl(uuid),private.sf_employee_company_profile_request_impl(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_employee_company_profile_impl(uuid),private.sf_employee_company_profile_request_impl(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.employee_company_profile(p_company uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT private.sf_employee_company_profile_impl(p_company)$$;
CREATE OR REPLACE FUNCTION public.employee_company_profile_request(p_company uuid,p_category text,p_message text) RETURNS uuid LANGUAGE sql SET search_path='' AS $$SELECT private.sf_employee_company_profile_request_impl(p_company,p_category,p_message)$$;
REVOKE ALL ON FUNCTION public.employee_company_profile(uuid),public.employee_company_profile_request(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_company_profile(uuid),public.employee_company_profile_request(uuid,text,text) TO authenticated;

do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ra uuid; rb uuid; denied boolean; data jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-profile-'||u::text||'@example.invalid','{}'),(other,'qa-profile-other-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA C',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','A',u,'ACTIVE'),(eb,b,'QA','B','B',u,'ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 data:=public.employee_company_profile(a);if data->'employee'->>'id'<>ea::text or data->'company'->>'id'<>a::text then raise exception 'Wrong profile A';end if;
 data:=public.employee_company_profile(b);if data->'employee'->>'id'<>eb::text or data->'company'->>'id'<>b::text then raise exception 'Wrong profile B';end if;
 denied:=false;begin perform public.employee_company_profile(c);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign profile accessible';end if;
 ra:=public.employee_company_profile_request(a,'contact','Bitte Daten ändern');rb:=public.employee_company_profile_request(b,'contact','Bitte Daten ändern');
 denied:=false;begin perform public.employee_company_profile_request(c,'contact','Bitte Daten ändern');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company accepted'; end if;
 denied:=false;begin perform public.employee_company_profile_request(a,'contact','Bitte Daten ändern');exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate request accepted'; end if;
 perform set_config('role','postgres',true);
 if not exists(select 1 from private.employee_profile_requests where id=ra and employee_id=ea and company_id=a) or not exists(select 1 from private.employee_profile_requests where id=rb and employee_id=eb and company_id=b) then raise exception 'Wrong employee profile'; end if;
 update public.employees set access_status='DISABLED' where id=eb;perform set_config('role','authenticated',true);
 denied:=false;begin perform public.employee_company_profile(b);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Disabled profile visible';end if;
 denied:=false;begin perform public.employee_company_profile_request(b,'other','Bitte Daten ändern');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled company accepted'; end if;
 perform set_config('role','postgres',true);
end $test$;

rollback;
