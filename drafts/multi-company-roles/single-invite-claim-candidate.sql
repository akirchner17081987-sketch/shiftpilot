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
