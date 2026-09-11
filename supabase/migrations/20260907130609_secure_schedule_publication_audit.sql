-- Publish schedule weeks through a narrowly scoped definer helper. Direct
-- authenticated writes to the append-only audit log remain revoked.

create or replace function private.publish_schedule_week_impl(p_week_start date)
returns table(published_at timestamptz, assignment_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_tz text;
  v_now timestamptz := now();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_week_start is null then
    raise exception 'Week start is required';
  end if;

  select cm.company_id, cm.role, coalesce(c.timezone, 'Europe/Berlin')
    into v_company, v_role, v_tz
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = v_user
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'ADMIN', 'DISPATCHER', 'PLANNER')
  order by cm.created_at
  limit 1;

  if v_company is null then
    raise exception 'Not authorized to publish schedule';
  end if;

  update public.shift_assignments s
     set status = 'PUBLISHED',
         published_at = coalesce(s.published_at, v_now)
   where s.company_id = v_company
     and s.status = 'DRAFT'
     and (s.starts_at at time zone v_tz)::date >= p_week_start
     and (s.starts_at at time zone v_tz)::date < p_week_start + 7;
  get diagnostics v_count = row_count;

  insert into public.plan_publications(company_id, week_start, published_at, published_by)
  values (v_company, p_week_start, v_now, v_user)
  on conflict(company_id, week_start)
  do update set
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role, metadata
  ) values (
    v_company, 'PLAN_PUBLISHED', 'plan_publication', null, v_user, v_role,
    pg_catalog.jsonb_build_object(
      'week_start', p_week_start,
      'assignment_count', v_count,
      'source', 'server_rpc'
    )
  );

  return query select v_now, v_count;
end;
$$;
revoke all on function private.publish_schedule_week_impl(date)
  from public, anon, authenticated;
grant execute on function private.publish_schedule_week_impl(date)
  to authenticated;
create or replace function public.publish_schedule_week(p_week_start date)
returns table(published_at timestamptz, assignment_count integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.publish_schedule_week_impl(p_week_start)
$$;
revoke all on function public.publish_schedule_week(date) from public, anon;
grant execute on function public.publish_schedule_week(date) to authenticated;
comment on function private.publish_schedule_week_impl(date) is
  'Publishes one schedule week and appends its immutable audit event after explicit tenant-role authorization.';
