-- Four public access profiles; legacy execution codes remain for older clients.
alter table public.company_members add column access_role text;
alter table public.company_members add column extra_permissions text[] not null default '{}';
alter table public.company_member_invites add column access_role text;
alter table public.company_member_invites add column extra_permissions text[] not null default '{}';
alter table public.company_member_invites add column employee_id uuid references public.employees(id);

update public.company_members set access_role=case when role in ('OWNER','ADMIN') then role when role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end,
 extra_permissions=case when role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when role='TIME_TRACKING' then array['manage_time','confirm_time'] when role='VIEWER' then array['read_only'] else '{}'::text[] end;
update public.company_member_invites set access_role=case when role='ADMIN' then role when role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end,
 extra_permissions=case when role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when role='TIME_TRACKING' then array['manage_time','confirm_time'] when role='VIEWER' then array['read_only'] else '{}'::text[] end;
alter table public.company_members alter column access_role set not null;
alter table public.company_member_invites alter column access_role set not null;

create or replace function private.sf_normalize_access_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Older clients assign execution codes: retain their previous capabilities.
 if new.access_role is null or (tg_op='UPDATE' and new.role<>old.role and new.access_role=old.access_role and new.extra_permissions=old.extra_permissions) then
  new.access_role:=case when new.role in ('OWNER','ADMIN') then new.role when new.role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end;
  new.extra_permissions:=case when new.role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when new.role='TIME_TRACKING' then array['manage_time','confirm_time'] when new.role='VIEWER' then array['read_only'] else '{}'::text[] end;
 end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only']::text[]
 or array_position(new.extra_permissions,null) is not null then raise exception 'Ungültiges Zugangsprofil'; end if;
 if auth.uid() is not null and (new.role='ADMIN' or (tg_op='UPDATE' and old.role='ADMIN')) and not exists(select 1 from public.company_members where company_id=new.company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 if (new.access_role in ('OWNER','ADMIN') and (new.role<>new.access_role or cardinality(new.extra_permissions)>0))
 or (new.access_role='TEAM_LEAD' and (new.role not in ('PLANNER','DISPATCHER','VIEWER') or (new.role='VIEWER')<>('read_only'=any(new.extra_permissions))))
 or (new.access_role='EMPLOYEE' and (new.role<>'TIME_TRACKING' or 'publish_schedule'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) or cardinality(new.extra_permissions)=0))
 or ('read_only'=any(new.extra_permissions) and cardinality(new.extra_permissions)<>1) then raise exception 'Rolle und Zusatzrechte passen nicht zusammen'; end if;
 return new;
end $$;
create trigger sf_access_profile_normalize before insert or update on public.company_members for each row execute function private.sf_normalize_access_profile();
create trigger sf_access_invite_normalize before insert or update on public.company_member_invites for each row execute function private.sf_normalize_access_profile();

create or replace function private.sf_has_access_permission(p_company_id uuid,p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
 and (cm.access_role in ('OWNER','ADMIN') or (not 'read_only'=any(cm.extra_permissions) and p_permission=any(cm.extra_permissions))));
$$;
create or replace function private.sf_can_manage_time(p_company_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.sf_has_access_permission(p_company_id,'manage_time') or private.sf_has_access_permission(p_company_id,'confirm_time');
$$;
create or replace function private.sf_is_read_only(p_company_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role='VIEWER');
$$;

create or replace function public.access_profile_context(p_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.company_members%rowtype;
begin
 select * into m from public.company_members where company_id=p_company_id and user_id=auth.uid();
 if m.user_id is not null then
  if m.status<>'ACTIVE' then raise exception 'Der Zugang ist gesperrt'; end if;
  return jsonb_build_object('role',m.access_role,'permissions',m.extra_permissions,'backend_role',m.role);
 end if;
 if exists(select 1 from public.employees where company_id=p_company_id and auth_user_id=auth.uid() and status='active' and access_status='ACTIVE' and deleted_at is null) then
  return jsonb_build_object('role','EMPLOYEE','permissions','[]'::jsonb,'backend_role','EMPLOYEE');
 end if;
 raise exception 'Nicht berechtigt';
end $$;

create or replace function public.manager_list_access_users(p_company_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 return result||jsonb_build_object('employees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',trim(concat_ws(', ',last_name,first_name)),'email',email)) from public.employees where company_id=p_company_id and status='active' and deleted_at is null and auth_user_id is null),'[]'::jsonb));
end $$;

create or replace function public.manager_set_access_profile(p_company_id uuid,p_user_id uuid,p_role text,p_permissions text[],p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare actor text; target text; e uuid; backend text; perms text[]:=coalesce(p_permissions,'{}');
begin
 -- Serialize concurrent changes, including owner/admin checks.
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,7041));
 select role into actor from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
 if actor is null or actor not in ('OWNER','ADMIN') then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2('manager_set_access_profile');
 select role into target from public.company_members where company_id=p_company_id and user_id=p_user_id for update;
 select id into e from public.employees where company_id=p_company_id and auth_user_id=p_user_id and deleted_at is null limit 1 for update;
 if target is null and e is null then raise exception 'Benutzer nicht gefunden'; end if;
 if target='OWNER' or p_user_id=auth.uid() then raise exception 'Dieser Zugang ist geschützt'; end if;
 if actor<>'OWNER' and (target='ADMIN' or p_role='ADMIN') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 if p_role is null or p_role not in ('ADMIN','TEAM_LEAD','EMPLOYEE') or p_status is null or p_status not in ('ACTIVE','DISABLED') then raise exception 'Ungültige Rolle oder Status'; end if;
 if p_role='EMPLOYEE' and cardinality(perms)=0 then
  if e is null then raise exception 'Für das Mitarbeiterportal muss zuerst ein Mitarbeiterprofil mit diesem Konto verknüpft sein'; end if;
  update public.employees set access_status=case when p_status='ACTIVE' then 'ACTIVE' else 'DISABLED' end where id=e;
  delete from public.company_members where company_id=p_company_id and user_id=p_user_id;
 else
  backend:=case when p_role='ADMIN' then 'ADMIN' when p_role='EMPLOYEE' then 'TIME_TRACKING' when 'read_only'=any(perms) then 'VIEWER' else 'PLANNER' end;
  insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(p_company_id,p_user_id,backend,p_status,p_role,perms)
  on conflict(company_id,user_id) do update set role=excluded.role,status=excluded.status,access_role=excluded.access_role,extra_permissions=excluded.extra_permissions;
  if e is not null then update public.employees set access_status=case when p_status='ACTIVE' then 'ACTIVE' else 'DISABLED' end where id=e; end if;
 end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
 values(p_company_id,'USER_ACCESS_CHANGED','company_member',p_user_id,auth.uid(),actor,jsonb_build_object('role',p_role,'permissions',perms,'status',p_status));
end $$;

create or replace function public.manager_create_access_invite(p_company_id uuid,p_email text,p_role text,p_permissions text[],p_token_hash text,p_employee_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text; mail text:=lower(trim(coalesce(p_email,''))); perms text[]:=coalesce(p_permissions,'{}'); eid uuid; ident uuid; backend text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,7041));
 select role into actor from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
 if actor is null or actor not in ('OWNER','ADMIN') then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2('manager_create_access_invite');
 if p_role='ADMIN' and actor<>'OWNER' then raise exception 'Nur der Inhaber darf Administratoren einladen'; end if;
 if p_role is null or p_role not in ('ADMIN','TEAM_LEAD','EMPLOYEE') then raise exception 'Ungültige Rolle'; end if;
 if mail !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Ungültige E-Mail oder Einladungsschlüssel'; end if;
 if exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company_id and lower(u.email)=mail)
 or exists(select 1 from public.employees e join auth.users u on u.id=e.auth_user_id where e.company_id=p_company_id and lower(u.email)=mail) then raise exception 'Für diese E-Mail besteht bereits ein Benutzer'; end if;
 if p_employee_id is not null then
  select id into eid from public.employees where id=p_employee_id and company_id=p_company_id and deleted_at is null and status='active' and auth_user_id is null for update;
  if eid is null then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
 end if;
 if p_role='EMPLOYEE' and cardinality(perms)=0 then
  if eid is null then raise exception 'Bitte das zugehörige Mitarbeiterprofil auswählen'; end if;
  insert into public.employee_access_invites(company_id,employee_id,email,token_hash,expires_at,created_by) values(p_company_id,eid,mail,p_token_hash,now()+interval '7 days',auth.uid())
  on conflict(company_id,employee_id) do update set email=excluded.email,token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=now(),created_by=auth.uid(),claimed_at=null,claimed_by=null returning id into ident;
  update public.employees set access_status='INVITED' where id=eid;
  update public.company_member_invites set status='REVOKED' where company_id=p_company_id and email=mail and status in ('INVITED','EXPIRED');
  return jsonb_build_object('id',ident,'parameter','employeeInvite');
 end if;
 backend:=case when p_role='ADMIN' then 'ADMIN' when p_role='EMPLOYEE' then 'TIME_TRACKING' when 'read_only'=any(perms) then 'VIEWER' else 'PLANNER' end;
 insert into public.company_member_invites(company_id,email,role,access_role,extra_permissions,employee_id,token_hash,status,expires_at,created_by)
 values(p_company_id,mail,backend,p_role,perms,eid,p_token_hash,'INVITED',now()+interval '7 days',auth.uid())
 on conflict(company_id,email) do update set role=excluded.role,access_role=excluded.access_role,extra_permissions=excluded.extra_permissions,employee_id=excluded.employee_id,token_hash=excluded.token_hash,status='INVITED',expires_at=excluded.expires_at,created_by=auth.uid(),created_at=now(),claimed_by=null,claimed_at=null returning id into ident;
 -- Replace any outstanding portal invitation for the same address.
 delete from public.employee_access_invites where company_id=p_company_id and lower(email)=mail and claimed_at is null;
 return jsonb_build_object('id',ident,'parameter','teamInvite');
end $$;

create or replace function public.manager_revoke_access_invite(p_company_id uuid,p_invite_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
 if exists(select 1 from public.company_member_invites where id=p_invite_id and company_id=p_company_id and access_role='ADMIN')
 and not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 update public.company_member_invites set status='REVOKED' where id=p_invite_id and company_id=p_company_id and status in ('INVITED','EXPIRED');
 if found then return; end if;
 delete from public.employee_access_invites where id=p_invite_id and company_id=p_company_id and claimed_at is null returning employee_id into eid;
 if eid is null then raise exception 'Einladung nicht gefunden'; end if;
 update public.employees set access_status='NONE' where id=eid and access_status='INVITED' and auth_user_id is null;
end $$;

create or replace function private.sf_access_time_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid; m boolean;
begin
 if tg_op='DELETE' then cid:=old.company_id; else cid:=new.company_id; end if;
 if auth.uid() is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op in ('UPDATE','DELETE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then if tg_op='DELETE' then return old; else return new; end if; end if;
 select exists(select 1 from public.company_members where company_id=cid and user_id=auth.uid()) into m;
 -- Personal employee submissions remain controlled by their existing RPC/RLS.
 if m then
  if tg_op in ('INSERT','DELETE') or (new.actual_start,new.actual_end,new.break_minutes) is distinct from (old.actual_start,old.actual_end,old.break_minutes) or
   (tg_op='UPDATE' and new.status not in ('confirmed','correction_requested') and (new.manager_note,new.employee_note,new.source) is distinct from (old.manager_note,old.employee_note,old.source)) then
   if not private.sf_has_access_permission(cid,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
  end if;
  if tg_op='DELETE' and old.status in ('confirmed','correction_requested') and not private.sf_has_access_permission(cid,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  if (tg_op='INSERT' and new.status in ('confirmed','correction_requested')) or
   (tg_op='UPDATE' and ((new.status,new.confirmed_by,new.confirmed_at,new.correction_requested_by,new.correction_requested_at) is distinct from (old.status,old.confirmed_by,old.confirmed_at,old.correction_requested_by,old.correction_requested_at))) then
   -- Editing an unconfirmed record does not constitute a review.
   if (new.status in ('confirmed','correction_requested') or old.status in ('confirmed','correction_requested')) and not private.sf_has_access_permission(cid,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger sf_access_time_write_guard before insert or update or delete on public.time_entries for each row execute function private.sf_access_time_write_guard();

create or replace function private.sf_access_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid; changed boolean;
begin
 if tg_op='DELETE' then cid:=old.company_id; else cid:=new.company_id; end if;
 if tg_table_name='plan_publications' then changed:=true;
 elsif tg_op='DELETE' then changed:=false;
 elsif tg_op='INSERT' then changed:=new.status='PUBLISHED' or new.published_at is not null;
 else changed:=(new.status='PUBLISHED' and old.status<>'PUBLISHED') or new.published_at is distinct from old.published_at; end if;
 if changed and auth.uid() is not null and not private.sf_has_access_permission(cid,'publish_schedule') then raise exception 'Zusatzrecht Dienstplan veröffentlichen fehlt'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger sf_access_publication_guard before insert or update or delete on public.plan_publications for each row execute function private.sf_access_publication_guard();
create trigger sf_access_publication_guard before insert or update on public.shift_assignments for each row execute function private.sf_access_publication_guard();

-- Read-only users get a deliberately reduced schedule, never raw personnel/audit data.
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='company_id'
 and table_name not in ('company_members','company_member_invites') loop
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.table_name and c.relrowsecurity) then
   execute format('create policy sf_read_only_data_guard on public.%I as restrictive for all to authenticated using (not private.sf_is_read_only(company_id)) with check (not private.sf_is_read_only(company_id))',t.table_name);
  end if;
 end loop;
end $$;
create or replace function public.read_only_schedule_snapshot(p_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_is_read_only(p_company_id) then raise exception 'Nicht berechtigt'; end if;
 return jsonb_build_object(
 'company',(select jsonb_build_object('name',name,'timezone',timezone) from public.companies where id=p_company_id),
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'last_name',last_name,'status',status)) from public.employees where company_id=p_company_id and deleted_at is null and status='active'),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'employee_id',employee_id,'shift_code',shift_code,'starts_at',starts_at,'ends_at',ends_at,'break_minutes',break_minutes,'status',status,'published_at',published_at)) from public.shift_assignments where company_id=p_company_id and status<>'CANCELLED'),'[]'::jsonb),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'default_start',default_start,'default_end',default_end)) from public.shift_templates where company_id=p_company_id),'[]'::jsonb));
end $$;

revoke all on function private.sf_normalize_access_profile(),private.sf_access_time_write_guard(),private.sf_access_publication_guard() from public,anon,authenticated;
revoke all on function private.sf_has_access_permission(uuid,text),private.sf_is_read_only(uuid) from public,anon;
grant execute on function private.sf_has_access_permission(uuid,text),private.sf_is_read_only(uuid) to authenticated;
revoke all on function public.access_profile_context(uuid),public.manager_list_access_users(uuid),public.manager_set_access_profile(uuid,uuid,text,text[],text),public.manager_create_access_invite(uuid,text,text,text[],text,uuid),public.manager_revoke_access_invite(uuid,uuid),public.read_only_schedule_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.access_profile_context(uuid),public.manager_list_access_users(uuid),public.manager_set_access_profile(uuid,uuid,text,text[],text),public.manager_create_access_invite(uuid,text,text,text[],text,uuid),public.manager_revoke_access_invite(uuid,uuid),public.read_only_schedule_snapshot(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.manager_update_company_member(p_company_id uuid, p_user_id uuid, p_role text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor_role text; v_target_role text; v_role text:=upper(trim(coalesce(p_role,''))); v_status text:=upper(trim(coalesce(p_status,'')));
begin
  select role into v_actor_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  if v_actor_role not in ('OWNER','ADMIN') then raise exception 'Nicht berechtigt'; end if;
  select role into v_target_role from public.company_members where company_id=p_company_id and user_id=p_user_id;
  if v_target_role is null then raise exception 'Benutzer nicht gefunden'; end if;
  if v_target_role='OWNER' then raise exception 'Die Inhaberrolle ist geschützt'; end if;
if p_user_id=auth.uid() then raise exception 'Dieser Zugang ist geschützt'; end if;
 if v_actor_role<>'OWNER' and (v_target_role='ADMIN' or v_role='ADMIN') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING') or v_status not in ('ACTIVE','DISABLED') then raise exception 'Ungültige Rolle oder Status'; end if;
  if p_user_id=auth.uid() and v_status<>'ACTIVE' then raise exception 'Der eigene Zugang kann nicht gesperrt werden'; end if;
  update public.company_members set role=v_role,status=v_status where company_id=p_company_id and user_id=p_user_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.manager_create_company_invite(p_company_id uuid, p_email text, p_role text, p_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_email text:=lower(trim(coalesce(p_email,''))); v_role text:=upper(trim(coalesce(p_role,'')));
begin
  if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
if v_role='ADMIN' and not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren einladen'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Ungültige E-Mail-Adresse'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING') then raise exception 'Ungültige Rolle'; end if;
  if length(coalesce(p_token_hash,''))<>64 then raise exception 'Ungültiger Einladungsschlüssel'; end if;
  if exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company_id and lower(u.email)=v_email) then raise exception 'Für diese E-Mail besteht bereits ein Benutzer'; end if;
  insert into public.company_member_invites(company_id,email,role,token_hash,status,expires_at,created_by)
  values(p_company_id,v_email,v_role,p_token_hash,'INVITED',now()+interval '7 days',auth.uid())
  on conflict(company_id,email) do update set role=excluded.role,token_hash=excluded.token_hash,status='INVITED',expires_at=excluded.expires_at,created_by=auth.uid(),created_at=now(),claimed_by=null,claimed_at=null
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.manager_revoke_company_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid;
begin
  select company_id into v_company from public.company_member_invites where id=p_invite_id;
  if v_company is null or not private.can_manage_company_users(v_company) then raise exception 'Nicht berechtigt'; end if;
if exists(select 1 from public.company_member_invites where id=p_invite_id and access_role='ADMIN') and not exists(select 1 from public.company_members where company_id=v_company and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
  update public.company_member_invites set status='REVOKED' where id=p_invite_id and status in ('INVITED','EXPIRED');
end $function$
;

CREATE OR REPLACE FUNCTION private.handle_schichtfunk_company_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text; v_hash text; v_inv public.company_member_invites%rowtype;
begin
  v_token:=coalesce(new.raw_user_meta_data->>'sf_company_invite','');
  if v_token='' then return new; end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into v_inv from public.company_member_invites where token_hash=v_hash and status='INVITED' and expires_at>now() for update;
  if v_inv.id is null or lower(coalesce(new.email,''))<>lower(v_inv.email) then raise exception 'Ungültige oder abgelaufene Einladung'; end if;
  insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(v_inv.company_id,new.id,v_inv.role,'ACTIVE',v_inv.access_role,v_inv.extra_permissions)
  on conflict(company_id,user_id) do update set role=excluded.role,status='ACTIVE',access_role=excluded.access_role,extra_permissions=excluded.extra_permissions;
 if v_inv.employee_id is not null then
 update public.employees set auth_user_id=new.id,access_status='ACTIVE',access_linked_at=now() where id=v_inv.employee_id and company_id=v_inv.company_id and auth_user_id is null and status='active' and deleted_at is null;
 if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
 end if;
  update public.company_member_invites set status='CLAIMED',claimed_by=new.id,claimed_at=now() where id=v_inv.id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.publish_schedule_period_impl(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(published_at timestamp with time zone, assignment_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid:=auth.uid(); v_role text; v_tz text; v_now timestamptz:=now(); v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_end_date-p_start_date>30 THEN
    RAISE EXCEPTION 'Select a valid publication period of at most 31 days';
  END IF;
  SELECT cm.role,coalesce(c.timezone,'Europe/Berlin') INTO v_role,v_tz
  FROM public.company_members cm JOIN public.companies c ON c.id=cm.company_id
  WHERE cm.company_id=p_company_id AND cm.user_id=v_user AND cm.status='ACTIVE'
    AND cm.role IN ('OWNER','ADMIN','DISPATCHER','PLANNER') FOR SHARE OF cm;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorized to publish this company schedule'; END IF;
IF NOT private.sf_has_access_permission(p_company_id,'publish_schedule') THEN RAISE EXCEPTION 'Zusatzrecht Dienstplan veröffentlichen fehlt'; END IF;

  UPDATE public.shift_assignments s SET status='PUBLISHED',published_at=coalesce(s.published_at,v_now)
  WHERE s.company_id=p_company_id AND s.status='DRAFT'
    AND s.starts_at >= p_start_date::timestamp AT TIME ZONE v_tz
    AND s.starts_at < (p_end_date+1)::timestamp AT TIME ZONE v_tz;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  -- A boundary week must not mark neighboring dates as published. Individual
  -- published_at flags protect the released shifts in those partial weeks.
  INSERT INTO public.plan_publications(company_id,week_start,published_at,published_by)
  SELECT p_company_id,d::date,v_now,v_user
  FROM pg_catalog.generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') d
  WHERE extract(isodow FROM d)=1 AND d::date+6<=p_end_date
  ON CONFLICT(company_id,week_start) DO UPDATE SET published_at=excluded.published_at,published_by=excluded.published_by;
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  VALUES(p_company_id,'PLAN_PUBLISHED','plan_publication',NULL,v_user,v_role,
    pg_catalog.jsonb_build_object('start_date',p_start_date,'end_date',p_end_date,'assignment_count',v_count,'source','server_rpc'));
  RETURN QUERY SELECT v_now,v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.publish_schedule_week_impl(p_week_start date)
 RETURNS TABLE(published_at timestamp with time zone, assignment_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_tz text;
  v_now timestamptz := now();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_week_start is null then
    raise exception 'Week start is required';
  end if;

  select cm.company_id, cm.role, coalesce(c.timezone, 'Europe/Berlin')
    into v_company, v_role, v_tz
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = v_user
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'ADMIN', 'DISPATCHER', 'PLANNER')
  order by cm.created_at
  limit 1;

  if v_company is null then
    raise exception 'Not authorized to publish schedule';
  end if;
if not private.sf_has_access_permission(v_company,'publish_schedule') then raise exception 'Zusatzrecht Dienstplan veröffentlichen fehlt'; end if;

  update public.shift_assignments s
     set status = 'PUBLISHED',
         published_at = coalesce(s.published_at, v_now)
   where s.company_id = v_company
     and s.status = 'DRAFT'
     and (s.starts_at at time zone v_tz)::date >= p_week_start
     and (s.starts_at at time zone v_tz)::date < p_week_start + 7;
  get diagnostics v_count = row_count;

  insert into public.plan_publications(company_id, week_start, published_at, published_by)
  values (v_company, p_week_start, v_now, v_user)
  on conflict(company_id, week_start)
  do update set
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role, metadata
  ) values (
    v_company, 'PLAN_PUBLISHED', 'plan_publication', null, v_user, v_role,
    pg_catalog.jsonb_build_object(
      'week_start', p_week_start,
      'assignment_count', v_count,
      'source', 'server_rpc'
    )
  );

  return query select v_now, v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_save_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_old jsonb; v_new jsonb;
begin
  select * into v_assignment from public.shift_assignments where id=p_assignment_id for update;
  if not found or not private.sf_can_manage_time(v_assignment.company_id) then raise exception 'Nicht berechtigt'; end if;
if not private.sf_has_access_permission(v_assignment.company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
 if p_confirm and not private.sf_has_access_permission(v_assignment.company_id,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  select to_jsonb(te) into v_old from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    case when p_confirm then 'confirmed' else 'recorded' end,coalesce(p_note,''),'MANAGER','',
    case when p_confirm then coalesce((select submitted_at from public.time_entries where assignment_id=p_assignment_id),now()) else null end,
    case when p_confirm then auth.uid() else null end,case when p_confirm then now() else null end,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,status=excluded.status,
    manager_note=excluded.manager_note,source='MANAGER',correction_note='',
    confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,updated_at=now(),updated_by=auth.uid(),
    version=public.time_entries.version+1;
  select to_jsonb(te) into v_new from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_assignment.company_id,case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_old,v_new,'{}'::jsonb);
  return v_new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_review_time_entry(p_assignment_id uuid, p_decision text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_result jsonb;
begin
  select sa.company_id into v_company from public.shift_assignments sa where sa.id=p_assignment_id;
  if v_company is null or not private.sf_can_manage_time(v_company) then raise exception 'Nicht berechtigt'; end if;
if not private.sf_has_access_permission(v_company,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  if private.sf_is_time_month_closed(v_company,(select actual_start::date from public.time_entries where assignment_id=p_assignment_id)) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  if upper(coalesce(p_decision,'')) not in ('CONFIRM','CORRECTION') then raise exception 'Ungueltige Entscheidung'; end if;
  if upper(p_decision)='CORRECTION' and length(trim(coalesce(p_comment,'')))<3 then
    raise exception 'Bitte einen Korrekturhinweis angeben';
  end if;
  update public.time_entries set
    status=case when upper(p_decision)='CONFIRM' then 'confirmed' else 'correction_requested' end,
    manager_note=case when upper(p_decision)='CONFIRM' then coalesce(p_comment,'') else manager_note end,
    correction_note=case when upper(p_decision)='CORRECTION' then p_comment else '' end,
    confirmed_by=case when upper(p_decision)='CONFIRM' then auth.uid() else null end,
    confirmed_at=case when upper(p_decision)='CONFIRM' then now() else null end,
    correction_requested_by=case when upper(p_decision)='CORRECTION' then auth.uid() else null end,
    correction_requested_at=case when upper(p_decision)='CORRECTION' then now() else null end,
    updated_at=now(),updated_by=auth.uid(),version=version+1
  where assignment_id=p_assignment_id returning to_jsonb(time_entries.*) into v_result;
  if v_result is null then raise exception 'Zeiteintrag nicht gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,case when upper(p_decision)='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_result,jsonb_build_object('comment',coalesce(p_comment,'')));
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.manager_bulk_record_time_entries(p_company_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer:=0;
  v_updated integer:=0;
  v_skipped_existing integer:=0;
  v_skipped_future integer:=0;
  v_skipped_invalid integer:=0;
  v_reopened_months integer:=0;
  v_month date;
begin
  if not private.sf_can_manage_time(p_company_id) then
    raise exception 'Nicht berechtigt';
  end if;
if not private.sf_has_access_permission(p_company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
 if p_confirm and not private.sf_has_access_permission(p_company_id,'confirm_time') then raise exception 'Zusatzrecht Zeiten bestätigen fehlt'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  if p_end_date-p_start_date>366 then
    raise exception 'Der Zeitraum darf hoechstens 366 Tage umfassen';
  end if;
  if length(coalesce(p_note,''))>1000 then
    raise exception 'Die Bemerkung darf hoechstens 1.000 Zeichen enthalten';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text||p_start_date::text||p_end_date::text,0
  ));

  select count(*) into v_total
  from public.shift_assignments sa
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_existing
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_future
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at>now();

  select count(*) into v_skipped_invalid
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
    and (
      sa.ends_at<=sa.starts_at or sa.ends_at-sa.starts_at>interval '24 hours'
      or coalesce(sa.break_minutes,0)<0
      or coalesce(sa.break_minutes,0)>=extract(epoch from(sa.ends_at-sa.starts_at))/60
    );

  -- Eine Sammeluebernahme ist die ausdrueckliche Entscheidung, dass Plan = Ist gilt.
  -- Falls der Zeitraum bereits abgeschlossen war, wird nur fuer wirklich uebernehmbare
  -- fehlende Eintraege kontrolliert wieder geoeffnet. Die bestehende RPC protokolliert
  -- jede Wiedereroeffnung und beschraenkt sie auf OWNER/ADMIN.
  for v_month in
    select distinct date_trunc('month',sa.starts_at)::date
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    join public.time_month_closures c
      on c.company_id=sa.company_id
     and c.month_start=date_trunc('month',sa.starts_at)::date
     and c.status='CLOSED'
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
    order by 1
  loop
    if not private.sf_is_manager(p_company_id,true) then
      raise exception 'Der Monat ist abgeschlossen. Nur Inhaber und Administratoren duerfen ihn fuer die Sammeluebernahme oeffnen.';
    end if;
    perform public.manager_reopen_time_month(
      p_company_id,
      v_month,
      'Automatisch fuer die Sammeluebernahme unveraenderter Planzeiten geoeffnet'
    );
    v_reopened_months:=v_reopened_months+1;
  end loop;

  with candidates as (
    select sa.id,sa.company_id,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0) as break_minutes
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null and not exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
  ), inserted as (
    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      updated_at,updated_by,version
    )
    select id,company_id,starts_at,ends_at,break_minutes,
      case when p_confirm then 'confirmed' else 'recorded' end,
      left(coalesce(p_note,''),1000),'MANAGER','',
      case when p_confirm then now() else null end,
      case when p_confirm then auth.uid() else null end,
      case when p_confirm then now() else null end,
      now(),auth.uid(),1
    from candidates
    on conflict(assignment_id) do nothing
    returning assignment_id,company_id,actual_start,actual_end,break_minutes,status,version
  ), audited as (
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    )
    select company_id,
      case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
      'time_entry',assignment_id,auth.uid(),'MANAGER',
      jsonb_build_object(
        'actualStart',actual_start,'actualEnd',actual_end,'breakMinutes',break_minutes,
        'status',status,'version',version
      ),
      jsonb_build_object('bulk',true,'planEqualsActual',true,'comment',left(coalesce(p_note,''),1000))
    from inserted
    returning 1
  )
  select count(*) into v_updated from audited;

  return jsonb_build_object(
    'total',v_total,
    'updated',v_updated,
    'status',case when p_confirm then 'confirmed' else 'recorded' end,
    'reopenedMonths',v_reopened_months,
    'skippedExisting',v_skipped_existing,
    'skippedQr',(select count(*) from public.shift_assignments sa where sa.company_id=p_company_id and sa.status<>'CANCELLED' and sa.starts_at::date between p_start_date and p_end_date and exists(select 1 from public.time_qr_independent_shifts q where q.company_id=sa.company_id and q.employee_id=sa.employee_id and q.started_at<sa.ends_at and coalesce(q.ended_at,statement_timestamp())>sa.starts_at)),
    'skippedFuture',v_skipped_future,
    'skippedClosed',0,
    'skippedUnpublished',0,
    'skippedInvalid',v_skipped_invalid
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sf_manager_correct_qr_independent_shift(p_company_id uuid, p_shift_id uuid, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_reason text, p_expected_revision text, p_breaks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shift public.time_qr_independent_shifts%rowtype;
  v_old jsonb;v_new jsonb;v_pauses jsonb;v_prepared jsonb:='[]'::jsonb;v_pause jsonb;
  v_start timestamptz;v_end timestamptz;v_last_end timestamptz;v_number integer;
  v_month date;v_timezone text;v_role text;
begin
  if auth.uid() is null or not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berechtigung'; end if;
if not private.sf_has_access_permission(p_company_id,'manage_time') then raise exception 'Zusatzrecht Zeiten verwalten fehlt'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Bitte eine Begründung mit 3 bis 1.000 Zeichen angeben'; end if;
  if p_started_at is null or p_ended_at is null or not isfinite(p_started_at) or not isfinite(p_ended_at)
     or p_ended_at<=p_started_at or p_ended_at>clock_timestamp() then
    raise exception 'Bitte einen tatsächlichen Beginn und ein späteres, bereits vergangenes Dienstende angeben';
  end if;
  select * into v_shift from public.time_qr_independent_shifts where id=p_shift_id and company_id=p_company_id;
  if not found then raise exception 'QR-Buchung nicht gefunden'; end if;
  -- Same lock as employee punches: a simultaneous pause or clock-out cannot be lost.
  perform pg_advisory_xact_lock(hashtextextended(v_shift.employee_id::text,0));
  select * into v_shift from public.time_qr_independent_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found then raise exception 'QR-Buchung nicht gefunden'; end if;
  v_old:=private.sf_qr_independent_snapshot(p_shift_id);
  if p_expected_revision is null or p_expected_revision<>v_old->>'revision' then
    raise exception 'Die Buchung wurde inzwischen geändert. Bitte schließen und erneut öffnen';
  end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=p_company_id;
  -- Protect every month touched by either the old or the corrected interval.
  -- Use the same month lock as manager_close_time_month; do not silently reopen.
  for v_month in
    select distinct date_trunc('month',g)::date from (
      select generate_series(date_trunc('month',v_shift.started_at at time zone v_timezone),
        date_trunc('month',(coalesce(v_shift.ended_at,p_ended_at)-interval '1 microsecond') at time zone v_timezone),interval '1 month') g
      union all
      select generate_series(date_trunc('month',p_started_at at time zone v_timezone),
        date_trunc('month',(p_ended_at-interval '1 microsecond') at time zone v_timezone),interval '1 month')
    ) months order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||v_month::text,0));
    if exists(select 1 from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED') then
      raise exception 'Der Zeitmonat % ist abgeschlossen. Bitte zuerst durch Inhaber oder Administratoren wieder öffnen',to_char(v_month,'MM/YYYY');
    end if;
  end loop;
  if exists(select 1 from public.time_qr_independent_shifts s where s.employee_id=v_shift.employee_id and s.id<>p_shift_id
    and tstzrange(s.started_at,s.ended_at,'[)')&&tstzrange(p_started_at,p_ended_at,'[)')) then
    raise exception 'Die korrigierte Zeit überschneidet sich mit einer anderen QR-Buchung';
  end if;
  v_pauses:=coalesce(p_breaks,v_old->'breaks');
  if jsonb_typeof(v_pauses)<>'array' or jsonb_array_length(v_pauses)<>jsonb_array_length(v_old->'breaks') then
    raise exception 'Bitte alle vorhandenen Pausen vollständig übergeben';
  end if;
  if exists(select 1 from jsonb_array_elements(v_pauses) x where jsonb_typeof(x)<>'object'
    or coalesce(x->>'number','')!~'^(10|[1-9])$') then raise exception 'Ungültige Pause'; end if;
  if (select count(distinct (x->>'number')::integer) from jsonb_array_elements(v_pauses) x)<>jsonb_array_length(v_pauses) then
    raise exception 'Eine Pause wurde doppelt übergeben';
  end if;
  for v_pause in select x from jsonb_array_elements(v_pauses) x order by (x->>'number')::integer loop
    v_number:=(v_pause->>'number')::integer;
    if not exists(select 1 from public.time_qr_independent_breaks where shift_id=p_shift_id and ordinal=v_number) then raise exception 'Unbekannte Pause'; end if;
    v_start:=nullif(v_pause->>'started_at','')::timestamptz;
    v_end:=coalesce(nullif(v_pause->>'ended_at','')::timestamptz,p_ended_at);
    if v_start is null or not isfinite(v_start) or not isfinite(v_end) or v_end<=v_start
       or v_start<p_started_at or v_end>p_ended_at or (v_last_end is not null and v_start<v_last_end) then
      raise exception 'Pausen müssen innerhalb des Dienstes liegen, ein späteres Ende haben und dürfen sich nicht überschneiden';
    end if;
    v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('number',v_number,'started_at',v_start,'ended_at',v_end));
    v_last_end:=v_end;
  end loop;
  update public.time_qr_independent_shifts set started_at=p_started_at,ended_at=p_ended_at where id=p_shift_id;
  update public.time_qr_independent_breaks b set started_at=(x->>'started_at')::timestamptz,ended_at=(x->>'ended_at')::timestamptz
    from jsonb_array_elements(v_prepared) x where b.shift_id=p_shift_id and b.ordinal=(x->>'number')::integer;
  v_new:=private.sf_qr_independent_snapshot(p_shift_id);
  if v_new->>'revision'=v_old->>'revision' then raise exception 'Es wurde keine Zeitänderung eingegeben'; end if;
  select role into v_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
    values(p_company_id,'QR_SHIFT_CORRECTED','qr_independent_shift',p_shift_id,auth.uid(),v_role,v_old,v_new,
      jsonb_build_object('reason',btrim(p_reason),'expectedRevision',p_expected_revision,'paidBreaks',true));
  return private.sf_manager_qr_independent_detail(p_company_id,p_shift_id);
end;$function$
;
