-- Production worker support for the two-phase privacy lifecycle.
-- External deletion remains opt-in per approved retention profile and fail-closed.

create or replace function private.sf_privacy_rule_days(
  p_rules jsonb,
  p_name text,
  p_default integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value integer;
begin
  if p_rules ? p_name then
    if jsonb_typeof(p_rules -> p_name) <> 'number'
      or (p_rules ->> p_name) !~ '^\d+$' then
      raise exception 'Retention profile % must be a non-negative integer', p_name;
    end if;
    v_value := (p_rules ->> p_name)::integer;
  else
    v_value := p_default;
  end if;
  if v_value < 0 or v_value > 3650 then
    raise exception 'Retention profile % must be between 0 and 3650', p_name;
  end if;
  return v_value;
end;
$$;

create or replace function private.sf_privacy_rule_enabled(p_rules jsonb, p_name text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p_rules ? p_name) then return false; end if;
  if jsonb_typeof(p_rules -> p_name) <> 'boolean' then
    raise exception 'Retention profile % must be boolean', p_name;
  end if;
  return (p_rules ->> p_name)::boolean;
end;
$$;

revoke all on function private.sf_privacy_rule_days(jsonb,text,integer)
  from public,anon,authenticated;
revoke all on function private.sf_privacy_rule_enabled(jsonb,text)
  from public,anon,authenticated;
grant execute on function private.sf_privacy_rule_days(jsonb,text,integer) to service_role;
grant execute on function private.sf_privacy_rule_enabled(jsonb,text) to service_role;

create or replace function private.sf_set_privacy_erase_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_employment_end date;
  v_days integer;
begin
  if new.status <> 'APPROVED' or new.retention_profile_id is null then return new; end if;

  select p.rules into v_rules
  from private.privacy_retention_profiles p
  where p.id=new.retention_profile_id and p.company_id=new.company_id and p.status='APPROVED';
  if v_rules is null then raise exception 'Approved retention profile required'; end if;

  begin
    v_employment_end := coalesce(nullif(new.preview->>'employment_end','')::date,current_date);
  exception when invalid_datetime_format then
    raise exception 'Offboarding preview contains an invalid employment end date';
  end;

  v_days := private.sf_privacy_rule_days(v_rules,'contactDays',30);
  if private.sf_privacy_rule_enabled(v_rules,'deleteAuthAccount') then
    v_days := greatest(v_days,private.sf_privacy_rule_days(v_rules,'authAccountDays',30));
  end if;
  if private.sf_privacy_rule_enabled(v_rules,'deletePersonnelDocuments') then
    v_days := greatest(v_days,private.sf_privacy_rule_days(v_rules,'personnelDocumentDays',1095));
  end if;

  new.erase_after := greatest(
    new.access_revoke_after,
    new.requested_at,
    v_employment_end::timestamptz + make_interval(days => v_days)
  );
  return new;
end;
$$;

drop trigger if exists privacy_lifecycle_set_erase_after on private.privacy_lifecycle_requests;
create trigger privacy_lifecycle_set_erase_after
before insert or update of status,retention_profile_id,erase_after
on private.privacy_lifecycle_requests
for each row execute function private.sf_set_privacy_erase_after();

create or replace function private.server_revoke_privacy_request_sessions(
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
  v_sessions integer := 0;
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

  select e.auth_user_id into v_auth_user_id from public.employees e
  where e.id=v_request.employee_id and e.company_id=v_request.company_id for update;
  if not found then raise exception 'Employee does not belong to company'; end if;
  if v_auth_user_id is not null and exists (
    select 1 from public.company_members m
    where m.user_id=v_auth_user_id and m.status='ACTIVE' and m.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Management membership requires separate offboarding approval'; end if;

  if v_auth_user_id is not null then
    delete from auth.sessions s where s.user_id=v_auth_user_id;
    get diagnostics v_sessions = row_count;
  end if;

  update private.privacy_lifecycle_requests r set
    outcome=coalesce(r.outcome,'{}'::jsonb)||jsonb_build_object(
      'access_external',jsonb_build_object(
        'completed_at',now(),'auth_sessions_revoked',true,
        'session_rows_deleted',v_sessions,'auth_user_id',v_auth_user_id
      )
    ),updated_at=now()
  where r.id=v_request.id;

  return jsonb_build_object('auth_user_id',v_auth_user_id,'session_rows_deleted',v_sessions);
end;
$$;

create or replace function private.server_privacy_erasure_external_plan(
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
  v_rules jsonb;
  v_storage_enabled boolean;
  v_auth_enabled boolean;
  v_current_paths text[];
  v_auth_user_id uuid;
  v_current_preview jsonb;
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
    select 1 from private.privacy_legal_holds h where h.company_id=v_request.company_id
      and (h.employee_id is null or h.employee_id=v_request.employee_id)
      and h.status='ACTIVE' and (h.hold_until is null or h.hold_until>=now())
  ) then raise exception 'Erasure is subject to an active legal hold'; end if;

  select p.rules into v_rules from private.privacy_retention_profiles p
  where p.id=v_request.retention_profile_id and p.company_id=v_request.company_id and p.status='APPROVED';
  if v_rules is null then raise exception 'Approved retention profile required'; end if;
  v_storage_enabled := private.sf_privacy_rule_enabled(v_rules,'deletePersonnelDocuments');
  v_auth_enabled := private.sf_privacy_rule_enabled(v_rules,'deleteAuthAccount');

  if v_storage_enabled then
    select coalesce(array_agg(d.storage_path order by d.storage_path),'{}'::text[])
      into v_current_paths from public.employee_personnel_documents d
      where d.company_id=v_request.company_id and d.employee_id=v_request.employee_id;
    if v_current_paths <> v_request.storage_paths then raise exception 'STORAGE_MANIFEST_CHANGED'; end if;
    if exists (
      select 1 from unnest(v_request.storage_paths) p(path)
      where p.path not like v_request.company_id::text||'/'||v_request.employee_id::text||'/%'
    ) then raise exception 'INVALID_STORAGE_PATH'; end if;
  end if;

  if cardinality(v_request.auth_user_ids)>1 then raise exception 'MULTIPLE_AUTH_USERS_BLOCKED'; end if;
  v_auth_user_id := v_request.auth_user_ids[1];
  if v_auth_enabled and v_auth_user_id is not null and exists(select 1 from auth.users u where u.id=v_auth_user_id) then
    v_current_preview := private.sf_employee_offboarding_preview(
      v_request.company_id,v_request.employee_id,(v_request.preview->>'as_of')::date
    );
    if coalesce((v_current_preview->'auth_account'->>'delete_eligible_after_session_revoke')::boolean,false) is not true then
      raise exception 'AUTH_ACCOUNT_DELETE_BLOCKED';
    end if;
    if exists (
      select 1 from public.company_members m
      where m.user_id=v_auth_user_id and m.status='ACTIVE' and m.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
    ) then raise exception 'AUTH_ACCOUNT_DELETE_BLOCKED'; end if;
  end if;

  return jsonb_build_object(
    'bucket','personnel-documents',
    'delete_storage',v_storage_enabled,
    'storage_paths',case when v_storage_enabled then to_jsonb(v_request.storage_paths) else '[]'::jsonb end,
    'delete_auth_account',v_auth_enabled and v_auth_user_id is not null,
    'auth_user_id',v_auth_user_id
  );
end;
$$;

create or replace function private.server_execute_privacy_access(
  p_request_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sf_assert_service_role();
  perform private.server_revoke_privacy_request_sessions(p_request_id,p_worker_id);
  return private.server_apply_employee_offboarding_access(p_request_id,p_worker_id);
end;
$$;

create or replace function private.server_mark_privacy_storage_deleted(
  p_request_id uuid,
  p_worker_id text,
  p_storage_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_lifecycle_requests%rowtype;
  v_rows integer := 0;
begin
  perform private.sf_assert_service_role();
  select * into v_request from private.privacy_lifecycle_requests r
  where r.id=p_request_id and r.status='EXECUTING'
    and r.execution_phase='ERASURE' and r.worker_id=p_worker_id
  for update;
  if v_request.id is null then raise exception 'Worker does not own erasure phase'; end if;
  if coalesce(p_storage_paths,'{}'::text[]) <> v_request.storage_paths then
    raise exception 'STORAGE_MANIFEST_CHANGED';
  end if;
  delete from public.employee_personnel_documents d
  where d.company_id=v_request.company_id and d.employee_id=v_request.employee_id
    and d.storage_path=any(coalesce(p_storage_paths,'{}'::text[]));
  get diagnostics v_rows = row_count;
  if v_rows <> cardinality(coalesce(p_storage_paths,'{}'::text[])) then
    raise exception 'STORAGE_METADATA_COUNT_CHANGED';
  end if;
  return v_rows;
end;
$$;

create or replace function private.server_fail_privacy_request(
  p_request_id uuid,
  p_worker_id text,
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
  if jsonb_typeof(coalesce(p_outcome,'{}'::jsonb)) <> 'object' then
    raise exception 'Outcome must be an object';
  end if;
  update private.privacy_lifecycle_requests r set
    status='BLOCKED',execution_phase=null,worker_id=null,
    outcome=coalesce(r.outcome,'{}'::jsonb)||coalesce(p_outcome,'{}'::jsonb),
    last_error=left(coalesce(p_error,'Unknown worker error'),1800),updated_at=now()
  where r.id=p_request_id and r.status='EXECUTING' and r.worker_id=p_worker_id;
  if not found then raise exception 'Worker does not own executing request'; end if;
  return private.server_privacy_request_snapshot(p_request_id);
end;
$$;

revoke all on function private.server_revoke_privacy_request_sessions(uuid,text) from public,anon,authenticated;
revoke all on function private.server_privacy_erasure_external_plan(uuid,text) from public,anon,authenticated;
revoke all on function private.server_execute_privacy_access(uuid,text) from public,anon,authenticated;
revoke all on function private.server_mark_privacy_storage_deleted(uuid,text,text[]) from public,anon,authenticated;
revoke all on function private.server_fail_privacy_request(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.server_revoke_privacy_request_sessions(uuid,text) to service_role;
grant execute on function private.server_privacy_erasure_external_plan(uuid,text) to service_role;
grant execute on function private.server_execute_privacy_access(uuid,text) to service_role;
grant execute on function private.server_mark_privacy_storage_deleted(uuid,text,text[]) to service_role;
grant execute on function private.server_fail_privacy_request(uuid,text,jsonb,text) to service_role;

create or replace function public.server_revoke_privacy_request_sessions(p_request_id uuid,p_worker_id text)
returns jsonb language sql set search_path=''
as $$ select private.server_revoke_privacy_request_sessions(p_request_id,p_worker_id) $$;
create or replace function public.server_privacy_erasure_external_plan(p_request_id uuid,p_worker_id text)
returns jsonb language sql set search_path=''
as $$ select private.server_privacy_erasure_external_plan(p_request_id,p_worker_id) $$;
create or replace function public.server_execute_privacy_access(p_request_id uuid,p_worker_id text)
returns jsonb language sql set search_path=''
as $$ select private.server_execute_privacy_access(p_request_id,p_worker_id) $$;
create or replace function public.server_mark_privacy_storage_deleted(p_request_id uuid,p_worker_id text,p_storage_paths text[])
returns integer language sql set search_path=''
as $$ select private.server_mark_privacy_storage_deleted(p_request_id,p_worker_id,p_storage_paths) $$;
create or replace function public.server_fail_privacy_request(p_request_id uuid,p_worker_id text,p_outcome jsonb default '{}'::jsonb,p_error text default null)
returns jsonb language sql set search_path=''
as $$ select private.server_fail_privacy_request(p_request_id,p_worker_id,p_outcome,p_error) $$;

revoke all on function public.server_revoke_privacy_request_sessions(uuid,text) from public,anon,authenticated;
revoke all on function public.server_privacy_erasure_external_plan(uuid,text) from public,anon,authenticated;
revoke all on function public.server_execute_privacy_access(uuid,text) from public,anon,authenticated;
revoke all on function public.server_mark_privacy_storage_deleted(uuid,text,text[]) from public,anon,authenticated;
revoke all on function public.server_fail_privacy_request(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.server_revoke_privacy_request_sessions(uuid,text) to service_role;
grant execute on function public.server_privacy_erasure_external_plan(uuid,text) to service_role;
grant execute on function public.server_execute_privacy_access(uuid,text) to service_role;
grant execute on function public.server_mark_privacy_storage_deleted(uuid,text,text[]) to service_role;
grant execute on function public.server_fail_privacy_request(uuid,text,jsonb,text) to service_role;

comment on function private.server_revoke_privacy_request_sessions(uuid,text) is
  'Revokes refresh sessions for a claimed ACCESS phase; access tokens remain bounded by JWT expiry and server authorization checks.';
comment on function private.server_privacy_erasure_external_plan(uuid,text) is
  'Builds a fail-closed Storage/Auth plan from an approved retention profile for a claimed ERASURE phase.';
