-- Draft only. Based on the production guard inspected 06.11.2026.
-- Permit only the precise profile link covered by an active, confirmed invitation
-- and the transaction-scoped private claim context; all other guards remain.
CREATE OR REPLACE FUNCTION private.sf_guard_personnel_leadership_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare leader_actor boolean; protected_identity boolean; invited_link boolean:=false;
begin
 if auth.uid() is null then return new; end if;
 select exists(select 1 from public.company_members m where m.company_id=new.company_id and m.user_id=auth.uid() and m.status='ACTIVE' and m.access_role='TEAM_LEAD') into leader_actor;
 if not leader_actor then return new; end if;
 protected_identity:=private.sf_personnel_leadership_identity(new.company_id,new.auth_user_id,new.email,new.role);
 if tg_op='UPDATE' then
  protected_identity:=protected_identity or private.sf_personnel_leadership_identity(old.company_id,old.auth_user_id,old.email,old.role);
  if protected_identity and row(new.company_id,new.role,new.auth_user_id,new.email) is distinct from row(old.company_id,old.role,old.auth_user_id,old.email) then
   if old.auth_user_id is null and new.auth_user_id=auth.uid()
      and row(new.company_id,new.role,new.email) is not distinct from row(old.company_id,old.role,old.email) then
    select exists(select 1 from private.sf_multi_claim_context x
      join public.company_member_invites i on i.id=x.invite_id and i.company_id=x.company_id
      join auth.users u on u.id=x.user_id
      where x.txid=pg_catalog.txid_current() and x.user_id=auth.uid()
        and x.company_id=new.company_id and i.employee_id=new.id
        and i.access_role='TEAM_LEAD' and i.status='INVITED' and i.claimed_at is null
        and i.expires_at>now() and u.email_confirmed_at is not null
        and lower(i.email)=lower(u.email)) into invited_link;
   end if;
   if not invited_link then raise exception 'Teamleiter-Zuordnung und Kontoverknüpfung dürfen nur Personalverantwortliche ändern';end if;
  end if;
 elsif protected_identity and not exists(
  select 1 from public.employees e where e.company_id=new.company_id and e.deleted_at is null
  and (e.id=new.id or (new.legacy_id is not null and e.legacy_id=new.legacy_id))
  and row(e.role,e.email) is not distinct from row(new.role,new.email)
  and (new.auth_user_id is null or e.auth_user_id=new.auth_user_id)
 ) then raise exception 'Teamleiter-Zuordnung darf nur durch Personalverantwortliche angelegt werden';
 end if;
 return new;
end $function$;
