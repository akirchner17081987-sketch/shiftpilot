-- QA ONLY: include all selected employee companies in the invitation email.
CREATE OR REPLACE FUNCTION private.reserve_invitation_email(p_company_id uuid, p_invite_id uuid, p_kind text, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_role text; addr text; company_name text; invite_role text; last_attempt timestamptz; hourly integer;
begin
 if actor is null then raise exception 'Nicht berechtigt'; end if;
 select role into actor_role from public.company_members where company_id=p_company_id and user_id=actor and status='ACTIVE' and role in ('OWNER','ADMIN') and access_role in ('OWNER','ADMIN');
 if actor_role is null then raise exception 'Nicht berechtigt'; end if;
 perform private.sf_assert_aal2('send_invitation_email');
 if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ungültiger Einladungsschlüssel'; end if;
 if p_kind='employeeInvite' then
   select email into addr from public.employee_access_invites where id=p_invite_id and company_id=p_company_id and token_hash=p_hash and claimed_at is null and expires_at>now();
 elsif p_kind='teamInvite' then
   select email,access_role into addr,invite_role from public.company_member_invites where id=p_invite_id and company_id=p_company_id and token_hash=p_hash and status='INVITED' and claimed_at is null and expires_at>now();
 else raise exception 'Ungültiger Einladungstyp';
 end if;
 if addr is null then raise exception 'Einladung ist ungültig oder abgelaufen'; end if;
 if invite_role='ADMIN' and actor_role<>'OWNER' then raise exception 'Nur der Inhaber darf Administratoren einladen'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,81127));
 select max(created_at) filter(where entity_id=p_invite_id),count(*) into last_attempt,hourly
 from public.audit_events where actor_id=actor and event_type='INVITATION_EMAIL_ATTEMPT' and created_at>now()-interval '1 hour';
 if last_attempt>now()-interval '1 minute' or hourly>=30 then raise exception 'Bitte warte vor dem erneuten Versand'; end if;
 select string_agg(c.name, ', ' order by c.name) into company_name
 from public.companies c
 where c.id=p_company_id or (p_kind='teamInvite' and exists(
  select 1 from private.qa_multi_company_invite_targets x where x.invite_id=p_invite_id and x.company_id=c.id)) or (p_kind='employeeInvite' and exists(
  select 1 from private.qa_employee_invite_targets x where x.invite_id=p_invite_id and x.company_id=c.id));
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
 values(p_company_id,'INVITATION_EMAIL_ATTEMPT','invitation',p_invite_id,actor,actor_role,jsonb_build_object('kind',p_kind));
 return jsonb_build_object('email',addr,'company',company_name,'qa_share',(select decrypted_secret from vault.decrypted_secrets where name='qa_preview_share' limit 1));
end $function$
;


