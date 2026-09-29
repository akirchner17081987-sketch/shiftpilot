-- Separate immediate access revocation from later retention-bound erasure.
-- Nothing is scheduled by this migration; every entry point remains service-role only.

alter table private.privacy_lifecycle_requests
  drop constraint if exists privacy_lifecycle_status_check;
alter table private.privacy_lifecycle_requests
  add constraint privacy_lifecycle_status_check
  check (status in (
    'PENDING_APPROVAL','APPROVED','EXECUTING','ACCESS_REVOKED','BLOCKED','COMPLETED','CANCELLED'
  ));

alter table private.privacy_lifecycle_requests
  add column if not exists execution_phase text;
alter table private.privacy_lifecycle_requests
  drop constraint if exists privacy_lifecycle_execution_phase_check;
alter table private.privacy_lifecycle_requests
  add constraint privacy_lifecycle_execution_phase_check check (
    (status = 'EXECUTING' and execution_phase in ('ACCESS','ERASURE'))
    or (status <> 'EXECUTING' and execution_phase is null)
  );

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
    'requested_by', r.requested_by,
    'requested_at', r.requested_at,
    'approved_by', r.approved_by,
    'approved_at', r.approved_at,
    'access_revoke_after', r.access_revoke_after,
    'erase_after', r.erase_after,
    'legal_hold_until', r.legal_hold_until,
    'retention_profile_id', r.retention_profile_id,
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
  v_contact_days integer;
  v_employment_end date;
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
  where p.id = p_retention_profile_id
    and p.company_id = v_request.company_id
    and p.status = 'APPROVED';
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
    status = 'APPROVED',
    execution_phase = null,
    approved_by = p_approved_by,
    approved_at = now(),
    retention_profile_id = v_profile.id,
    legal_hold_until = p_legal_hold_until,
    erase_after = greatest(r.requested_at, v_employment_end::timestamptz + make_interval(days => v_contact_days)),
    updated_at = now()
  where r.id = p_request_id;

  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

create or replace function private.server_claim_due_privacy_request(p_worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_phase text;
begin
  perform private.sf_assert_service_role();
  if length(btrim(coalesce(p_worker_id, ''))) < 8 then raise exception 'Worker id is required'; end if;

  select r.id,
    case when r.status = 'APPROVED' then 'ACCESS' else 'ERASURE' end
    into v_request_id, v_phase
  from private.privacy_lifecycle_requests r
  where (
      r.status = 'APPROVED'
      and r.access_revoke_after <= now()
    ) or (
      r.status = 'ACCESS_REVOKED'
      and r.erase_after <= now()
      and (r.legal_hold_until is null or r.legal_hold_until < now())
      and not exists (
        select 1 from private.privacy_legal_holds h
        where h.company_id = r.company_id
          and (h.employee_id is null or h.employee_id = r.employee_id)
          and h.status = 'ACTIVE'
          and (h.hold_until is null or h.hold_until >= now())
      )
    )
  order by case when r.status='APPROVED' then 0 else 1 end,
    case when r.status='APPROVED' then r.access_revoke_after else r.erase_after end,
    r.requested_at
  limit 1
  for update skip locked;

  if v_request_id is null then return null; end if;

  update private.privacy_lifecycle_requests r set
    status = 'EXECUTING',
    execution_phase = v_phase,
    worker_id = left(btrim(p_worker_id), 200),
    started_at = now(),
    attempt_count = r.attempt_count + 1,
    last_error = null,
    updated_at = now()
  where r.id = v_request_id;

  return private.server_privacy_request_snapshot(v_request_id);
end;
$$;

create or replace function private.server_apply_employee_offboarding_access(
  p_request_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_lifecycle_requests%rowtype;
  v_auth_user_id uuid;
  v_employee_rows integer := 0;
  v_invite_rows integer := 0;
  v_push_rows integer := 0;
  v_qr_link_rows integer := 0;
  v_qr_terminal_rows integer := 0;
  v_membership_rows integer := 0;
  v_step jsonb;
begin
  perform private.sf_assert_service_role();

  select * into v_request from private.privacy_lifecycle_requests r
  where r.id=p_request_id and r.status='EXECUTING'
    and r.execution_phase='ACCESS' and r.worker_id=p_worker_id
  for update;
  if v_request.id is null then raise exception 'Worker does not own access phase'; end if;
  if v_request.request_kind <> 'EMPLOYEE_OFFBOARDING' or v_request.employee_id is null then
    raise exception 'Employee offboarding request required';
  end if;

  select e.auth_user_id into v_auth_user_id
  from public.employees e
  where e.id=v_request.employee_id and e.company_id=v_request.company_id
  for update;
  if not found then raise exception 'Employee does not belong to company'; end if;

  if v_auth_user_id is not null and exists (
    select 1 from public.company_members m
    where m.company_id=v_request.company_id and m.user_id=v_auth_user_id
      and m.status='ACTIVE' and m.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Management membership requires separate offboarding approval'; end if;

  update public.employees e set
    status='inactive', access_status='DISABLED', updated_at=now()
  where e.id=v_request.employee_id and e.company_id=v_request.company_id;
  get diagnostics v_employee_rows = row_count;

  delete from public.employee_access_invites i
  where i.company_id=v_request.company_id and i.employee_id=v_request.employee_id;
  get diagnostics v_invite_rows = row_count;

  if v_auth_user_id is not null then
    delete from public.push_subscriptions p
    where p.company_id=v_request.company_id and p.user_id=v_auth_user_id;
    get diagnostics v_push_rows = row_count;

    update public.company_members m set status='DISABLED'
    where m.company_id=v_request.company_id and m.user_id=v_auth_user_id
      and m.role='VIEWER' and m.status<>'DISABLED';
    get diagnostics v_membership_rows = row_count;
  end if;

  delete from public.time_qr_pilot_employees q
  where q.company_id=v_request.company_id and q.employee_id=v_request.employee_id;
  get diagnostics v_qr_link_rows = row_count;

  update public.time_qr_terminals t set
    pilot_employee_id=null, updated_at=now()
  where t.company_id=v_request.company_id and t.pilot_employee_id=v_request.employee_id;
  get diagnostics v_qr_terminal_rows = row_count;

  v_step := jsonb_build_object(
    'completed_at',now(),
    'employee_rows',v_employee_rows,
    'invites_deleted',v_invite_rows,
    'push_subscriptions_deleted',v_push_rows,
    'qr_pilot_links_deleted',v_qr_link_rows,
    'qr_terminals_unlinked',v_qr_terminal_rows,
    'viewer_memberships_disabled',v_membership_rows,
    'auth_user_id',v_auth_user_id,
    'auth_sessions_revoked',false
  );

  update private.privacy_lifecycle_requests r set
    status='ACCESS_REVOKED', execution_phase=null, worker_id=null,
    outcome=coalesce(r.outcome,'{}'::jsonb)||jsonb_build_object('access',v_step),
    updated_at=now()
  where r.id=v_request.id;

  return private.server_privacy_request_snapshot(v_request.id);
end;
$$;

create or replace function private.server_apply_employee_offboarding_erasure(
  p_request_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_lifecycle_requests%rowtype;
  v_employee_rows integer := 0;
  v_detail_rows integer := 0;
  v_step jsonb;
begin
  perform private.sf_assert_service_role();

  select * into v_request from private.privacy_lifecycle_requests r
  where r.id=p_request_id and r.status='EXECUTING'
    and r.execution_phase='ERASURE' and r.worker_id=p_worker_id
  for update;
  if v_request.id is null then raise exception 'Worker does not own erasure phase'; end if;
  if v_request.request_kind <> 'EMPLOYEE_OFFBOARDING' or v_request.employee_id is null then
    raise exception 'Employee offboarding request required';
  end if;
  if v_request.erase_after > now() then raise exception 'Erasure is not due'; end if;
  if v_request.legal_hold_until is not null and v_request.legal_hold_until >= now() then
    raise exception 'Erasure is subject to an inline legal hold';
  end if;
  if exists (
    select 1 from private.privacy_legal_holds h
    where h.company_id=v_request.company_id
      and (h.employee_id is null or h.employee_id=v_request.employee_id)
      and h.status='ACTIVE' and (h.hold_until is null or h.hold_until>=now())
  ) then raise exception 'Erasure is subject to an active legal hold'; end if;

  update public.employees e set
    email=null, phone=null, address=null, zip=null, city=null, note='', updated_at=now()
  where e.id=v_request.employee_id and e.company_id=v_request.company_id;
  get diagnostics v_employee_rows = row_count;
  if v_employee_rows <> 1 then raise exception 'Employee does not belong to company'; end if;

  update public.employee_personnel_details d set
    emergency_contact_name='', emergency_contact_phone='', private_note='', updated_at=now()
  where d.employee_id=v_request.employee_id and d.company_id=v_request.company_id;
  get diagnostics v_detail_rows = row_count;

  v_step := jsonb_build_object(
    'completed_at',now(),
    'employee_contact_rows_redacted',v_employee_rows,
    'personnel_detail_rows_redacted',v_detail_rows,
    'retained_domains',jsonb_build_array(
      'employee_identity_until_customer_retention_due',
      'planning_history','time_and_payroll_evidence','personnel_documents',
      'audit_events','month_snapshots'
    ),
    'storage_objects_deleted',false,
    'auth_account_deleted',false
  );

  update private.privacy_lifecycle_requests r set
    outcome=coalesce(r.outcome,'{}'::jsonb)||jsonb_build_object('erasure',v_step),
    updated_at=now()
  where r.id=v_request.id;

  return private.server_privacy_request_snapshot(v_request.id);
end;
$$;

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
    status=case when p_succeeded then 'COMPLETED' else 'BLOCKED' end,
    execution_phase=null,
    outcome=coalesce(r.outcome,'{}'::jsonb)||coalesce(p_outcome,'{}'::jsonb),
    last_error=case when p_succeeded then null else left(coalesce(p_error,'Unknown worker error'),1800) end,
    completed_at=case when p_succeeded then now() else null end,
    worker_id=null,
    updated_at=now()
  where r.id=p_request_id and r.status='EXECUTING'
    and r.execution_phase='ERASURE' and r.worker_id=p_worker_id;

  if not found then raise exception 'Worker does not own executing erasure request'; end if;
  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

revoke all on function private.server_apply_employee_offboarding_access(uuid,text)
  from public,anon,authenticated;
revoke all on function private.server_apply_employee_offboarding_erasure(uuid,text)
  from public,anon,authenticated;
grant execute on function private.server_apply_employee_offboarding_access(uuid,text) to service_role;
grant execute on function private.server_apply_employee_offboarding_erasure(uuid,text) to service_role;

create or replace function public.server_apply_employee_offboarding_access(p_request_id uuid,p_worker_id text)
returns jsonb language sql set search_path=''
as $$ select private.server_apply_employee_offboarding_access(p_request_id,p_worker_id) $$;
create or replace function public.server_apply_employee_offboarding_erasure(p_request_id uuid,p_worker_id text)
returns jsonb language sql set search_path=''
as $$ select private.server_apply_employee_offboarding_erasure(p_request_id,p_worker_id) $$;
revoke all on function public.server_apply_employee_offboarding_access(uuid,text) from public,anon,authenticated;
revoke all on function public.server_apply_employee_offboarding_erasure(uuid,text) from public,anon,authenticated;
grant execute on function public.server_apply_employee_offboarding_access(uuid,text) to service_role;
grant execute on function public.server_apply_employee_offboarding_erasure(uuid,text) to service_role;

comment on function private.server_claim_due_privacy_request(text) is
  'Claims immediate ACCESS work before separately due, legal-hold-aware ERASURE work.';
comment on function private.server_apply_employee_offboarding_access(uuid,text) is
  'Idempotently disables database access paths; external Auth session revocation remains required.';
comment on function private.server_apply_employee_offboarding_erasure(uuid,text) is
  'Redacts due contact/emergency data while preserving separately retained evidence domains.';
