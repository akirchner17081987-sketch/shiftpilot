-- A send reservation validates the active invitation and limits retries per actor.
create or replace function private.reserve_invitation_email(p_company_id uuid, p_invite_id uuid, p_kind text, p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 select name into company_name from public.companies where id=p_company_id;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
 values(p_company_id,'INVITATION_EMAIL_ATTEMPT','invitation',p_invite_id,actor,actor_role,jsonb_build_object('kind',p_kind));
 return jsonb_build_object('email',addr,'company',company_name);
end $$;
revoke all on function private.reserve_invitation_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.reserve_invitation_email(uuid,uuid,text,text) to authenticated;
create or replace function public.reserve_invitation_email(p_company_id uuid,p_invite_id uuid,p_kind text,p_hash text)
returns jsonb language sql set search_path='' as $$ select private.reserve_invitation_email(p_company_id,p_invite_id,p_kind,p_hash) $$;
revoke all on function public.reserve_invitation_email(uuid,uuid,text,text) from public,anon;
grant execute on function public.reserve_invitation_email(uuid,uuid,text,text) to authenticated;
