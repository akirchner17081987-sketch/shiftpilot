-- Remove elevated privileges from the exposed audit reader. RLS and the
-- explicit company-admin predicate both remain in force.
create or replace function public.manager_list_audit_events(
  p_company_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_id uuid default null,
  p_action text default null,
  p_limit integer default 250
)
returns table(
  id uuid,
  created_at timestamptz,
  event_type text,
  entity_type text,
  entity_id uuid,
  actor_id uuid,
  actor_email text,
  actor_role text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb
)
language plpgsql
security invoker
set search_path = 'public', 'private', 'pg_temp'
as $$
begin
  if not private.can_manage_company_users(p_company_id) then
    raise exception 'Nicht berechtigt';
  end if;

  return query
  select
    a.id,
    a.created_at,
    a.event_type,
    a.entity_type,
    a.entity_id,
    a.actor_id,
    case when a.actor_id is null then 'System' else a.actor_id::text end,
    coalesce(a.actor_role, 'SYSTEM')::text,
    a.old_values,
    a.new_values,
    a.metadata
  from public.audit_events a
  where a.company_id = p_company_id
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (p_actor_id is null or a.actor_id = p_actor_id)
    and (nullif(trim(p_action), '') is null or a.event_type = p_action)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 1000);
end;
$$;

revoke all on function public.manager_list_audit_events(uuid,timestamptz,timestamptz,uuid,text,integer) from public, anon;
grant execute on function public.manager_list_audit_events(uuid,timestamptz,timestamptz,uuid,text,integer) to authenticated;
