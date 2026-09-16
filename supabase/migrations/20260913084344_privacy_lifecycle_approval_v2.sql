-- Approval and worker-state foundation. This migration still performs no
-- business-data deletion and installs no schedule.

create table if not exists private.privacy_retention_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  version integer not null,
  status text not null default 'DRAFT',
  rules jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  revoked_at timestamptz,
  constraint privacy_retention_profile_version_check check (version > 0),
  constraint privacy_retention_profile_status_check check (status in ('DRAFT', 'APPROVED', 'REVOKED')),
  constraint privacy_retention_profile_rules_check check (jsonb_typeof(rules) = 'object'),
  constraint privacy_retention_profile_approval_check check (
    (status = 'DRAFT' and approved_by is null and approved_at is null)
    or (status = 'APPROVED' and approved_by is not null and approved_at is not null and approved_by <> created_by)
    or (status = 'REVOKED' and revoked_at is not null)
  ),
  unique(company_id, version)
);

create unique index if not exists privacy_retention_profiles_one_approved_idx
  on private.privacy_retention_profiles(company_id)
  where status = 'APPROVED';

create table if not exists private.privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid,
  category text not null,
  status text not null default 'ACTIVE',
  reason text not null,
  hold_until timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  released_by uuid,
  released_at timestamptz,
  constraint privacy_legal_hold_category_check check (
    category in ('ALL', 'EMPLOYMENT', 'TIME', 'ABSENCE', 'PERSONNEL_FILE', 'AUDIT', 'SECURITY_INCIDENT')
  ),
  constraint privacy_legal_hold_status_check check (status in ('ACTIVE', 'RELEASED')),
  constraint privacy_legal_hold_reason_check check (length(btrim(reason)) >= 10),
  constraint privacy_legal_hold_release_check check (
    (status = 'ACTIVE' and released_by is null and released_at is null)
    or (status = 'RELEASED' and released_by is not null and released_at is not null)
  )
);

alter table private.privacy_retention_profiles enable row level security;
alter table private.privacy_legal_holds enable row level security;

create index if not exists privacy_legal_holds_active_idx
  on private.privacy_legal_holds(company_id, employee_id, hold_until)
  where status = 'ACTIVE';

alter table private.privacy_lifecycle_requests
  add column if not exists retention_profile_id uuid,
  add column if not exists worker_id text,
  add column if not exists started_at timestamptz,
  add column if not exists outcome jsonb;

revoke all on table private.privacy_retention_profiles from public, anon, authenticated;
revoke all on table private.privacy_legal_holds from public, anon, authenticated;
grant select, insert, update on table private.privacy_retention_profiles to service_role;
grant select, insert, update on table private.privacy_legal_holds to service_role;

create or replace function private.server_privacy_request_snapshot(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'request_kind', r.request_kind,
    'company_id', r.company_id,
    'employee_id', r.employee_id,
    'status', r.status,
    'requested_by', r.requested_by,
    'requested_at', r.requested_at,
    'approved_by', r.approved_by,
    'approved_at', r.approved_at,
    'erase_after', r.erase_after,
    'legal_hold_until', r.legal_hold_until,
    'retention_profile_id', r.retention_profile_id,
    'preview', r.preview,
    'attempt_count', r.attempt_count,
    'completed_at', r.completed_at,
    'outcome', r.outcome
  )
  from private.privacy_lifecycle_requests r
  where current_setting('request.jwt.claim.role', true) = 'service_role'
    and r.id = p_request_id
$$;

revoke all on function private.server_privacy_request_snapshot(uuid) from public, anon, authenticated;
grant execute on function private.server_privacy_request_snapshot(uuid) to service_role;

create or replace function private.server_approve_privacy_request(
  p_request_id uuid,
  p_approved_by uuid,
  p_retention_profile_id uuid,
  p_legal_hold_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_lifecycle_requests%rowtype;
  v_profile private.privacy_retention_profiles%rowtype;
begin
  perform private.sf_assert_service_role();

  select * into v_request
  from private.privacy_lifecycle_requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then raise exception 'Privacy request not found'; end if;
  if v_request.status <> 'PENDING_APPROVAL' then raise exception 'Privacy request is not awaiting approval'; end if;
  if v_request.requested_by = p_approved_by then raise exception 'Two-person approval required'; end if;

  if not exists (
    select 1 from public.company_members m
    where m.company_id = v_request.company_id
      and m.user_id = p_approved_by
      and m.status = 'ACTIVE'
      and m.role in ('OWNER', 'ADMIN')
  ) then raise exception 'Approver is not an active owner or admin'; end if;

  select * into v_profile
  from private.privacy_retention_profiles p
  where p.id = p_retention_profile_id and p.company_id = v_request.company_id and p.status = 'APPROVED';
  if v_profile.id is null then raise exception 'Approved retention profile required'; end if;

  update private.privacy_lifecycle_requests r set
    -- Keep an approved request claimable after a temporary hold expires.
    -- The worker claim enforces both this timestamp and explicit legal holds.
    status = 'APPROVED',
    approved_by = p_approved_by,
    approved_at = now(),
    retention_profile_id = v_profile.id,
    legal_hold_until = p_legal_hold_until,
    updated_at = now()
  where r.id = p_request_id;

  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

revoke all on function private.server_approve_privacy_request(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.server_approve_privacy_request(uuid, uuid, uuid, timestamptz)
  to service_role;

create or replace function private.server_claim_due_privacy_request(p_worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  perform private.sf_assert_service_role();

  if length(btrim(coalesce(p_worker_id, ''))) < 8 then raise exception 'Worker id is required'; end if;

  select r.id into v_request_id
  from private.privacy_lifecycle_requests r
  where r.status = 'APPROVED'
    and r.erase_after <= now()
    and (r.legal_hold_until is null or r.legal_hold_until < now())
    and not exists (
      select 1 from private.privacy_legal_holds h
      where h.company_id = r.company_id
        and (h.employee_id is null or h.employee_id = r.employee_id)
        and h.status = 'ACTIVE'
        and (h.hold_until is null or h.hold_until >= now())
    )
  order by r.erase_after, r.requested_at
  limit 1
  for update skip locked;

  if v_request_id is null then return null; end if;

  update private.privacy_lifecycle_requests r set
    status = 'EXECUTING',
    worker_id = left(btrim(p_worker_id), 200),
    started_at = now(),
    attempt_count = r.attempt_count + 1,
    last_error = null,
    updated_at = now()
  where r.id = v_request_id;

  return private.server_privacy_request_snapshot(v_request_id);
end;
$$;

revoke all on function private.server_claim_due_privacy_request(text) from public, anon, authenticated;
grant execute on function private.server_claim_due_privacy_request(text) to service_role;

create or replace function private.server_finish_privacy_request(
  p_request_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_outcome jsonb default '{}'::jsonb,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sf_assert_service_role();

  if jsonb_typeof(coalesce(p_outcome, '{}'::jsonb)) <> 'object' then
    raise exception 'Outcome must be an object';
  end if;

  update private.privacy_lifecycle_requests r set
    status = case when p_succeeded then 'COMPLETED' else 'BLOCKED' end,
    outcome = coalesce(p_outcome, '{}'::jsonb),
    last_error = case when p_succeeded then null else left(coalesce(p_error, 'Unknown worker error'), 1800) end,
    completed_at = case when p_succeeded then now() else null end,
    worker_id = null,
    updated_at = now()
  where r.id = p_request_id
    and r.status = 'EXECUTING'
    and r.worker_id = p_worker_id;

  if not found then raise exception 'Worker does not own executing request'; end if;
  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

revoke all on function private.server_finish_privacy_request(uuid, text, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function private.server_finish_privacy_request(uuid, text, boolean, jsonb, text)
  to service_role;

create or replace function public.server_privacy_request_snapshot(p_request_id uuid)
returns jsonb language sql stable set search_path = ''
as $$ select private.server_privacy_request_snapshot(p_request_id) $$;
revoke all on function public.server_privacy_request_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.server_privacy_request_snapshot(uuid) to service_role;

create or replace function public.server_approve_privacy_request(
  p_request_id uuid, p_approved_by uuid, p_retention_profile_id uuid,
  p_legal_hold_until timestamptz default null
)
returns jsonb language sql set search_path = ''
as $$ select private.server_approve_privacy_request(p_request_id,p_approved_by,p_retention_profile_id,p_legal_hold_until) $$;
revoke all on function public.server_approve_privacy_request(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_approve_privacy_request(uuid, uuid, uuid, timestamptz)
  to service_role;

create or replace function public.server_claim_due_privacy_request(p_worker_id text)
returns jsonb language sql set search_path = ''
as $$ select private.server_claim_due_privacy_request(p_worker_id) $$;
revoke all on function public.server_claim_due_privacy_request(text) from public, anon, authenticated;
grant execute on function public.server_claim_due_privacy_request(text) to service_role;

create or replace function public.server_finish_privacy_request(
  p_request_id uuid, p_worker_id text, p_succeeded boolean,
  p_outcome jsonb default '{}'::jsonb, p_error text default null
)
returns jsonb language sql set search_path = ''
as $$ select private.server_finish_privacy_request(p_request_id,p_worker_id,p_succeeded,p_outcome,p_error) $$;
revoke all on function public.server_finish_privacy_request(uuid, text, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.server_finish_privacy_request(uuid, text, boolean, jsonb, text)
  to service_role;

comment on table private.privacy_retention_profiles is
  'Versioned customer-approved retention rules. Only one approved profile per company.';
comment on table private.privacy_legal_holds is
  'Narrowly scoped deletion holds. Reasons must not contain unnecessary personal data.';
