-- Safely replaces an obsolete sole-owner retention-profile draft.
-- The old immutable approval evidence is retained as REVOKED and the new
-- profile starts a fresh 24-hour AAL2 cooling-off period.

create or replace function private.server_replace_sole_owner_retention_profile_draft(
  p_profile_id uuid,
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
  v_profile private.privacy_retention_profiles%rowtype;
begin
  perform private.sf_assert_service_role();
  perform private.sf_assert_sole_owner(p_company_id, p_created_by);

  select * into v_profile
  from private.privacy_retention_profiles p
  where p.id = p_profile_id and p.company_id = p_company_id
  for update;

  if v_profile.id is null then raise exception 'Retention profile draft not found'; end if;
  if v_profile.status <> 'DRAFT' or v_profile.approval_mode <> 'SOLE_OWNER_DELAYED' then
    raise exception 'Sole-owner retention profile is not awaiting confirmation';
  end if;
  if v_profile.created_by <> p_created_by then raise exception 'ORIGINAL_SOLE_OWNER_REQUIRED'; end if;
  if p_version <= v_profile.version then raise exception 'Replacement version must be newer'; end if;

  update private.privacy_retention_profiles p set
    status = 'REVOKED', revoked_at = now()
  where p.id = v_profile.id;

  return private.server_stage_sole_owner_retention_profile(
    p_company_id,
    p_version,
    p_rules,
    p_created_by,
    p_session_id,
    p_approval_reference
  );
end;
$$;

revoke all on function private.server_replace_sole_owner_retention_profile_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function private.server_replace_sole_owner_retention_profile_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)
  to service_role;

create or replace function public.server_replace_sole_owner_retention_profile_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_version integer,
  p_rules jsonb,
  p_created_by uuid,
  p_session_id uuid,
  p_approval_reference text
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.server_replace_sole_owner_retention_profile_draft(
    p_profile_id,p_company_id,p_version,p_rules,p_created_by,p_session_id,p_approval_reference
  )
$$;

revoke all on function public.server_replace_sole_owner_retention_profile_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.server_replace_sole_owner_retention_profile_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)
  to service_role;

comment on function private.server_replace_sole_owner_retention_profile_draft(uuid,uuid,integer,jsonb,uuid,uuid,text) is
  'Atomically revokes an obsolete sole-owner draft and stages a newer immutable draft with a fresh cooling-off period.';
