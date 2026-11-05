-- QA ONLY. Synthetic policies and rollback. Not a production migration.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create policy sf_employee_active_read on public.employees as restrictive for select to authenticated using (true);
create policy sf_assignment_active_read on public.shift_assignments as restrictive for select to authenticated using (true);
create policy sf_time_capability_read on public.time_entries as restrictive for select to authenticated using (true);
-- Draft for isolated QA testing; not a production migration.
-- Returns only active profiles belonging to the caller.
create or replace function private.sf_employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $function$
 select c.id,c.name,e.id
 from public.employees e join public.companies c on c.id=e.company_id
 where auth.uid() is not null
   and not private.sf_has_time_only_login()
   and e.auth_user_id=auth.uid() and e.status='active'
   and e.access_status='ACTIVE' and e.deleted_at is null
   and not exists (
     select 1 from public.company_members m
     where m.company_id=e.company_id and m.user_id=auth.uid()
       and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING')
            or 'read_only'=any(m.extra_permissions))
   )
 order by c.name,c.id,e.id
$function$;

create or replace function public.employee_company_options()
returns table(company_id uuid, company_name text, employee_id uuid)
language sql stable set search_path = '' as $function$
 select * from private.sf_employee_company_options()
$function$;

create or replace function private.multi_role_company_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Nicht angemeldet' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.company_name,q.company_id,q.mode),'[]'::jsonb)
 into result from (
   select c.id company_id,c.name company_name,'manager'::text mode,m.role role
   from public.company_members m join public.companies c on c.id=m.company_id
   where m.user_id=auth.uid() and m.status='ACTIVE'
   union all
   select o.company_id,o.company_name,'employee'::text,'EMPLOYEE'::text
   from private.sf_employee_company_options() o
 ) q;
 return result;
end $function$;

create or replace function public.multi_role_company_options()
returns jsonb language sql stable set search_path = '' as $function$
 select private.multi_role_company_options()
$function$;

revoke all on function private.sf_employee_company_options() from public,anon;
revoke all on function public.employee_company_options() from public,anon;
revoke all on function private.multi_role_company_options() from public,anon;
revoke all on function public.multi_role_company_options() from public,anon;
grant execute on function private.sf_employee_company_options() to authenticated;
grant execute on function public.employee_company_options() to authenticated;
grant execute on function private.multi_role_company_options() to authenticated;
grant execute on function public.multi_role_company_options() to authenticated;

-- Draft: resolve an explicitly selected company to exactly one active employee.
-- This helper does not change existing portal endpoints or policies.
create or replace function private.sf_employee_identity_for_company(p_company uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $function$
declare ids uuid[];
begin
 if auth.uid() is null or p_company is null then
   raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501';
 end if;
 select array_agg(o.employee_id) into ids
 from private.sf_employee_company_options() o where o.company_id=p_company;
 if coalesce(cardinality(ids),0)<>1 then
   raise exception 'Kein eindeutiger aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501';
 end if;
 return ids[1];
end $function$;
revoke all on function private.sf_employee_identity_for_company(uuid) from public,anon,authenticated;

-- Draft: explicit-company lists; legacy multi-profile lists fail closed.
create or replace function private.sf_single_active_employee_company() returns uuid
language plpgsql stable security definer set search_path='' as $fn$
declare ids uuid[];
begin
 select array_agg(o.company_id) into ids from private.sf_employee_company_options() o;
 if coalesce(cardinality(ids),0)<>1 then raise exception 'Bitte das Mitarbeiterportal neu laden und ein Unternehmen auswählen' using errcode='42501';end if;
 return ids[1];
end $fn$;
revoke all on function private.sf_single_active_employee_company() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sf_list_shift_swaps_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_employee_id uuid;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  v_employee_id:=private.sf_employee_identity_for_company(p_company_id);
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  return query
  select s.id,
         case when s.original_employee_id=v_employee_id then 'OUTGOING' else 'INCOMING' end,
         s.status,
         s.assignment_id,
         a.shift_code,
         a.starts_at,
         a.ends_at,
         trim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,'')),
         s.reason,s.colleague_comment,s.manager_comment,s.requested_at
  from public.shift_swap_requests s
  left join public.shift_assignments a on a.id=s.assignment_id
  join public.employees orig on orig.id=s.original_employee_id
  join public.employees targ on targ.id=s.target_employee_id
  join public.employees o on o.id=case when s.original_employee_id=v_employee_id then s.target_employee_id else s.original_employee_id end
  where s.company_id=p_company_id and (s.original_employee_id=v_employee_id or s.target_employee_id=v_employee_id)
  order by s.requested_at desc
  limit 50;
end
$function$
;
CREATE OR REPLACE FUNCTION private.sf_list_shift_marketplace_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select e.* into v_emp
  from public.employees e
  where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query
  select s.id,s.original_employee_id=v_emp.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,
    trim(o.first_name||' '||o.last_name),o.role,s.reason,s.requested_at,
    (s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id and private.sf_swap_candidate_reason(a.id,v_emp.id) is null),
    case when s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id then private.sf_swap_candidate_reason(a.id,v_emp.id) else null end
  from public.shift_swap_requests s
  join public.shift_assignments a on a.id=s.assignment_id
  join public.employees o on o.id=s.original_employee_id
  where s.company_id=v_emp.company_id
    and (s.status='MARKET_OPEN' or s.original_employee_id=v_emp.id or s.target_employee_id=v_emp.id)
  order by case when s.status='MARKET_OPEN' then 0 else 1 end,s.requested_at desc
  limit 100;
end $function$
;

create or replace function private.employee_list_shift_swaps_impl() RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function private.employee_list_shift_marketplace_impl() RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql security definer set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(private.sf_single_active_employee_company())
$fn$;
create or replace function public.employee_list_shift_swaps_for_company(p_company_id uuid) RETURNS TABLE(id uuid, direction text, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, other_employee_name text, reason text, colleague_comment text, manager_comment text, requested_at timestamp with time zone)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_swaps_for_company(p_company_id)
$fn$;
create or replace function public.employee_list_shift_marketplace_for_company(p_company_id uuid) RETURNS TABLE(id uuid, is_own boolean, status text, assignment_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, offered_by text, employee_role text, reason text, requested_at timestamp with time zone, can_take boolean, block_reason text)
language sql set search_path='' as $fn$
 select * from private.sf_list_shift_marketplace_for_company(p_company_id)
$fn$;
revoke all on function private.sf_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function private.sf_list_shift_marketplace_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_swaps_for_company(uuid) from public,anon;
revoke all on function public.employee_list_shift_marketplace_for_company(uuid) from public,anon;
grant execute on function private.sf_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function private.sf_list_shift_marketplace_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_swaps_for_company(uuid) to authenticated;
grant execute on function public.employee_list_shift_marketplace_for_company(uuid) to authenticated;

-- Definition supplied by its consolidated compatibility candidate.

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
-- Definition supplied by its consolidated compatibility candidate.
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
-- QA: existing trigger retained for rollback-only check
-- QA: existing trigger retained for rollback-only check
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

-- Draft: accept legacy single-company links by confirmed existing accounts; depends on invitation candidate.
CREATE OR REPLACE FUNCTION private.claim_multi_company_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid_ uuid:=auth.uid(); mail text; hash_ text; g private.multi_company_invitation_groups%rowtype;
 item jsonb; ci public.company_member_invites%rowtype; ei public.employee_access_invites%rowtype;
 company uuid; invite_id uuid; expected text; n integer:=0; single_count integer:=0;
begin
 if uid_ is null or coalesce(p_token,'') !~ '^[a-f0-9-]{64,96}$' then raise exception 'Ungültige Einladung' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=uid_ and email_confirmed_at is not null;
 if mail is null then raise exception 'Bitte bestätige zuerst die E-Mail-Adresse deines Kontos' using errcode='42501'; end if;
 hash_:=encode(extensions.digest(p_token,'sha256'),'hex');
 -- A hash-scoped lock serializes group creation and single-invite acceptance.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(hash_,72116));
 select * into g from private.multi_company_invitation_groups where token_hash=hash_ for update;
 if not found then
  -- Existing standalone invitations retain their old link and can be claimed by a confirmed account.
  select (select count(*) from public.employee_access_invites x where x.token_hash=hash_ and lower(x.email)=mail and x.claimed_at is null and x.expires_at>now())
       + (select count(*) from public.company_member_invites x where x.token_hash=hash_ and lower(x.email)=mail and x.status='INVITED' and x.claimed_at is null and x.expires_at>now())
    into single_count;
  if single_count<>1 then raise exception 'Ungültige oder abgelaufene Einladung' using errcode='42501'; end if;
  select * into ei from public.employee_access_invites x where x.token_hash=hash_ and lower(x.email)=mail and x.claimed_at is null and x.expires_at>now() for update;
  if found then
   insert into private.multi_company_invitation_groups(token_hash,email,entries,expires_at,created_by)
   values(hash_,mail,jsonb_build_array(jsonb_build_object('company_id',ei.company_id,'id',ei.id,'kind','employeeInvite','hash',hash_)),ei.expires_at,ei.created_by);
  else
   select * into ci from public.company_member_invites x where x.token_hash=hash_ and lower(x.email)=mail and x.status='INVITED' and x.claimed_at is null and x.expires_at>now() for update;
   if not found then raise exception 'Ungültige oder abgelaufene Einladung' using errcode='42501'; end if;
   insert into private.multi_company_invitation_groups(token_hash,email,entries,expires_at,created_by)
   values(hash_,mail,jsonb_build_array(jsonb_build_object('company_id',ci.company_id,'id',ci.id,'kind','teamInvite','hash',hash_)),ci.expires_at,ci.created_by);
  end if;
  select * into g from private.multi_company_invitation_groups where token_hash=hash_ for update;
 end if;
 if g.claimed_at is not null or g.expires_at<=now() or g.email<>mail then raise exception 'Ungültige oder abgelaufene Einladung' using errcode='42501'; end if;
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
end $function$;

-- Draft: managing linked employee access; depends on per-company identity uniqueness migration.
CREATE OR REPLACE FUNCTION private.manager_employee_company_profiles(p_source uuid, p_employee uuid)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_user uuid; verified_email text;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id,case when u.email_confirmed_at is not null then lower(trim(u.email)) end
 into target_user,verified_email from public.employees e join auth.users u on u.id=e.auth_user_id
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 return query select c.id,c.name,e.id,(e.auth_user_id=target_user and e.access_status='ACTIVE')
 from public.employees e join public.companies c on c.id=e.company_id
 join public.company_members m on m.company_id=e.company_id and m.user_id=auth.uid()
 where e.deleted_at is null and e.status='active' and m.status='ACTIVE'
 and m.role in ('OWNER','ADMIN') and m.access_role in ('OWNER','ADMIN')
 and (e.auth_user_id=target_user or (e.auth_user_id is null and e.access_status='NONE'
   and verified_email is not null and lower(trim(e.email))=verified_email
   and not exists(select 1 from public.employees linked where linked.company_id=e.company_id and linked.auth_user_id=target_user and linked.deleted_at is null)
   and not exists(select 1 from public.employee_access_invites i where i.employee_id=e.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=e.id and i.status='INVITED' and i.expires_at>now())))
 and not exists(select 1 from public.company_members x where x.company_id=e.company_id and x.user_id=target_user)
 order by c.name,c.id,e.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.manager_set_employee_company_access(p_source uuid, p_employee uuid, p_target uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_user uuid; verified_email text; profile public.employees%rowtype;
begin
 if auth.uid() is null or private.sf_request_aal()<>'aal2' or p_enabled is null or not private.can_manage_company_users(p_source)
 then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select e.auth_user_id,case when u.email_confirmed_at is not null then lower(trim(u.email)) end
 into target_user,verified_email from public.employees e join auth.users u on u.id=e.auth_user_id
 where e.id=p_employee and e.company_id=p_source and e.deleted_at is null for update of e;
 if target_user is null or target_user=auth.uid() then raise exception 'Mitarbeiterkonto nicht verfügbar' using errcode='42501'; end if;
 select * into profile from public.employees e where e.id=p_target and e.deleted_at is null and e.status='active' for update;
 if not found or not private.can_manage_company_users(profile.company_id)
 or exists(select 1 from public.company_members x where x.company_id=profile.company_id and x.user_id=target_user)
 then raise exception 'Nicht berechtigt für dieses Mitarbeiterprofil' using errcode='42501'; end if;
 if profile.auth_user_id=target_user and profile.access_status in ('ACTIVE','DISABLED') then
  update public.employees set access_status=case when p_enabled then 'ACTIVE' else 'DISABLED' end,updated_at=now() where id=p_target;
 elsif profile.auth_user_id is null and p_enabled and profile.access_status='NONE' and verified_email is not null
   and lower(trim(profile.email))=verified_email
   and not exists(select 1 from public.employees linked where linked.company_id=profile.company_id and linked.auth_user_id=target_user and linked.deleted_at is null)
   and not exists(select 1 from public.employee_access_invites i where i.employee_id=profile.id and i.claimed_at is null and i.expires_at>now())
   and not exists(select 1 from public.company_member_invites i where i.employee_id=profile.id and i.status='INVITED' and i.expires_at>now()) then
  update public.employees set auth_user_id=target_user,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=p_target;
 else raise exception 'Das Mitarbeiterprofil kann diesem Konto nicht zugeordnet werden' using errcode='42501'; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
 values(profile.company_id,'EMPLOYEE_COMPANY_ACCESS_CHANGED','employee',profile.id,auth.uid(),
 (select m.access_role from public.company_members m where m.company_id=profile.company_id and m.user_id=auth.uid() and m.status='ACTIVE' limit 1),
 jsonb_build_object('access_status',profile.access_status,'linked',profile.auth_user_id is not null),
 jsonb_build_object('access_status',case when p_enabled then 'ACTIVE' else 'DISABLED' end,'linked',true));
end $function$
;
CREATE OR REPLACE FUNCTION public.manager_employee_company_profiles(p_source uuid, p_employee uuid)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, enabled boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select * from private.manager_employee_company_profiles(p_source,p_employee)$function$
;
CREATE OR REPLACE FUNCTION public.manager_set_employee_company_access(p_source uuid, p_employee uuid, p_target uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.manager_set_employee_company_access(p_source,p_employee,p_target,p_enabled)$function$
;

revoke all on function private.manager_employee_company_profiles(uuid,uuid) from public,anon;
revoke all on function private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.manager_employee_company_profiles(uuid,uuid) from public,anon;
revoke all on function public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function private.manager_employee_company_profiles(uuid,uuid) to authenticated;
grant execute on function private.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.manager_employee_company_profiles(uuid,uuid) to authenticated;
grant execute on function public.manager_set_employee_company_access(uuid,uuid,uuid,boolean) to authenticated;

-- Draft: install only after migration and full authorization review.
-- Existing permissive policies and manager/time-manager capabilities remain in force.
-- sf_employee_company_options() checks the authenticated user, active/deleted state,
-- and the company's disabled/read-only/time-only restrictions.
alter policy sf_employee_active_read on public.employees
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=employees.company_id and o.employee_id=employees.id));

alter policy sf_assignment_active_read on public.shift_assignments
 using (private.sf_is_manager(company_id,false) or
   exists(select 1 from private.sf_employee_company_options() o
     where o.company_id=shift_assignments.company_id and o.employee_id=shift_assignments.employee_id));

alter policy sf_time_capability_read on public.time_entries
 using (private.sf_can_manage_time(company_id) or
   exists(select 1 from public.shift_assignments sa
     join private.sf_employee_company_options() o on o.company_id=sa.company_id and o.employee_id=sa.employee_id
     where sa.id=time_entries.assignment_id and sa.company_id=time_entries.company_id));

-- Draft: preserve production overlap locking and validation; require an active identity in the chosen company.
CREATE OR REPLACE FUNCTION private.employee_submit_absence_request_for_company(p_company_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_full_day boolean DEFAULT true, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_time_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_id uuid;
  v_type text := btrim(coalesce(p_absence_type,''));
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_type not in ('Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office','Frei','Fortbildung','Sperrzeit','Sonstiges') then
    raise exception 'Ungültige Abwesenheitsart';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Bitte einen gültigen Zeitraum wählen';
  end if;
  if (p_end_date - p_start_date) > 366 then raise exception 'Der Zeitraum ist zu lang'; end if;
  if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then
    raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  -- Enforce the same active, company-specific identity for every entry point.
  perform private.sf_employee_identity_for_company(p_company_id);

  select e.* into v_employee
  from public.employees e
  where e.auth_user_id=v_uid and e.company_id=p_company_id and e.status='active'
    and e.access_status='ACTIVE' and e.deleted_at is null
    and not exists(select 1 from public.company_members m where m.company_id=e.company_id and m.user_id=v_uid and m.status<>'ACTIVE')
  order by e.id limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  -- Serialize absence submissions for the same employee. Without this lock,
  -- concurrent requests can both pass the overlap check before either inserts.
  perform pg_advisory_xact_lock(
    hashtextextended('absence-request:' || v_employee.id::text, 0)
  );

  if exists (
    select 1 from public.absences a
    where a.employee_id=v_employee.id
      and a.status in ('Beantragt','Genehmigt','Erfasst')
      and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  insert into public.absences(
    company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,
    start_time,end_time,time_note,note,request_source,requested_by,requested_at
  ) values (
    v_employee.company_id,v_employee.id,null,p_start_date,p_end_date,v_type,'Beantragt',coalesce(p_full_day,true),
    case when coalesce(p_full_day,true) then null else p_start_time end,
    case when coalesce(p_full_day,true) then null else p_end_time end,
    coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',v_uid,now()
  ) returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_employee.company_id,'ABSENCE_REQUEST_CREATED','absence',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('status','Beantragt','type',v_type,'startDate',p_start_date,'endDate',p_end_date),
    jsonb_build_object('source','EMPLOYEE_PORTAL'));

  return v_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.employee_submit_absence_request_for_company(p_company_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_full_day boolean DEFAULT true, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_time_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.employee_submit_absence_request_for_company(p_company_id,p_absence_type,p_start_date,p_end_date,p_note,p_full_day,p_start_time,p_end_time,p_time_note)
$function$
;

-- Draft: require active company identity before loading portal summary, company profile or leave balance.
CREATE OR REPLACE FUNCTION private.employee_home_summary_impl(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
 v_now timestamptz:=statement_timestamp(); v_timezone text; v_next jsonb; v_qr jsonb; v_sites jsonb;
 v_changes integer; v_replacements integer; v_feedback integer; v_swaps integer; v_handover integer; v_wishes integer; v_wish_month text;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if v_uid is null or p_company_id is null then
  raise exception 'Bitte mit einem Mitarbeiterzugang anmelden' using errcode='42501';
 end if;
 if private.sf_has_time_only_login() then
  raise exception 'Dieser Zugang ist nur für die Zeiterfassung' using errcode='42501';
 end if;
 select e.* into v_employee from public.employees e
 where e.auth_user_id=v_uid and e.company_id=p_company_id
  and e.status='active' and e.access_status='ACTIVE'
  and not exists(select 1 from public.company_members m where m.company_id=e.company_id
   and m.user_id=v_uid and m.status<>'ACTIVE')
 order by e.id limit 1;
 if not found then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 select coalesce(c.timezone,'Europe/Berlin') into v_timezone from public.companies c where c.id=p_company_id;
 select jsonb_build_object('id',a.id,'shift_code',a.shift_code,'name',coalesce(t.name,a.shift_code),
  'starts_at',a.starts_at,'ends_at',a.ends_at,'break_minutes',a.break_minutes,
  'site_name',nullif(l.name,''),'site_address',coalesce(l.address,'')) into v_next
 from public.shift_assignments a
 left join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 left join public.company_locations l on l.id=t.site_id and l.company_id=a.company_id
 where a.company_id=p_company_id and a.employee_id=v_employee.id
  and a.status='PUBLISHED' and a.published_at is not null and a.ends_at>v_now
 order by a.starts_at,a.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'name',l.name,'address',coalesce(l.address,'')) order by t.code),'[]'::jsonb) into v_sites
 from public.shift_templates t join public.company_locations l on l.id=t.site_id and l.company_id=t.company_id
 where t.company_id=p_company_id;
 select jsonb_build_object('id',s.id,'started_at',s.started_at,'terminal_name',t.name,
  'location_note',coalesce(t.location_note,''),
  'state',case when exists(select 1 from public.time_qr_independent_breaks b where b.shift_id=s.id and b.ended_at is null) then 'BREAK' else 'RUNNING' end,
  'attendance_seconds',greatest(0,extract(epoch from(v_now-s.started_at))),
  'pause_seconds',coalesce((select sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))) from public.time_qr_independent_breaks b where b.shift_id=s.id),0)) into v_qr
 from public.time_qr_independent_shifts s
 join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
 where s.company_id=p_company_id and s.employee_id=v_employee.id and s.ended_at is null
 order by s.started_at desc,s.id limit 1;
 select count(*)::integer into v_changes from public.shift_change_requests r
 where r.company_id=p_company_id and r.employee_id=v_employee.id and r.requires_employee_approval
  and r.status not in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED')
  and not exists(select 1 from public.shift_change_approvals a where a.change_request_id=r.id
   and a.approval_type='EMPLOYEE' and a.status<>'PENDING');
 select count(*)::integer into v_replacements from public.disruption_offers o
 join public.disruption_incidents i on i.id=o.incident_id and i.company_id=o.company_id
 join public.shift_assignments a on a.id=i.assignment_id and a.company_id=o.company_id
 where o.company_id=p_company_id and o.employee_id=v_employee.id and o.status='OFFERED'
  and o.expires_at>v_now and i.status='OPEN' and a.ends_at>v_now;
 select count(*)::integer into v_feedback from public.notifications n
 where n.company_id=p_company_id and n.user_id=v_uid and n.employee_id=v_employee.id and not n.is_read
  and n.kind in ('ABSENCE_DECISION','ABSENCE_REQUEST_APPROVED','ABSENCE_REQUEST_REJECTED','PROFILE_DECISION');
 select count(*)::integer into v_swaps from public.shift_swap_requests r
 join public.shift_assignments a on a.id=r.assignment_id and a.company_id=r.company_id
 where r.company_id=p_company_id and r.target_employee_id=v_employee.id
  and r.status='PENDING_COLLEAGUE' and a.status='PUBLISHED' and a.published_at is not null and a.ends_at>v_now;
 select count(*)::integer,to_char(min(greatest(w.start_date,(v_now at time zone v_timezone)::date)),'YYYY-MM') into v_wishes,v_wish_month
 from public.planning_wishes w where w.company_id=p_company_id and w.employee_id=v_employee.id
  and w.status='RELEASE_REQUESTED' and w.end_date>=(v_now at time zone v_timezone)::date;
 with own_boards as (
  select b.* from public.shift_handovers b where b.company_id=p_company_id and b.state='WORKING'
   and b.ends_at>=((v_now at time zone v_timezone)::date-7)::timestamp at time zone v_timezone
   and b.starts_at<((v_now at time zone v_timezone)::date+8)::timestamp at time zone v_timezone
   and exists(select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
    where a.company_id=p_company_id and a.employee_id=v_employee.id and a.status='PUBLISHED' and a.published_at is not null
     and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at and t.site_id is not distinct from b.site_id)
 ) select ((select count(*) from public.shift_handovers src join own_boards b on b.id=src.target_id
    where src.company_id=p_company_id and src.state='SENT' and src.received_at is null)
   +(select count(*) from public.shift_handover_items i join own_boards b on b.id=i.board_id
    where i.company_id=p_company_id and i.responsible_employee_id=v_employee.id and i.status in ('OPEN','IN_PROGRESS')))::integer into v_handover;
 return jsonb_build_object('employee_id',v_employee.id,'company_id',p_company_id,'as_of',v_now,
  'timezone',coalesce(v_timezone,'Europe/Berlin'),'next_shift',v_next,'qr',v_qr,'sites',v_sites,'wish_month',v_wish_month,
  'tasks',jsonb_build_object('changes',v_changes,'replacements',v_replacements,'feedback',v_feedback,'swaps',v_swaps,'handover',v_handover,'wishes',v_wishes));
end;$function$
;

CREATE OR REPLACE FUNCTION private.employee_my_company_profile(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if auth.uid() is null or not exists(select 1 from public.employees e where e.company_id=p_company_id and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null) then raise exception using errcode='42501',message='Kein aktiver Mitarbeiterzugang für dieses Unternehmen.'; end if;
 select jsonb_build_object('company_id',c.id,'name',c.name,'timezone',c.timezone,'display_location',coalesce(p.display_location,''),'logo_data_url',coalesce(p.logo_data_url,''),'contacts',coalesce((select jsonb_agg(x) from jsonb_array_elements(p.contacts)x where x->>'visible_to_employees'='true'),'[]'::jsonb)) into result from public.companies c left join public.company_profiles p on p.company_id=c.id where c.id=p_company_id;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.employee_my_leave_account(p_company_id uuid, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e uuid;
begin
  perform private.sf_employee_identity_for_company(p_company_id);
if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Mitarbeiterzugang' using errcode='42501'; end if;
 select id into e from public.employees b where b.company_id=p_company_id and b.auth_user_id=auth.uid()
  and b.status='active' and b.access_status='ACTIVE' and b.deleted_at is null
  and not exists(select 1 from public.company_members m where m.company_id=b.company_id and m.user_id=auth.uid() and m.status<>'ACTIVE')
 order by id limit 1;
 if e is null then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return private.leave_account_bundle(e,p_year);
end;$function$
;

-- Draft: explicitly scoped wage and time account views; ambiguous legacy calls fail closed.
CREATE OR REPLACE FUNCTION private.sf_employee_wage_month_for_company(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_tz text;
  v_state text;
  v_month date;
  v_next date;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz:=statement_timestamp();
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees
    where id=private.sf_employee_identity_for_company(p_company_id) and company_id=p_company_id;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=v_employee.company_id;
  select coalesce(federal_state,'DE') into v_state from public.time_account_settings where company_id=v_employee.company_id;
  v_state:=coalesce(v_state,'DE');
  if p_month is not null and (p_month<date '1900-01-01' or p_month>=date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023'; end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_tz)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  v_start:=v_month::timestamp at time zone v_tz;v_end:=v_next::timestamp at time zone v_tz;
  with qr as materialized (
    select s.id,s.started_at,s.ended_at,t.name label from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at<v_end and coalesce(s.ended_at,v_now)>v_start
  ), plan as materialized (
    select te.assignment_id id,te.actual_start started_at,te.actual_end ended_at,te.status,sa.shift_code label,
      case when upper(coalesce(te.source,''))='QR' then 0 else greatest(0,coalesce(te.break_minutes,0)) end break_minutes
    from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id
      and sa.company_id=v_employee.company_id and sa.employee_id=v_employee.id
    where te.company_id=v_employee.company_id and te.actual_start is not null
      and te.actual_start<v_end and coalesce(te.actual_end,v_now)>v_start
  ), accepted as (
    select greatest(started_at,v_start) a,least(ended_at,v_end) b,'qr' source from qr
      where ended_at is not null and ended_at<=v_now
    union all
    select greatest(started_at,v_start),least(ended_at-make_interval(mins=>break_minutes),v_end),'plan' from plan
      where status='confirmed' and ended_at is not null and ended_at<=v_now
  ), paid as materialized (
    select tstzrange(a,b,'[)') r from accepted where b>a
  ), merged as materialized (
    select unnest(range_agg(r)) r from paid
  ), calendar as (
    select v_month+n d,h.name holiday_name
    from generate_series(0,v_next-v_month-1) n
    left join private.sf_public_holidays(extract(year from v_month)::integer,v_state) h on h.holiday_date=v_month+n
  ), windows as (
    select c.d,c.holiday_name,
      case when c.holiday_name is not null then 'holiday' when extract(isodow from c.d)=7 then 'sunday'
        when w.h in(0,22) then 'night' else 'base' end kind,
      tstzrange((c.d+w.h*interval '1 hour') at time zone v_tz,
        (c.d+w.next_h*interval '1 hour') at time zone v_tz,'[)') r
    from calendar c cross join (values(0,6),(6,22),(22,24)) w(h,next_h)
  ), portions as (
    select w.d,w.holiday_name,w.kind,extract(epoch from(upper(m.r*w.r)-lower(m.r*w.r))) seconds
    from merged m join windows w on m.r&&w.r
  ), daily as (
    select d,max(holiday_name) holiday_name,sum(seconds) paid_seconds,
      coalesce(sum(seconds) filter(where kind='night'),0) night_seconds,
      coalesce(sum(seconds) filter(where kind='sunday'),0) sunday_seconds,
      coalesce(sum(seconds) filter(where kind='holiday'),0) holiday_seconds
    from portions group by d
  ), pending as (
    select id,'qr' source,label,started_at,ended_at,
      case when ended_at is null then 'open' else 'future' end state from qr where ended_at is null or ended_at>v_now
    union all
    select id,'plan',label,started_at,ended_at,
      case when ended_at is null then 'open' when ended_at>v_now then 'future' else status end from plan
      where status<>'confirmed' or ended_at is null or ended_at>v_now
  )
  select jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_tz,'federal_state',v_state,'as_of',v_now,
    'rates',jsonb_build_object('night',0.2,'sunday',0.5,'holiday',1),
    'totals',jsonb_build_object('paid_seconds',coalesce(sum(paid_seconds),0),'night_seconds',coalesce(sum(night_seconds),0),
      'sunday_seconds',coalesce(sum(sunday_seconds),0),'holiday_seconds',coalesce(sum(holiday_seconds),0)),
    'days',coalesce(jsonb_agg(to_jsonb(daily) order by d) filter(where d is not null),'[]'::jsonb),
    'sources',jsonb_build_object('qr_entries',(select count(*) from qr where ended_at is not null and ended_at<=v_now),
      'confirmed_entries',(select count(*) from plan where status='confirmed' and ended_at is not null and ended_at<=v_now),
      'legacy_break_entries',(select count(*) from plan where status='confirmed' and ended_at<=v_now and break_minutes>0),
      'overlap_seconds',greatest(0,(select coalesce(sum(extract(epoch from(upper(r)-lower(r)))),0) from paid)-coalesce(sum(paid_seconds),0))),
    'pending',coalesce((select jsonb_agg(to_jsonb(pending) order by started_at desc,id) from pending),'[]'::jsonb)
  ) into v_result from daily;
  return v_result;
end;$function$
;
CREATE OR REPLACE FUNCTION private.sf_employee_time_account_for_company(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_employee uuid:=private.sf_employee_identity_for_company(p_company_id); v_company uuid; v_state text; v_row jsonb; v_holidays jsonb; v_snapshot jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_employee is null then raise exception 'Kein aktives Mitarbeiterkonto gefunden'; end if;
  select e.company_id into v_company from public.employees e where e.id=v_employee;
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
$function$
;

create or replace function private.employee_my_wage_month_impl(p_month date default null) returns jsonb
language sql stable security definer set search_path='' as $fn$ select private.sf_employee_wage_month_for_company(private.sf_single_active_employee_company(),p_month) $fn$;
create or replace function public.employee_my_wage_month_for_company(p_company_id uuid,p_month date default null) returns jsonb
language sql stable set search_path='' as $fn$ select private.sf_employee_wage_month_for_company(p_company_id,p_month) $fn$;
create or replace function public.employee_my_time_account_month(p_month date) returns jsonb
language sql stable security definer set search_path='' as $fn$ select private.sf_employee_time_account_for_company(private.sf_single_active_employee_company(),p_month) $fn$;
create or replace function public.employee_my_time_account_month_for_company(p_company_id uuid,p_month date) returns jsonb
language sql stable set search_path='' as $fn$ select private.sf_employee_time_account_for_company(p_company_id,p_month) $fn$;
revoke all on function private.sf_employee_wage_month_for_company(uuid,date) from public,anon;
revoke all on function private.sf_employee_time_account_for_company(uuid,date) from public,anon;
revoke all on function public.employee_my_wage_month_for_company(uuid,date) from public,anon;
revoke all on function public.employee_my_time_account_month_for_company(uuid,date) from public,anon;
grant execute on function private.sf_employee_wage_month_for_company(uuid,date) to authenticated;
grant execute on function private.sf_employee_time_account_for_company(uuid,date) to authenticated;
grant execute on function public.employee_my_wage_month_for_company(uuid,date) to authenticated;
grant execute on function public.employee_my_time_account_month_for_company(uuid,date) to authenticated;

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

-- Draft: preserves current production time-entry validation and audit; adds explicit company identity.
CREATE OR REPLACE FUNCTION private.sf_submit_time_entry_for_company(p_company_id uuid, p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_employee uuid; v_result jsonb;
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  v_employee:=private.sf_employee_identity_for_company(p_company_id);
  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and company_id=p_company_id and employee_id=v_employee and status='PUBLISHED' for update;
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

create or replace function public.employee_submit_time_entry_for_company(p_company_id uuid,p_assignment_id uuid,p_actual_start timestamptz,p_actual_end timestamptz,p_break_minutes integer,p_note text)
returns jsonb language sql set search_path = '' as $function$
 select private.sf_submit_time_entry_for_company(p_company_id,p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note)
$function$;
revoke all on function private.sf_submit_time_entry_for_company(uuid,uuid,timestamptz,timestamptz,integer,text) from public,anon;
revoke all on function public.employee_submit_time_entry_for_company(uuid,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function private.sf_submit_time_entry_for_company(uuid,uuid,timestamptz,timestamptz,integer,text) to authenticated;
grant execute on function public.employee_submit_time_entry_for_company(uuid,uuid,timestamptz,timestamptz,integer,text) to authenticated;

-- Draft: legacy QR terminal selects the active profile for its own company.
CREATE OR REPLACE FUNCTION private.sf_qr_time_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_employee uuid;
  v_terminal public.time_qr_terminals%rowtype;
  v_assignment public.shift_assignments%rowtype;
  v_open_punch public.time_qr_punches%rowtype;
  v_company_timezone text;
  v_candidate_count integer := 0;
  v_entry_status text;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Ungültiger QR-Code'; end if;
  select t.* into v_terminal from public.time_qr_terminals t where t.token_hash = extensions.digest(lower(p_token), 'sha256') and t.is_active = true limit 1;
  if not found then raise exception 'QR-Terminal ist ungültig oder deaktiviert'; end if;
  v_employee := private.sf_employee_identity_for_company(v_terminal.company_id);
  select p.* into v_open_punch
  from public.time_qr_punches p join public.shift_assignments a on a.id = p.assignment_id
  where p.employee_id = v_employee and p.terminal_id = v_terminal.id and p.company_id = v_terminal.company_id
    and p.punch_type = 'CLOCK_IN' and a.company_id = v_terminal.company_id
    and not exists (select 1 from public.time_qr_punches o where o.assignment_id = p.assignment_id and o.employee_id = p.employee_id and o.punch_type = 'CLOCK_OUT' and o.punched_at > p.punched_at)
  order by p.punched_at desc limit 1;
  if found then
    select a.* into v_assignment from public.shift_assignments a
    where a.id = v_open_punch.assignment_id and a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null;
    if not found then raise exception 'Die zugehörige veröffentlichte Schicht wurde nicht gefunden'; end if;
    if v_now > v_assignment.ends_at + pg_catalog.make_interval(mins => v_terminal.end_window_minutes) then raise exception 'Das Zeitfenster zum Ausstempeln ist abgelaufen. Bitte Korrektur durch die Einsatzleitung anfordern'; end if;
    select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
    if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_OUT','state','RUNNING','clocked_in_at',v_open_punch.punched_at);
  end if;
  select count(*) into v_candidate_count from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at;
  if v_candidate_count = 0 then raise exception 'Aktuell gibt es an diesem Terminal keine passende veröffentlichte Schicht';
  elsif v_candidate_count > 1 then raise exception 'Mehrere passende Schichten gefunden. Bitte Einsatzleitung kontaktieren'; end if;
  select a.* into v_assignment from public.shift_assignments a
  where a.employee_id = v_employee and a.company_id = v_terminal.company_id and a.status = 'PUBLISHED' and a.published_at is not null
    and v_now >= a.starts_at - pg_catalog.make_interval(mins => v_terminal.start_window_minutes) and v_now <= a.ends_at limit 1;
  select c.timezone into v_company_timezone from public.companies c where c.id = v_terminal.company_id;
  if private.sf_is_time_month_closed(v_terminal.company_id,(v_assignment.starts_at at time zone coalesce(v_company_timezone, 'Europe/Berlin'))::date) then raise exception 'Der Monat ist abgeschlossen'; end if;
  if exists (select 1 from public.time_qr_punches p where p.assignment_id = v_assignment.id and p.employee_id = v_employee and p.punch_type = 'CLOCK_OUT') then
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  select te.status into v_entry_status from public.time_entries te where te.assignment_id = v_assignment.id;
  if found then
    if v_entry_status = 'open' then raise exception 'Für diese Schicht existiert bereits eine offene Zeitbuchung ohne passenden QR-Start. Bitte Einsatzleitung kontaktieren'; end if;
    return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action',null,'state','COMPLETED');
  end if;
  return jsonb_build_object('company_id',v_terminal.company_id,'employee_id',v_employee,'terminal_id',v_terminal.id,'terminal_name',v_terminal.name,'location_note',v_terminal.location_note,'assignment_id',v_assignment.id,'shift_code',v_assignment.shift_code,'planned_start',v_assignment.starts_at,'planned_end',v_assignment.ends_at,'planned_break_minutes',v_assignment.break_minutes,'action','CLOCK_IN','state','READY');
end;$function$
;

CREATE OR REPLACE FUNCTION private.sf_assert_qr_pilot_access(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee_id uuid;
  v_terminal public.time_qr_terminals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst mit dem persönlichen Mitarbeiterkonto anmelden';
  end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Ungültiger QR-Code';
  end if;

  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.token_hash=extensions.digest(lower(p_token),'sha256')
    and t.is_active=true
  limit 1;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  v_employee_id := private.sf_employee_identity_for_company(v_terminal.company_id);

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    join public.employees e
      on e.id=p.employee_id
     and e.company_id=p.company_id
     and e.status='active'
     and e.auth_user_id is not null
    where p.terminal_id=v_terminal.id
      and p.company_id=v_terminal.company_id
      and p.employee_id=v_employee_id
  ) then
    raise exception 'Dieses QR-Terminal ist aktuell nur für ausdrücklich freigegebene Pilot-Mitarbeiter nutzbar';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sf_enforce_qr_punch_pilot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_terminal public.time_qr_terminals%rowtype;
begin
  select t.* into v_terminal
  from public.time_qr_terminals t
  where t.id=new.terminal_id
    and t.company_id=new.company_id
    and t.is_active=true;
  if not found then
    raise exception 'QR-Terminal ist ungültig oder deaktiviert';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id=new.employee_id
      and e.company_id=new.company_id
      and e.status='active'
      and e.auth_user_id=new.auth_user_id
      and new.auth_user_id=(select auth.uid())
  ) then
    raise exception 'Mitarbeiterkonto ist für diese QR-Buchung nicht berechtigt';
  end if;

  if private.sf_employee_identity_for_company(new.company_id)<>new.employee_id then
    raise exception 'Mitarbeiterkonto ist für dieses Unternehmen nicht aktiv' using errcode='42501';
  end if;

  if v_terminal.pilot_mode is true and not exists (
    select 1
    from public.time_qr_pilot_employees p
    where p.terminal_id=new.terminal_id
      and p.company_id=new.company_id
      and p.employee_id=new.employee_id
  ) then
    raise exception 'Mitarbeiter ist für dieses QR-Pilot-Terminal nicht freigegeben';
  end if;

  return new;
end;
$function$
;

-- Draft: preserve production open-market behavior while enforcing a company-specific identity.
CREATE OR REPLACE FUNCTION private.sf_open_market_api(p_action text, p_company uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); role_name text; emp public.employees%rowtype; o public.open_shift_market_offers%rowtype; cl public.open_shift_market_claims%rowtype;
 company uuid:=p_company; ctx jsonb; row_data jsonb; out_rows jsonb:='[]'; item jsonb; oid uuid; claim_id uuid; asg uuid; change_id uuid;
 n integer; total integer:=0; groups integer:=0; reason text; warning text; decision text; tz text; info jsonb;
BEGIN
 IF uid IS NULL OR private.sf_has_time_only_login() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für diesen Zugang ist der Schicht-Marktplatz nicht freigegeben.'; END IF;
 IF p_action LIKE 'employee_%' THEN
  company:=coalesce(p_company,private.sf_single_active_employee_company());
  SELECT * INTO emp FROM public.employees WHERE id=private.sf_employee_identity_for_company(company) AND company_id=company;
  IF emp.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Kein aktiver Mitarbeiterzugang'; END IF;
  role_name:='EMPLOYEE';
 ELSE
  IF p_action IN ('review','cancel_offer') THEN
   IF p_action='review' THEN SELECT c.company_id INTO company FROM public.open_shift_market_claims c WHERE c.id=(p_data->>'id')::uuid;
   ELSE SELECT f.company_id INTO company FROM public.open_shift_market_offers f WHERE f.id=(p_data->>'id')::uuid; END IF;
  END IF;
  SELECT m.role INTO role_name FROM public.company_members m WHERE m.company_id=company AND m.user_id=uid AND m.status='ACTIVE' AND m.role IN ('OWNER','ADMIN','PLANNER','DISPATCHER') LIMIT 1;
  IF role_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Keine aktiven Planungsrechte für dieses Unternehmen'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||company::text,0));
 -- Reconcile current demand. Completed offers never reopen without planner confirmation.
 FOR o IN SELECT * FROM public.open_shift_market_offers WHERE company_id=company AND status='MARKET_OPEN' ORDER BY id FOR UPDATE LOOP
  ctx:=private.sf_open_market_slot(company,o.work_date,o.shift_code);
  IF o.starts_at<=now() OR (ctx->>'missing')::integer=0 OR o.remaining_count=0 OR o.starts_at IS DISTINCT FROM (ctx->>'starts_at')::timestamptz OR o.ends_at IS DISTINCT FROM (ctx->>'ends_at')::timestamptz OR private.time_month_is_closed(company,o.work_date) THEN
   UPDATE public.open_shift_market_offers SET status=CASE WHEN (ctx->>'missing')::integer=0 OR remaining_count=0 THEN 'FILLED' ELSE 'SUPERSEDED' END,remaining_count=0,updated_at=now() WHERE id=o.id;
   UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
  ELSE UPDATE public.open_shift_market_offers SET remaining_count=least(remaining_count,(ctx->>'missing')::integer) WHERE id=o.id; END IF;
 END LOOP;
 IF p_action='publish' THEN
  IF jsonb_typeof(p_data->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'slots') NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Bitte offene Plätze auswählen'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'slots') s GROUP BY s->>'date',coalesce((SELECT t.coverage_group FROM public.shift_templates t WHERE t.company_id=company AND t.code=s->>'type'),s->>'type') HAVING count(*)>1) THEN RAISE EXCEPTION 'Doppelte Auswahl für denselben Dienst'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'slots') LOOP
   ctx:=private.sf_open_market_slot(company,(item->>'date')::date,item->>'type');
   IF ctx->>'representative' IS NOT NULL THEN item:=jsonb_set(item,'{type}',to_jsonb(ctx->>'representative')); END IF;
   n:=least((item->>'count')::integer,(ctx->>'missing')::integer);
   IF coalesce(n,0)<1 OR (ctx->>'starts_at')::timestamptz<=now() THEN CONTINUE; END IF;
   IF private.time_month_is_closed(company,(item->>'date')::date) THEN RAISE EXCEPTION 'Der Planungsmonat ist abgeschlossen'; END IF;
   SELECT id INTO oid FROM public.open_shift_market_offers WHERE company_id=company AND work_date=(item->>'date')::date AND shift_code=item->>'type' AND status='MARKET_OPEN';
   IF oid IS NULL THEN
    INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,reason,created_by) VALUES(company,(item->>'date')::date,item->>'type',(ctx->>'starts_at')::timestamptz,(ctx->>'ends_at')::timestamptz,n,left(coalesce(p_data->>'note',''),1000),uid) RETURNING id INTO oid;
   ELSE
    UPDATE public.open_shift_market_offers SET remaining_count=greatest(remaining_count,n),reason=left(coalesce(p_data->>'note',''),1000),updated_at=now() WHERE id=oid;
   END IF;
   total:=total+n;groups:=groups+1;
  END LOOP;
  IF groups=0 THEN RAISE EXCEPTION 'Keine veröffentlichbaren offenen Plätze mehr vorhanden'; END IF;
  info:=jsonb_build_object('published_positions',total,'offer_count',groups);
 ELSIF p_action='employee_claim' THEN
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  reason:=private.sf_open_market_candidate(o.id,emp.id);
  IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
  IF EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE offer_id=o.id AND employee_id=emp.id AND status IN ('PENDING_MANAGER','APPLIED')) THEN RAISE EXCEPTION 'Für diesen Dienst liegt bereits eine Übernahme vor'; END IF;
  warning:=private.sf_open_market_extra_warning(o.id,emp.id);
  INSERT INTO public.open_shift_market_claims(offer_id,company_id,employee_id,comment,requested_by,rhythm_warning) VALUES(o.id,company,emp.id,left(coalesce(p_data->>'note',''),1000),uid,warning) RETURNING id INTO claim_id;
  info:=jsonb_build_object('status','PENDING_MANAGER','id',claim_id);
 ELSIF p_action='review' THEN
  SELECT * INTO cl FROM public.open_shift_market_claims WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  IF cl.status IS DISTINCT FROM 'PENDING_MANAGER' THEN RETURN jsonb_build_object('status',coalesce(cl.status,'SUPERSEDED'),'message','Diese Anfrage wartet nicht mehr auf Freigabe.'); END IF;
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id AND company_id=company FOR UPDATE;
  decision:=upper(p_data->>'decision');
  IF decision NOT IN ('APPROVE','REJECT') OR decision IS NULL THEN RAISE EXCEPTION 'Ungültige Entscheidung'; END IF;
  IF decision='REJECT' THEN
   UPDATE public.open_shift_market_claims SET status='REJECTED_MANAGER',manager_comment=left(coalesce(p_data->>'note',''),1000),reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
   info:=jsonb_build_object('status','REJECTED_MANAGER','message','Übernahme abgelehnt. Der Platz bleibt verfügbar.');
  ELSE
   PERFORM 1 FROM public.employees WHERE id=cl.employee_id FOR UPDATE;
   reason:=private.sf_open_market_candidate(o.id,cl.employee_id);
   IF reason IS NOT NULL THEN
    UPDATE public.open_shift_market_claims SET status='SUPERSEDED',manager_comment=reason,reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
    RETURN jsonb_build_object('status','SUPERSEDED','message',reason);
   END IF;
   warning:=private.sf_open_market_extra_warning(o.id,cl.employee_id);
   IF warning<>'' AND NOT coalesce((p_data->>'accept_rhythm')::boolean,false) THEN RAISE EXCEPTION 'Zusatzdienst bitte ausdrücklich bestätigen: %',warning; END IF;
   row_data:=jsonb_build_object('employeeId',cl.employee_id,'type',private.sf_shared_coverage_shift(company,o.shift_code,cl.employee_id,o.work_date),'startsAt',o.starts_at,'endsAt',o.ends_at,'breakMinutes',0,'note',CASE WHEN warning<>'' THEN 'Freiwilliger Zusatzdienst aus dem Schicht-Marktplatz' ELSE 'Übernahme aus dem Schicht-Marktplatz' END);
   INSERT INTO public.shift_change_requests(company_id,action,employee_id,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
    VALUES(company,'CREATE',cl.employee_id,NULL,row_data,'Marktplatz',left('Freiwillige Übernahme #'||cl.id||CASE WHEN warning<>'' THEN ' · '||warning ELSE '' END,2000),'YES',greatest(0,floor(extract(epoch FROM(o.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,uid) RETURNING id INTO change_id;
   asg:=public.apply_shift_change(change_id);
   UPDATE public.open_shift_market_claims SET status='APPLIED',assignment_id=asg,rhythm_warning=warning,manager_comment=left(coalesce(p_data->>'note',''),1000),reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
   UPDATE public.open_shift_market_offers SET remaining_count=remaining_count-1,status=CASE WHEN remaining_count<=1 THEN 'FILLED' ELSE 'MARKET_OPEN' END,updated_at=now() WHERE id=o.id;
   ctx:=private.sf_open_market_slot(company,o.work_date,o.shift_code);
   IF (ctx->>'missing')::integer=0 OR o.remaining_count<=1 THEN
    UPDATE public.open_shift_market_offers SET remaining_count=0,status='FILLED' WHERE id=o.id;
    UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
   END IF;
   info:=jsonb_build_object('status','APPLIED','assignment_id',asg,'message','Übernahme freigegeben und verbindlich im Dienstplan eingetragen.');
  END IF;
 ELSIF p_action='cancel_offer' THEN
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  UPDATE public.open_shift_market_offers SET status='CANCELLED',remaining_count=0,updated_at=now() WHERE id=o.id AND status='MARKET_OPEN';
  UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
  info:=jsonb_build_object('status','CANCELLED');
 ELSIF p_action='employee_cancel' THEN
  UPDATE public.open_shift_market_claims SET status='CANCELLED',reviewed_at=now() WHERE id=(p_data->>'id')::uuid AND company_id=company AND employee_id=emp.id AND status='PENDING_MANAGER';
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Anfrage kann nicht zurückgezogen werden'; END IF;
  info:=jsonb_build_object('status','CANCELLED');
 ELSIF p_action IN ('manager_list','employee_list') THEN
  FOR o IN SELECT * FROM public.open_shift_market_offers WHERE company_id=company AND status='MARKET_OPEN' ORDER BY work_date,shift_code LOOP
   reason:=CASE WHEN p_action='employee_list' THEN private.sf_open_market_candidate(o.id,emp.id) END;
   warning:=CASE WHEN p_action='employee_list' THEN private.sf_open_market_extra_warning(o.id,emp.id) ELSE '' END;
   IF p_action='employee_list' AND EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE offer_id=o.id AND employee_id=emp.id AND status IN ('PENDING_MANAGER','APPLIED')) THEN reason:='Übernahme bereits eingereicht'; END IF;
   out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',o.id,'kind','OPEN_POSITION','is_claim',false,'is_own',false,'status','MARKET_OPEN','assignment_id',NULL,'shift_code',o.shift_code,'shift_label',coalesce((SELECT t.coverage_group FROM public.shift_templates t WHERE t.company_id=company AND t.code=o.shift_code),o.shift_code),'starts_at',o.starts_at,'ends_at',o.ends_at,'offered_by','Offener Bedarf · Planung','reason',o.reason,'requested_at',o.created_at,'can_take',reason IS NULL,'block_reason',reason,'rhythm_warning',warning,'additional_warning',warning,'is_additional',coalesce(warning,'')<>'','remaining_count',o.remaining_count,'company_name',(SELECT name FROM public.companies WHERE id=company)));
  END LOOP;
  FOR cl IN SELECT * FROM public.open_shift_market_claims WHERE company_id=company AND (p_action='manager_list' OR employee_id=emp.id) ORDER BY requested_at DESC LIMIT 1000 LOOP
   SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id;
   warning:=CASE WHEN cl.status='PENDING_MANAGER' THEN private.sf_open_market_extra_warning(o.id,cl.employee_id) ELSE coalesce(cl.rhythm_warning,'') END;
   out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',cl.id,'offer_id',o.id,'kind','OPEN_POSITION','is_claim',true,'is_own',false,'status',cl.status,'assignment_id',cl.assignment_id,'shift_code',o.shift_code,'shift_label',coalesce((SELECT t.coverage_group FROM public.shift_templates t WHERE t.company_id=company AND t.code=o.shift_code),o.shift_code),'starts_at',o.starts_at,'ends_at',o.ends_at,'offered_by','Offener Bedarf · Planung','claimed_by',(SELECT trim(first_name||' '||last_name) FROM public.employees WHERE id=cl.employee_id),'reason',o.reason,'colleague_comment',cl.comment,'manager_comment',cl.manager_comment,'requested_at',cl.requested_at,'can_take',false,'rhythm_warning',warning,'additional_warning',warning,'is_additional',coalesce(warning,'')<>''));
  END LOOP;
  RETURN out_rows;
 ELSE RAISE EXCEPTION 'Unbekannter Marktplatzvorgang'; END IF;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata) VALUES(company,'OPEN_SHIFT_MARKET_'||upper(p_action),'open_shift_market',coalesce(cl.id,claim_id,oid,o.id),uid,role_name,info,jsonb_build_object('note',left(coalesce(p_data->>'note',''),1000)));
 RETURN info;
END $function$
;

create or replace function public.employee_list_open_shift_market_for_company(p_company_id uuid) returns jsonb
language sql set search_path='' as $fn$ select private.sf_open_market_api('employee_list',p_company_id) $fn$;
create or replace function public.employee_claim_open_shift_for_company(p_company_id uuid,p_offer_id uuid,p_comment text default '') returns jsonb
language sql set search_path='' as $fn$ select private.sf_open_market_api('employee_claim',p_company_id,jsonb_build_object('id',p_offer_id,'note',p_comment)) $fn$;
create or replace function public.employee_cancel_open_shift_claim_for_company(p_company_id uuid,p_claim_id uuid) returns jsonb
language sql set search_path='' as $fn$ select private.sf_open_market_api('employee_cancel',p_company_id,jsonb_build_object('id',p_claim_id)) $fn$;
revoke all on function public.employee_list_open_shift_market_for_company(uuid) from public,anon;
revoke all on function public.employee_claim_open_shift_for_company(uuid,uuid,text) from public,anon;
revoke all on function public.employee_cancel_open_shift_claim_for_company(uuid,uuid) from public,anon;
grant execute on function public.employee_list_open_shift_market_for_company(uuid) to authenticated;
grant execute on function public.employee_claim_open_shift_for_company(uuid,uuid,text) to authenticated;
grant execute on function public.employee_cancel_open_shift_claim_for_company(uuid,uuid) to authenticated;

-- Production-derived draft: reject suspended employee access on claim and manager approval.
CREATE OR REPLACE FUNCTION private.sf_open_market_candidate(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; ctx jsonb; err text; selected_code text; 
BEGIN
 SELECT * INTO o FROM public.open_shift_market_offers WHERE id=p_offer;
 IF o.id IS NULL OR o.status<>'MARKET_OPEN' OR o.remaining_count=0 OR o.starts_at<=now() THEN RETURN 'Dieses Angebot ist nicht mehr verfügbar'; END IF;
 ctx:=private.sf_open_market_slot(o.company_id,o.work_date,o.shift_code);
 IF (ctx->>'missing')::integer=0 THEN RETURN 'Der Bedarf wurde inzwischen vollständig besetzt'; END IF;
 IF o.starts_at<>(ctx->>'starts_at')::timestamptz OR o.ends_at<>(ctx->>'ends_at')::timestamptz THEN RETURN 'Die Schichtzeiten wurden inzwischen geändert'; END IF;
 IF private.time_month_is_closed(o.company_id,o.work_date) THEN RETURN 'Der Planungsmonat ist abgeschlossen'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=o.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.access_status<>'ACTIVE' OR e.deleted_at IS NOT NULL OR e.auth_user_id IS NULL
  OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=e.company_id AND m.user_id=e.auth_user_id
    AND (m.status<>'ACTIVE' OR m.role IN ('VIEWER','TIME_TRACKING') OR 'read_only'=ANY(m.extra_permissions)))
 THEN RETURN 'Kein aktiver Mitarbeiterzugang'; END IF;
 IF (e.start_date IS NOT NULL AND o.work_date<e.start_date) OR (e.contract_end IS NOT NULL AND o.work_date>e.contract_end) THEN RETURN 'Schicht liegt außerhalb des Beschäftigungszeitraums'; END IF;
 selected_code:=private.sf_shared_coverage_shift(o.company_id,o.shift_code,e.id,o.work_date);
 IF selected_code IS NULL THEN RETURN 'Keine Freigabe für diese Schichtart'; END IF;
 IF private.sf_regional_day_allowed(o.company_id,e.id,o.work_date,selected_code) IS FALSE THEN RETURN 'Die Schicht passt nicht zum Feiertag am Standort'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=o.company_id AND code=selected_code AND responsible_only AND responsible_employee_id IS DISTINCT FROM e.id) THEN RETURN 'Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet'; END IF;
 err:=private.sf_shift_scope_error(o.company_id,e.id,selected_code,o.starts_at,o.ends_at);
 IF err IS NOT NULL THEN RETURN err; END IF;
 BEGIN
  PERFORM public.assert_standard_shift_rules(o.company_id,e.id,o.starts_at,o.ends_at,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  RETURN CASE err WHEN 'Shift overlaps another assignment' THEN 'Bereits andere Schicht im Zeitraum' WHEN 'Shift overlaps an approved absence' THEN 'Genehmigte Abwesenheit im Zeitraum' WHEN 'Standard minimum rest period not met before shift' THEN 'Ruhezeit vor der Schicht nicht ausreichend' WHEN 'Standard minimum rest period not met after shift' THEN 'Ruhezeit nach der Schicht nicht ausreichend' WHEN 'Standard maximum shift duration exceeded' THEN 'Schicht überschreitet die zulässige Dauer' ELSE err END;
 END;
 err:=private.sf_confirmed_candidate_error(o.company_id,e.id,o.starts_at,o.ends_at,selected_code);
 IF err IS NOT NULL THEN RETURN err; END IF;
 RETURN NULL;
END $function$
;

-- Draft: QR history is explicitly scoped to the chosen company.
CREATE OR REPLACE FUNCTION private.sf_qr_bookings_for_company(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_timezone text;
  v_month date;
  v_next date;
  v_now timestamptz:=statement_timestamp();
  v_rows jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees
    where id=private.sf_employee_identity_for_company(p_company_id)
      and company_id=p_company_id;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=v_employee.company_id;
  if p_month is not null and (p_month < date '1900-01-01' or p_month >= date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023';
  end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_timezone)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc,x.id) filter(where x.position<=500),'[]'::jsonb),count(*)
  into v_rows,v_count from (
    select s.id,s.started_at,s.ended_at,t.name terminal_name,
      row_number() over(order by s.started_at desc,s.id) position,
      round(greatest(0,extract(epoch from (coalesce(s.ended_at,v_now)-s.started_at)))/60)::integer attendance_minutes,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at,
        'minutes',round(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))/60)::integer) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      (select coalesce(round(sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at))))/60),0)::integer
        from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at >= (v_month::timestamp at time zone v_timezone)
      and s.started_at < (v_next::timestamp at time zone v_timezone)
    order by s.started_at desc,s.id limit 501
  ) x;
  return jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_timezone,'as_of',v_now,
    'rows',v_rows,'truncated',v_count>500);
end;$function$
;
create or replace function private.employee_my_qr_bookings_impl(p_month date default null)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(private.sf_single_active_employee_company(),p_month)
$fn$;
create or replace function public.employee_my_qr_bookings_for_company(p_company_id uuid,p_month date default null)
returns jsonb language sql stable set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(p_company_id,p_month)
$fn$;
revoke all on function private.sf_qr_bookings_for_company(uuid,date) from public,anon;
revoke all on function public.employee_my_qr_bookings_for_company(uuid,date) from public,anon;
grant execute on function private.sf_qr_bookings_for_company(uuid,date) to authenticated;
grant execute on function public.employee_my_qr_bookings_for_company(uuid,date) to authenticated;

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

-- Draft: scope cancellation to the active profile in the offer's company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_cancel_shift_swap_impl(p_swap_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.company_id=s.company_id and e.id=private.sf_employee_identity_for_company(s.company_id)) then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $function$
;

-- Draft: candidate lookup requires an active employee in the assignment company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_shift_swap_candidates_impl(p_assignment_id uuid)
 RETURNS TABLE(employee_id uuid, display_name text, employee_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into req from public.employees where id=a.employee_id and company_id=a.company_id and id=private.sf_employee_identity_for_company(a.company_id);
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  return query
  select e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),coalesce(e.role,'Mitarbeiter')
  from public.employees e
  where e.company_id=a.company_id
    and e.id<>a.employee_id
    and e.status='active'
    and e.auth_user_id is not null
    and private.sf_swap_candidate_reason(a.id,e.id) is null
  order by e.last_name,e.first_name;
end
$function$
;

-- Draft: company-scoped disruption list; legacy calls reject ambiguous accounts.
-- Requires employee-company-identity-candidate.sql. Not a production migration.
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_for_company_impl(p_company_id uuid)
 RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.id=private.sf_employee_identity_for_company(p_company_id) and e.company_id=p_company_id;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $function$
;
CREATE OR REPLACE FUNCTION private.employee_list_disruption_offers_impl()
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_company uuid; v_count integer;
begin
 select count(*),min(company_id::text)::uuid into v_count,v_company from private.sf_employee_company_options();
 if v_count<>1 then raise exception 'Bitte das Unternehmen für den Mitarbeiterzugang auswählen' using errcode='42501'; end if;
 return query select * from private.employee_list_disruption_offers_for_company_impl(v_company);
end $function$;
CREATE OR REPLACE FUNCTION public.employee_list_disruption_offers_for_company(p_company_id uuid)
RETURNS TABLE(offer_id uuid, offer_status text, incident_id uuid, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, incident_type text, note text, expires_at timestamp with time zone, employee_comment text) LANGUAGE sql SET search_path TO '' AS $function$
 select * from private.employee_list_disruption_offers_for_company_impl(p_company_id)
$function$;
revoke all on function private.employee_list_disruption_offers_for_company_impl(uuid) from public,anon;
revoke all on function public.employee_list_disruption_offers_for_company(uuid) from public,anon;
grant execute on function private.employee_list_disruption_offers_for_company_impl(uuid) to authenticated;
grant execute on function public.employee_list_disruption_offers_for_company(uuid) to authenticated;

-- Draft: require active employee identity in the disruption offer's company.
-- Requires employee-company-identity-candidate.sql; not a production migration.
CREATE OR REPLACE FUNCTION private.employee_respond_disruption_offer_impl(p_offer_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS TABLE(status text, message text, assignment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_decision text:=upper(trim(coalesce(p_decision,''))); v_pre public.disruption_offers%rowtype; v_offer public.disruption_offers%rowtype; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype; v_reason text; v_change_id uuid; v_result uuid; v_old jsonb; v_new jsonb;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_decision not in ('ACCEPT','DECLINE') then raise exception 'Ungültige Entscheidung'; end if;
  select * into v_pre from public.disruption_offers where id=p_offer_id; if v_pre.id is null then raise exception 'Angebot nicht gefunden'; end if;
  select * into v_incident from public.disruption_incidents where id=v_pre.incident_id for update;
  select * into v_offer from public.disruption_offers where id=p_offer_id for update;
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.company_id=v_offer.company_id and e.id=private.sf_employee_identity_for_company(v_offer.company_id);
  if v_employee.id is null then raise exception 'Dieses Angebot gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if v_offer.status<>'OFFERED' then raise exception 'Dieses Angebot wurde bereits beantwortet'; end if;
  if v_decision='DECLINE' then update public.disruption_offers set status='DECLINED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id; return query select 'DECLINED'::text,'Anfrage abgelehnt. Die Disposition wurde informiert.'::text,v_incident.assignment_id; return; end if;
  if v_incident.status<>'OPEN' then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Der Störfall wurde bereits abgeschlossen'; end if;
  if v_offer.expires_at<=now() then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Das Angebot ist abgelaufen'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then update public.disruption_incidents set status='SUPERSEDED',resolved_at=now(),updated_at=now() where id=v_incident.id; update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.status='OFFERED'; raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;
  if exists(select 1 from private.disruption_replacements x join public.shift_change_requests r on r.id=x.change_id where x.incident_id=v_incident.id and r.status not in('REJECTED','SUPERSEDED','CANCELLED')) then raise exception 'Eine Ersatzübernahme ist bereits in Bearbeitung.';end if;
  if exists(select 1 from public.time_entries t where t.assignment_id=v_assignment.id) then raise exception 'Für den ursprünglichen Dienst bestehen Zeitbuchungen. Bitte die Disposition um eine Teilablösung bitten.';end if;
  if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception 'Teamleiterrolle erforderlich'; end if;
  v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%',v_reason; end if;
  
  v_reason:=private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'block';
  if v_reason is not null then raise exception '%',v_reason;end if;
  if coalesce((private.sf_disruption_candidate(v_assignment,v_employee.id,v_assignment.starts_at,v_assignment.ends_at)->>'rhythm')::boolean,false) then
   raise exception 'Der Rhythmus hat sich geändert. Bitte die Disposition um eine neue Prüfung bitten.';
  end if;
 if exists(select 1 from public.company_compliance_policy where company_id=v_incident.company_id and works_council_enabled) then
   update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
   update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
   insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id)
   select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Zusage zur Ersatzübernahme','Zusage eingegangen. Bitte Ersatzübernahme mit erforderlicher Betriebsratsfreigabe abschließen.','disruptions','disruption_incident',v_incident.id from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in('OWNER','ADMIN','PLANNER','DISPATCHER');
   return query select 'ACCEPTED_PENDING'::text,'Zusage gespeichert. Der Dienstplan wird nach den erforderlichen Freigaben aktualisiert.'::text,v_assignment.id;return;
  end if;
  v_old:=jsonb_build_object('employeeId',v_assignment.employee_id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  v_new:=jsonb_build_object('employeeId',v_employee.id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(v_incident.company_id,v_assignment.id,'UPDATE',v_employee.id,v_assignment.version,v_old,v_new,'Störfall-Ersatz',left('Störfall-Autopilot #'||v_incident.id::text,2000),'NO',greatest(0,floor(extract(epoch from(v_assignment.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid) returning id into v_change_id;
  v_result:=public.apply_shift_change(v_change_id);
  update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
  update public.disruption_incidents set status='RESOLVED',resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) values(v_incident.company_id,'DISRUPTION_RESOLVED','disruption_incident',v_incident.id,v_uid,'EMPLOYEE',jsonb_build_object('employeeId',v_incident.original_employee_id),jsonb_build_object('employeeId',v_employee.id),jsonb_build_object('assignmentId',v_result,'changeRequestId',v_change_id));
  insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Störfall gelöst',trim(v_employee.first_name||' '||v_employee.last_name)||' übernimmt '||v_assignment.shift_code,'disruptions','disruption_incident',v_incident.id,jsonb_build_object('assignmentId',v_result)
  from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER');
  return query select 'ACCEPTED'::text,'Schicht übernommen und Dienstplan sofort aktualisiert.'::text,v_result;
end $function$
;

-- Draft: apply active company-specific identity checks to legacy swap and marketplace actions.
CREATE OR REPLACE FUNCTION private.employee_create_shift_swap_impl(p_assignment_id uuid, p_target_employee_id uuid, p_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
  v_reason text;
  v_id uuid;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits eine Tauschanfrage';
  end if;

  v_reason:=private.sf_swap_candidate_reason(a.id,p_target_employee_id);
  if v_reason is not null then raise exception '%',v_reason; end if;

  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,p_target_employee_id,a.version,'PENDING_COLLEAGUE',left(coalesce(p_reason,''),1000),v_uid)
  returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(a.company_id,'SHIFT_SWAP_REQUESTED','shift_swap_request',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('assignmentId',a.id,'fromEmployeeId',a.employee_id,'toEmployeeId',p_target_employee_id,'status','PENDING_COLLEAGUE'),
    jsonb_build_object('reason',left(coalesce(p_reason,''),1000)));

  return v_id;
end
$function$
;

CREATE OR REPLACE FUNCTION private.employee_offer_shift_marketplace_impl(p_assignment_id uuid, p_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); a public.shift_assignments%rowtype; e public.employees%rowtype; v_id uuid;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(a.company_id)<>a.employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Schicht' using errcode='42501'; end if;
  select * into e from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if e.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können angeboten werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht angeboten werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits ein Angebot';
  end if;
  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,null,a.version,'MARKET_OPEN',left(coalesce(p_reason,''),1000),v_uid) returning id into v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
  values(a.company_id,'SHIFT_MARKET_OFFERED','shift_swap_request',v_id,v_uid,'EMPLOYEE',jsonb_build_object('assignmentId',a.id,'status','MARKET_OPEN'));
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION private.employee_claim_shift_marketplace_impl(p_offer_id uuid, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype; s public.shift_swap_requests%rowtype; a public.shift_assignments%rowtype; v_reason text;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_offer_id for update;
  if s.id is null or s.status<>'MARKET_OPEN' then raise exception 'Dieses Angebot ist nicht mehr verfügbar'; end if;
  perform private.sf_employee_identity_for_company(s.company_id);
  select * into v_emp from public.employees where auth_user_id=v_uid and company_id=s.company_id and status='active' limit 1;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  if v_emp.id=s.original_employee_id then raise exception 'Eigene Schichten können nicht übernommen werden'; end if;
  select * into a from public.shift_assignments where id=s.assignment_id for update;
  if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' or a.starts_at<=now() then
    update public.shift_swap_requests set status='SUPERSEDED',updated_at=now() where id=s.id;
    raise exception 'Die Schicht wurde verändert und ist nicht mehr verfügbar';
  end if;
  v_reason:=private.sf_swap_candidate_reason(a.id,v_emp.id);
  if v_reason is not null then raise exception '%',v_reason; end if;
  update public.shift_swap_requests set target_employee_id=v_emp.id,status='PENDING_MANAGER',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,'SHIFT_MARKET_CLAIMED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status','MARKET_OPEN'),jsonb_build_object('status','PENDING_MANAGER','targetEmployeeId',v_emp.id),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));
  return 'PENDING_MANAGER';
end $function$
;

CREATE OR REPLACE FUNCTION private.employee_respond_shift_swap_impl(p_swap_id uuid, p_decision text, p_comment text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  s public.shift_swap_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_decision text:=upper(trim(coalesce(p_decision,'')));
  v_reason text;
  v_status text;
begin
  PERFORM private.sf_require_active_employee_access();
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  if private.sf_employee_identity_for_company(s.company_id)<>s.target_employee_id then raise exception 'Kein aktiver Mitarbeiterzugang für diese Anfrage' using errcode='42501'; end if;
  if not exists(select 1 from public.employees e where e.id=s.target_employee_id and e.auth_user_id=v_uid and e.status='active') then
    raise exception 'Diese Tauschanfrage gehört nicht zum angemeldeten Mitarbeiter';
  end if;
  if s.status<>'PENDING_COLLEAGUE' then raise exception 'Diese Tauschanfrage wartet nicht mehr auf deine Entscheidung'; end if;

  if v_decision='REJECT' then
    v_status:='REJECTED_COLLEAGUE';
  else
    select * into a from public.shift_assignments where id=s.assignment_id;
    if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason','assignment_changed'));
      return 'SUPERSEDED';
    end if;
    v_reason:=private.sf_swap_candidate_reason(a.id,s.target_employee_id);
    if v_reason is not null then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason',v_reason));
      return 'SUPERSEDED';
    end if;
    v_status:='PENDING_MANAGER';
  end if;

  update public.shift_swap_requests
  set status=v_status,colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now()
  where id=s.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,case when v_status='PENDING_MANAGER' then 'SHIFT_SWAP_COLLEAGUE_APPROVED' else 'SHIFT_SWAP_COLLEAGUE_REJECTED' end,
    'shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status',v_status),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));

  return v_status;
end
$function$
;

-- Draft only: apply atomically only as part of the reviewed multi-company release.
-- Existing global uniqueness must first be replaced with uniqueness per company.
-- Do not install in production until all legacy employee endpoints are company-scoped.
create unique index if not exists employees_company_auth_user_id_uidx
  on public.employees (company_id, auth_user_id)
  where auth_user_id is not null;
-- QA already has the per-company index

do $verify$ begin
if to_regprocedure('public.manager_create_multi_access_invite(uuid,text,jsonb,text)') is null then raise exception 'invite missing';end if;
if to_regprocedure('public.manager_set_employee_company_access(uuid,uuid,uuid,boolean)') is null then raise exception 'management missing';end if;
if to_regprocedure('public.employee_list_disruption_offers_for_company(uuid)') is null then raise exception 'disruption list missing';end if;
if to_regprocedure('public.employee_claim_open_shift_for_company(uuid,uuid,text)') is null then raise exception 'claim missing';end if;
if has_function_privilege('anon','public.claim_multi_company_invite(text)','execute') then raise exception 'anon invite claim privilege';end if;
end $verify$;
rollback;