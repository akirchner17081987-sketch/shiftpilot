-- Allows a newer sole-owner retention profile to supersede an approved profile
-- without removing the active profile during the 24-hour cooling-off period.

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
  v_current private.privacy_retention_profiles%rowtype;
  v_fingerprint text := private.sf_session_fingerprint(p_session_id);
  v_approved_at timestamptz := now();
begin
  perform private.sf_assert_service_role();

  select * into v_profile
  from private.privacy_retention_profiles p
  where p.id = p_profile_id
  for update;

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

  select * into v_current
  from private.privacy_retention_profiles p
  where p.company_id = v_profile.company_id
    and p.status = 'APPROVED'
    and p.id <> v_profile.id
  for update;

  if v_current.id is not null and v_profile.version <= v_current.version then
    raise exception 'RETENTION_PROFILE_VERSION_NOT_NEWER';
  end if;

  -- Both updates are one transaction: on any failure the previous profile stays active.
  if v_current.id is not null then
    update private.privacy_retention_profiles p set
      status = 'REVOKED', revoked_at = v_approved_at
    where p.id = v_current.id;
  end if;

  update private.privacy_retention_profiles p set
    status = 'APPROVED', approved_by = p_confirmed_by, approved_at = v_approved_at,
    confirmed_session_fingerprint = v_fingerprint
  where p.id = p_profile_id;

  return jsonb_build_object(
    'id', v_profile.id,
    'company_id', v_profile.company_id,
    'version', v_profile.version,
    'status', 'APPROVED',
    'approval_mode', 'SOLE_OWNER_DELAYED',
    'approved_at', v_approved_at,
    'superseded_profile_id', v_current.id
  );
end;
$$;

revoke all on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid)
  to service_role;

comment on function private.server_confirm_sole_owner_retention_profile(uuid,uuid,uuid) is
  'Confirms a delayed sole-owner retention profile and atomically revokes an older approved version only after all AAL2/session checks pass.';
