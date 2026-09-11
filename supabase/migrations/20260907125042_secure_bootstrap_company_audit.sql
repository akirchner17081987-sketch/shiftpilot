-- Keep the append-only audit log closed to ordinary authenticated writes.
-- Company bootstrap needs a narrowly scoped definer helper because it must
-- create the first membership before its audit row can satisfy normal RLS.

create or replace function private.bootstrap_company_impl(p_name text default 'SchichtFunk')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_name text := left(coalesce(nullif(trim(p_name), ''), 'SchichtFunk'), 160);
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Prevent concurrent first-login requests from creating two companies for
  -- the same account while preserving the original idempotent behaviour.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  select cm.company_id
    into v_company
  from public.company_members cm
  where cm.user_id = v_user
    and cm.status = 'ACTIVE'
  order by cm.created_at
  limit 1;

  if v_company is not null then
    return v_company;
  end if;

  insert into public.companies(name, created_by)
  values (v_name, v_user)
  returning id into v_company;

  insert into public.company_members(company_id, user_id, role, status)
  values (v_company, v_user, 'OWNER', 'ACTIVE');

  insert into public.shift_templates(
    company_id, code, name, default_start, default_end, css_class, sort_order
  ) values
    (v_company, 'O1', 'O1', '07:00', '15:00', 'violet', 1),
    (v_company, 'O2', 'O2', '15:00', '23:00', 'blue', 2),
    (v_company, 'Teamleiter', 'Teamleiter', '08:00', '16:00', 'amber', 3),
    (v_company, 'O3', 'O3', '23:00', '07:00', 'pink', 4),
    (v_company, 'OT1', 'OT1', '10:00', '18:00', 'teal', 5),
    (v_company, 'OT2', 'OT2', '12:00', '20:00', 'cyan', 6),
    (v_company, 'OT', 'OT', '18:00', '02:00', 'violet', 7);

  insert into public.global_staffing_requirements(
    company_id, shift_code, required_count
  ) values
    (v_company, 'O1', 3),
    (v_company, 'O2', 2),
    (v_company, 'Teamleiter', 2),
    (v_company, 'O3', 2),
    (v_company, 'OT1', 1),
    (v_company, 'OT2', 2),
    (v_company, 'OT', 3);

  insert into public.company_compliance_policy(company_id)
  values (v_company);

  insert into public.audit_events(
    company_id,
    event_type,
    entity_type,
    entity_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    v_company,
    'COMPANY_BOOTSTRAPPED',
    'company',
    v_company,
    v_user,
    'OWNER',
    pg_catalog.jsonb_build_object('name', v_name)
  );

  return v_company;
end;
$$;
revoke all on function private.bootstrap_company_impl(text)
  from public, anon, authenticated;
grant execute on function private.bootstrap_company_impl(text)
  to authenticated;
create or replace function public.bootstrap_company(p_name text default 'SchichtFunk')
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.bootstrap_company_impl(p_name)
$$;
revoke all on function public.bootstrap_company(text) from public, anon;
grant execute on function public.bootstrap_company(text) to authenticated;
comment on function private.bootstrap_company_impl(text) is
  'Creates the first company and immutable audit entry for the authenticated user without reopening direct audit writes.';
