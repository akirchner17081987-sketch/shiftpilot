-- Past offboarding dates must become due immediately, never be scheduled before request time.
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
    now(), greatest(now(), v_as_of::timestamptz + interval '30 days'),
    btrim(p_reason), v_preview, v_storage_paths, v_auth_user_ids
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

comment on function private.server_stage_employee_offboarding(uuid, uuid, uuid, uuid, text, date) is
  'Stages an idempotent request and clamps overdue erasure dates to the request time.';
