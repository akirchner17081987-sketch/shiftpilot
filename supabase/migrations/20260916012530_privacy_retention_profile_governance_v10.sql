-- Governance hardening and read-only status endpoint for privacy retention profiles.
-- This migration does not delete, redact, stage, approve, or otherwise modify business data.

alter table private.privacy_retention_profiles
  drop constraint if exists privacy_retention_profile_rules_v10_check;

alter table private.privacy_retention_profiles
  add constraint privacy_retention_profile_rules_v10_check check (
    jsonb_typeof(rules) = 'object'
    and (rules ? 'contactDays')
    and coalesce(rules->>'contactDays','') ~ '^\d{1,4}$'
    and (rules->>'contactDays')::integer between 0 and 3650
    and (rules ? 'planningYears')
    and coalesce(rules->>'planningYears','') ~ '^\d{1,2}$'
    and (rules->>'planningYears')::integer between 1 and 20
    and (rules ? 'absenceYears')
    and coalesce(rules->>'absenceYears','') ~ '^\d{1,2}$'
    and (rules->>'absenceYears')::integer between 1 and 20
    and (rules ? 'timeEvidenceYears')
    and coalesce(rules->>'timeEvidenceYears','') ~ '^\d{1,2}$'
    and (rules->>'timeEvidenceYears')::integer between 2 and 20
    and (rules ? 'personnelYears')
    and coalesce(rules->>'personnelYears','') ~ '^\d{1,2}$'
    and (rules->>'personnelYears')::integer between 1 and 20
    and (rules ? 'auditYears')
    and coalesce(rules->>'auditYears','') ~ '^\d{1,2}$'
    and (rules->>'auditYears')::integer between 1 and 20
    and (rules ? 'monthSnapshotYears')
    and coalesce(rules->>'monthSnapshotYears','') ~ '^\d{1,2}$'
    and (rules->>'monthSnapshotYears')::integer between 1 and 20
    and (rules ? 'datevAuditYears')
    and coalesce(rules->>'datevAuditYears','') ~ '^\d{1,2}$'
    and (rules->>'datevAuditYears')::integer between 1 and 20
    and (rules ? 'deletePersonnelDocuments')
    and jsonb_typeof(rules->'deletePersonnelDocuments') = 'boolean'
    and (rules ? 'deleteAuthAccount')
    and jsonb_typeof(rules->'deleteAuthAccount') = 'boolean'
  );

create or replace function private.server_privacy_retention_status(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profiles jsonb;
  v_queue jsonb;
  v_holds jsonb;
  v_next_version integer;
begin
  perform private.sf_assert_service_role();

  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'version',p.version,
    'status',p.status,
    'rules',p.rules,
    'approval_mode',p.approval_mode,
    'approval_reference',p.approval_reference,
    'created_at',p.created_at,
    'approved_at',p.approved_at,
    'confirmation_not_before',p.confirmation_not_before,
    'confirmation_expires_at',p.confirmation_expires_at
  ) order by p.version desc), '[]'::jsonb)
  into v_profiles
  from private.privacy_retention_profiles p
  where p.company_id = p_company_id;

  select coalesce(max(p.version),0)+1 into v_next_version
  from private.privacy_retention_profiles p
  where p.company_id = p_company_id;

  select coalesce(jsonb_object_agg(s.status,s.cnt), '{}'::jsonb)
  into v_queue
  from (
    select r.status, count(*)::integer as cnt
    from private.privacy_lifecycle_requests r
    where r.company_id = p_company_id
    group by r.status
  ) s;

  select jsonb_build_object(
    'active', count(*) filter (where h.status='ACTIVE' and (h.hold_until is null or h.hold_until >= now())),
    'total', count(*)
  ) into v_holds
  from private.privacy_legal_holds h
  where h.company_id = p_company_id;

  return jsonb_build_object(
    'company_id',p_company_id,
    'profiles',v_profiles,
    'next_version',v_next_version,
    'queue',v_queue,
    'legal_holds',v_holds
  );
end;
$$;

revoke all on function private.server_privacy_retention_status(uuid) from public,anon,authenticated;
grant execute on function private.server_privacy_retention_status(uuid) to service_role;

create or replace function public.server_privacy_retention_status(p_company_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.server_privacy_retention_status(p_company_id) $$;

revoke all on function public.server_privacy_retention_status(uuid) from public,anon,authenticated;
grant execute on function public.server_privacy_retention_status(uuid) to service_role;

comment on function private.server_privacy_retention_status(uuid) is
  'Read-only service-role status for customer retention profiles, lifecycle queue and legal holds.';
