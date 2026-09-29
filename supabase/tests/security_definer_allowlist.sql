-- Read-only verifier. Run against a disposable Supabase branch before release.
with allowlist(name, arguments) as (values
  ('employee_clock_from_qr','p_token text, p_expected_action text'),
  ('employee_my_time_account_month','p_month date'),
  ('employee_qr_time_status','p_token text'),
  ('employee_respond_to_shift_change','p_change_id uuid, p_decision text, p_comment text'),
  ('employee_submit_time_entry','p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text'),
  ('get_push_public_key',''),
  ('manager_close_time_month','p_company_id uuid, p_month date, p_note text'),
  ('manager_create_company_invite','p_company_id uuid, p_email text, p_role text, p_token_hash text'),
  ('manager_create_time_qr_terminal','p_company_id uuid, p_name text, p_location_note text'),
  ('manager_import_month_matrix','p_company_id uuid, p_rows jsonb, p_apply boolean'),
  ('manager_list_company_users','p_company_id uuid'),
  ('manager_list_time_entries','p_company_id uuid, p_start_date date, p_end_date date'),
  ('manager_list_time_qr_pilot_candidates','p_company_id uuid'),
  ('manager_list_time_qr_terminals','p_company_id uuid'),
  ('manager_log_datev_lodas_export','p_company_id uuid, p_month date, p_row_count integer, p_content_sha256 text'),
  ('manager_monthly_holidays','p_company_id uuid, p_month date'),
  ('manager_monthly_time_accounts','p_company_id uuid, p_month date'),
  ('manager_reopen_time_month','p_company_id uuid, p_month date, p_note text'),
  ('manager_review_time_entry','p_assignment_id uuid, p_decision text, p_comment text'),
  ('manager_revoke_company_invite','p_invite_id uuid'),
  ('manager_rotate_time_qr_terminal','p_terminal_id uuid'),
  ('manager_save_time_entry','p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text, p_confirm boolean'),
  ('manager_set_time_account_opening','p_employee_id uuid, p_effective_date date, p_opening_balance_minutes integer, p_note text'),
  ('manager_set_time_qr_terminal_active','p_terminal_id uuid, p_is_active boolean'),
  ('manager_set_time_qr_terminal_mode','p_terminal_id uuid, p_pilot_mode boolean'),
  ('manager_set_time_qr_terminal_pilot_employee','p_terminal_id uuid, p_employee_id uuid'),
  ('manager_set_time_qr_terminal_pilot_employees','p_terminal_id uuid, p_employee_ids uuid[]'),
  ('manager_time_month_status','p_company_id uuid, p_month date'),
  ('manager_time_report_bundle','p_company_id uuid, p_month date, p_employee_id uuid'),
  ('manager_update_company_member','p_company_id uuid, p_user_id uuid, p_role text, p_status text'),
  ('manager_update_time_account_settings','p_company_id uuid, p_account_start_date date, p_credited_absence_types text[]'),
  ('manager_update_time_account_settings_v2','p_company_id uuid, p_account_start_date date, p_credited_absence_types text[], p_federal_state text'),
  ('register_push_subscription','p_company_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text'),
  ('send_push_test','p_company_id uuid'),
  ('unregister_push_subscription','p_endpoint text')
), actual as (
  select p.oid, p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments,
    p.proconfig, p.prosrc,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), findings as (
  select 'UNLISTED' issue, a.name, a.arguments from actual a
    left join allowlist l using(name,arguments) where l.name is null
  union all
  select 'MISSING', l.name, l.arguments from allowlist l
    left join actual a using(name,arguments) where a.name is null
  union all
  select 'ANON_EXECUTE', a.name, a.arguments from actual a where a.anon_execute
  union all
  select 'NO_AUTHENTICATED_EXECUTE', a.name, a.arguments from actual a where not a.authenticated_execute
  union all
  select 'UNSAFE_SEARCH_PATH', a.name, a.arguments from actual a
    where a.proconfig is null or not exists (
      select 1 from unnest(a.proconfig) c where c like 'search_path=%'
    )
  union all
  select 'USER_METADATA_AUTHORIZATION', a.name, a.arguments from actual a
    where a.prosrc ~* 'raw_user_meta_data|user_metadata'
  union all
  select 'DYNAMIC_SQL', a.name, a.arguments from actual a
    where a.prosrc ~* '\mexecute\M|format[ ]*[(]'
)
select * from findings order by issue,name,arguments;

-- Passing result: zero rows. The caller must fail the release when any row appears.
