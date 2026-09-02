-- SchichtFunk: unveraenderbare, mandantengetrennte Audit-Protokollierung.
-- Lesen duerfen ausschliesslich aktive OWNER/ADMIN-Mitglieder.

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception 'Audit-Protokolle sind unveraenderbar';
end;
$$;

revoke all on function public.prevent_audit_mutation() from public, anon, authenticated;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update
before update or delete on public.audit_events
for each row execute function public.prevent_audit_mutation();

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on table public.audit_events from anon, authenticated;
grant select on table public.audit_events to authenticated;

drop policy if exists audit_events_admin_read on public.audit_events;
create policy audit_events_admin_read
on public.audit_events
for select
to authenticated
using (private.can_manage_company_users(company_id));

create or replace function private.capture_audit_change()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private', 'auth', 'pg_temp'
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_company_id uuid := coalesce((v_new->>'company_id')::uuid, (v_old->>'company_id')::uuid);
  v_entity_id uuid := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_actor_role text;
begin
  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'ACTIVE';

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role,
    old_values, new_values, metadata
  ) values (
    v_company_id,
    upper(tg_op || '_' || tg_table_name),
    tg_table_name,
    v_entity_id,
    auth.uid(),
    coalesce(v_actor_role, 'SYSTEM'),
    v_old,
    v_new,
    jsonb_build_object('schema', tg_table_schema, 'backendCaptured', true)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_audit_change() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'employees', 'absences', 'shift_assignments', 'shift_change_requests',
    'time_entries', 'company_members', 'global_staffing_requirements',
    'daily_staffing_overrides', 'company_compliance_policy'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists %I on public.%I', 'sf_audit_' || v_table, v_table);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function private.capture_audit_change()',
        'sf_audit_' || v_table,
        v_table
      );
    end if;
  end loop;
end;
$$;

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
security definer
set search_path = 'public', 'private', 'auth', 'pg_temp'
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
    coalesce(u.email, 'System')::text,
    coalesce(a.actor_role, 'SYSTEM')::text,
    a.old_values,
    a.new_values,
    a.metadata
  from public.audit_events a
  left join auth.users u on u.id = a.actor_id
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
