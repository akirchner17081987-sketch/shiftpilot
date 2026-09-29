-- Privacy lifecycle foundation. This migration only adds a private queue and
-- read-only previews. It deliberately does not schedule or execute deletion.

create schema if not exists private;

create table if not exists private.privacy_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_kind text not null,
  company_id uuid not null,
  employee_id uuid,
  status text not null default 'PENDING_APPROVAL',
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  access_revoke_after timestamptz not null default now(),
  erase_after timestamptz not null,
  legal_hold_until timestamptz,
  reason text not null,
  preview jsonb not null,
  storage_paths text[] not null default '{}'::text[],
  auth_user_ids uuid[] not null default '{}'::uuid[],
  attempt_count integer not null default 0,
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint privacy_lifecycle_request_kind_check
    check (request_kind in ('EMPLOYEE_OFFBOARDING', 'COMPANY_OFFBOARDING', 'RETENTION_PURGE')),
  constraint privacy_lifecycle_status_check
    check (status in ('PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  constraint privacy_lifecycle_target_check
    check (
      (request_kind = 'EMPLOYEE_OFFBOARDING' and employee_id is not null)
      or (request_kind in ('COMPANY_OFFBOARDING', 'RETENTION_PURGE'))
    ),
  constraint privacy_lifecycle_reason_check check (length(btrim(reason)) >= 10),
  constraint privacy_lifecycle_dates_check check (erase_after >= access_revoke_after),
  constraint privacy_lifecycle_attempt_count_check check (attempt_count >= 0)
);

create index if not exists privacy_lifecycle_requests_due_idx
  on private.privacy_lifecycle_requests(status, erase_after)
  where status in ('APPROVED', 'BLOCKED');

create index if not exists privacy_lifecycle_requests_company_idx
  on private.privacy_lifecycle_requests(company_id, requested_at desc);

alter table private.privacy_lifecycle_requests enable row level security;

revoke all on table private.privacy_lifecycle_requests from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on table private.privacy_lifecycle_requests to service_role;

create or replace function private.sf_assert_service_role()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
end;
$$;

revoke all on function private.sf_assert_service_role() from public, anon, authenticated;
grant execute on function private.sf_assert_service_role() to service_role;

create or replace function private.sf_employee_offboarding_preview(
  p_company_id uuid,
  p_employee_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee public.employees%rowtype;
  v_storage_paths text[];
  v_as_of date := coalesce(p_as_of, current_date);
  v_end_date date;
  v_default_anonymize_after date;
  v_time_retention_after date;
  v_future_assignments bigint;
  v_open_time_entries bigint;
begin
  perform private.sf_assert_service_role();

  select e.* into v_employee
  from public.employees e
  where e.id = p_employee_id and e.company_id = p_company_id;

  if v_employee.id is null then
    raise exception 'Employee does not belong to company';
  end if;

  v_end_date := coalesce(v_employee.contract_end, v_as_of);
  -- Three years after the end of the relevant calendar year.
  v_default_anonymize_after := make_date(extract(year from v_end_date)::integer + 4, 1, 1);
  -- Conservative six-year window for payroll-relevant time-account evidence.
  v_time_retention_after := make_date(extract(year from v_end_date)::integer + 7, 1, 1);

  select coalesce(array_agg(d.storage_path order by d.storage_path), '{}'::text[])
    into v_storage_paths
  from public.employee_personnel_documents d
  where d.company_id = p_company_id and d.employee_id = p_employee_id;

  select count(*) into v_future_assignments
  from public.shift_assignments a
  where a.company_id = p_company_id
    and a.employee_id = p_employee_id
    and a.status <> 'CANCELLED'
    and a.ends_at::date >= v_as_of;

  select count(*) into v_open_time_entries
  from public.time_entries t
  join public.shift_assignments a on a.id = t.assignment_id
  where t.company_id = p_company_id
    and a.employee_id = p_employee_id
    and t.status not in ('confirmed', 'rejected');

  return jsonb_build_object(
    'version', 1,
    'request_kind', 'EMPLOYEE_OFFBOARDING',
    'company_id', p_company_id,
    'employee_id', p_employee_id,
    'as_of', v_as_of,
    'immediate_actions', jsonb_build_array(
      'deactivate_employee_access',
      'revoke_company_membership',
      'revoke_open_invites',
      'delete_push_subscriptions',
      'revoke_auth_sessions'
    ),
    'auth_user_ids', case when v_employee.auth_user_id is null
      then '[]'::jsonb else jsonb_build_array(v_employee.auth_user_id) end,
    'storage_paths', to_jsonb(v_storage_paths),
    'counts', jsonb_build_object(
      'absences', (select count(*) from public.absences x where x.company_id=p_company_id and x.employee_id=p_employee_id),
      'assignments', (select count(*) from public.shift_assignments x where x.company_id=p_company_id and x.employee_id=p_employee_id),
      'qr_punches', (select count(*) from public.time_qr_punches x where x.company_id=p_company_id and x.employee_id=p_employee_id),
      'personnel_documents', cardinality(v_storage_paths),
      'personnel_notes', (select count(*) from public.employee_personnel_notes x where x.company_id=p_company_id and x.employee_id=p_employee_id),
      'personnel_qualifications', (select count(*) from public.employee_personnel_qualifications x where x.company_id=p_company_id and x.employee_id=p_employee_id)
    ),
    'blockers', jsonb_build_object(
      'future_assignments', v_future_assignments,
      'open_time_entries', v_open_time_entries,
      'customer_retention_profile_required', true,
      'legal_hold_check_required', true
    ),
    'retention', jsonb_build_object(
      'contact_data_delete_after', v_end_date + 30,
      'default_personnel_anonymize_after', v_default_anonymize_after,
      'payroll_time_evidence_review_after', v_time_retention_after,
      'policy_source', 'customer-approved retention profile'
    ),
    'execution_enabled', false
  );
end;
$$;

revoke all on function private.sf_employee_offboarding_preview(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function private.sf_employee_offboarding_preview(uuid, uuid, date)
  to service_role;

create or replace function private.server_stage_employee_offboarding(
  p_idempotency_key uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_requested_by uuid,
  p_reason text,
  p_as_of date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview jsonb;
  v_request_id uuid;
  v_storage_paths text[];
  v_auth_user_ids uuid[];
  v_as_of date := coalesce(p_as_of, current_date);
begin
  perform private.sf_assert_service_role();

  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Documented reason is required';
  end if;

  select r.id into v_request_id
  from private.privacy_lifecycle_requests r
  where r.idempotency_key = p_idempotency_key
    and r.request_kind = 'EMPLOYEE_OFFBOARDING'
    and r.company_id = p_company_id
    and r.employee_id = p_employee_id
    and r.requested_by = p_requested_by;
  if v_request_id is not null then
    return v_request_id;
  end if;

  if exists (
    select 1 from private.privacy_lifecycle_requests r
    where r.idempotency_key = p_idempotency_key
  ) then
    raise exception 'Idempotency key belongs to another request';
  end if;

  v_preview := private.sf_employee_offboarding_preview(p_company_id, p_employee_id, v_as_of);
  select coalesce(array_agg(value), '{}'::text[]) into v_storage_paths
  from jsonb_array_elements_text(v_preview->'storage_paths');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_auth_user_ids
  from jsonb_array_elements_text(v_preview->'auth_user_ids');

  insert into private.privacy_lifecycle_requests(
    idempotency_key, request_kind, company_id, employee_id, requested_by,
    access_revoke_after, erase_after, reason, preview, storage_paths, auth_user_ids
  ) values (
    p_idempotency_key, 'EMPLOYEE_OFFBOARDING', p_company_id, p_employee_id, p_requested_by,
    now(), v_as_of::timestamptz + interval '30 days', btrim(p_reason), v_preview,
    v_storage_paths, v_auth_user_ids
  ) on conflict (idempotency_key) do nothing
  returning id into v_request_id;

  if v_request_id is null then
    select r.id into v_request_id
    from private.privacy_lifecycle_requests r
    where r.idempotency_key = p_idempotency_key
      and r.request_kind = 'EMPLOYEE_OFFBOARDING'
      and r.company_id = p_company_id
      and r.employee_id = p_employee_id
      and r.requested_by = p_requested_by;
    if v_request_id is null then
      raise exception 'Idempotency key belongs to another request';
    end if;
  end if;

  return v_request_id;
end;
$$;

revoke all on function private.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date)
  from public, anon, authenticated;
grant execute on function private.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date)
  to service_role;

create or replace function private.server_due_privacy_requests(p_limit integer default 25)
returns setof private.privacy_lifecycle_requests
language sql
security definer
set search_path = ''
as $$
  select r.*
  from private.privacy_lifecycle_requests r
  where current_setting('request.jwt.claim.role', true) = 'service_role'
    and r.status = 'APPROVED'
    and r.erase_after <= now()
    and (r.legal_hold_until is null or r.legal_hold_until < now())
  order by r.erase_after, r.requested_at
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;

revoke all on function private.server_due_privacy_requests(integer)
  from public, anon, authenticated;
grant execute on function private.server_due_privacy_requests(integer)
  to service_role;

-- PostgREST only exposes public RPCs. These invoker wrappers remain callable
-- exclusively with the service-role key used inside the Edge Function.
create or replace function public.server_employee_offboarding_preview(
  p_company_id uuid,
  p_employee_id uuid,
  p_as_of date default current_date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.sf_employee_offboarding_preview(p_company_id, p_employee_id, p_as_of)
$$;

revoke all on function public.server_employee_offboarding_preview(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.server_employee_offboarding_preview(uuid, uuid, date)
  to service_role;

create or replace function public.server_stage_employee_offboarding(
  p_idempotency_key uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_requested_by uuid,
  p_reason text,
  p_as_of date default current_date
)
returns uuid
language sql
set search_path = ''
as $$
  select private.server_stage_employee_offboarding(
    p_idempotency_key, p_company_id, p_employee_id, p_requested_by, p_reason, p_as_of
  )
$$;

revoke all on function public.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date)
  to service_role;

comment on table private.privacy_lifecycle_requests is
  'Two-person approval queue for privacy lifecycle actions. No deletion is performed by this migration.';
comment on function private.sf_employee_offboarding_preview(uuid, uuid, date) is
  'Read-only employee offboarding preview for a service-side worker.';
comment on function private.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date) is
  'Stages an idempotent request. Approval and destructive execution are intentionally separate.';
