begin;
-- Only in this rollback test: reproduce production signup triggers and suppress unrelated QA-only triggers.
create or replace function private.qa_finish_multi_company_signup() returns trigger language plpgsql as $noop$ begin return new; end $noop$;
create or replace function private.qa_finish_multi_employee_signup() returns trigger language plpgsql as $noop$ begin return new; end $noop$;
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
CREATE OR REPLACE FUNCTION private.handle_schichtfunk_employee_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_hash text;
  v_inv public.employee_access_invites%rowtype;
  v_emp public.employees%rowtype;
begin
  v_token := nullif(new.raw_user_meta_data->>'sf_employee_invite','');
  if v_token is null then
    return new;
  end if;

  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  select * into v_inv
  from public.employee_access_invites
  where token_hash=v_hash
    and claimed_at is null
    and expires_at>now()
  for update;

  if not found then
    raise exception 'SchichtFunk Mitarbeiter-Einladung ist ungültig oder abgelaufen.';
  end if;

  if lower(v_inv.email) <> lower(coalesce(new.email,'')) then
    raise exception 'Die E-Mail-Adresse passt nicht zur SchichtFunk Mitarbeiter-Einladung.';
  end if;

  select * into v_emp from public.employees where id=v_inv.employee_id for update;
  if not found or v_emp.company_id<>v_inv.company_id then
    raise exception 'Mitarbeiterdatensatz zur Einladung nicht gefunden.';
  end if;
  if v_emp.status<>'active' then
    raise exception 'Der Mitarbeiterzugang ist nicht aktivierbar.';
  end if;
  if v_emp.auth_user_id is not null and v_emp.auth_user_id<>new.id then
    raise exception 'Für diesen Mitarbeiter besteht bereits ein Zugang.';
  end if;

  update public.employees
    set auth_user_id=new.id,
        access_status='ACTIVE',
        access_linked_at=now(),
        updated_at=now()
  where id=v_inv.employee_id;

  update public.employee_access_invites
    set claimed_at=now(), claimed_by=new.id
  where id=v_inv.id;

  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION private.manager_create_access_invite(p_company_id uuid, p_email text, p_role text, p_permissions text[], p_token_hash text, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
-- Draft for isolated verification only. Do not deploy.
create table if not exists private.multi_company_invitation_groups (token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),email text not null,entries jsonb not null,expires_at timestamptz not null,created_by uuid not null references auth.users(id),claimed_by uuid references auth.users(id),claimed_at timestamptz);
alter table private.multi_company_invitation_groups enable row level security;
revoke all on private.multi_company_invitation_groups from public,anon,authenticated;
create table if not exists private.sf_multi_claim_context(txid bigint not null,user_id uuid not null,company_id uuid not null,invite_id uuid not null,primary key(txid,user_id,company_id));
alter table private.sf_multi_claim_context enable row level security;
revoke all on private.sf_multi_claim_context from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.sf_normalize_access_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare claim_allowed boolean := false;
begin
 -- Older clients assign execution codes: retain their previous capabilities.
 if new.access_role is null or (tg_op='UPDATE' and new.role<>old.role and new.access_role=old.access_role and new.extra_permissions=old.extra_permissions) then
  new.access_role:=case when new.role in ('OWNER','ADMIN') then new.role when new.role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end;
  new.extra_permissions:=case when new.role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when new.role='TIME_TRACKING' then array['manage_time','confirm_time'] when new.role='VIEWER' then array['read_only'] else '{}'::text[] end;
 end if;
 if tg_table_name='company_members' and new.access_role='TEAM_LEAD' and new.role in ('PLANNER','DISPATCHER') and not 'read_only'=any(new.extra_permissions) and not 'personnel_conversations'=any(new.extra_permissions) then new.extra_permissions:=array_append(new.extra_permissions,'personnel_conversations'); end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only','personnel_conversations']::text[]
 or array_position(new.extra_permissions,null) is not null then raise exception 'Ungültiges Zugangsprofil'; end if;
 if auth.uid() is not null and (new.role='ADMIN' or (tg_op='UPDATE' and old.role='ADMIN')) and not exists(select 1 from public.company_members where company_id=new.company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then
  if tg_table_schema='public' and tg_table_name='company_members' and tg_op='INSERT' then
   select exists(select 1 from private.sf_multi_claim_context x join public.company_member_invites i on i.id=x.invite_id and i.company_id=x.company_id join auth.users u on u.id=x.user_id where x.txid=pg_catalog.txid_current() and x.user_id=auth.uid() and x.user_id=new.user_id and x.company_id=new.company_id and i.role=new.role and i.access_role=new.access_role and i.status='INVITED' and i.claimed_at is null and i.expires_at>now() and u.email_confirmed_at is not null and lower(i.email)=lower(u.email)) into claim_allowed;
  elsif tg_table_schema='public' and tg_table_name='company_member_invites' and tg_op='UPDATE' then
   select exists(select 1 from private.sf_multi_claim_context x join auth.users u on u.id=x.user_id where x.txid=pg_catalog.txid_current() and x.user_id=auth.uid() and x.user_id=new.claimed_by and x.company_id=new.company_id and x.invite_id=new.id and old.id=new.id and old.company_id=new.company_id and old.status='INVITED' and new.status='CLAIMED' and old.role=new.role and old.access_role=new.access_role and old.email=new.email and old.expires_at>now() and u.email_confirmed_at is not null and lower(old.email)=lower(u.email)) into claim_allowed;
  end if;
  if not claim_allowed then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 end if;
 if (new.access_role in ('OWNER','ADMIN') and (new.role<>new.access_role or cardinality(new.extra_permissions)>0))
 or (new.access_role='TEAM_LEAD' and (new.role not in ('PLANNER','DISPATCHER','VIEWER') or (new.role='VIEWER')<>('read_only'=any(new.extra_permissions))))
 or (new.access_role='EMPLOYEE' and (new.role<>'TIME_TRACKING' or 'publish_schedule'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) or cardinality(new.extra_permissions)=0))
 or ('read_only'=any(new.extra_permissions) and cardinality(new.extra_permissions)<>1) then raise exception 'Rolle und Zusatzrechte passen nicht zusammen'; end if;
 if 'personnel_conversations'=any(new.extra_permissions) and (new.access_role<>'TEAM_LEAD' or tg_table_name='company_member_invites') then raise exception 'Personalgespräche werden aktiven Teamleitern automatisch zugeordnet'; end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.manager_multi_invite_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 perform private.sf_assert_aal2('manager_multi_invite_options');
 select coalesce(jsonb_agg(jsonb_build_object('company_id',c.id,'company_name',c.name,
   'can_invite_admin',m.role='OWNER' and m.access_role='OWNER',
   'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(', ',e.last_name,e.first_name),'email',e.email) order by e.last_name,e.first_name,e.id)
      from public.employees e where e.company_id=c.id and e.status='active' and e.deleted_at is null and e.auth_user_id is null),'[]'::jsonb)) order by c.name,c.id),'[]'::jsonb)
 into result from public.company_members m join public.companies c on c.id=m.company_id
 where m.user_id=auth.uid() and m.status='ACTIVE' and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN');
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_create_multi_access_invite(p_source uuid, p_email text, p_targets jsonb, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t jsonb; company uuid; actor text; role_ text; emp uuid; subhash text; created jsonb; anchor jsonb; entries_ jsonb:='[]'::jsonb; seen uuid[]:='{}'; mail text:=lower(trim(coalesce(p_email,'')));
begin
 if auth.uid() is null or not private.can_manage_company_users(p_source) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 if jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets)<1 or jsonb_array_length(p_targets)>30 or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ungültige Unternehmensauswahl'; end if;
 -- Sort lock acquisition consistently to avoid deadlocks. The source row remains the anchor for the email.
 for t in select value from jsonb_array_elements(p_targets) order by (value->>'company_id')::uuid loop
  company:=(t->>'company_id')::uuid; role_:=t->>'role'; emp:=nullif(t->>'employee_id','')::uuid;
  if company is null or company=any(seen) or role_ not in ('EMPLOYEE','TEAM_LEAD','ADMIN') or not private.can_manage_company_users(company) then raise exception 'Unternehmen oder Rolle nicht berechtigt' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text,7041));
  if exists(select 1 from private.multi_company_invitation_groups g cross join lateral jsonb_array_elements(g.entries) e
   where g.email=mail and g.claimed_at is null and g.expires_at>now() and e->>'company_id'=company::text)
  then raise exception 'Für diese Person besteht bereits eine gemeinsame Einladung. Bitte erneuern oder zurückziehen.'; end if;
  seen:=array_append(seen,company);
  select m.role into actor from public.company_members m where m.company_id=company and m.user_id=auth.uid() and m.status='ACTIVE' and m.access_role in ('OWNER','ADMIN');
  if role_='ADMIN' and actor<>'OWNER' then raise exception 'Nur der Inhaber darf Administratoren einladen' using errcode='42501'; end if;
  subhash:=case when company=p_source then p_token_hash else encode(extensions.digest(p_token_hash||':'||company::text,'sha256'),'hex') end;
  created:=private.manager_create_access_invite(company,mail,role_,'{}'::text[],subhash,emp);
  entries_:=entries_||jsonb_build_array(jsonb_build_object('company_id',company,'id',created->>'id','kind',created->>'parameter','hash',subhash));
  if company=p_source then anchor:=created; end if;
 end loop;
 if anchor is null then raise exception 'Das aktuelle Unternehmen muss ausgewählt sein'; end if;
 insert into private.multi_company_invitation_groups(token_hash,email,entries,expires_at,created_by)
 values(p_token_hash,mail,entries_,now()+interval '7 days',auth.uid());
 return anchor;
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_multi_invite_snapshot(p_company_id uuid, p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g private.multi_company_invitation_groups%rowtype; item jsonb; company uuid; invite_id uuid; expected text; ci public.company_member_invites%rowtype; ei public.employee_access_invites%rowtype; rows_ jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select * into g from private.multi_company_invitation_groups x where x.claimed_at is null and x.entries @> jsonb_build_array(jsonb_build_object('company_id',p_company_id,'id',p_invite_id::text)) order by x.expires_at desc limit 1;
 if not found then return null; end if;
 for item in select value from jsonb_array_elements(g.entries) order by value->>'company_id' loop
  company:=(item->>'company_id')::uuid; invite_id:=(item->>'id')::uuid;expected:=item->>'hash';
  if not private.can_manage_company_users(company) then raise exception 'Für alle Unternehmen der Einladung ist eine Verwaltungsberechtigung erforderlich' using errcode='42501'; end if;
  if item->>'kind'='employeeInvite' then
   select * into ei from public.employee_access_invites where id=invite_id and company_id=company and token_hash=expected and claimed_at is null;
   if not found then raise exception 'Einladungsdaten haben sich geändert'; end if;
   rows_:=rows_||jsonb_build_array(jsonb_build_object('company_id',company,'role','EMPLOYEE','employee_id',ei.employee_id));
  elsif item->>'kind'='teamInvite' then
   select * into ci from public.company_member_invites where id=invite_id and company_id=company and token_hash=expected and status in ('INVITED','EXPIRED');
   if not found then raise exception 'Einladungsdaten haben sich geändert'; end if;
   if ci.access_role='ADMIN' and not exists(select 1 from public.company_members m where m.company_id=company and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='OWNER' and m.access_role='OWNER') then raise exception 'Nur der Inhaber darf Administratoren verwalten' using errcode='42501'; end if;
   rows_:=rows_||jsonb_build_array(jsonb_build_object('company_id',company,'role',ci.access_role,'employee_id',ci.employee_id));
  else raise exception 'Ungültige Einladungsart'; end if;
 end loop;
 return jsonb_build_object('email',g.email,'targets',rows_);
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_revoke_multi_or_single_invite(p_company_id uuid, p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g private.multi_company_invitation_groups%rowtype; item jsonb; company uuid; invite_id uuid; old_hash text; admin_target boolean;
begin
 if auth.uid() is null or not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select * into g from private.multi_company_invitation_groups x
 where x.claimed_at is null and x.entries @> jsonb_build_array(jsonb_build_object('company_id',p_company_id,'id',p_invite_id::text))
 order by x.expires_at desc limit 1 for update;
 if not found then perform private.manager_revoke_access_invite(p_company_id,p_invite_id); return; end if;
 for item in select value from jsonb_array_elements(g.entries) order by value->>'company_id' loop
  company:=(item->>'company_id')::uuid; invite_id:=(item->>'id')::uuid; old_hash:=item->>'hash';
  if not private.can_manage_company_users(company) then raise exception 'Für alle Unternehmen der Einladung ist eine Verwaltungsberechtigung erforderlich' using errcode='42501'; end if;
  select exists(select 1 from public.company_member_invites where id=invite_id and company_id=company and token_hash=old_hash and access_role='ADMIN') into admin_target;
  if admin_target and not exists(select 1 from public.company_members m where m.company_id=company and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='OWNER' and m.access_role='OWNER') then raise exception 'Nur der Inhaber darf Administratoren verwalten' using errcode='42501'; end if;
 end loop;
 for item in select value from jsonb_array_elements(g.entries) order by value->>'company_id' loop
  company:=(item->>'company_id')::uuid; invite_id:=(item->>'id')::uuid; old_hash:=item->>'hash';
  if (item->>'kind'='teamInvite' and exists(select 1 from public.company_member_invites where id=invite_id and company_id=company and token_hash=old_hash and status in ('INVITED','EXPIRED')))
   or (item->>'kind'='employeeInvite' and exists(select 1 from public.employee_access_invites where id=invite_id and company_id=company and token_hash=old_hash and claimed_at is null))
  then perform private.manager_revoke_access_invite(company,invite_id); end if;
 end loop;
 delete from private.multi_company_invitation_groups where token_hash=g.token_hash;
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_renew_multi_access_invite(p_source uuid, p_invite_id uuid, p_email text, p_targets jsonb, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_ jsonb;
begin
 old_:=private.manager_multi_invite_snapshot(p_source,p_invite_id);
 if old_ is null or lower(trim(coalesce(p_email,'')))<>old_->>'email' then raise exception 'Gemeinsame Einladung nicht verfügbar' using errcode='42501'; end if;
 perform private.manager_revoke_multi_or_single_invite(p_source,p_invite_id);
 return private.manager_create_multi_access_invite(p_source,p_email,p_targets,p_token_hash);
end $function$
;
CREATE OR REPLACE FUNCTION private.claim_multi_company_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid_ uuid:=auth.uid(); mail text; hash_ text; g private.multi_company_invitation_groups%rowtype;
 item jsonb; ci public.company_member_invites%rowtype; ei public.employee_access_invites%rowtype;
 company uuid; invite_id uuid; expected text; n integer:=0;
begin
 if uid_ is null or coalesce(p_token,'') !~ '^[a-f0-9-]{64,96}$' then raise exception 'Ungültige Einladung' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=uid_ and email_confirmed_at is not null;
 if mail is null then raise exception 'Bitte bestätige zuerst die E-Mail-Adresse deines Kontos' using errcode='42501'; end if;
 hash_:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into g from private.multi_company_invitation_groups where token_hash=hash_ for update;
 if not found or g.claimed_at is not null or g.expires_at<=now() or g.email<>mail then raise exception 'Ungültige oder abgelaufene Einladung' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(g.entries) order by value->>'company_id' loop
  company:=(item->>'company_id')::uuid;invite_id:=(item->>'id')::uuid;expected:=item->>'hash';
  if item->>'kind'='employeeInvite' then
   select * into ei from public.employee_access_invites where id=invite_id and company_id=company and token_hash=expected and lower(email)=mail and expires_at>now() and claimed_at is null for update;
   if not found then raise exception 'Ein Mitarbeiterzugang der Einladung ist nicht mehr verfügbar'; end if;
   update public.employees set auth_user_id=uid_,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=ei.employee_id and company_id=company and status='active' and deleted_at is null and auth_user_id is null;
   if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
   update public.employee_access_invites set claimed_at=now(),claimed_by=uid_ where id=ei.id;
  elsif item->>'kind'='teamInvite' then
   select * into ci from public.company_member_invites where id=invite_id and company_id=company and token_hash=expected and lower(email)=mail and expires_at>now() and status='INVITED' for update;
   if not found then raise exception 'Ein Teamzugang der Einladung ist nicht mehr verfügbar'; end if;
   if ci.role='ADMIN' then insert into private.sf_multi_claim_context(txid,user_id,company_id,invite_id) values(pg_catalog.txid_current(),uid_,company,ci.id); end if;
   insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(company,uid_,ci.role,'ACTIVE',ci.access_role,ci.extra_permissions) on conflict do nothing;
   if not found then raise exception 'Für dieses Unternehmen besteht bereits ein Zugang'; end if;
   if ci.employee_id is not null then
    update public.employees set auth_user_id=uid_,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=ci.employee_id and company_id=company and auth_user_id is null and status='active' and deleted_at is null;
    if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
   end if;
   update public.company_member_invites set status='CLAIMED',claimed_by=uid_,claimed_at=now() where id=ci.id;
   delete from private.sf_multi_claim_context where txid=pg_catalog.txid_current() and user_id=uid_ and company_id=company;
  else raise exception 'Ungültige Einladungsart'; end if;
  n:=n+1;
 end loop;
 update private.multi_company_invitation_groups set claimed_by=uid_,claimed_at=now() where token_hash=hash_;
 return jsonb_build_object('companies',n);
end $function$
;
CREATE OR REPLACE FUNCTION private.handle_multi_company_invitation_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare raw text; hash_ text; g private.multi_company_invitation_groups%rowtype; item jsonb; ci public.company_member_invites%rowtype; ei public.employee_access_invites%rowtype; company uuid; invite_id uuid; hash_expected text;
begin
 raw:=coalesce(nullif(new.raw_user_meta_data->>'sf_company_invite',''),nullif(new.raw_user_meta_data->>'sf_employee_invite',''));
 if raw is null then return new; end if;
 hash_:=encode(extensions.digest(raw,'sha256'),'hex');
 select * into g from private.multi_company_invitation_groups where token_hash=hash_ for update;
 if not found then return new; end if;
 if g.claimed_at is not null or g.expires_at<=now() or lower(coalesce(new.email,''))<>g.email then raise exception 'Die gemeinsame Einladung ist ungültig oder abgelaufen'; end if;
 for item in select value from jsonb_array_elements(g.entries) order by value->>'company_id' loop
  company:=(item->>'company_id')::uuid; invite_id:=(item->>'id')::uuid; hash_expected:=item->>'hash';
  if item->>'kind'='employeeInvite' then
   select * into ei from public.employee_access_invites where id=invite_id and company_id=company and token_hash=hash_expected and lower(email)=g.email and expires_at>now() for update;
   if not found then raise exception 'Ein Mitarbeiterzugang der Einladung ist nicht mehr verfügbar'; end if;
   if hash_expected=hash_ then
    if ei.claimed_by is distinct from new.id or ei.claimed_at is null then raise exception 'Einladungszugang wurde nicht bestätigt'; end if;
   else
    if ei.claimed_at is not null then raise exception 'Mitarbeitereinladung bereits verwendet'; end if;
    update public.employees set auth_user_id=new.id,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=ei.employee_id and company_id=company and status='active' and deleted_at is null and (auth_user_id is null or auth_user_id=new.id);
    if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
    update public.employee_access_invites set claimed_at=now(),claimed_by=new.id where id=ei.id;
   end if;
  elsif item->>'kind'='teamInvite' then
   select * into ci from public.company_member_invites where id=invite_id and company_id=company and token_hash=hash_expected and lower(email)=g.email and expires_at>now() for update;
   if not found then raise exception 'Ein Teamzugang der Einladung ist nicht mehr verfügbar'; end if;
   if hash_expected=hash_ then
    if ci.claimed_by is distinct from new.id or ci.status<>'CLAIMED' then raise exception 'Einladungszugang wurde nicht bestätigt'; end if;
   else
    if ci.status<>'INVITED' then raise exception 'Teameinladung ist nicht mehr aktiv'; end if;
    insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(ci.company_id,new.id,ci.role,'ACTIVE',ci.access_role,ci.extra_permissions);
    if ci.employee_id is not null then
     update public.employees set auth_user_id=new.id,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=ci.employee_id and company_id=company and auth_user_id is null and status='active' and deleted_at is null;
     if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
    end if;
    update public.company_member_invites set status='CLAIMED',claimed_by=new.id,claimed_at=now() where id=ci.id;
   end if;
  else raise exception 'Ungültige Einladungsart'; end if;
 end loop;
 update private.multi_company_invitation_groups set claimed_by=new.id,claimed_at=now() where token_hash=hash_;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_multi_company_invite(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.claim_multi_company_invite(p_token)$function$
;
CREATE OR REPLACE FUNCTION public.manager_create_multi_access_invite(p_source uuid, p_email text, p_targets jsonb, p_token_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manager_create_multi_access_invite(p_source,p_email,p_targets,p_token_hash)$function$
;
CREATE OR REPLACE FUNCTION public.manager_multi_invite_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.manager_multi_invite_options()$function$
;
CREATE OR REPLACE FUNCTION public.manager_multi_invite_snapshot(p_company_id uuid, p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.manager_multi_invite_snapshot(p_company_id,p_invite_id)$function$
;
CREATE OR REPLACE FUNCTION public.manager_renew_multi_access_invite(p_source uuid, p_invite_id uuid, p_email text, p_targets jsonb, p_token_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manager_renew_multi_access_invite(p_source,p_invite_id,p_email,p_targets,p_token_hash)$function$
;
CREATE OR REPLACE FUNCTION public.manager_revoke_multi_or_single_invite(p_company_id uuid, p_invite_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manager_revoke_multi_or_single_invite(p_company_id,p_invite_id)$function$
;
drop trigger if exists zz_schichtfunk_multi_company_signup on auth.users;
create trigger zz_schichtfunk_multi_company_signup after insert on auth.users for each row execute function private.handle_multi_company_invitation_signup();
revoke all on function private.claim_multi_company_invite(text) from public,anon; grant execute on function private.claim_multi_company_invite(text) to authenticated;
revoke all on function private.handle_multi_company_invitation_signup() from public,anon,authenticated;
revoke all on function private.manager_create_multi_access_invite(uuid,text,jsonb,text) from public,anon; grant execute on function private.manager_create_multi_access_invite(uuid,text,jsonb,text) to authenticated;
revoke all on function private.manager_multi_invite_options() from public,anon; grant execute on function private.manager_multi_invite_options() to authenticated;
revoke all on function private.manager_multi_invite_snapshot(uuid,uuid) from public,anon; grant execute on function private.manager_multi_invite_snapshot(uuid,uuid) to authenticated;
revoke all on function private.manager_renew_multi_access_invite(uuid,uuid,text,jsonb,text) from public,anon; grant execute on function private.manager_renew_multi_access_invite(uuid,uuid,text,jsonb,text) to authenticated;
revoke all on function private.manager_revoke_multi_or_single_invite(uuid,uuid) from public,anon; grant execute on function private.manager_revoke_multi_or_single_invite(uuid,uuid) to authenticated;
revoke all on function public.claim_multi_company_invite(text) from public,anon; grant execute on function public.claim_multi_company_invite(text) to authenticated;
revoke all on function public.manager_create_multi_access_invite(uuid,text,jsonb,text) from public,anon; grant execute on function public.manager_create_multi_access_invite(uuid,text,jsonb,text) to authenticated;
revoke all on function public.manager_multi_invite_options() from public,anon; grant execute on function public.manager_multi_invite_options() to authenticated;
revoke all on function public.manager_multi_invite_snapshot(uuid,uuid) from public,anon; grant execute on function public.manager_multi_invite_snapshot(uuid,uuid) to authenticated;
revoke all on function public.manager_renew_multi_access_invite(uuid,uuid,text,jsonb,text) from public,anon; grant execute on function public.manager_renew_multi_access_invite(uuid,uuid,text,jsonb,text) to authenticated;
revoke all on function public.manager_revoke_multi_or_single_invite(uuid,uuid) from public,anon; grant execute on function public.manager_revoke_multi_or_single_invite(uuid,uuid) to authenticated;

-- Invitation email: return company names only after verifying access to every target.
create or replace function private.multi_invite_email_companies(p_company_id uuid,p_invite_id uuid,p_kind text,p_hash text)
returns text language plpgsql stable security definer set search_path='' as $fn$
declare g private.multi_company_invitation_groups%rowtype; item jsonb; cid uuid; result text;
begin
 if auth.uid() is null or not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 perform private.sf_assert_aal2('send_invitation_email');
 select * into g from private.multi_company_invitation_groups where token_hash=p_hash and claimed_at is null and expires_at>now();
 if not found then return null; end if;
 if not exists(select 1 from jsonb_array_elements(g.entries) x where x->>'company_id'=p_company_id::text and x->>'id'=p_invite_id::text and x->>'kind'=p_kind and x->>'hash'=p_hash) then raise exception 'Einladung nicht verfügbar' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(g.entries) loop
  cid:=(item->>'company_id')::uuid;
  if not private.can_manage_company_users(cid) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
  if item->>'kind'='teamInvite' and exists(select 1 from public.company_member_invites i where i.id=(item->>'id')::uuid and i.company_id=cid and i.access_role='ADMIN')
   and not exists(select 1 from public.company_members m where m.company_id=cid and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='OWNER' and m.access_role='OWNER') then raise exception 'Nur der Inhaber darf Administratoren einladen' using errcode='42501'; end if;
 end loop;
 select string_agg(c.name,', ' order by c.name) into result from public.companies c where c.id in (select (x->>'company_id')::uuid from jsonb_array_elements(g.entries) x);
 return result;
end $fn$;
create or replace function public.multi_invite_email_companies(p_company_id uuid,p_invite_id uuid,p_kind text,p_hash text)
returns text language sql stable set search_path='' as $fn$ select private.multi_invite_email_companies(p_company_id,p_invite_id,p_kind,p_hash) $fn$;
revoke all on function private.multi_invite_email_companies(uuid,uuid,text,text) from public,anon;
revoke all on function public.multi_invite_email_companies(uuid,uuid,text,text) from public,anon;
grant execute on function private.multi_invite_email_companies(uuid,uuid,text,text) to authenticated;
grant execute on function public.multi_invite_email_companies(uuid,uuid,text,text) to authenticated;

do $test$
declare o uuid:=gen_random_uuid();u uuid; a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();e uuid; mail text; raw text; anchor uuid; result jsonb; it integer; rejected boolean; wrong_id uuid;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(o,'sign-owner-'||o::text||'@example.invalid',now(),'{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'Sign A',o),(b,'Sign B',o);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(a,o,'OWNER','ACTIVE','OWNER'),(b,o,'OWNER','ACTIVE','OWNER');
 for it in 1..2 loop
  u:=gen_random_uuid(); e:=gen_random_uuid();mail:='sign-'||u::text||'@example.invalid';raw:=repeat(case when it=1 then 'a' else 'b' end,72);anchor:=case when it=1 then a else b end;
  insert into public.employees(id,company_id,first_name,last_name,personnel_no,email) values(e,a,'QA','Signup','QS-'||left(e::text,8),mail);
  perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','aal','aal2')::text,true);
  result:=private.manager_create_multi_access_invite(anchor,mail,jsonb_build_array(jsonb_build_object('company_id',a,'role','EMPLOYEE','employee_id',e),jsonb_build_object('company_id',b,'role','ADMIN')),encode(extensions.digest(raw,'sha256'),'hex'));
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  wrong_id:=gen_random_uuid();rejected:=false;
  begin
   insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(wrong_id,'wrong-'||wrong_id::text||'@example.invalid',null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));
  exception when others then rejected:=true;end;
  if not rejected or exists(select 1 from auth.users where id=wrong_id) then raise exception 'wrong email signup accepted';end if;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,mail,null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));
  if not exists(select 1 from public.employees where id=e and auth_user_id=u and company_id=a and access_status='ACTIVE') then raise exception 'employee missing for anchor %',it; end if;
  if not exists(select 1 from public.company_members where company_id=b and user_id=u and access_role='ADMIN' and status='ACTIVE') then raise exception 'admin missing for anchor %',it; end if;
  if not exists(select 1 from private.multi_company_invitation_groups where token_hash=encode(extensions.digest(raw,'sha256'),'hex') and claimed_by=u and claimed_at is not null) then raise exception 'group not claimed for anchor %',it; end if;
  -- Free the original address so a duplicate-email constraint cannot mask token replay.
  update auth.users set email='released-'||u::text||'@example.invalid' where id=u;
  rejected:=false;wrong_id:=gen_random_uuid();
  begin
   insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(wrong_id,mail,null,jsonb_build_object(case when it=1 then 'sf_employee_invite' else 'sf_company_invite' end,raw));
  exception when others then rejected:=true;end;
  if not rejected then raise exception 'reused signup token accepted';end if;
 end loop;
end $test$;
rollback;