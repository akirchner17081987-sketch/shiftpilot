-- DRAFT ONLY: preserves production personnel-conversation rules while testing the QA invite claim exception.
-- Requires the rest of the feature, a reviewed migration, and full release verification.
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
 if tg_table_name='company_members' and new.access_role='TEAM_LEAD' and new.role in ('PLANNER','DISPATCHER') and not 'read_only'=any(new.extra_permissions) and not 'personnel_conversations'=any(new.extra_permissions) then new.extra_permissions:=array_append(new.extra_permissions,'personnel_conversations'); end if;
 if new.access_role not in ('OWNER','ADMIN','TEAM_LEAD','EMPLOYEE') or not new.extra_permissions <@ array['publish_schedule','manage_time','confirm_time','read_only','personnel_conversations']::text[]
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
 if 'personnel_conversations'=any(new.extra_permissions) and (new.access_role<>'TEAM_LEAD' or tg_table_name='company_member_invites') then raise exception 'Personalgespräche werden aktiven Teamleitern automatisch zugeordnet'; end if;
 return new;
end $function$
;
