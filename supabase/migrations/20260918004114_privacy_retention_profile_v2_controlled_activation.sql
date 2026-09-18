-- One-time, operator-authorized correction of the SchichtFunk retention profile.
--
-- This migration does not alter the normal SOLE_OWNER_DELAYED path. Future
-- retention changes still require two AAL2 confirmations in different sessions
-- with a 24-hour cooling-off period. The explicit CONTROLLED_MIGRATION mode is
-- retained on V2 so the exceptional activation is never misrepresented as an
-- ordinary AAL2 confirmation.

alter table private.privacy_retention_profiles
  drop constraint if exists privacy_retention_profile_approval_check;
alter table private.privacy_retention_profiles
  drop constraint if exists privacy_retention_profile_approval_mode_check;

alter table private.privacy_retention_profiles
  add constraint privacy_retention_profile_approval_mode_check
  check (approval_mode in ('TWO_PERSON','SOLE_OWNER_DELAYED','CONTROLLED_MIGRATION'));

alter table private.privacy_retention_profiles
  add constraint privacy_retention_profile_approval_check check (
    (
      status = 'DRAFT'
      and approved_by is null and approved_at is null
      and (
        approval_mode = 'TWO_PERSON'
        or (
          approval_mode = 'SOLE_OWNER_DELAYED'
          and coalesce(length(btrim(approval_reference)),0) >= 10
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
        or (
          approval_mode = 'CONTROLLED_MIGRATION'
          and version = 2
          and approved_by = created_by
          and approval_reference = 'SF-RETENTION-V2-2026-09-18: einmalige kontrollierte Sofortkorrektur nach ausdruecklicher Betreiberfreigabe'
          and rules_hash is not null and length(rules_hash) = 64
          and first_session_fingerprint is null
          and confirmed_session_fingerprint is null
          and confirmation_not_before is null
          and confirmation_expires_at is null
          and approved_at = created_at
          and (rules->>'timeEvidenceYears')::integer = 6
          and (rules->>'monthSnapshotYears')::integer = 6
          and (rules->>'datevAuditYears')::integer = 6
          and (rules->>'deletePersonnelDocuments')::boolean = false
          and (rules->>'deleteAuthAccount')::boolean = false
        )
      )
    )
    or (status = 'REVOKED' and revoked_at is not null)
  );

do $$
declare
  v_company_id constant uuid := '3dbc2d99-78d7-4b82-bcaf-fe11db8213d3';
  v_reference constant text := 'SF-RETENTION-V2-2026-09-18: einmalige kontrollierte Sofortkorrektur nach ausdruecklicher Betreiberfreigabe';
  -- Retain the source-generation identifier recorded in the immutable audit row.
  v_migration constant text := '20260918003842_privacy_retention_profile_v2_controlled_activation';
  v_old private.privacy_retention_profiles%rowtype;
  v_new private.privacy_retention_profiles%rowtype;
  v_rules jsonb;
  v_owner_id uuid;
  v_now timestamptz := clock_timestamp();
  v_owner_count integer;
  v_admin_count integer;
begin
  -- Lock all profiles of the target tenant so revocation and activation remain atomic.
  perform 1
  from private.privacy_retention_profiles p
  where p.company_id = v_company_id
  for update;

  select * into v_new
  from private.privacy_retention_profiles p
  where p.company_id = v_company_id and p.version = 2;

  if v_new.id is not null then
    if v_new.status <> 'APPROVED'
       or v_new.approval_mode <> 'CONTROLLED_MIGRATION'
       or v_new.rules->>'timeEvidenceYears' <> '6'
       or v_new.rules->>'monthSnapshotYears' <> '6'
       or v_new.rules->>'datevAuditYears' <> '6'
       or private.sf_privacy_json_hash(v_new.rules) <> v_new.rules_hash then
      raise exception 'Existing retention profile V2 does not match the controlled activation';
    end if;
    return;
  end if;

  select * into v_old
  from private.privacy_retention_profiles p
  where p.company_id = v_company_id and p.status = 'APPROVED'
  for update;

  if v_old.id is null or v_old.version <> 1 then
    raise exception 'Expected approved retention profile V1';
  end if;
  if v_old.rules->>'timeEvidenceYears' <> '3'
     or v_old.rules->>'monthSnapshotYears' <> '6'
     or v_old.rules->>'datevAuditYears' <> '6'
     or private.sf_privacy_json_hash(v_old.rules) <> v_old.rules_hash then
    raise exception 'Approved retention profile V1 differs from the reviewed baseline';
  end if;

  select
    count(*) filter (where m.role = 'OWNER'),
    count(*) filter (where m.role = 'ADMIN'),
    max(m.user_id::text) filter (where m.role = 'OWNER')::uuid
  into v_owner_count, v_admin_count, v_owner_id
  from public.company_members m
  where m.company_id = v_company_id and m.status = 'ACTIVE';

  if v_owner_count <> 1 or v_admin_count <> 0 or v_owner_id <> v_old.approved_by then
    raise exception 'Reviewed sole-owner baseline no longer applies';
  end if;

  v_rules := v_old.rules || jsonb_build_object(
    'timeEvidenceYears', 6,
    'monthSnapshotYears', 6,
    'datevAuditYears', 6,
    'deletePersonnelDocuments', false,
    'deleteAuthAccount', false
  );

  update private.privacy_retention_profiles p
  set status = 'REVOKED', revoked_at = v_now
  where p.id = v_old.id;

  insert into private.privacy_retention_profiles(
    company_id, version, status, rules, created_by, created_at,
    approved_by, approved_at, approval_mode, approval_reference, rules_hash
  ) values (
    v_company_id, 2, 'APPROVED', v_rules, v_owner_id, v_now,
    v_owner_id, v_now, 'CONTROLLED_MIGRATION', v_reference,
    private.sf_privacy_json_hash(v_rules)
  ) returning * into v_new;

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role,
    old_values, new_values, metadata
  ) values (
    v_company_id,
    'RETENTION_PROFILE_CONTROLLED_ACTIVATION',
    'privacy_retention_profile',
    v_new.id,
    v_owner_id,
    'OWNER',
    jsonb_build_object(
      'profileId', v_old.id,
      'version', v_old.version,
      'status', 'APPROVED',
      'rules', v_old.rules,
      'rulesHash', v_old.rules_hash
    ),
    jsonb_build_object(
      'profileId', v_new.id,
      'version', v_new.version,
      'status', 'APPROVED',
      'rules', v_new.rules,
      'rulesHash', v_new.rules_hash
    ),
    jsonb_build_object(
      'migration', v_migration,
      'authorization', 'Express operator approval in SchichtFunk project conversation on 2026-09-18',
      'reason', 'Correct active V1 time-evidence retention from 3 to 6 years without early deletion',
      'exception', 'One-time immediate activation; normal SOLE_OWNER_DELAYED AAL2 and 24-hour controls remain unchanged',
      'supersededProfileId', v_old.id,
      'noDeletionExecuted', true
    )
  );
end;
$$;

comment on column private.privacy_retention_profiles.approval_mode is
  'TWO_PERSON or SOLE_OWNER_DELAYED for normal operation. CONTROLLED_MIGRATION records the narrowly constrained, audited SchichtFunk V2 correction of 2026-09-18 and is not exposed by an application RPC.';
