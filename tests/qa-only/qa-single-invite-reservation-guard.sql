-- QA ONLY: prevent a separate invitation from reusing a reserved profile.
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
 if exists(select 1 from private.qa_employee_invite_targets t join public.employee_access_invites i on i.id=t.invite_id where t.company_id=p_company_id and lower(i.email)=mail and i.claimed_at is null and i.expires_at>now()) then raise exception 'Eine offene Mehrfach-Einladung besteht bereits'; end if;
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

