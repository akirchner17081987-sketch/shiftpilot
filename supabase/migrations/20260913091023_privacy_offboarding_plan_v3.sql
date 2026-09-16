-- Expanded, read-only employee offboarding inventory.
-- This migration still performs no UPDATE/DELETE and installs no schedule.

create or replace function private.sf_employee_offboarding_preview(
  p_company_id uuid,
  p_employee_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee public.employees%rowtype;
  v_as_of date := coalesce(p_as_of, current_date);
  v_end_date date;
  v_default_anonymize_after date;
  v_time_retention_after date;
  v_storage_paths text[];
  v_assignment_ids uuid[];
  v_change_request_ids uuid[];
  v_incident_ids uuid[];
  v_counts jsonb;
  v_auth_reference_counts jsonb := '{}'::jsonb;
  v_current_memberships bigint := 0;
  v_other_memberships bigint := 0;
  v_other_employee_links bigint := 0;
  v_owned_companies bigint := 0;
  v_restricting_auth_references bigint := 0;
  v_cascading_auth_references bigint := 0;
  v_set_null_auth_references bigint := 0;
begin
  perform private.sf_assert_service_role();

  select e.* into v_employee
  from public.employees e
  where e.id = p_employee_id and e.company_id = p_company_id;

  if v_employee.id is null then
    raise exception 'Employee does not belong to company';
  end if;

  v_end_date := coalesce(v_employee.contract_end, v_as_of);
  v_default_anonymize_after := make_date(extract(year from v_end_date)::integer + 4, 1, 1);
  v_time_retention_after := make_date(extract(year from v_end_date)::integer + 7, 1, 1);

  select coalesce(array_agg(d.storage_path order by d.storage_path), '{}'::text[])
    into v_storage_paths
  from public.employee_personnel_documents d
  where d.company_id = p_company_id and d.employee_id = p_employee_id;

  select coalesce(array_agg(a.id order by a.id), '{}'::uuid[])
    into v_assignment_ids
  from public.shift_assignments a
  where a.company_id = p_company_id and a.employee_id = p_employee_id;

  select coalesce(array_agg(r.id order by r.id), '{}'::uuid[])
    into v_change_request_ids
  from public.shift_change_requests r
  where r.company_id = p_company_id
    and (r.employee_id = p_employee_id or r.assignment_id = any(v_assignment_ids));

  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_incident_ids
  from public.disruption_incidents i
  where i.company_id = p_company_id
    and (i.original_employee_id = p_employee_id or i.assignment_id = any(v_assignment_ids));

  if v_employee.auth_user_id is not null then
    select count(*) into v_current_memberships
    from public.company_members m
    where m.user_id = v_employee.auth_user_id and m.company_id = p_company_id;

    select count(*) into v_other_memberships
    from public.company_members m
    where m.user_id = v_employee.auth_user_id and m.company_id <> p_company_id;

    select count(*) into v_other_employee_links
    from public.employees e
    where e.auth_user_id = v_employee.auth_user_id and e.id <> p_employee_id;

    select count(*) into v_owned_companies
    from public.companies c
    where c.created_by = v_employee.auth_user_id;

    v_auth_reference_counts := jsonb_build_object(
      'memberships', jsonb_build_object(
        'current_company', v_current_memberships,
        'other_companies', v_other_memberships
      ),
      'employee_links', jsonb_build_object(
        'current_employee', 1,
        'other_employees', v_other_employee_links
      ),
      'ownership', jsonb_build_object(
        'companies_created', v_owned_companies
      ),
      'restricting', jsonb_build_object(
        'company_member_invites', (select count(*) from public.company_member_invites x
          where x.created_by=v_employee.auth_user_id or x.claimed_by=v_employee.auth_user_id),
        'disruption_incidents', (select count(*) from public.disruption_incidents x
          where x.created_by=v_employee.auth_user_id or x.resolved_by=v_employee.auth_user_id),
        'disruption_offers', (select count(*) from public.disruption_offers x
          where x.offered_by=v_employee.auth_user_id)
      ),
      'cascading', jsonb_build_object(
        'employee_access_invites', (select count(*) from public.employee_access_invites x
          where x.created_by=v_employee.auth_user_id),
        'legacy_imports', (select count(*) from public.legacy_imports x
          where x.user_id=v_employee.auth_user_id),
        'notifications', (select count(*) from public.notifications x
          where x.user_id=v_employee.auth_user_id)
      ),
      'set_null', jsonb_build_object(
        'audit_events', (select count(*) from public.audit_events x
          where x.actor_id=v_employee.auth_user_id),
        'employee_access_invites', (select count(*) from public.employee_access_invites x
          where x.claimed_by=v_employee.auth_user_id),
        'datev_lodas_rules', (select count(*) from public.datev_lodas_rules x
          where x.created_by=v_employee.auth_user_id or x.updated_by=v_employee.auth_user_id),
        'datev_lodas_settings', (select count(*) from public.datev_lodas_settings x
          where x.updated_by=v_employee.auth_user_id),
        'personnel_details', (select count(*) from public.employee_personnel_details x
          where x.updated_by=v_employee.auth_user_id),
        'personnel_documents', (select count(*) from public.employee_personnel_documents x
          where x.uploaded_by=v_employee.auth_user_id),
        'personnel_notes', (select count(*) from public.employee_personnel_notes x
          where x.created_by=v_employee.auth_user_id),
        'personnel_qualifications', (select count(*) from public.employee_personnel_qualifications x
          where x.created_by=v_employee.auth_user_id or x.updated_by=v_employee.auth_user_id),
        'employee_time_account_openings', (select count(*) from public.employee_time_account_openings x
          where x.updated_by=v_employee.auth_user_id),
        'plan_publications', (select count(*) from public.plan_publications x
          where x.published_by=v_employee.auth_user_id),
        'shift_assignments', (select count(*) from public.shift_assignments x
          where x.created_by=v_employee.auth_user_id),
        'shift_change_approvals', (select count(*) from public.shift_change_approvals x
          where x.decided_by=v_employee.auth_user_id),
        'shift_change_requests', (select count(*) from public.shift_change_requests x
          where x.requested_by=v_employee.auth_user_id),
        'shift_swap_requests', (select count(*) from public.shift_swap_requests x
          where x.requested_by=v_employee.auth_user_id
             or x.colleague_decided_by=v_employee.auth_user_id
             or x.manager_decided_by=v_employee.auth_user_id),
        'time_account_openings', (select count(*) from public.time_account_openings x
          where x.updated_by=v_employee.auth_user_id),
        'time_account_settings', (select count(*) from public.time_account_settings x
          where x.updated_by=v_employee.auth_user_id),
        'time_entries', (select count(*) from public.time_entries x
          where x.updated_by=v_employee.auth_user_id
             or x.confirmed_by=v_employee.auth_user_id
             or x.correction_requested_by=v_employee.auth_user_id),
        'time_month_closures', (select count(*) from public.time_month_closures x
          where x.closed_by=v_employee.auth_user_id or x.reopened_by=v_employee.auth_user_id),
        'qr_pilot_links', (select count(*) from public.time_qr_pilot_employees x
          where x.created_by=v_employee.auth_user_id),
        'qr_punches', (select count(*) from public.time_qr_punches x
          where x.auth_user_id=v_employee.auth_user_id),
        'qr_terminals', (select count(*) from public.time_qr_terminals x
          where x.created_by=v_employee.auth_user_id or x.updated_by=v_employee.auth_user_id)
      )
    );

    select coalesce(sum(value::bigint), 0) into v_restricting_auth_references
    from jsonb_each_text(v_auth_reference_counts->'restricting');

    select coalesce(sum(value::bigint), 0) into v_cascading_auth_references
    from jsonb_each_text(v_auth_reference_counts->'cascading');

    select coalesce(sum(value::bigint), 0) into v_set_null_auth_references
    from jsonb_each_text(v_auth_reference_counts->'set_null');
  end if;

  v_counts := jsonb_build_object(
    'absences', (select count(*) from public.absences x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'access_invites', (select count(*) from public.employee_access_invites x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'assignments', cardinality(v_assignment_ids),
    'assignment_confirmations', (select count(*) from public.shift_assignment_confirmations x
      where x.company_id=p_company_id
        and (x.employee_id=p_employee_id or x.assignment_id=any(v_assignment_ids))),
    'time_entries', (select count(*) from public.time_entries x
      where x.company_id=p_company_id and x.assignment_id=any(v_assignment_ids)),
    'time_account_openings',
      (select count(*) from public.time_account_openings x
        where x.company_id=p_company_id and x.employee_id=p_employee_id)
      + (select count(*) from public.employee_time_account_openings x
        where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'qr_pilot_links', (select count(*) from public.time_qr_pilot_employees x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'qr_punches', (select count(*) from public.time_qr_punches x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'shift_change_requests', cardinality(v_change_request_ids),
    'shift_change_approvals', (select count(*) from public.shift_change_approvals x
      where x.company_id=p_company_id and x.change_request_id=any(v_change_request_ids)),
    'compliance_check_runs', (select count(*) from public.compliance_check_runs x
      where x.company_id=p_company_id and x.change_request_id=any(v_change_request_ids)),
    'compliance_findings', (select count(*) from public.compliance_findings x
      where x.company_id=p_company_id and x.change_request_id=any(v_change_request_ids)),
    'shift_swap_requests', (select count(*) from public.shift_swap_requests x
      where x.company_id=p_company_id and (
        x.original_employee_id=p_employee_id or x.target_employee_id=p_employee_id
        or x.assignment_id=any(v_assignment_ids)
      )),
    'disruption_incidents', cardinality(v_incident_ids),
    'disruption_offers', (select count(*) from public.disruption_offers x
      where x.company_id=p_company_id
        and (x.employee_id=p_employee_id or x.incident_id=any(v_incident_ids))),
    'personnel_details', (select count(*) from public.employee_personnel_details x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'personnel_documents', cardinality(v_storage_paths),
    'personnel_notes', (select count(*) from public.employee_personnel_notes x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'personnel_qualifications', (select count(*) from public.employee_personnel_qualifications x
      where x.company_id=p_company_id and x.employee_id=p_employee_id),
    'notifications', (select count(*) from public.notifications x
      where x.company_id=p_company_id and (
        x.employee_id=p_employee_id
        or (v_employee.auth_user_id is not null and x.user_id=v_employee.auth_user_id)
      )),
    'push_subscriptions', (select count(*) from public.push_subscriptions x
      where x.company_id=p_company_id
        and v_employee.auth_user_id is not null and x.user_id=v_employee.auth_user_id),
    'audit_actor_events', (select count(*) from public.audit_events x
      where x.company_id=p_company_id
        and v_employee.auth_user_id is not null and x.actor_id=v_employee.auth_user_id),
    'audit_payload_references', (select count(*) from public.audit_events x
      where x.company_id=p_company_id and (
        x.entity_id=p_employee_id
        or coalesce(x.old_values,'{}'::jsonb)::text like '%'||p_employee_id::text||'%'
        or coalesce(x.new_values,'{}'::jsonb)::text like '%'||p_employee_id::text||'%'
        or coalesce(x.metadata,'{}'::jsonb)::text like '%'||p_employee_id::text||'%'
      )),
    'month_snapshot_references', (select count(*) from public.time_month_closures x
      where x.company_id=p_company_id
        and coalesce(x.report_snapshot,'{}'::jsonb)::text like '%'||p_employee_id::text||'%'),
    'other_company_memberships', v_other_memberships,
    'other_employee_links', v_other_employee_links,
    'owned_companies', v_owned_companies,
    'restricting_auth_references', v_restricting_auth_references,
    'cascading_auth_references', v_cascading_auth_references,
    'set_null_auth_references', v_set_null_auth_references
  );

  return jsonb_build_object(
    'version', 2,
    'request_kind', 'EMPLOYEE_OFFBOARDING',
    'company_id', p_company_id,
    'employee_id', p_employee_id,
    'as_of', v_as_of,
    'employment_end', v_end_date,
    'execution_enabled', false,
    'counts', v_counts,
    'storage_paths', to_jsonb(v_storage_paths),
    'auth_user_ids', case when v_employee.auth_user_id is null
      then '[]'::jsonb else jsonb_build_array(v_employee.auth_user_id) end,
    'auth_reference_counts', v_auth_reference_counts,
    'immediate_actions', jsonb_build_array(
      'disable_employee_access',
      'revoke_employee_invites',
      'delete_push_subscriptions',
      'revoke_auth_sessions',
      'remove_company_membership_if_present'
    ),
    'retention_actions', jsonb_build_object(
      'contact_and_emergency_data', jsonb_build_object(
        'action', 'DELETE_OR_REDACT', 'not_before', v_end_date + 30
      ),
      'personnel_and_planning_history', jsonb_build_object(
        'action', 'REDACT_OR_RETAIN', 'review_after', v_default_anonymize_after
      ),
      'payroll_time_evidence', jsonb_build_object(
        'action', 'RETAIN_THEN_REDACT', 'review_after', v_time_retention_after
      ),
      'audit_and_month_snapshots', jsonb_build_object(
        'action', 'CONTROLLED_REDACTION_REQUIRED',
        'reason', 'immutable or closed evidence can contain embedded identifiers'
      )
    ),
    'blockers', jsonb_build_object(
      'future_assignments', (select count(*) from public.shift_assignments x
        where x.company_id=p_company_id and x.employee_id=p_employee_id
          and x.status<>'CANCELLED' and x.ends_at::date>=v_as_of),
      'open_time_entries', (select count(*) from public.time_entries x
        where x.company_id=p_company_id and x.assignment_id=any(v_assignment_ids)
          and x.status not in ('confirmed','rejected')),
      'open_shift_changes', (select count(*) from public.shift_change_requests x
        where x.id=any(v_change_request_ids)
          and x.status not in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED')),
      'open_shift_swaps', (select count(*) from public.shift_swap_requests x
        where x.company_id=p_company_id
          and (x.original_employee_id=p_employee_id or x.target_employee_id=p_employee_id
               or x.assignment_id=any(v_assignment_ids))
          and x.status not in (
            'APPLIED','REJECTED_COLLEAGUE','REJECTED_MANAGER','CANCELLED','SUPERSEDED'
          )),
      'open_disruption_incidents', (select count(*) from public.disruption_incidents x
        where x.id=any(v_incident_ids) and x.status='OPEN'),
      'audit_redaction_review', (v_counts->>'audit_payload_references')::bigint,
      'closed_month_redaction_review', (v_counts->>'month_snapshot_references')::bigint,
      'customer_retention_profile_required', true,
      'legal_hold_check_required', true
    ),
    'auth_account', jsonb_build_object(
      'linked', v_employee.auth_user_id is not null,
      'delete_eligible_after_session_revoke',
        v_employee.auth_user_id is not null
        and v_other_memberships=0 and v_other_employee_links=0
        and v_owned_companies=0 and v_restricting_auth_references=0
        and v_cascading_auth_references=0,
      'set_null_review_required', v_set_null_auth_references > 0,
      'must_use_admin_api', true
    )
  );
end;
$$;

revoke all on function private.sf_employee_offboarding_preview(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function private.sf_employee_offboarding_preview(uuid, uuid, date)
  to service_role;

comment on function private.sf_employee_offboarding_preview(uuid, uuid, date) is
  'Read-only V2 inventory across employee, planning, time, HR, notifications, auth references and immutable evidence.';
