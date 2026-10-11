-- Explicitly delegated personnel conversations. No existing user or record is shared automatically.
create table private.personnel_conversation_assignments (
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 created_by uuid not null, created_at timestamptz not null default now(),
 primary key(company_id,user_id,employee_id),
 foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade
);
create table private.employee_personnel_conversations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 meeting_date date not null, title text not null check(length(title) between 2 and 160),
 summary text not null check(length(summary) between 2 and 10000), goals text not null default '' check(length(goals)<=10000),
 next_review_date date, created_by uuid not null, created_at timestamptz not null default now(),
 check(next_review_date is null or next_review_date>=meeting_date)
);
create index personnel_conversations_employee_date on private.employee_personnel_conversations(company_id,employee_id,meeting_date desc);
alter table private.personnel_conversation_assignments enable row level security;
alter table private.employee_personnel_conversations enable row level security;
create policy personnel_assignments_rpc_only on private.personnel_conversation_assignments to authenticated using(false) with check(false);
create policy personnel_conversations_rpc_only on private.employee_personnel_conversations to authenticated using(false) with check(false);
revoke all on private.personnel_conversation_assignments,private.employee_personnel_conversations from public,anon,authenticated;
alter table public.employee_personnel_qualifications add column conversation_visible boolean not null default false;

create or replace function private.sf_revoke_personnel_conversation_assignments() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'ACTIVE' or new.access_role<>'TEAM_LEAD' or not 'personnel_conversations'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) then
  delete from private.personnel_conversation_assignments where company_id=new.company_id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger sf_revoke_personnel_conversations after update on public.company_members for each row execute function private.sf_revoke_personnel_conversation_assignments();

create or replace function private.sf_reset_conversation_qualification_visibility() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'conversation_visible'-'updated_at'-'updated_by') is distinct from (to_jsonb(old)-'conversation_visible'-'updated_at'-'updated_by') then new.conversation_visible:=false; end if;
 return new;
end $$;
create trigger sf_reset_conversation_qualification_visibility before update on public.employee_personnel_qualifications for each row execute function private.sf_reset_conversation_qualification_visibility();

create or replace function private.sf_assert_personnel_conversation_access(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2('personnel_conversations');
 select e.company_id into c from public.employees e where e.id=p_employee_id and e.deleted_at is null;
 if c is null then raise exception 'Nicht berechtigt'; end if;
 if private.sf_can_read_personnel(c) then return c; end if;
 if not exists(select 1 from public.company_members m join private.personnel_conversation_assignments a on a.company_id=m.company_id and a.user_id=m.user_id where m.company_id=c and m.user_id=auth.uid() and m.status='ACTIVE' and m.access_role='TEAM_LEAD' and m.role in ('PLANNER','DISPATCHER') and 'personnel_conversations'=any(m.extra_permissions) and not 'read_only'=any(m.extra_permissions) and a.employee_id=p_employee_id) then raise exception 'Personalgespräche sind für diesen Mitarbeiter nicht freigegeben'; end if;
 return c;
end $$;

create or replace function private.manager_set_access_profile_with_personnel(p_company_id uuid,p_user_id uuid,p_role text,p_permissions text[],p_status text,p_personnel_employee_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[]:=coalesce(p_personnel_employee_ids,'{}'); actor text; enabled boolean:=coalesce('personnel_conversations'=any(p_permissions),false);
begin
 -- Existing setter preserves MFA, tenant, self/owner and administrator protections.
 perform private.manager_set_access_profile(p_company_id,p_user_id,p_role,p_permissions,p_status);
 if enabled and (p_role<>'TEAM_LEAD' or coalesce('read_only'=any(p_permissions),false)) then raise exception 'Ungültiges Gesprächsrecht'; end if;
 if enabled and p_status='ACTIVE' and cardinality(ids)=0 then raise exception 'Bitte mindestens einen Mitarbeiter ausdrücklich zuordnen'; end if;
 if not enabled and cardinality(ids)>0 then raise exception 'Mitarbeiterzuordnung erfordert das Zusatzrecht Personalgespräche'; end if;
 if array_position(ids,null) is not null or exists(select 1 from unnest(ids) x where not exists(select 1 from public.employees e where e.id=x and e.company_id=p_company_id and e.deleted_at is null and e.status='active')) then raise exception 'Ungültige Mitarbeiterzuordnung'; end if;
 delete from private.personnel_conversation_assignments where company_id=p_company_id and user_id=p_user_id;
 if enabled and p_status='ACTIVE' then
  insert into private.personnel_conversation_assignments(company_id,user_id,employee_id,created_by) select p_company_id,p_user_id,x,auth.uid() from (select distinct unnest(ids) x) q;
 end if;
 select role into actor from public.company_members where company_id=p_company_id and user_id=auth.uid();
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values) values(p_company_id,'PERSONNEL_CONVERSATION_ACCESS_CHANGED','company_member',p_user_id,auth.uid(),actor,jsonb_build_object('employeeIds',case when enabled and p_status='ACTIVE' then ids else '{}'::uuid[] end));
end $$;
create function public.manager_set_access_profile_with_personnel(p_company_id uuid,p_user_id uuid,p_role text,p_permissions text[],p_status text,p_personnel_employee_ids uuid[] default '{}') returns void language sql security invoker set search_path='' as $$select private.manager_set_access_profile_with_personnel(p_company_id,p_user_id,p_role,p_permissions,p_status,p_personnel_employee_ids)$$;

create function private.manager_add_personnel_conversation(p_employee_id uuid,p_meeting_date date,p_title text,p_summary text,p_goals text default '',p_next_review_date date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid; i uuid; r text;
begin
 c:=private.sf_assert_personnel_conversation_access(p_employee_id);
 insert into private.employee_personnel_conversations(company_id,employee_id,meeting_date,title,summary,goals,next_review_date,created_by) values(c,p_employee_id,p_meeting_date,trim(p_title),trim(p_summary),coalesce(trim(p_goals),''),p_next_review_date,auth.uid()) returning id into i;
 select access_role into r from public.company_members where company_id=c and user_id=auth.uid();
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata) values(c,'PERSONNEL_CONVERSATION_ADDED','personnel_conversation',i,auth.uid(),r,jsonb_build_object('employeeId',p_employee_id));
 return i;
end $$;
create function public.manager_add_personnel_conversation(p_employee_id uuid,p_meeting_date date,p_title text,p_summary text,p_goals text default '',p_next_review_date date default null) returns uuid language sql security invoker set search_path='' as $$select private.manager_add_personnel_conversation(p_employee_id,p_meeting_date,p_title,p_summary,p_goals,p_next_review_date)$$;

create function private.manager_set_conversation_qualification_visibility(p_qualification_id uuid,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid; e uuid; r text;
begin
 perform private.sf_assert_aal2('personnel_qualification_visibility');
 select company_id,employee_id into c,e from public.employee_personnel_qualifications where id=p_qualification_id for update;
 r:=private.personnel_admin_role(c);
 if r is null then raise exception 'Nicht berechtigt'; end if;
 update public.employee_personnel_qualifications set conversation_visible=coalesce(p_visible,false) where id=p_qualification_id;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata) values(c,'PERSONNEL_QUALIFICATION_SHARING_CHANGED','personnel_qualification',p_qualification_id,auth.uid(),r,jsonb_build_object('employeeId',e,'visible',coalesce(p_visible,false)));
end $$;
create function public.manager_set_conversation_qualification_visibility(p_qualification_id uuid,p_visible boolean) returns void language sql security invoker set search_path='' as $$select private.manager_set_conversation_qualification_visibility(p_qualification_id,p_visible)$$;

create or replace function private.sf_normalize_access_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Older clients assign execution codes: retain their previous capabilities.
 if new.access_role is null or (tg_op='UPDATE' and new.role<>old.role and new.access_role=old.access_role and new.extra_permissions=old.extra_permissions) then
  new.access_role:=case when new.role in ('OWNER','ADMIN') then new.role when new.role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end;
  new.extra_permissions:=case when new.role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when new.role='TIME_TRACKING' then array['manage_time','confirm_time'] when new.role='VIEWER' then array['read_only'] else '{}'::text[] end;
 end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only','personnel_conversations']::text[]
 or array_position(new.extra_permissions,null) is not null then raise exception 'Ungültiges Zugangsprofil'; end if;
 if auth.uid() is not null and (new.role='ADMIN' or (tg_op='UPDATE' and old.role='ADMIN')) and not exists(select 1 from public.company_members where company_id=new.company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 if (new.access_role in ('OWNER','ADMIN') and (new.role<>new.access_role or cardinality(new.extra_permissions)>0))
 or (new.access_role='TEAM_LEAD' and (new.role not in ('PLANNER','DISPATCHER','VIEWER') or (new.role='VIEWER')<>('read_only'=any(new.extra_permissions))))
 or (new.access_role='EMPLOYEE' and (new.role<>'TIME_TRACKING' or 'publish_schedule'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) or cardinality(new.extra_permissions)=0))
 or ('read_only'=any(new.extra_permissions) and cardinality(new.extra_permissions)<>1) then raise exception 'Rolle und Zusatzrechte passen nicht zusammen'; end if;
 if 'personnel_conversations'=any(new.extra_permissions) and (new.access_role<>'TEAM_LEAD' or tg_table_name='company_member_invites') then raise exception 'Personalgespräche sind nur für bestehende Teamleiter mit Mitarbeiterzuordnung freigegeben'; end if;
 return new;
end $$;
create or replace function private.access_profile_context(p_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.company_members%rowtype;
begin
 select * into m from public.company_members where company_id=p_company_id and user_id=auth.uid();
 if m.user_id is not null then
  if m.status<>'ACTIVE' then raise exception 'Der Zugang ist gesperrt'; end if;
  return jsonb_build_object('role',m.access_role,'permissions',m.extra_permissions,'backend_role',m.role,'personnel_employee_ids',coalesce((select jsonb_agg(a.employee_id) from private.personnel_conversation_assignments a join public.employees e on e.id=a.employee_id and e.company_id=a.company_id and e.deleted_at is null where a.company_id=p_company_id and a.user_id=auth.uid() and m.access_role='TEAM_LEAD' and 'personnel_conversations'=any(m.extra_permissions) and not 'read_only'=any(m.extra_permissions)),'[]'::jsonb));
 end if;
 if exists(select 1 from public.employees where company_id=p_company_id and auth_user_id=auth.uid() and status='active' and access_status='ACTIVE' and deleted_at is null) then
  return jsonb_build_object('role','EMPLOYEE','permissions','[]'::jsonb,'backend_role','EMPLOYEE');
 end if;
 raise exception 'Nicht berechtigt';
end $$;
CREATE OR REPLACE FUNCTION private.manager_list_access_users(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
 select jsonb_build_object('users',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb)) into result from (
  select cm.user_id record_id,cm.user_id,u.email,cm.access_role role,cm.extra_permissions permissions,cm.status,'MEMBER' kind,cm.created_at,null::timestamptz expires_at,cm.user_id=auth.uid() is_self,
   e.id employee_id,trim(concat_ws(', ',e.last_name,e.first_name)) display_name
  from public.company_members cm join auth.users u on u.id=cm.user_id
  left join lateral(select id,first_name,last_name from public.employees where company_id=cm.company_id and auth_user_id=cm.user_id and deleted_at is null limit 1) e on true
  where cm.company_id=p_company_id
  union all
  select e.id,e.auth_user_id,u.email,'EMPLOYEE','{}'::text[],case when e.access_status='ACTIVE' and e.status='active' then 'ACTIVE' else 'DISABLED' end,'EMPLOYEE',coalesce(e.access_linked_at,e.created_at),null::timestamptz,e.auth_user_id=auth.uid(),e.id,trim(concat_ws(', ',e.last_name,e.first_name))
  from public.employees e join auth.users u on u.id=e.auth_user_id where e.company_id=p_company_id and e.deleted_at is null
  and not exists(select 1 from public.company_members cm where cm.company_id=e.company_id and cm.user_id=e.auth_user_id)
  union all
  select i.id,null::uuid,i.email,i.access_role,i.extra_permissions,case when i.expires_at<=now() then 'EXPIRED' else i.status end,'INVITE',i.created_at,i.expires_at,false,i.employee_id,null::text
  from public.company_member_invites i where i.company_id=p_company_id and i.status in ('INVITED','EXPIRED')
  union all
  select i.id,null::uuid,i.email,'EMPLOYEE','{}'::text[],case when i.expires_at<=now() then 'EXPIRED' else 'INVITED' end,'INVITE',i.created_at,i.expires_at,false,i.employee_id,trim(concat_ws(', ',e.last_name,e.first_name))
  from public.employee_access_invites i join public.employees e on e.id=i.employee_id and e.company_id=i.company_id
  where i.company_id=p_company_id and i.claimed_at is null and e.access_status='INVITED'
 ) q;
 result:=result||jsonb_build_object('users',coalesce((select jsonb_agg(u||jsonb_build_object('personnel_employee_ids',coalesce((select jsonb_agg(a.employee_id) from private.personnel_conversation_assignments a where a.company_id=p_company_id and a.user_id=(u->>'user_id')::uuid),'[]'::jsonb))) from jsonb_array_elements(result->'users') u),'[]'::jsonb),'personnel_employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',trim(concat_ws(', ',e.last_name,e.first_name)))) from public.employees e where e.company_id=p_company_id and e.deleted_at is null and e.status='active'),'[]'::jsonb));
 return result||jsonb_build_object('employees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',trim(concat_ws(', ',last_name,first_name)),'email',email)) from public.employees where company_id=p_company_id and status='active' and deleted_at is null and auth_user_id is null),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION private.manager_personnel_file_bundle_impl(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company uuid;
  v_role text;
  v_result jsonb;
begin
  v_company:=private.sf_assert_personnel_conversation_access(p_employee_id);
  v_role:=private.personnel_admin_role(v_company);
  if v_role is null then
    select jsonb_build_object('access_scope','CONVERSATIONS','employee',jsonb_build_object('id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,'role',e.role,'status',e.status),
      'qualifications',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'category',q.category,'title',q.title,'issuer',q.issuer,'issued_on',q.issued_on,'expires_on',q.expires_on,'validity_status',case when q.expires_on is null then 'NO_EXPIRY' when q.expires_on<current_date then 'EXPIRED' when q.expires_on<=current_date+60 then 'EXPIRING' else 'VALID' end) order by q.title) from public.employee_personnel_qualifications q where q.company_id=v_company and q.employee_id=e.id and q.conversation_visible),'[]'::jsonb),'documents','[]'::jsonb,'notes','[]'::jsonb,'history','[]'::jsonb) into v_result from public.employees e where e.id=p_employee_id;
  else

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,
      'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,'start_date',e.start_date,
      'contract_end',e.contract_end,'birth_date',e.birth_date,'status',e.status,'email',e.email,'phone',e.phone,
      'address',e.address,'zip',e.zip,'city',e.city,'shift_permissions',e.shift_permissions,
      'base_qualifications',e.qualifications,'access_status',e.access_status,
      'details', coalesce((select to_jsonb(d) - 'company_id' - 'updated_by' from public.employee_personnel_details d where d.employee_id=e.id),'{}'::jsonb)
    ),
    'qualifications', coalesce((select jsonb_agg(
      (to_jsonb(q) - 'company_id' - 'created_by' - 'updated_by') || jsonb_build_object(
        'validity_status', case when q.expires_on is null then 'NO_EXPIRY' when q.expires_on < current_date then 'EXPIRED' when q.expires_on <= current_date + 60 then 'EXPIRING' else 'VALID' end,
        'days_until_expiry', case when q.expires_on is null then null else q.expires_on-current_date end,
        'expiry_level', case when q.expires_on is null then 'NONE' when q.expires_on < current_date then 'EXPIRED' when q.expires_on <= current_date + 30 then 'CRITICAL' when q.expires_on <= current_date + 60 then 'WARNING' when q.expires_on <= current_date + 90 then 'UPCOMING' else 'VALID' end
      )
      order by coalesce(q.expires_on,'9999-12-31'::date),q.title)
      from public.employee_personnel_qualifications q where q.employee_id=e.id),'[]'::jsonb),
    'documents', coalesce((select jsonb_agg(
      (to_jsonb(d) - 'company_id' - 'uploaded_by') || jsonb_build_object(
        'validity_status', case when d.expires_on is null then 'NO_EXPIRY' when d.expires_on < current_date then 'EXPIRED' when d.expires_on <= current_date + 60 then 'EXPIRING' else 'VALID' end,
        'days_until_expiry', case when d.expires_on is null then null else d.expires_on-current_date end,
        'expiry_level', case when d.expires_on is null then 'NONE' when d.expires_on < current_date then 'EXPIRED' when d.expires_on <= current_date + 30 then 'CRITICAL' when d.expires_on <= current_date + 60 then 'WARNING' when d.expires_on <= current_date + 90 then 'UPCOMING' else 'VALID' end
      )
      order by d.created_at desc)
      from public.employee_personnel_documents d where d.employee_id=e.id),'[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) - 'company_id' order by n.created_at desc)
      from public.employee_personnel_notes n where n.employee_id=e.id),'[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'event_type',a.event_type,'entity_type',a.entity_type,'entity_id',a.entity_id,
      'actor_role',a.actor_role,'metadata',a.metadata,'created_at',a.created_at) order by a.created_at desc)
      from (select * from public.audit_events a
            where a.company_id=v_company
              and (a.entity_id=e.id or a.metadata->>'employeeId'=e.id::text)
            order by a.created_at desc limit 80) a),'[]'::jsonb)
  ) into v_result
  from public.employees e where e.id=p_employee_id;
  end if;
  v_result:=v_result||jsonb_build_object('conversations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'meeting_date',c.meeting_date,'title',c.title,'summary',c.summary,'goals',c.goals,'next_review_date',c.next_review_date,'created_at',c.created_at) order by c.meeting_date desc,c.created_at desc) from private.employee_personnel_conversations c where c.company_id=v_company and c.employee_id=p_employee_id),'[]'::jsonb));
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata) values(v_company,case when v_role is null then 'PERSONNEL_CONVERSATION_VIEWED' else 'PERSONNEL_FILE_VIEWED' end,'employee',p_employee_id,auth.uid(),coalesce(v_role,'TEAM_LEAD'),jsonb_build_object('employeeId',p_employee_id,'scope',coalesce(v_result->>'access_scope','FULL')));
  return v_result;
end;
$function$
;


revoke all on function private.sf_normalize_access_profile(),private.sf_revoke_personnel_conversation_assignments(),private.sf_reset_conversation_qualification_visibility() from public,anon,authenticated;
revoke all on function private.sf_assert_personnel_conversation_access(uuid) from public,anon,authenticated;
grant execute on function private.sf_assert_personnel_conversation_access(uuid) to authenticated;
revoke all on function private.manager_set_access_profile_with_personnel(uuid,uuid,text,text[],text,uuid[]),public.manager_set_access_profile_with_personnel(uuid,uuid,text,text[],text,uuid[]),private.manager_add_personnel_conversation(uuid,date,text,text,text,date),public.manager_add_personnel_conversation(uuid,date,text,text,text,date),private.manager_set_conversation_qualification_visibility(uuid,boolean),public.manager_set_conversation_qualification_visibility(uuid,boolean) from public,anon,authenticated;
grant execute on function private.manager_set_access_profile_with_personnel(uuid,uuid,text,text[],text,uuid[]),public.manager_set_access_profile_with_personnel(uuid,uuid,text,text[],text,uuid[]),private.manager_add_personnel_conversation(uuid,date,text,text,text,date),public.manager_add_personnel_conversation(uuid,date,text,text,text,date),private.manager_set_conversation_qualification_visibility(uuid,boolean),public.manager_set_conversation_qualification_visibility(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
