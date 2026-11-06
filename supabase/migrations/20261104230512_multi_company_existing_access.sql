-- Draft: adds existing manager accounts to explicitly selected companies.
create or replace function private.manager_grant_existing_companies(
  p_source_company_id uuid, p_target_user_id uuid, p_company_ids uuid[]
) returns integer language plpgsql security definer set search_path = '' as $$
declare source_row public.company_members%rowtype; company_id_ uuid; granted_ integer := 0;
begin
  if auth.uid() is null or p_target_user_id is null or p_target_user_id = auth.uid()
    or p_company_ids is null or cardinality(p_company_ids) < 1 or cardinality(p_company_ids) > 50
    or array_position(p_company_ids, null) is not null
    or cardinality(p_company_ids) <> (select count(distinct x) from unnest(p_company_ids) x)
  then raise exception 'Ungültige Auswahl'; end if;
  if not private.can_manage_company_users(p_source_company_id) then
    raise exception 'Nicht berechtigt';
  end if;
  select m.* into source_row from public.company_members m
    where m.company_id=p_source_company_id and m.user_id=p_target_user_id and m.status='ACTIVE';
  if not found or source_row.role not in ('ADMIN','PLANNER','DISPATCHER','VIEWER','TIME_TRACKING')
    or source_row.access_role not in ('ADMIN','TEAM_LEAD','EMPLOYEE') then
    raise exception 'Aktiver Quellzugang nicht verfügbar';
  end if;
  for company_id_ in select x from unnest(p_company_ids) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended(company_id_::text,7041));
    if not private.can_manage_company_users(company_id_) then raise exception 'Nicht berechtigt für ein ausgewähltes Unternehmen'; end if;
    if source_row.access_role='ADMIN' and not exists(
       select 1 from public.company_members m where m.company_id=company_id_ and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='OWNER' and m.access_role='OWNER'
    ) then raise exception 'Nur der Inhaber darf Administratoren zuweisen'; end if;
    if exists(select 1 from public.company_members m where m.company_id=company_id_ and m.user_id=p_target_user_id)
      or exists(select 1 from public.employees e where e.company_id=company_id_ and e.auth_user_id=p_target_user_id and e.deleted_at is null)
    then raise exception 'Zugang zum ausgewählten Unternehmen besteht bereits'; end if;
    insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions)
    values(company_id_,p_target_user_id,source_row.role,'ACTIVE',source_row.access_role,source_row.extra_permissions);
    granted_ := granted_+1;
  end loop;
  return granted_;
end $$;
revoke all on function private.manager_grant_existing_companies(uuid,uuid,uuid[]) from public, anon;
grant execute on function private.manager_grant_existing_companies(uuid,uuid,uuid[]) to authenticated;
create or replace function public.manager_grant_existing_companies(
  p_source_company_id uuid, p_target_user_id uuid, p_company_ids uuid[]
) returns integer language sql set search_path = '' as $$
  select private.manager_grant_existing_companies(p_source_company_id,p_target_user_id,p_company_ids)
$$;
revoke all on function public.manager_grant_existing_companies(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.manager_grant_existing_companies(uuid,uuid,uuid[]) to authenticated;

-- Only list companies the caller can administer, and mark existing assignments.
create or replace function private.manager_existing_company_options(p_source_company_id uuid, p_target_user_id uuid)
returns table(company_id uuid, company_name text, assigned boolean)
language plpgsql stable security definer set search_path = '' as $$
declare source_row public.company_members%rowtype;
begin
  if auth.uid() is null or p_target_user_id is null or p_target_user_id=auth.uid()
    or not private.can_manage_company_users(p_source_company_id) then raise exception 'Nicht berechtigt'; end if;
  select m.* into source_row from public.company_members m
    where m.company_id=p_source_company_id and m.user_id=p_target_user_id and m.status='ACTIVE';
  if not found or source_row.role not in ('ADMIN','PLANNER','DISPATCHER','VIEWER','TIME_TRACKING')
    or source_row.access_role not in ('ADMIN','TEAM_LEAD','EMPLOYEE')
  then raise exception 'Aktiver Quellzugang nicht verfügbar'; end if;
  return query
    select c.id,c.name,
      (exists(select 1 from public.company_members t where t.company_id=c.id and t.user_id=p_target_user_id)
       or exists(select 1 from public.employees e where e.company_id=c.id and e.auth_user_id=p_target_user_id and e.deleted_at is null))
    from public.company_members actor join public.companies c on c.id=actor.company_id
    where actor.user_id=auth.uid() and actor.status='ACTIVE'
      and actor.role in ('OWNER','ADMIN') and actor.access_role in ('OWNER','ADMIN')
      and c.id<>p_source_company_id
      and (source_row.access_role<>'ADMIN' or (actor.role='OWNER' and actor.access_role='OWNER'))
    order by c.name,c.id;
end $$;
revoke all on function private.manager_existing_company_options(uuid,uuid) from public, anon;
grant execute on function private.manager_existing_company_options(uuid,uuid) to authenticated;
create or replace function public.manager_existing_company_options(p_source_company_id uuid, p_target_user_id uuid)
returns table(company_id uuid,company_name text,assigned boolean) language sql stable set search_path = '' as $$
  select * from private.manager_existing_company_options(p_source_company_id,p_target_user_id)
$$;
revoke all on function public.manager_existing_company_options(uuid,uuid) from public, anon;
grant execute on function public.manager_existing_company_options(uuid,uuid) to authenticated;
