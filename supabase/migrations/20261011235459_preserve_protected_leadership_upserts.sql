-- Allow unchanged leadership identities through the existing company/legacy upsert.
-- UPDATE validation still independently rejects relabeling, unlinking and email changes.
begin;
create or replace function private.sf_guard_personnel_leadership_identity() returns trigger
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
 elsif protected_identity and not exists(
  select 1 from public.employees e where e.company_id=new.company_id and e.deleted_at is null
  and (e.id=new.id or (new.legacy_id is not null and e.legacy_id=new.legacy_id))
  and row(e.role,e.email) is not distinct from row(new.role,new.email)
  and (new.auth_user_id is null or e.auth_user_id=new.auth_user_id)
 ) then raise exception 'Teamleiter-Zuordnung darf nur durch Personalverantwortliche angelegt werden';
 end if;
 return new;
end $$;
commit;
