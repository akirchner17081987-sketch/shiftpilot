-- Accept both the legacy single-role request setting and the current JWT claims JSON.
-- All privacy worker RPCs still fail closed unless the verified role is service_role.

create or replace function private.sf_assert_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := nullif(current_setting('request.jwt.claim.role',true),'');
  v_claims jsonb;
begin
  if v_role is null then
    begin
      v_claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
      v_role := v_claims->>'role';
    exception when others then
      v_role := null;
    end;
  end if;
  if coalesce(v_role,'') <> 'service_role' then
    raise exception 'Service role required';
  end if;
end;
$$;

revoke all on function private.sf_assert_service_role() from public,anon,authenticated;
grant execute on function private.sf_assert_service_role() to service_role;

create or replace function private.server_privacy_request_snapshot(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.sf_assert_service_role();
  select jsonb_build_object(
    'id',r.id,'request_kind',r.request_kind,'company_id',r.company_id,
    'employee_id',r.employee_id,'status',r.status,'execution_phase',r.execution_phase,
    'approval_mode',r.approval_mode,'requested_by',r.requested_by,'requested_at',r.requested_at,
    'approved_by',r.approved_by,'approved_at',r.approved_at,
    'confirmation_not_before',r.confirmation_not_before,
    'confirmation_expires_at',r.confirmation_expires_at,
    'confirmed_by',r.confirmed_by,'confirmed_at',r.confirmed_at,
    'access_revoke_after',r.access_revoke_after,'erase_after',r.erase_after,
    'legal_hold_until',r.legal_hold_until,'retention_profile_id',r.retention_profile_id,
    'preview_hash',r.preview_hash,'preview',r.preview,'attempt_count',r.attempt_count,
    'started_at',r.started_at,'completed_at',r.completed_at,'outcome',r.outcome
  ) into v_result
  from private.privacy_lifecycle_requests r where r.id=p_request_id;
  return v_result;
end;
$$;

create or replace function private.server_due_privacy_requests(p_limit integer default 25)
returns setof private.privacy_lifecycle_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sf_assert_service_role();
  return query
    select r.* from private.privacy_lifecycle_requests r
    where r.status='APPROVED' and r.erase_after<=now()
      and (r.legal_hold_until is null or r.legal_hold_until<now())
    order by r.erase_after,r.requested_at
    limit least(greatest(coalesce(p_limit,25),1),100);
end;
$$;

revoke all on function private.server_privacy_request_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.server_due_privacy_requests(integer) from public,anon,authenticated;
grant execute on function private.server_privacy_request_snapshot(uuid) to service_role;
grant execute on function private.server_due_privacy_requests(integer) to service_role;

comment on function private.sf_assert_service_role() is
  'Fails closed unless PostgREST supplies service_role via the legacy role setting or the verified JWT claims JSON.';
