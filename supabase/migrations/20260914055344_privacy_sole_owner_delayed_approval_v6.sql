-- Compensating approval controls for companies with exactly one active OWNER.
-- This migration creates no schedule and performs no deletion.

alter table private.privacy_lifecycle_requests
  add column if not exists approval_mode text not null default 'TWO_PERSON',
  add column if not exists first_session_fingerprint text,
  add column if not exists confirmation_not_before timestamptz,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists confirmed_session_fingerprint text,
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists preview_hash text;

alter table private.privacy_lifecycle_requests
  drop constraint if exists privacy_lifecycle_approval_mode_check;
alter table private.privacy_lifecycle_requests
  add constraint privacy_lifecycle_approval_mode_check
  check (approval_mode in ('TWO_PERSON','SOLE_OWNER_DELAYED'));

alter table private.privacy_lifecycle_requests
  drop constraint if exists privacy_lifecycle_sole_owner_fields_check;
alter table private.privacy_lifecycle_requests
  add constraint privacy_lifecycle_sole_owner_fields_check check (
    approval_mode = 'TWO_PERSON'
    or (
      request_kind = 'EMPLOYEE_OFFBOARDING'
      and employee_id is not null
      and first_session_fingerprint is not null and length(first_session_fingerprint) = 64
      and preview_hash is not null and length(preview_hash) = 64
      and confirmation_not_before is not null
      and confirmation_expires_at is not null
      and confirmation_not_before >= requested_at + interval '24 hours'
      and confirmation_expires_at = requested_at + interval '7 days'
      and confirmation_expires_at > confirmation_not_before
      and (
        (
          confirmed_by is null and confirmed_at is null and confirmed_session_fingerprint is null
          and approved_by is null and approved_at is null and status = 'PENDING_APPROVAL'
        )
        or (
          confirmed_by = requested_by
          and approved_by = confirmed_by and approved_at = confirmed_at
          and confirmed_at is not null
          and confirmed_session_fingerprint is not null
          and confirmed_at between confirmation_not_before and confirmation_expires_at
          and length(confirmed_session_fingerprint) = 64
          and confirmed_session_fingerprint <> first_session_fingerprint
        )
      )
    )
  );

create index if not exists privacy_lifecycle_sole_owner_pending_idx
  on private.privacy_lifecycle_requests(confirmation_not_before, confirmation_expires_at)
  where approval_mode = 'SOLE_OWNER_DELAYED' and status = 'PENDING_APPROVAL';

alter table private.privacy_retention_profiles
  add column if not exists approval_mode text not null default 'TWO_PERSON',
  add column if not exists approval_reference text,
  add column if not exists rules_hash text,
  add column if not exists first_session_fingerprint text,
  add column if not exists confirmation_not_before timestamptz,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists confirmed_session_fingerprint text;

alter table private.privacy_retention_profiles
  drop constraint if exists privacy_retention_profile_approval_check;
alter table private.privacy_retention_profiles
  drop constraint if exists privacy_retention_profile_approval_mode_check;
alter table private.privacy_retention_profiles
  add constraint privacy_retention_profile_approval_mode_check
  check (approval_mode in ('TWO_PERSON','SOLE_OWNER_DELAYED'));
alter table private.privacy_retention_profiles
  add constraint privacy_retention_profile_approval_check check (
    (
      status = 'DRAFT'
      and approved_by is null and approved_at is null
      and (
        approval_mode = 'TWO_PERSON'
        or (
          coalesce(length(btrim(approval_reference)),0) >= 10
          and rules_hash is not null and length(rules_hash) = 64
          and first_session_fingerprint is not null and length(first_session_fingerprint) = 64
          and confirmation_not_before is not null
          and confirmation_expires_at is not null
          and confirmation_not_before >= created_at + interval '24 hours'
          and confirmation_expires_at = created_at + interval '7 days'
          and confirmed_session_fingerprint is null
        )
      )
    )
    or (
      status = 'APPROVED'
      and approved_by is not null and approved_at is not null
      and (
        (approval_mode = 'TWO_PERSON' and approved_by <> created_by)
        or (
          approval_mode = 'SOLE_OWNER_DELAYED'
          and approved_by = created_by
          and coalesce(length(btrim(approval_reference)),0) >= 10
          and rules_hash is not null and length(rules_hash) = 64
          and first_session_fingerprint is not null and length(first_session_fingerprint) = 64
          and confirmed_session_fingerprint is not null and length(confirmed_session_fingerprint) = 64
          and confirmation_not_before is not null
          and confirmation_expires_at is not null
          and confirmed_session_fingerprint <> first_session_fingerprint
          and approved_at between confirmation_not_before and confirmation_expires_at
        )
      )
    )
    or (status = 'REVOKED' and revoked_at is not null)
  );

create index if not exists privacy_retention_profiles_sole_owner_pending_idx
  on private.privacy_retention_profiles(confirmation_not_before, confirmation_expires_at)
  where approval_mode = 'SOLE_OWNER_DELAYED' and status = 'DRAFT';

create or replace function private.sf_session_fingerprint(p_session_id uuid)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(p_session_id::text, 'sha256'), 'hex')
$$;

create or replace function private.sf_privacy_json_hash(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(p_value::text, 'sha256'), 'hex')
$$;

revoke all on function private.sf_session_fingerprint(uuid) from public, anon, authenticated;
revoke all on function private.sf_privacy_json_hash(jsonb) from public, anon, authenticated;
grant execute on function private.sf_session_fingerprint(uuid) to service_role;
grant execute on function private.sf_privacy_json_hash(jsonb) to service_role;

create or replace function private.sf_assert_sole_owner(
  p_company_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_count integer;
  v_admin_count integer;
begin
  perform private.sf_assert_service_role();

  select
    count(*) filter (where m.role = 'OWNER'),
    count(*) filter (where m.role = 'ADMIN')
  into v_owner_count, v_admin_count
  from public.company_members m
  where m.company_id = p_company_id and m.status = 'ACTIVE';

  if v_owner_count <> 1 or v_admin_count <> 0 then
    raise exception 'SOLE_OWNER_MODE_NOT_AVAILABLE';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = p_user_id
      and m.role = 'OWNER' and m.status = 'ACTIVE'
  ) then
    raise exception 'SOLE_OWNER_REQUIRED';
  end if;
end;
$$;

revoke all on function private.sf_assert_sole_owner(uuid,uuid) from public, anon, authenticated;
grant execute on function private.sf_assert_sole_owner(uuid,uuid) to service_role;

create or replace function private.sf_assert_not_sole_owner_target(
  p_company_id uuid,
  p_employee_id uuid,
  p_owner_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
begin
  perform private.sf_assert_service_role();
  select e.auth_user_id into v_auth_user_id
  from public.employees e
  where e.company_id = p_company_id and e.id = p_employee_id;
  if not found then raise exception 'Employee does not belong to company'; end if;
  if v_auth_user_id = p_owner_id or exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = v_auth_user_id
      and m.role = 'OWNER' and m.status = 'ACTIVE'
  ) then
    raise exception 'SOLE_OWNER_TARGET_BLOCKED';
  end if;
end;
$$;

revoke all on function private.sf_assert_not_sole_owner_target(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.sf_assert_not_sole_owner_target(uuid,uuid,uuid)
  to service_role;

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
    'execution_phase', r.execution_phase,
    'approval_mode', r.approval_mode,
    'requested_by', r.requested_by,
    'requested_at', r.requested_at,
    'approved_by', r.approved_by,
    'approved_at', r.approved_at,
    'confirmation_not_before', r.confirmation_not_before,
    'confirmation_expires_at', r.confirmation_expires_at,
    'confirmed_by', r.confirmed_by,
    'confirmed_at', r.confirmed_at,
    'access_revoke_after', r.access_revoke_after,
    'erase_after', r.erase_after,
    'legal_hold_until', r.legal_hold_until,
    'retention_profile_id', r.retention_profile_id,
    'preview_hash', r.preview_hash,
    'preview', r.preview,
    'attempt_count', r.attempt_count,
    'started_at', r.started_at,
    'completed_at', r.completed_at,
    'outcome', r.outcome
  )
  from private.privacy_lifecycle_requests r
  where current_setting('request.jwt.claim.role', true) = 'service_role'
    and r.id = p_request_id
$$;

create or replace function private.server_stage_sole_owner_employee_offboarding(
  p_idempotency_key uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_requested_by uuid,
  p_session_id uuid,
  p_reason text,
  p_as_of date default current_date
)
returns jsonb
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
  v_fingerprint text := private.sf_session_fingerprint(p_session_id);
begin
  perform private.sf_assert_service_role();
  perform private.sf_assert_sole_owner(p_company_id, p_requested_by);
  perform private.sf_assert_not_sole_owner_target(p_company_id, p_employee_id, p_requested_by);
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Documented reason is required';
  end if;

  select r.id into v_request_id
  from private.privacy_lifecycle_requests r
  where r.idempotency_key = p_idempotency_key
    and r.request_kind = 'EMPLOYEE_OFFBOARDING'
    and r.company_id = p_company_id
    and r.employee_id = p_employee_id
    and r.requested_by = p_requested_by
    and r.approval_mode = 'SOLE_OWNER_DELAYED'
    and r.first_session_fingerprint = v_fingerprint;
  if v_request_id is not null then
    return private.server_privacy_request_snapshot(v_request_id);
  end if;
  if exists (select 1 from private.privacy_lifecycle_requests r where r.idempotency_key = p_idempotency_key) then
    raise exception 'Idempotency key belongs to another request';
  end if;

  v_preview := private.sf_employee_offboarding_preview(p_company_id, p_employee_id, v_as_of);
  select coalesce(array_agg(value), '{}'::text[]) into v_storage_paths
  from jsonb_array_elements_text(v_preview->'storage_paths');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_auth_user_ids
  from jsonb_array_elements_text(v_preview->'auth_user_ids');

  insert into private.privacy_lifecycle_requests(
    idempotency_key, request_kind, company_id, employee_id, requested_by,
    access_revoke_after, erase_after, reason, preview, storage_paths, auth_user_ids,
    approval_mode, first_session_fingerprint, confirmation_not_before,
    confirmation_expires_at, preview_hash
  ) values (
    p_idempotency_key, 'EMPLOYEE_OFFBOARDING', p_company_id, p_employee_id, p_requested_by,
    now(), greatest(now(), v_as_of::timestamptz + interval '30 days'),
    btrim(p_reason), v_preview, v_storage_paths, v_auth_user_ids,
    'SOLE_OWNER_DELAYED', v_fingerprint, now() + interval '24 hours',
    now() + interval '7 days', private.sf_privacy_json_hash(v_preview)
  ) returning id into v_request_id;

  return private.server_privacy_request_snapshot(v_request_id);
end;
$$;

create or replace function private.server_confirm_sole_owner_privacy_request(
  p_request_id uuid,
  p_confirmed_by uuid,
  p_session_id uuid,
  p_retention_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_lifecycle_requests%rowtype;
  v_profile private.privacy_retention_profiles%rowtype;
  v_current_preview jsonb;
  v_current_hash text;
  v_fingerprint text := private.sf_session_fingerprint(p_session_id);
  v_contact_days integer;
  v_employment_end date;
begin
  perform private.sf_assert_service_role();
  select * into v_request from private.privacy_lifecycle_requests r
  where r.id = p_request_id for update;

  if v_request.id is null then raise exception 'Privacy request not found'; end if;
  if v_request.status <> 'PENDING_APPROVAL' or v_request.approval_mode <> 'SOLE_OWNER_DELAYED' then
    raise exception 'Sole-owner request is not awaiting confirmation';
  end if;
  if v_request.request_kind <> 'EMPLOYEE_OFFBOARDING' then raise exception 'EMPLOYEE_OFFBOARDING_REQUIRED'; end if;
  if v_request.requested_by <> p_confirmed_by then raise exception 'ORIGINAL_SOLE_OWNER_REQUIRED'; end if;
  if now() < v_request.confirmation_not_before then raise exception 'SOLE_OWNER_COOLING_OFF_ACTIVE'; end if;
  if now() > v_request.confirmation_expires_at then raise exception 'SOLE_OWNER_CONFIRMATION_EXPIRED'; end if;
  if v_fingerprint = v_request.first_session_fingerprint then raise exception 'NEW_AUTH_SESSION_REQUIRED'; end if;

  perform private.sf_assert_sole_owner(v_request.company_id, p_confirmed_by);
  perform private.sf_assert_not_sole_owner_target(v_request.company_id, v_request.employee_id, p_confirmed_by);

  if v_request.legal_hold_until is not null and v_request.legal_hold_until >= now() then
    raise exception 'Erasure is subject to an inline legal hold';
  end if;
  if exists (
    select 1 from private.privacy_legal_holds h
    where h.company_id = v_request.company_id
      and (h.employee_id is null or h.employee_id = v_request.employee_id)
      and h.status = 'ACTIVE' and (h.hold_until is null or h.hold_until >= now())
  ) then raise exception 'Erasure is subject to an active legal hold'; end if;

  v_current_preview := private.sf_employee_offboarding_preview(
    v_request.company_id, v_request.employee_id, (v_request.preview->>'as_of')::date
  );
  v_current_hash := private.sf_privacy_json_hash(v_current_preview);
  if v_current_hash <> v_request.preview_hash then raise exception 'OFFBOARDING_PREVIEW_CHANGED'; end if;

  select * into v_profile from private.privacy_retention_profiles p
  where p.id = p_retention_profile_id and p.company_id = v_request.company_id and p.status = 'APPROVED';
  if v_profile.id is null then raise exception 'Approved retention profile required'; end if;
  begin
    v_contact_days := coalesce(nullif(v_profile.rules->>'contactDays','')::integer, 30);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Retention profile contactDays must be an integer';
  end;
  if v_contact_days < 0 or v_contact_days > 3650 then
    raise exception 'Retention profile contactDays must be between 0 and 3650';
  end if;
  begin
    v_employment_end := coalesce(nullif(v_request.preview->>'employment_end','')::date, current_date);
  exception when invalid_datetime_format then
    raise exception 'Offboarding preview contains an invalid employment end date';
  end;

  update private.privacy_lifecycle_requests r set
    status = 'APPROVED', approved_by = p_confirmed_by, approved_at = now(),
    confirmed_by = p_confirmed_by, confirmed_at = now(),
    confirmed_session_fingerprint = v_fingerprint,
    retention_profile_id = v_profile.id,
    erase_after = greatest(r.requested_at, v_employment_end::timestamptz + make_interval(days => v_contact_days)),
    updated_at = now()
  where r.id = p_request_id;

  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

create or replace function private.server_stage_sole_owner_retention_profile(
  p_company_id uuid,
  p_version integer,
  p_rules jsonb,
  p_created_by uuid,
  p_session_id uuid,
  p_approval_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  perform private.sf_assert_service_role();
  perform private.sf_assert_sole_owner(p_company_id, p_created_by);
  if p_version < 1 then raise exception 'Retention profile version must be positive'; end if;
  if jsonb_typeof(p_rules) <> 'object' then raise exception 'Retention profile rules must be an object'; end if;
  if length(btrim(coalesce(p_approval_reference,''))) < 10 then raise exception 'Approval reference is required'; end if;

  insert into private.privacy_retention_profiles(
    company_id, version, status, rules, created_by, approval_mode, approval_reference,
    rules_hash, first_session_fingerprint, confirmation_not_before, confirmation_expires_at
  ) values (
    p_company_id, p_version, 'DRAFT', p_rules, p_created_by, 'SOLE_OWNER_DELAYED',
    btrim(p_approval_reference), private.sf_privacy_json_hash(p_rules),
    private.sf_session_fingerprint(p_session_id), now() + interval '24 hours', now() + interval '7 days'
  ) returning id into v_profile_id;

  return jsonb_build_object(
    'id', v_profile_id, 'company_id', p_company_id, 'version', p_version,
    'status', 'DRAFT', 'approval_mode', 'SOLE_OWNER_DELAYED',
    'confirmation_not_before', now() + interval '24 hours',
    'confirmation_expires_at', now() + interval '7 days'
  );
end;
$$;

create or replace function private.server_confirm_sole_owner_retention_profile(
  p_profile_id uuid,
  p_confirmed_by uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile private.privacy_retention_profiles%rowtype;
  v_fingerprint text := private.sf_session_fingerprint(p_session_id);
begin
  perform private.sf_assert_service_role();
  select * into v_profile from private.privacy_retention_profiles p
  where p.id = p_profile_id for update;
  if v_profile.id is null then raise exception 'Retention profile not found'; end if;
  if v_profile.status <> 'DRAFT' or v_profile.approval_mode <> 'SOLE_OWNER_DELAYED' then
    raise exception 'Sole-owner retention profile is not awaiting confirmation';
  end if;
  if v_profile.created_by <> p_confirmed_by then raise exception 'ORIGINAL_SOLE_OWNER_REQUIRED'; end if;
  if now() < v_profile.confirmation_not_before then raise exception 'SOLE_OWNER_COOLING_OFF_ACTIVE'; end if;
  if now() > v_profile.confirmation_expires_at then raise exception 'SOLE_OWNER_CONFIRMATION_EXPIRED'; end if;
  if v_fingerprint = v_profile.first_session_fingerprint then raise exception 'NEW_AUTH_SESSION_REQUIRED'; end if;
  if private.sf_privacy_json_hash(v_profile.rules) <> v_profile.rules_hash then
    raise exception 'RETENTION_PROFILE_CHANGED';
  end if;
  perform private.sf_assert_sole_owner(v_profile.company_id, p_confirmed_by);

  update private.privacy_retention_profiles p set
    status = 'APPROVED', approved_by = p_confirmed_by, approved_at = now(),
    confirmed_session_fingerprint = v_fingerprint
  where p.id = p_profile_id;

  return jsonb_build_object(
    'id', v_profile.id, 'company_id', v_profile.company_id, 'version', v_profile.version,
    'status', 'APPROVED', 'approval_mode', 'SOLE_OWNER_DELAYED', 'approved_at', now()
  );
end;
$$;

revoke all on function private.server_stage_sole_owner_employee_offboarding(uuid,uuid,uuid,uuid,uuid,text,date)
  from public, anon, authenticated;
revoke all on function private.server_confirm_sole_owner_privacy_request(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function private.server_stage_sole_owner_retention_profile(uuid,integer,jsonb,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.server_stage_sole_owner_employee_offboarding(uuid,uuid,uuid,uuid,uuid,text,date)
  to service_role;
grant execute on function private.server_confirm_sole_owner_privacy_request(uuid,uuid,uuid,uuid)
  to service_role;
grant execute on function private.server_stage_sole_owner_retention_profile(uuid,integer,jsonb,uuid,uuid,text)
  to service_role;
grant execute on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  to service_role;

create or replace function public.server_stage_sole_owner_employee_offboarding(
  p_idempotency_key uuid, p_company_id uuid, p_employee_id uuid, p_requested_by uuid,
  p_session_id uuid, p_reason text, p_as_of date default current_date
)
returns jsonb language sql set search_path = ''
as $$ select private.server_stage_sole_owner_employee_offboarding(
  p_idempotency_key,p_company_id,p_employee_id,p_requested_by,p_session_id,p_reason,p_as_of
) $$;

create or replace function public.server_confirm_sole_owner_privacy_request(
  p_request_id uuid, p_confirmed_by uuid, p_session_id uuid, p_retention_profile_id uuid
)
returns jsonb language sql set search_path = ''
as $$ select private.server_confirm_sole_owner_privacy_request(
  p_request_id,p_confirmed_by,p_session_id,p_retention_profile_id
) $$;

create or replace function public.server_stage_sole_owner_retention_profile(
  p_company_id uuid, p_version integer, p_rules jsonb, p_created_by uuid,
  p_session_id uuid, p_approval_reference text
)
returns jsonb language sql set search_path = ''
as $$ select private.server_stage_sole_owner_retention_profile(
  p_company_id,p_version,p_rules,p_created_by,p_session_id,p_approval_reference
) $$;

create or replace function public.server_confirm_sole_owner_retention_profile(
  p_profile_id uuid, p_confirmed_by uuid, p_session_id uuid
)
returns jsonb language sql set search_path = ''
as $$ select private.server_confirm_sole_owner_retention_profile(p_profile_id,p_confirmed_by,p_session_id) $$;

revoke all on function public.server_stage_sole_owner_employee_offboarding(uuid,uuid,uuid,uuid,uuid,text,date)
  from public, anon, authenticated;
revoke all on function public.server_confirm_sole_owner_privacy_request(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.server_stage_sole_owner_retention_profile(uuid,integer,jsonb,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.server_stage_sole_owner_employee_offboarding(uuid,uuid,uuid,uuid,uuid,text,date)
  to service_role;
grant execute on function public.server_confirm_sole_owner_privacy_request(uuid,uuid,uuid,uuid)
  to service_role;
grant execute on function public.server_stage_sole_owner_retention_profile(uuid,integer,jsonb,uuid,uuid,text)
  to service_role;
grant execute on function public.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  to service_role;

comment on function private.server_stage_sole_owner_employee_offboarding(uuid,uuid,uuid,uuid,uuid,text,date) is
  'Stages a sole-owner employee offboarding request with a 24-hour delay and hashed session evidence.';
comment on function private.server_confirm_sole_owner_privacy_request(uuid,uuid,uuid,uuid) is
  'Confirms a sole-owner request from a different session during the 24-hour to 7-day window.';
comment on function private.server_stage_sole_owner_retention_profile(uuid,integer,jsonb,uuid,uuid,text) is
  'Stages a contract-referenced retention profile for delayed sole-owner approval.';
comment on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid) is
  'Confirms an unchanged sole-owner retention profile from a different session.';
