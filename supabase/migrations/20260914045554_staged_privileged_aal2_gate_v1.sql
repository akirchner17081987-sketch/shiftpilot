-- Staged AAL2 enforcement for privileged RPCs called through the Supabase
-- Data API. All entries start disabled so applying this migration cannot lock
-- out an existing privileged account. A later, explicitly approved migration
-- enables one tested stage at a time.

create table if not exists private.sf_mfa_protected_rpcs (
  function_name text primary key,
  rollout_stage smallint not null check (rollout_stage between 2 and 5),
  control_area text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint sf_mfa_protected_rpcs_name_chk
    check (function_name ~ '^[a-z][a-z0-9_]*$')
);

alter table private.sf_mfa_protected_rpcs enable row level security;
alter table private.sf_mfa_protected_rpcs force row level security;
revoke all on table private.sf_mfa_protected_rpcs from public, anon, authenticated;

insert into private.sf_mfa_protected_rpcs(function_name, rollout_stage, control_area, enabled)
values
  ('manager_list_company_users', 2, 'Benutzer und Rechte', false),
  ('manager_create_company_invite', 2, 'Benutzer und Rechte', false),
  ('manager_revoke_company_invite', 2, 'Benutzer und Rechte', false),
  ('manager_update_company_member', 2, 'Benutzer und Rechte', false),

  ('manager_personnel_file_bundle', 3, 'Personalakte', false),
  ('manager_update_personnel_details', 3, 'Personalakte', false),
  ('manager_save_personnel_qualification', 3, 'Personalakte', false),
  ('manager_delete_personnel_qualification', 3, 'Personalakte', false),
  ('manager_register_personnel_document', 3, 'Personalakte', false),
  ('manager_delete_personnel_document', 3, 'Personalakte', false),
  ('manager_add_personnel_note', 3, 'Personalakte', false),
  ('manager_personnel_deadline_dashboard', 3, 'Personalakte', false),

  ('manager_authorize_datev_lodas_export', 4, 'DATEV und Berichte', false),
  ('manager_log_datev_lodas_export', 4, 'DATEV und Berichte', false),
  ('manager_time_report_bundle', 4, 'DATEV und Berichte', false),
  ('manager_list_audit_events', 4, 'DATEV und Berichte', false),
  ('manager_list_time_entries', 4, 'DATEV und Berichte', false),
  ('manager_monthly_time_accounts', 4, 'DATEV und Berichte', false),
  ('manager_time_month_status', 4, 'DATEV und Berichte', false),
  ('manager_close_time_month', 4, 'DATEV und Berichte', false),
  ('manager_reopen_time_month', 4, 'DATEV und Berichte', false),

  ('manager_create_time_qr_terminal', 5, 'QR-Sicherheitskonfiguration', false),
  ('manager_rotate_time_qr_terminal', 5, 'QR-Sicherheitskonfiguration', false),
  ('manager_set_time_qr_terminal_active', 5, 'QR-Sicherheitskonfiguration', false),
  ('manager_set_time_qr_terminal_mode', 5, 'QR-Sicherheitskonfiguration', false),
  ('manager_set_time_qr_terminal_pilot_employee', 5, 'QR-Sicherheitskonfiguration', false),
  ('manager_set_time_qr_terminal_pilot_employees', 5, 'QR-Sicherheitskonfiguration', false)
on conflict (function_name) do update
set rollout_stage = excluded.rollout_stage,
    control_area = excluded.control_area;

create schema if not exists gateway;
revoke all on schema gateway from public;
grant usage on schema gateway to anon, authenticated, service_role, authenticator;

create or replace function gateway.sf_enforce_staged_aal2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text := trim(both '/' from coalesce(current_setting('request.path', true), ''));
  v_rpc text;
begin
  if v_path not like 'rpc/%' then
    return;
  end if;

  v_rpc := substring(v_path from 5);

  if exists (
    select 1
    from private.sf_mfa_protected_rpcs p
    where p.function_name = v_rpc
      and p.enabled
  ) then
    perform private.sf_assert_aal2('rpc:' || v_rpc);
  end if;
end;
$$;

revoke all on function gateway.sf_enforce_staged_aal2() from public, anon, authenticated;
grant execute on function gateway.sf_enforce_staged_aal2()
  to anon, authenticated, service_role, authenticator;

comment on table private.sf_mfa_protected_rpcs is
  'Allowlist for staged Data API AAL2 enforcement. Rows are enabled only by reviewed migrations.';
comment on function gateway.sf_enforce_staged_aal2() is
  'PostgREST pre-request guard for enabled sensitive RPCs; delegates JWT validation to sf_assert_aal2.';

alter role authenticator
  set pgrst.db_pre_request = 'gateway.sf_enforce_staged_aal2';

notify pgrst, 'reload config';
