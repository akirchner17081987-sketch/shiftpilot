-- Own profile, limited public-facing personnel data and an audited correction queue.
-- No direct table access and no automatic contract or login changes.
create table private.employee_profile_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null check(category in ('personal','contact','employment','planning','qualifications','other')),
  message text not null check(length(btrim(message)) between 5 and 2000),
  status text not null default 'pending' check(status in ('pending','completed','rejected')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  check((status='pending' and reviewed_by is null and reviewed_at is null) or
    (status<>'pending' and reviewed_by is not null and reviewed_at is not null and length(btrim(review_note)) between 5 and 2000))
);
alter table private.employee_profile_requests enable row level security;
revoke all on private.employee_profile_requests from public,anon,authenticated;
create policy profile_requests_rpc_only on private.employee_profile_requests to authenticated using(false) with check(false);
create unique index profile_requests_one_pending on private.employee_profile_requests(employee_id,category) where status='pending';
create index profile_requests_employee_history on private.employee_profile_requests(employee_id,created_at desc);
create index profile_requests_company_queue on private.employee_profile_requests(company_id,status,created_at desc);

create function private.employee_profile_identity_impl()
returns public.employees language plpgsql stable security definer set search_path='' as $$
declare e public.employees%rowtype;
begin
  if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Mitarbeiterzugang' using errcode='42501';end if;
  select * into e from public.employees where auth_user_id=auth.uid() and status='active' and access_status='ACTIVE' and deleted_at is null order by id limit 1;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';end if;
  return e;
end;$$;

create function private.employee_my_profile_impl()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees%rowtype; c public.companies%rowtype; team text; rhythm jsonb; today date;
begin
  e:=private.employee_profile_identity_impl();
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
end;$$;

create function private.employee_submit_profile_request_impl(p_category text,p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.employees%rowtype; rid uuid; member record; msg text:=btrim(coalesce(p_message,''));
begin
  e:=private.employee_profile_identity_impl();
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
end;$$;

create function private.manager_profile_requests_impl(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.sf_is_manager(p_company_id,true) then raise exception 'Nur die Personalverwaltung darf Profilanfragen bearbeiten' using errcode='42501';end if;
  return jsonb_build_object('company_id',p_company_id,'pending_count',(select count(*) from private.employee_profile_requests where company_id=p_company_id and status='pending'),
    'requests',coalesce((select jsonb_agg(to_jsonb(r) order by (r.status='pending') desc,r.created_at desc) from
      (select q.id,q.employee_id,q.category,q.message,q.status,q.created_at,q.review_note,q.reviewed_at,e.first_name,e.last_name,e.personnel_no,e.status employee_status
       from private.employee_profile_requests q join public.employees e on e.id=q.employee_id and e.company_id=q.company_id
       where q.company_id=p_company_id order by (q.status='pending') desc,q.created_at desc limit 500) r),'[]'::jsonb));
end;$$;

create function private.manager_review_profile_request_impl(p_request_id uuid,p_status text,p_review_note text,p_confirm_applied boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare q private.employee_profile_requests%rowtype; e public.employees%rowtype; note text:=btrim(coalesce(p_review_note,''));
begin
  select * into q from private.employee_profile_requests where id=p_request_id;
  if auth.uid() is null or q.id is null or not private.sf_is_manager(q.company_id,true) then raise exception 'Keine Berechtigung für diese Profilanfrage' using errcode='42501';end if;
  if p_status is null or p_status not in ('completed','rejected') or length(note) not between 5 and 2000 or (p_status='completed' and not coalesce(p_confirm_applied,false)) then
    raise exception 'Bitte Ergebnis erläutern und die Umsetzung gegebenenfalls bestätigen' using errcode='22023';end if;
  select * into q from private.employee_profile_requests where id=p_request_id for update;
  if q.status<>'pending' then raise exception 'Diese Anfrage wurde bereits bearbeitet' using errcode='22023';end if;
  select * into e from public.employees where id=q.employee_id and company_id=q.company_id;
  update private.employee_profile_requests set status=p_status,review_note=note,reviewed_at=now(),reviewed_by=auth.uid() where id=q.id;
  perform private.sf_put_notification(q.company_id,e.auth_user_id,e.id,'PROFILE_DECISION','Rückmeldung zu deiner Profilanfrage',
    case when p_status='completed' then 'Die Leitung hat deine Anfrage als erledigt markiert. Die Rückmeldung findest du in Mein Profil.' else 'Die Leitung hat deine Anfrage abgelehnt. Die Begründung findest du in Mein Profil.' end,
    'employee-profile','profile_request',q.id,jsonb_build_object('status',p_status));
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
    values(q.company_id,'PROFILE_REVIEWED','profile_request',q.id,auth.uid(),'PERSONNEL_ADMIN',jsonb_build_object('status',q.status),jsonb_build_object('status',p_status));
  return p_status;
end;$$;

create function public.employee_my_profile() returns jsonb language sql stable security invoker set search_path='' as $$select private.employee_my_profile_impl()$$;
create function public.employee_submit_profile_request(p_category text,p_message text) returns uuid language sql security invoker set search_path='' as $$select private.employee_submit_profile_request_impl(p_category,p_message)$$;
create function public.manager_profile_requests(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.manager_profile_requests_impl(p_company_id)$$;
create function public.manager_review_profile_request(p_request_id uuid,p_status text,p_review_note text,p_confirm_applied boolean default false) returns text language sql security invoker set search_path='' as $$select private.manager_review_profile_request_impl(p_request_id,p_status,p_review_note,p_confirm_applied)$$;
revoke all on function private.employee_profile_identity_impl(),private.employee_my_profile_impl(),private.employee_submit_profile_request_impl(text,text),private.manager_profile_requests_impl(uuid),private.manager_review_profile_request_impl(uuid,text,text,boolean),public.employee_my_profile(),public.employee_submit_profile_request(text,text),public.manager_profile_requests(uuid),public.manager_review_profile_request(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function private.employee_profile_identity_impl(),private.employee_my_profile_impl(),private.employee_submit_profile_request_impl(text,text),private.manager_profile_requests_impl(uuid),private.manager_review_profile_request_impl(uuid,text,text,boolean),public.employee_my_profile(),public.employee_submit_profile_request(text,text),public.manager_profile_requests(uuid),public.manager_review_profile_request(uuid,text,text,boolean) to authenticated;
