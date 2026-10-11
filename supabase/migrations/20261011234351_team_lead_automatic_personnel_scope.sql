-- Automatic conversation scope for team leaders. Private HR content remains restricted.
-- Scope is evaluated from current employee/account data, including newly created employees.
begin;

create function private.sf_personnel_leadership_identity(p_company_id uuid,p_auth_user_id uuid,p_email text,p_role text)
returns boolean language sql stable security invoker set search_path='' as $$
 select regexp_replace(lower(coalesce(p_role,'')), '[^a-z]', '', 'g') ~ '^(teamleit|teamlead|teamleader|tl$|owner$|admin$|inhaber$|administrator$)'
 or exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id
   where cm.company_id=p_company_id and cm.access_role in ('TEAM_LEAD','OWNER','ADMIN')
     and (cm.user_id=p_auth_user_id or (nullif(trim(p_email),'') is not null and lower(trim(u.email))=lower(trim(p_email)))));
$$;

create function private.sf_personnel_conversation_employee_ids(p_company_id uuid)
returns uuid[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(e.id order by e.last_name,e.first_name,e.id),'{}'::uuid[])
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null
 and not private.sf_personnel_leadership_identity(e.company_id,e.auth_user_id,e.email,e.role);
$$;
revoke all on function private.sf_personnel_leadership_identity(uuid,uuid,text,text),private.sf_personnel_conversation_employee_ids(uuid) from public,anon,authenticated;

create or replace function private.sf_assert_personnel_conversation_access(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2('personnel_conversations');
 select e.company_id into c from public.employees e where e.id=p_employee_id and e.deleted_at is null;
 if c is null then raise exception 'Nicht berechtigt'; end if;
 if private.sf_can_read_personnel(c) then return c; end if;
 if not exists(select 1 from public.company_members m where m.company_id=c and m.user_id=auth.uid()
  and m.status='ACTIVE' and m.access_role='TEAM_LEAD' and m.role in ('PLANNER','DISPATCHER')
  and not 'read_only'=any(m.extra_permissions)) then raise exception 'Nicht berechtigt'; end if;
 if not p_employee_id=any(private.sf_personnel_conversation_employee_ids(c)) then
  raise exception 'Teamleiter-Akten sind für Teamleiter geschützt';
 end if;
 return c;
end $$;

-- Compatibility for older clients: submitted selections cannot expand or narrow the automatic scope.
create or replace function private.manager_set_access_profile_with_personnel(p_company_id uuid,p_user_id uuid,p_role text,p_permissions text[],p_status text,p_personnel_employee_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[]:=coalesce(p_personnel_employee_ids,'{}');
begin
 perform private.manager_set_access_profile(p_company_id,p_user_id,p_role,p_permissions,p_status);
 if array_position(ids,null) is not null or exists(select 1 from unnest(ids) x where not x=any(private.sf_personnel_conversation_employee_ids(p_company_id))) then raise exception 'Ungültige Mitarbeiterzuordnung: Teamleiter-Akten sind geschützt'; end if;
 if cardinality(ids)>0 and (p_role<>'TEAM_LEAD' or 'read_only'=any(coalesce(p_permissions,'{}'))) then raise exception 'Ungültiges Gesprächsrecht'; end if;
 -- Legacy rows are no longer an authorization source.
 delete from private.personnel_conversation_assignments where company_id=p_company_id and user_id=p_user_id;
end $$;

create or replace function private.sf_normalize_access_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Older clients assign execution codes: retain their previous capabilities.
 if new.access_role is null or (tg_op='UPDATE' and new.role<>old.role and new.access_role=old.access_role and new.extra_permissions=old.extra_permissions) then
  new.access_role:=case when new.role in ('OWNER','ADMIN') then new.role when new.role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end;
  new.extra_permissions:=case when new.role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when new.role='TIME_TRACKING' then array['manage_time','confirm_time'] when new.role='VIEWER' then array['read_only'] else '{}'::text[] end;
 end if;
 if tg_table_name='company_members' and new.access_role='TEAM_LEAD' and new.role in ('PLANNER','DISPATCHER') and not 'read_only'=any(new.extra_permissions) and not 'personnel_conversations'=any(new.extra_permissions) then new.extra_permissions:=array_append(new.extra_permissions,'personnel_conversations'); end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only','personnel_conversations']::text[]
 or array_position(new.extra_permissions,null) is not null then raise exception 'Ungültiges Zugangsprofil'; end if;
 if auth.uid() is not null and (new.role='ADMIN' or (tg_op='UPDATE' and old.role='ADMIN')) and not exists(select 1 from public.company_members where company_id=new.company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 if (new.access_role in ('OWNER','ADMIN') and (new.role<>new.access_role or cardinality(new.extra_permissions)>0))
 or (new.access_role='TEAM_LEAD' and (new.role not in ('PLANNER','DISPATCHER','VIEWER') or (new.role='VIEWER')<>('read_only'=any(new.extra_permissions))))
 or (new.access_role='EMPLOYEE' and (new.role<>'TIME_TRACKING' or 'publish_schedule'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) or cardinality(new.extra_permissions)=0))
 or ('read_only'=any(new.extra_permissions) and cardinality(new.extra_permissions)<>1) then raise exception 'Rolle und Zusatzrechte passen nicht zusammen'; end if;
 if 'personnel_conversations'=any(new.extra_permissions) and (new.access_role<>'TEAM_LEAD' or tg_table_name='company_member_invites') then raise exception 'Personalgespräche werden aktiven Teamleitern automatisch zugeordnet'; end if;
 return new;
end $$;
create or replace function private.access_profile_context(p_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.company_members%rowtype; ids uuid[]; eligible boolean;
begin
 if auth.uid() is null then raise exception 'Nicht berechtigt'; end if;
 select * into m from public.company_members where company_id=p_company_id and user_id=auth.uid();
 if m.user_id is not null then
  if m.status<>'ACTIVE' then raise exception 'Der Zugang ist gesperrt'; end if;
  eligible:=m.access_role='TEAM_LEAD' and m.role in ('PLANNER','DISPATCHER') and not 'read_only'=any(m.extra_permissions);
  ids:=case when eligible then private.sf_personnel_conversation_employee_ids(p_company_id) else '{}'::uuid[] end;
  return jsonb_build_object('role',m.access_role,'permissions',m.extra_permissions,'backend_role',m.role,
   'personnel_employee_ids',to_jsonb(ids),'personnel_assignment_mode',case when eligible then 'ALL_NON_LEADERS' else null end,
   'personnel_excluded_employee_ids',case when eligible then coalesce((select jsonb_agg(e.id) from public.employees e where e.company_id=p_company_id and e.deleted_at is null and not e.id=any(ids)),'[]'::jsonb) else '[]'::jsonb end);
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
 result:=result||jsonb_build_object('personnel_assignment_mode','ALL_NON_LEADERS','users',coalesce((select jsonb_agg(u||jsonb_build_object('personnel_assignment_mode',case when u->>'role'='TEAM_LEAD' and u->>'status'='ACTIVE' and not (u->'permissions') ? 'read_only' then 'ALL_NON_LEADERS' else null end,'personnel_employee_ids',case when u->>'role'='TEAM_LEAD' and u->>'status'='ACTIVE' and not (u->'permissions') ? 'read_only' then to_jsonb(private.sf_personnel_conversation_employee_ids(p_company_id)) else '[]'::jsonb end)) from jsonb_array_elements(result->'users') u),'[]'::jsonb),'personnel_employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',trim(concat_ws(', ',e.last_name,e.first_name))) order by e.last_name,e.first_name,e.id) from public.employees e where e.id=any(private.sf_personnel_conversation_employee_ids(p_company_id))),'[]'::jsonb));
 return result||jsonb_build_object('employees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',trim(concat_ws(', ',last_name,first_name)),'email',email)) from public.employees where company_id=p_company_id and status='active' and deleted_at is null and auth_user_id is null),'[]'::jsonb));
end $function$
;


-- A team leader cannot relabel or unlink a leadership identity to bypass the peer restriction.
create function private.sf_guard_personnel_leadership_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare leader_actor boolean; protected_identity boolean;
begin
 if auth.uid() is null then return new; end if;
 select exists(select 1 from public.company_members m where m.company_id=new.company_id and m.user_id=auth.uid() and m.status='ACTIVE' and m.access_role='TEAM_LEAD') into leader_actor;
 if not leader_actor then return new; end if;
 protected_identity:=private.sf_personnel_leadership_identity(new.company_id,new.auth_user_id,new.email,new.role);
 if tg_op='UPDATE' then
  protected_identity:=protected_identity or private.sf_personnel_leadership_identity(old.company_id,old.auth_user_id,old.email,old.role);
  if protected_identity and row(new.company_id,new.role,new.auth_user_id,new.email) is distinct from row(old.company_id,old.role,old.auth_user_id,old.email) then
   raise exception 'Teamleiter-Zuordnung und Kontoverknüpfung dürfen nur Personalverantwortliche ändern';
  end if;
 elsif protected_identity then raise exception 'Teamleiter-Zuordnung darf nur durch Personalverantwortliche angelegt werden';
 end if;
 return new;
end $$;
revoke all on function private.sf_guard_personnel_leadership_identity() from public,anon,authenticated;
create trigger sf_guard_personnel_leadership_identity before insert or update of company_id,role,auth_user_id,email on public.employees
for each row execute function private.sf_guard_personnel_leadership_identity();

-- Enable the role default for existing execution-capable team leaders without changing other rights.
update public.company_members set extra_permissions=array_append(extra_permissions,'personnel_conversations')
where access_role='TEAM_LEAD' and role in ('PLANNER','DISPATCHER') and not 'read_only'=any(extra_permissions) and not 'personnel_conversations'=any(extra_permissions);
insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_role,metadata)
select company_id,'PERSONNEL_CONVERSATION_AUTOMATIC_SCOPE_ENABLED','company_member',user_id,'SYSTEM',
 jsonb_build_object('scope','ALL_NON_LEADERS','excluded','LEADERSHIP','mfaRequired',true,'privateContentRestricted',true)
from public.company_members where access_role='TEAM_LEAD' and role in ('PLANNER','DISPATCHER') and not 'read_only'=any(extra_permissions);
commit;
