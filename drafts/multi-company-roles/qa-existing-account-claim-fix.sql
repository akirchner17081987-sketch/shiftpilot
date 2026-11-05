-- QA ONLY. Requires security review and production migration before release.
create table private.qa_mixed_claim_context(txid bigint not null,user_id uuid not null,company_id uuid not null,invite_id uuid not null,primary key(txid,user_id,company_id));
alter table private.qa_mixed_claim_context enable row level security;
revoke all on private.qa_mixed_claim_context from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.sf_normalize_access_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare qa_claim_allowed boolean := false;
begin
 -- Older clients assign execution codes: retain their previous capabilities.
 if new.access_role is null or (tg_op='UPDATE' and new.role<>old.role and new.access_role=old.access_role and new.extra_permissions=old.extra_permissions) then
  new.access_role:=case when new.role in ('OWNER','ADMIN') then new.role when new.role in ('PLANNER','DISPATCHER','VIEWER') then 'TEAM_LEAD' else 'EMPLOYEE' end;
  new.extra_permissions:=case when new.role in ('PLANNER','DISPATCHER') then array['publish_schedule','manage_time','confirm_time'] when new.role='TIME_TRACKING' then array['manage_time','confirm_time'] when new.role='VIEWER' then array['read_only'] else '{}'::text[] end;
 end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only']::text[]
 or array_position(new.extra_permissions,null) is not null then raise exception 'Ungültiges Zugangsprofil'; end if;
 if auth.uid() is not null and (new.role='ADMIN' or (tg_op='UPDATE' and old.role='ADMIN')) and not exists(select 1 from public.company_members where company_id=new.company_id and user_id=auth.uid() and role='OWNER' and status='ACTIVE') then
  if tg_table_schema='public' and tg_table_name='company_members' and tg_op='INSERT' then
   select exists(select 1 from private.qa_mixed_claim_context x join public.company_member_invites i on i.id=x.invite_id and i.company_id=x.company_id join auth.users u on u.id=x.user_id where x.txid=pg_catalog.txid_current() and x.user_id=auth.uid() and x.user_id=new.user_id and x.company_id=new.company_id and i.role=new.role and i.access_role=new.access_role and i.status='INVITED' and i.claimed_at is null and i.expires_at>now() and u.email_confirmed_at is not null and lower(i.email)=lower(u.email)) into qa_claim_allowed;
  elsif tg_table_schema='public' and tg_table_name='company_member_invites' and tg_op='UPDATE' then
   select exists(select 1 from private.qa_mixed_claim_context x join auth.users u on u.id=x.user_id where x.txid=pg_catalog.txid_current() and x.user_id=auth.uid() and x.user_id=new.claimed_by and x.company_id=new.company_id and x.invite_id=new.id and old.id=new.id and old.company_id=new.company_id and old.status='INVITED' and new.status='CLAIMED' and old.role=new.role and old.access_role=new.access_role and old.email=new.email and old.expires_at>now() and u.email_confirmed_at is not null and lower(old.email)=lower(u.email)) into qa_claim_allowed;
  end if;
  if not qa_claim_allowed then raise exception 'Nur der Inhaber darf Administratoren verwalten'; end if;
 end if;
 if (new.access_role in ('OWNER','ADMIN') and (new.role<>new.access_role or cardinality(new.extra_permissions)>0))
 or (new.access_role='TEAM_LEAD' and (new.role not in ('PLANNER','DISPATCHER','VIEWER') or (new.role='VIEWER')<>('read_only'=any(new.extra_permissions))))
 or (new.access_role='EMPLOYEE' and (new.role<>'TIME_TRACKING' or 'publish_schedule'=any(new.extra_permissions) or 'read_only'=any(new.extra_permissions) or cardinality(new.extra_permissions)=0))
 or ('read_only'=any(new.extra_permissions) and cardinality(new.extra_permissions)<>1) then raise exception 'Rolle und Zusatzrechte passen nicht zusammen'; end if;
 return new;
end $function$;
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
   if ci.role='ADMIN' then insert into private.qa_mixed_claim_context(txid,user_id,company_id,invite_id) values(pg_catalog.txid_current(),uid_,company,ci.id); end if;
   insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(company,uid_,ci.role,'ACTIVE',ci.access_role,ci.extra_permissions) on conflict do nothing;
   if not found then raise exception 'Für dieses Unternehmen besteht bereits ein Zugang'; end if;
   if ci.employee_id is not null then
    update public.employees set auth_user_id=uid_,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=ci.employee_id and company_id=company and auth_user_id is null and status='active' and deleted_at is null;
    if not found then raise exception 'Mitarbeiterprofil nicht verfügbar'; end if;
   end if;
   update public.company_member_invites set status='CLAIMED',claimed_by=uid_,claimed_at=now() where id=ci.id;
   delete from private.qa_mixed_claim_context where txid=pg_catalog.txid_current() and user_id=uid_ and company_id=company;
  else raise exception 'Ungültige Einladungsart'; end if;
  n:=n+1;
 end loop;
 update private.multi_company_invitation_groups set claimed_by=uid_,claimed_at=now() where token_hash=hash_;
 return jsonb_build_object('companies',n);
end $function$;