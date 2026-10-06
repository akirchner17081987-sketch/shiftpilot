-- Schema-only fixture. No production rows or credentials.
create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
create schema auth; create schema private; create schema storage; create schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users on delete cascade,status text);
create table auth.audit_log_entries(id uuid primary key default gen_random_uuid(),payload jsonb);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.sf_assert_service_role() returns void language plpgsql as $$begin if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'Service role required'; end if;end$$;
create function private.sf_validate_time_values(timestamptz,timestamptz,integer) returns void language plpgsql as $$begin if $2<=$1 then raise exception 'Invalid time'; end if;end$$;
create table "public"."employee_access_invites" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"email" text not null,
"token_hash" text not null,
"expires_at" timestamp with time zone default (now() + '7 days'::interval) not null,
"claimed_at" timestamp with time zone,
"claimed_by" uuid,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."employee_personnel_details" (
"employee_id" uuid not null,
"company_id" uuid not null,
"department" text default ''::text not null,
"job_title" text default ''::text not null,
"work_location" text default ''::text not null,
"cost_center" text default ''::text not null,
"probation_end" date,
"emergency_contact_name" text default ''::text not null,
"emergency_contact_phone" text default ''::text not null,
"private_note" text default ''::text not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."employee_personnel_qualifications" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"category" text default 'Qualifikation'::text not null,
"title" text not null,
"credential_number" text default ''::text not null,
"issuer" text default ''::text not null,
"issued_on" date,
"expires_on" date,
"note" text default ''::text not null,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."employee_personnel_documents" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"category" text default 'Sonstiges'::text not null,
"title" text not null,
"file_name" text not null,
"storage_path" text not null,
"mime_type" text default 'application/octet-stream'::text not null,
"file_size" bigint default 0 not null,
"document_date" date,
"expires_on" date,
"note" text default ''::text not null,
"uploaded_by" uuid,
"created_at" timestamp with time zone default now() not null
);
create table "public"."employee_personnel_notes" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"note_type" text default 'ALLGEMEIN'::text not null,
"title" text default ''::text not null,
"note" text not null,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null
);
create table "public"."absences" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"legacy_id" text,
"start_date" date not null,
"end_date" date not null,
"absence_type" text not null,
"status" text default 'Genehmigt'::text not null,
"full_day" boolean default true not null,
"start_time" time without time zone,
"end_time" time without time zone,
"time_note" text default ''::text not null,
"note" text default ''::text not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"request_source" text default 'MANAGER'::text not null,
"requested_by" uuid,
"requested_at" timestamp with time zone,
"reviewed_by" uuid,
"reviewed_at" timestamp with time zone,
"review_note" text default ''::text not null
);
create table "public"."notifications" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"user_id" uuid not null,
"employee_id" uuid,
"kind" text not null,
"title" text not null,
"message" text default ''::text not null,
"link_view" text,
"entity_type" text not null,
"entity_id" uuid not null,
"is_read" boolean default false not null,
"read_at" timestamp with time zone,
"metadata" jsonb default '{}'::jsonb not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."shift_swap_requests" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"assignment_id" uuid,
"original_employee_id" uuid not null,
"target_employee_id" uuid,
"assignment_version" integer not null,
"status" text not null,
"reason" text default ''::text not null,
"colleague_comment" text default ''::text not null,
"manager_comment" text default ''::text not null,
"requested_by" uuid,
"colleague_decided_by" uuid,
"manager_decided_by" uuid,
"change_request_id" uuid,
"requested_at" timestamp with time zone default now() not null,
"colleague_decided_at" timestamp with time zone,
"manager_decided_at" timestamp with time zone,
"applied_at" timestamp with time zone,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."time_entries" (
"assignment_id" uuid not null,
"company_id" uuid not null,
"actual_start" timestamp with time zone,
"actual_end" timestamp with time zone,
"break_minutes" integer default 0 not null,
"status" text default 'open'::text not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null,
"employee_note" text default ''::text not null,
"manager_note" text default ''::text not null,
"source" text default 'EMPLOYEE'::text not null,
"submitted_at" timestamp with time zone,
"confirmed_by" uuid,
"confirmed_at" timestamp with time zone,
"correction_requested_by" uuid,
"correction_requested_at" timestamp with time zone,
"correction_note" text default ''::text not null,
"created_at" timestamp with time zone default now() not null,
"version" integer default 1 not null
);
create table "private"."personnel_expiry_reminder_log" (
"company_id" uuid not null,
"recipient_user_id" uuid not null,
"entity_type" text not null,
"entity_id" uuid not null,
"employee_id" uuid not null,
"expires_on" date not null,
"milestone_days" integer not null,
"actual_days" integer not null,
"sent_at" timestamp with time zone default now() not null
);
create table "public"."time_account_settings" (
"company_id" uuid not null,
"account_start_date" date default (date_trunc('month'::text, (CURRENT_DATE + '1 mon'::interval)))::date not null,
"target_method" text default 'WEEKDAYS_5'::text not null,
"credited_absence_types" text[] default ARRAY['Urlaub'::text, 'Krank'::text, 'Fortbildung'::text, 'Sonderurlaub'::text] not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null,
"federal_state" text default 'DE'::text not null
);
create table "public"."employee_time_account_openings" (
"employee_id" uuid not null,
"company_id" uuid not null,
"effective_date" date not null,
"opening_balance_minutes" integer default 0 not null,
"note" text default ''::text not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."time_month_closures" (
"company_id" uuid not null,
"month_start" date not null,
"status" text default 'OPEN'::text not null,
"revision" integer default 0 not null,
"closed_at" timestamp with time zone,
"closed_by" uuid,
"close_note" text default ''::text not null,
"reopened_at" timestamp with time zone,
"reopened_by" uuid,
"reopen_note" text default ''::text not null,
"report_snapshot" jsonb,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."shift_assignment_confirmations" (
"id" uuid default gen_random_uuid() not null,
"assignment_id" uuid not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"status" text not null,
"note" text default ''::text not null,
"responded_at" timestamp with time zone default now() not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."disruption_incidents" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"assignment_id" uuid not null,
"original_employee_id" uuid not null,
"assignment_version" integer not null,
"incident_type" text not null,
"note" text default ''::text not null,
"status" text default 'OPEN'::text not null,
"created_by" uuid not null,
"resolved_by" uuid,
"created_at" timestamp with time zone default now() not null,
"resolved_at" timestamp with time zone,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."disruption_offers" (
"id" uuid default gen_random_uuid() not null,
"incident_id" uuid not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"rank_score" integer default 0 not null,
"rank_reasons" text[] default '{}'::text[] not null,
"status" text default 'OFFERED'::text not null,
"employee_comment" text default ''::text not null,
"offered_by" uuid not null,
"offered_at" timestamp with time zone default now() not null,
"expires_at" timestamp with time zone not null,
"responded_at" timestamp with time zone,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."datev_lodas_settings" (
"company_id" uuid not null,
"berater_nr" text default ''::text not null,
"mandanten_nr" text default ''::text not null,
"updated_at" timestamp with time zone default now() not null,
"updated_by" uuid
);
create table "public"."company_member_invites" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"email" text not null,
"role" text not null,
"token_hash" text not null,
"status" text default 'INVITED'::text not null,
"expires_at" timestamp with time zone not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"claimed_by" uuid,
"claimed_at" timestamp with time zone
);
create table "public"."time_account_openings" (
"employee_id" uuid not null,
"company_id" uuid not null,
"effective_date" date not null,
"opening_balance_minutes" integer default 0 not null,
"note" text default ''::text not null,
"updated_at" timestamp with time zone default now() not null,
"updated_by" uuid
);
create table "public"."time_qr_independent_shifts" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"terminal_id" uuid not null,
"started_at" timestamp with time zone not null,
"ended_at" timestamp with time zone,
"created_at" timestamp with time zone default clock_timestamp() not null
);
create table "public"."time_qr_independent_events" (
"id" uuid default gen_random_uuid() not null,
"shift_id" uuid not null,
"action" text not null,
"punched_at" timestamp with time zone not null,
"request_id" text
);
create table "public"."time_qr_independent_breaks" (
"id" uuid default gen_random_uuid() not null,
"shift_id" uuid not null,
"ordinal" smallint not null,
"started_at" timestamp with time zone not null,
"ended_at" timestamp with time zone
);
create table "public"."datev_lodas_rules" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"label" text not null,
"source_type" text not null,
"source_key" text,
"wage_type" text not null,
"cost_center" text,
"sort_order" integer default 100 not null,
"active" boolean default true not null,
"created_at" timestamp with time zone default now() not null,
"created_by" uuid,
"updated_at" timestamp with time zone default now() not null,
"updated_by" uuid
);
create table "public"."time_qr_independent_sessions" (
"token_hash" bytea not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"terminal_id" uuid not null,
"expires_at" timestamp with time zone not null
);
create table "public"."time_qr_independent_login_limits" (
"key_hash" bytea not null,
"failed_count" integer default 0 not null,
"reset_at" timestamp with time zone not null
);
create table "public"."audit_events" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"event_type" text not null,
"entity_type" text not null,
"entity_id" uuid,
"actor_id" uuid,
"actor_role" text,
"old_values" jsonb,
"new_values" jsonb,
"metadata" jsonb default '{}'::jsonb not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."companies" (
"id" uuid default gen_random_uuid() not null,
"name" text not null,
"timezone" text default 'Europe/Berlin'::text not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."company_members" (
"company_id" uuid not null,
"user_id" uuid not null,
"role" text default 'OWNER'::text not null,
"status" text default 'ACTIVE'::text not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."shift_change_requests" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"assignment_id" uuid,
"legacy_id" text,
"action" text not null,
"employee_id" uuid,
"base_version" integer default 0 not null,
"old_snapshot" jsonb,
"proposed_snapshot" jsonb,
"reason_code" text not null,
"reason_text" text default ''::text not null,
"predictable" text default 'UNKNOWN'::text not null,
"notice_minutes" integer,
"compliance_status" text not null,
"status" text not null,
"requires_employee_approval" boolean default false not null,
"requires_works_council" boolean default false not null,
"requested_by" uuid,
"requested_at" timestamp with time zone default now() not null,
"applied_at" timestamp with time zone,
"rejected_at" timestamp with time zone,
"created_at" timestamp with time zone default now() not null
);
create table "public"."global_staffing_requirements" (
"company_id" uuid not null,
"shift_code" text not null,
"required_count" integer default 0 not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."daily_staffing_overrides" (
"company_id" uuid not null,
"work_date" date not null,
"shift_code" text not null,
"required_count" integer not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."plan_publications" (
"company_id" uuid not null,
"week_start" date not null,
"published_at" timestamp with time zone default now() not null,
"published_by" uuid
);
create table "public"."shift_assignments" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"legacy_id" text,
"shift_code" text not null,
"starts_at" timestamp with time zone not null,
"ends_at" timestamp with time zone not null,
"break_minutes" integer default 0 not null,
"note" text default ''::text not null,
"status" text default 'DRAFT'::text not null,
"published_at" timestamp with time zone,
"version" integer default 1 not null,
"last_change_request_id" uuid,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."compliance_check_runs" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"change_request_id" uuid not null,
"rule_engine_version" text not null,
"overall_status" text not null,
"started_at" timestamp with time zone default now() not null,
"completed_at" timestamp with time zone default now() not null
);
create table "public"."compliance_findings" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"check_run_id" uuid not null,
"change_request_id" uuid not null,
"rule_code" text not null,
"status" text not null,
"severity" text default 'INFO'::text not null,
"actual_value" text,
"required_value" text,
"legal_basis" text,
"message" text not null,
"rule_version" text not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."legacy_imports" (
"company_id" uuid not null,
"user_id" uuid not null,
"source" text default 'localstorage_v1'::text not null,
"imported_at" timestamp with time zone default now() not null,
"counts" jsonb default '{}'::jsonb not null
);
create table "public"."employees" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"legacy_id" text,
"first_name" text not null,
"last_name" text not null,
"personnel_no" text,
"role" text default 'Sicherheitsmitarbeiter'::text not null,
"employment" text default 'Vollzeit'::text not null,
"weekly_hours" numeric(6,2) default 40 not null,
"start_date" date,
"contract_end" date,
"birth_date" date,
"status" text default 'active'::text not null,
"email" text,
"phone" text,
"address" text,
"zip" text,
"city" text,
"shift_permissions" text[] default '{}'::text[] not null,
"qualifications" text[] default '{}'::text[] not null,
"work_time_model" text default 'SHIFT'::text not null,
"note" text default ''::text not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"auth_user_id" uuid,
"access_status" text default 'NONE'::text not null,
"access_linked_at" timestamp with time zone,
"deleted_at" timestamp with time zone,
"deleted_by" uuid
);
create table "public"."shift_change_approvals" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"change_request_id" uuid not null,
"approval_type" text not null,
"required" boolean default true not null,
"status" text default 'PENDING'::text not null,
"decided_by" uuid,
"decided_at" timestamp with time zone,
"comment" text default ''::text not null,
"created_at" timestamp with time zone default now() not null
);
create table "public"."company_compliance_policy" (
"company_id" uuid not null,
"short_notice_hours" integer default 48 not null,
"critical_notice_hours" integer default 24 not null,
"employee_confirmation_under_hours" integer default 24 not null,
"standard_min_rest_hours" numeric(5,2) default 11 not null,
"standard_max_shift_hours" numeric(5,2) default 10 not null,
"works_council_enabled" boolean default false not null,
"require_reason_for_published_change" boolean default true not null,
"sector" text default 'security'::text not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."time_qr_terminals" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"name" text not null,
"location_note" text default ''::text not null,
"token_hash" bytea not null,
"is_active" boolean default false not null,
"start_window_minutes" integer default 60 not null,
"end_window_minutes" integer default 120 not null,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_by" uuid,
"updated_at" timestamp with time zone default now() not null,
"rotated_at" timestamp with time zone,
"disabled_at" timestamp with time zone,
"pilot_mode" boolean default true not null,
"pilot_employee_id" uuid,
"vault_secret_id" uuid
);
create table "public"."time_qr_pilot_employees" (
"terminal_id" uuid not null,
"employee_id" uuid not null,
"company_id" uuid not null,
"created_at" timestamp with time zone default clock_timestamp() not null,
"created_by" uuid
);
create table "public"."time_qr_punches" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"terminal_id" uuid not null,
"assignment_id" uuid not null,
"employee_id" uuid not null,
"auth_user_id" uuid,
"punch_type" text not null,
"punched_at" timestamp with time zone default clock_timestamp() not null,
"created_at" timestamp with time zone default clock_timestamp() not null,
"break_tracking_enabled" boolean default false not null
);
create table "private"."push_config" (
"id" boolean default true not null,
"enabled" boolean default false not null,
"function_url" text not null,
"webhook_secret" text not null,
"vapid_public_key" text not null,
"vapid_private_key" text not null,
"vapid_subject" text not null,
"updated_at" timestamp with time zone default now() not null
);
create table "private"."privacy_lifecycle_requests" (
"id" uuid default gen_random_uuid() not null,
"idempotency_key" uuid not null,
"request_kind" text not null,
"company_id" uuid not null,
"employee_id" uuid,
"status" text default 'PENDING_APPROVAL'::text not null,
"requested_by" uuid not null,
"requested_at" timestamp with time zone default now() not null,
"approved_by" uuid,
"approved_at" timestamp with time zone,
"access_revoke_after" timestamp with time zone default now() not null,
"erase_after" timestamp with time zone not null,
"legal_hold_until" timestamp with time zone,
"reason" text not null,
"preview" jsonb not null,
"storage_paths" text[] default '{}'::text[] not null,
"auth_user_ids" uuid[] default '{}'::uuid[] not null,
"attempt_count" integer default 0 not null,
"last_error" text,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone default now() not null,
"retention_profile_id" uuid,
"worker_id" text,
"started_at" timestamp with time zone,
"outcome" jsonb,
"execution_phase" text,
"approval_mode" text default 'TWO_PERSON'::text not null,
"first_session_fingerprint" text,
"confirmation_not_before" timestamp with time zone,
"confirmation_expires_at" timestamp with time zone,
"confirmed_session_fingerprint" text,
"confirmed_by" uuid,
"confirmed_at" timestamp with time zone,
"preview_hash" text
);
create table "private"."push_dispatches" (
"notification_id" uuid not null,
"status" text default 'PENDING'::text not null,
"attempts" integer default 0 not null,
"delivered_count" integer default 0 not null,
"failed_count" integer default 0 not null,
"last_attempt_at" timestamp with time zone,
"sent_at" timestamp with time zone,
"last_error" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."push_subscriptions" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"user_id" uuid not null,
"endpoint" text not null,
"p256dh" text not null,
"auth_key" text not null,
"user_agent" text,
"enabled" boolean default true not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"last_seen_at" timestamp with time zone default now() not null
);
create table "private"."sf_mfa_protected_rpcs" (
"function_name" text not null,
"rollout_stage" smallint not null,
"control_area" text not null,
"enabled" boolean default false not null,
"updated_at" timestamp with time zone default now() not null
);
create table "private"."privacy_legal_holds" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid,
"category" text not null,
"status" text default 'ACTIVE'::text not null,
"reason" text not null,
"hold_until" timestamp with time zone,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"released_by" uuid,
"released_at" timestamp with time zone
);
create table "private"."privacy_retention_profiles" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"version" integer not null,
"status" text default 'DRAFT'::text not null,
"rules" jsonb not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"approved_by" uuid,
"approved_at" timestamp with time zone,
"revoked_at" timestamp with time zone,
"approval_mode" text default 'TWO_PERSON'::text not null,
"approval_reference" text,
"rules_hash" text,
"first_session_fingerprint" text,
"confirmation_not_before" timestamp with time zone,
"confirmation_expires_at" timestamp with time zone,
"confirmed_session_fingerprint" text
);
create table "private"."privacy_redaction_runs" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"retention_profile_id" uuid,
"as_of" date not null,
"status" text not null,
"audit_cutoff" date not null,
"datev_audit_cutoff" date not null,
"month_snapshot_cutoff" date not null,
"audit_eligible" integer default 0 not null,
"audit_redacted" integer default 0 not null,
"month_snapshot_eligible" integer default 0 not null,
"month_snapshot_redacted" integer default 0 not null,
"result" jsonb default '{}'::jsonb not null,
"created_at" timestamp with time zone default now() not null,
"completed_at" timestamp with time zone
);
create table "public"."time_qr_breaks" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"terminal_id" uuid not null,
"assignment_id" uuid not null,
"employee_id" uuid not null,
"started_at" timestamp with time zone not null,
"ended_at" timestamp with time zone
);
create table "public"."company_planning_teams" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"team_code" text not null,
"start_date" date not null,
"pattern" text[] not null,
"start_offset" integer not null,
"updated_at" timestamp with time zone default now() not null,
"updated_by" uuid
);
create table "public"."open_shift_market_offers" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"work_date" date not null,
"shift_code" text not null,
"starts_at" timestamp with time zone not null,
"ends_at" timestamp with time zone not null,
"remaining_count" integer not null,
"status" text default 'MARKET_OPEN'::text not null,
"reason" text default ''::text not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table "public"."open_shift_market_claims" (
"id" uuid default gen_random_uuid() not null,
"offer_id" uuid not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"status" text default 'PENDING_MANAGER'::text not null,
"comment" text default ''::text not null,
"manager_comment" text default ''::text not null,
"requested_by" uuid not null,
"requested_at" timestamp with time zone default now() not null,
"reviewed_by" uuid,
"reviewed_at" timestamp with time zone,
"assignment_id" uuid,
"rhythm_warning" text default ''::text not null
);
create table "private"."employee_profile_requests" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"employee_id" uuid not null,
"category" text not null,
"message" text not null,
"status" text default 'pending'::text not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"review_note" text default ''::text not null,
"reviewed_by" uuid,
"reviewed_at" timestamp with time zone
);
create table "public"."shift_templates" (
"id" uuid default gen_random_uuid() not null,
"company_id" uuid not null,
"code" text not null,
"name" text not null,
"default_start" time without time zone not null,
"default_end" time without time zone not null,
"css_class" text default 'teal'::text not null,
"active" boolean default true not null,
"sort_order" integer default 0 not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"planning_mode" text default 'required'::text not null,
"optional_staffing" integer default 0 not null,
"responsible_employee_id" uuid,
"responsible_only" boolean default false not null,
"optional_weekdays" integer[] default ARRAY[1, 2, 3, 4, 5, 6, 7] not null,
"coverage_group" text,
"coverage_required" integer default 0 not null,
"morning_ot_switch_min" integer,
"allowed_personnel_nos" text[],
"exclusive_employees" boolean default false not null,
"requires_planning_team" boolean default false not null,
"strict_weekdays" boolean default false not null,
"strict_times" boolean default false not null,
"rhythm_alias" text
);
alter table "public"."employee_access_invites" add constraint "fixture_constraint_1" UNIQUE (company_id, employee_id);
alter table "public"."employee_access_invites" add constraint "fixture_constraint_5" PRIMARY KEY (id);
alter table "public"."employee_access_invites" add constraint "fixture_constraint_6" UNIQUE (token_hash);
alter table "public"."employee_personnel_details" add constraint "fixture_constraint_9" PRIMARY KEY (employee_id);
alter table "public"."employee_personnel_qualifications" add constraint "fixture_constraint_10" CHECK (((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on)));
alter table "public"."employee_personnel_qualifications" add constraint "fixture_constraint_13" PRIMARY KEY (id);
alter table "public"."employee_personnel_documents" add constraint "fixture_constraint_14" CHECK (((file_size >= 0) AND (file_size <= 10485760)));
alter table "public"."employee_personnel_documents" add constraint "fixture_constraint_17" PRIMARY KEY (id);
alter table "public"."employee_personnel_documents" add constraint "fixture_constraint_18" UNIQUE (storage_path);
alter table "public"."employee_personnel_notes" add constraint "fixture_constraint_19" CHECK ((length(btrim(note)) >= 2));
alter table "public"."employee_personnel_notes" add constraint "fixture_constraint_22" PRIMARY KEY (id);
alter table "public"."absences" add constraint "fixture_constraint_23" CHECK ((end_date >= start_date));
alter table "public"."absences" add constraint "fixture_constraint_25" UNIQUE (company_id, legacy_id);
alter table "public"."absences" add constraint "fixture_constraint_27" PRIMARY KEY (id);
alter table "public"."notifications" add constraint "fixture_constraint_30" PRIMARY KEY (id);
alter table "public"."notifications" add constraint "fixture_constraint_32" UNIQUE (user_id, kind, entity_id);
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_34" CHECK ((assignment_version >= 0));
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_36" CHECK ((original_employee_id <> target_employee_id));
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_41" PRIMARY KEY (id);
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_43" CHECK ((status = ANY (ARRAY['MARKET_OPEN'::text, 'PENDING_COLLEAGUE'::text, 'PENDING_MANAGER'::text, 'REJECTED_COLLEAGUE'::text, 'REJECTED_MANAGER'::text, 'APPLIED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])));
alter table "public"."time_entries" add constraint "fixture_constraint_46" CHECK ((break_minutes >= 0));
alter table "public"."time_entries" add constraint "fixture_constraint_47" CHECK (((actual_start IS NULL) OR (actual_end IS NULL) OR ((break_minutes)::numeric <= floor((EXTRACT(epoch FROM (actual_end - actual_start)) / (60)::numeric)))));
alter table "public"."time_entries" add constraint "fixture_constraint_48" CHECK (((actual_end IS NULL) OR (actual_start IS NULL) OR (actual_end > actual_start)));
alter table "public"."time_entries" add constraint "fixture_constraint_52" PRIMARY KEY (assignment_id);
alter table "public"."time_entries" add constraint "fixture_constraint_53" CHECK ((source = ANY (ARRAY['EMPLOYEE'::text, 'MANAGER'::text])));
alter table "public"."time_entries" add constraint "fixture_constraint_54" CHECK ((status = ANY (ARRAY['open'::text, 'recorded'::text, 'correction_requested'::text, 'confirmed'::text])));
alter table "public"."time_entries" add constraint "fixture_constraint_56" CHECK ((version > 0));
alter table "private"."personnel_expiry_reminder_log" add constraint "fixture_constraint_57" CHECK ((entity_type = ANY (ARRAY['PERSONNEL_QUALIFICATION'::text, 'PERSONNEL_DOCUMENT'::text])));
alter table "private"."personnel_expiry_reminder_log" add constraint "fixture_constraint_58" CHECK ((milestone_days = ANY (ARRAY[90, 60, 30, 14, 7, 1, 0])));
alter table "private"."personnel_expiry_reminder_log" add constraint "fixture_constraint_59" PRIMARY KEY (company_id, recipient_user_id, entity_type, entity_id, expires_on, milestone_days);
alter table "public"."time_account_settings" add constraint "fixture_constraint_61" CHECK ((federal_state = ANY (ARRAY['DE'::text, 'DE-BW'::text, 'DE-BY'::text, 'DE-BE'::text, 'DE-BB'::text, 'DE-HB'::text, 'DE-HH'::text, 'DE-HE'::text, 'DE-MV'::text, 'DE-NI'::text, 'DE-NW'::text, 'DE-RP'::text, 'DE-SL'::text, 'DE-SN'::text, 'DE-ST'::text, 'DE-SH'::text, 'DE-TH'::text])));
alter table "public"."time_account_settings" add constraint "fixture_constraint_62" PRIMARY KEY (company_id);
alter table "public"."time_account_settings" add constraint "fixture_constraint_63" CHECK ((target_method = 'WEEKDAYS_5'::text));
alter table "public"."employee_time_account_openings" add constraint "fixture_constraint_65" UNIQUE (company_id, employee_id);
alter table "public"."employee_time_account_openings" add constraint "fixture_constraint_68" PRIMARY KEY (employee_id);
alter table "public"."time_month_closures" add constraint "fixture_constraint_70" CHECK (((status = 'OPEN'::text) OR ((closed_at IS NOT NULL) AND (closed_by IS NOT NULL) AND (report_snapshot IS NOT NULL))));
alter table "public"."time_month_closures" add constraint "fixture_constraint_72" CHECK ((month_start = (date_trunc('month'::text, (month_start)::timestamp with time zone))::date));
alter table "public"."time_month_closures" add constraint "fixture_constraint_73" PRIMARY KEY (company_id, month_start);
alter table "public"."time_month_closures" add constraint "fixture_constraint_74" CHECK ((revision >= 0));
alter table "public"."time_month_closures" add constraint "fixture_constraint_75" CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])));
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_76" UNIQUE (assignment_id, employee_id);
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_80" CHECK ((char_length(note) <= 1000));
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_81" PRIMARY KEY (id);
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_82" CHECK ((status = ANY (ARRAY['CONFIRMED'::text, 'ISSUE_REPORTED'::text])));
alter table "public"."disruption_incidents" add constraint "fixture_constraint_84" CHECK ((assignment_version > 0));
alter table "public"."disruption_incidents" add constraint "fixture_constraint_87" CHECK ((incident_type = ANY (ARRAY['SICKNESS'::text, 'NO_SHOW'::text, 'EMERGENCY'::text, 'OTHER'::text])));
alter table "public"."disruption_incidents" add constraint "fixture_constraint_88" CHECK ((char_length(note) <= 1000));
alter table "public"."disruption_incidents" add constraint "fixture_constraint_90" PRIMARY KEY (id);
alter table "public"."disruption_incidents" add constraint "fixture_constraint_92" CHECK ((status = ANY (ARRAY['OPEN'::text, 'RESOLVED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])));
alter table "public"."disruption_offers" add constraint "fixture_constraint_94" CHECK ((char_length(employee_comment) <= 1000));
alter table "public"."disruption_offers" add constraint "fixture_constraint_96" UNIQUE (incident_id, employee_id);
alter table "public"."disruption_offers" add constraint "fixture_constraint_99" PRIMARY KEY (id);
alter table "public"."disruption_offers" add constraint "fixture_constraint_100" CHECK ((status = ANY (ARRAY['OFFERED'::text, 'ACCEPTED'::text, 'DECLINED'::text, 'EXPIRED'::text, 'REVOKED'::text])));
alter table "public"."datev_lodas_settings" add constraint "fixture_constraint_101" CHECK (((berater_nr = ''::text) OR (berater_nr ~ '^[0-9]{4,7}$'::text)));
alter table "public"."datev_lodas_settings" add constraint "fixture_constraint_102" CHECK (((mandanten_nr = ''::text) OR (mandanten_nr ~ '^[0-9]{1,5}$'::text)));
alter table "public"."datev_lodas_settings" add constraint "fixture_constraint_104" PRIMARY KEY (company_id);
alter table "public"."company_member_invites" add constraint "fixture_constraint_107" UNIQUE (company_id, email);
alter table "public"."company_member_invites" add constraint "fixture_constraint_110" PRIMARY KEY (id);
alter table "public"."company_member_invites" add constraint "fixture_constraint_111" CHECK ((role = ANY (ARRAY['ADMIN'::text, 'DISPATCHER'::text, 'PLANNER'::text, 'VIEWER'::text, 'TIME_TRACKING'::text])));
alter table "public"."company_member_invites" add constraint "fixture_constraint_112" CHECK ((status = ANY (ARRAY['INVITED'::text, 'CLAIMED'::text, 'REVOKED'::text, 'EXPIRED'::text])));
alter table "public"."company_member_invites" add constraint "fixture_constraint_113" UNIQUE (token_hash);
alter table "public"."time_account_openings" add constraint "fixture_constraint_115" PRIMARY KEY (employee_id);
alter table "public"."time_qr_independent_shifts" add constraint "fixture_constraint_116" CHECK (((ended_at IS NULL) OR (ended_at > started_at)));
alter table "public"."time_qr_independent_shifts" add constraint "fixture_constraint_119" PRIMARY KEY (id);
alter table "public"."time_qr_independent_events" add constraint "fixture_constraint_121" CHECK ((action = ANY (ARRAY['CLOCK_IN'::text, 'BREAK_START'::text, 'BREAK_END'::text, 'CLOCK_OUT'::text])));
alter table "public"."time_qr_independent_events" add constraint "fixture_constraint_122" PRIMARY KEY (id);
alter table "public"."time_qr_independent_events" add constraint "fixture_constraint_124" CHECK (((request_id IS NULL) OR (request_id ~ '^[0-9a-f]{64}$'::text)));
alter table "public"."time_qr_independent_breaks" add constraint "fixture_constraint_125" CHECK (((ended_at IS NULL) OR (ended_at > started_at)));
alter table "public"."time_qr_independent_breaks" add constraint "fixture_constraint_126" CHECK (((ordinal >= 1) AND (ordinal <= 10)));
alter table "public"."time_qr_independent_breaks" add constraint "fixture_constraint_127" PRIMARY KEY (id);
alter table "public"."time_qr_independent_breaks" add constraint "fixture_constraint_129" UNIQUE (shift_id, ordinal);
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_130" CHECK (((cost_center IS NULL) OR (((length(TRIM(BOTH FROM cost_center)) >= 1) AND (length(TRIM(BOTH FROM cost_center)) <= 13)) AND (cost_center ~ '^[A-Za-z0-9 ._/-]+$'::text))));
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_131" CHECK ((((source_type = 'WORK_TOTAL'::text) AND (COALESCE(source_key, ''::text) = ''::text)) OR ((source_type = ANY (ARRAY['SHIFT_CODE'::text, 'ABSENCE_TYPE'::text, 'ABSENCE_DAYS'::text, 'NIGHT_WINDOW'::text, 'SUNDAY_WINDOW'::text, 'HOLIDAY_WINDOW'::text])) AND ((length(TRIM(BOTH FROM COALESCE(source_key, ''::text))) >= 1) AND (length(TRIM(BOTH FROM COALESCE(source_key, ''::text))) <= 80)))));
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_132" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 120)));
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_133" CHECK ((source_type = ANY (ARRAY['WORK_TOTAL'::text, 'SHIFT_CODE'::text, 'ABSENCE_TYPE'::text, 'ABSENCE_DAYS'::text, 'NIGHT_WINDOW'::text, 'SUNDAY_WINDOW'::text, 'HOLIDAY_WINDOW'::text])));
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_134" CHECK ((wage_type ~ '^[0-9]{1,4}$'::text));
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_137" PRIMARY KEY (id);
alter table "public"."time_qr_independent_sessions" add constraint "fixture_constraint_141" PRIMARY KEY (token_hash);
alter table "public"."time_qr_independent_login_limits" add constraint "fixture_constraint_143" PRIMARY KEY (key_hash);
alter table "public"."audit_events" add constraint "fixture_constraint_146" PRIMARY KEY (id);
alter table "public"."companies" add constraint "fixture_constraint_148" CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table "public"."companies" add constraint "fixture_constraint_149" PRIMARY KEY (id);
alter table "public"."company_members" add constraint "fixture_constraint_151" PRIMARY KEY (company_id, user_id);
alter table "public"."company_members" add constraint "fixture_constraint_152" CHECK ((role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'DISPATCHER'::text, 'PLANNER'::text, 'VIEWER'::text, 'TIME_TRACKING'::text])));
alter table "public"."company_members" add constraint "fixture_constraint_153" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INVITED'::text, 'DISABLED'::text])));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_155" CHECK ((action = ANY (ARRAY['CREATE'::text, 'UPDATE'::text, 'DELETE'::text])));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_157" CHECK ((base_version >= 0));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_158" CHECK ((((action = 'CREATE'::text) AND (assignment_id IS NULL) AND (proposed_snapshot IS NOT NULL)) OR ((action = 'UPDATE'::text) AND (proposed_snapshot IS NOT NULL) AND ((assignment_id IS NOT NULL) OR (status = ANY (ARRAY['APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])))) OR ((action = 'DELETE'::text) AND ((assignment_id IS NOT NULL) OR (status = ANY (ARRAY['APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text]))))));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_160" UNIQUE (company_id, legacy_id);
alter table "public"."shift_change_requests" add constraint "fixture_constraint_161" CHECK ((compliance_status = ANY (ARRAY['GREEN'::text, 'REVIEW'::text, 'BLOCK'::text])));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_163" PRIMARY KEY (id);
alter table "public"."shift_change_requests" add constraint "fixture_constraint_164" CHECK ((predictable = ANY (ARRAY['NO'::text, 'PARTLY'::text, 'YES'::text, 'UNKNOWN'::text])));
alter table "public"."shift_change_requests" add constraint "fixture_constraint_166" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING_EMPLOYEE'::text, 'PENDING_WORKS_COUNCIL'::text, 'READY_TO_APPLY'::text, 'BLOCKED'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])));
alter table "public"."global_staffing_requirements" add constraint "fixture_constraint_168" PRIMARY KEY (company_id, shift_code);
alter table "public"."global_staffing_requirements" add constraint "fixture_constraint_169" CHECK ((required_count >= 0));
alter table "public"."daily_staffing_overrides" add constraint "fixture_constraint_171" PRIMARY KEY (company_id, work_date, shift_code);
alter table "public"."daily_staffing_overrides" add constraint "fixture_constraint_172" CHECK ((required_count >= 0));
alter table "public"."plan_publications" add constraint "fixture_constraint_174" PRIMARY KEY (company_id, week_start);
alter table "public"."shift_assignments" add constraint "fixture_constraint_176" CHECK ((break_minutes >= 0));
alter table "public"."shift_assignments" add constraint "fixture_constraint_177" CHECK ((ends_at > starts_at));
alter table "public"."shift_assignments" add constraint "fixture_constraint_179" UNIQUE (company_id, legacy_id);
alter table "public"."shift_assignments" add constraint "fixture_constraint_183" PRIMARY KEY (id);
alter table "public"."shift_assignments" add constraint "fixture_constraint_184" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'CANCELLED'::text])));
alter table "public"."shift_assignments" add constraint "fixture_constraint_185" CHECK ((version > 0));
alter table "public"."compliance_check_runs" add constraint "fixture_constraint_188" CHECK ((overall_status = ANY (ARRAY['GREEN'::text, 'REVIEW'::text, 'BLOCK'::text])));
alter table "public"."compliance_check_runs" add constraint "fixture_constraint_189" PRIMARY KEY (id);
alter table "public"."compliance_findings" add constraint "fixture_constraint_193" PRIMARY KEY (id);
alter table "public"."compliance_findings" add constraint "fixture_constraint_194" CHECK ((severity = ANY (ARRAY['INFO'::text, 'WARNING'::text, 'ERROR'::text])));
alter table "public"."compliance_findings" add constraint "fixture_constraint_195" CHECK ((status = ANY (ARRAY['PASS'::text, 'REVIEW'::text, 'BLOCK'::text])));
alter table "public"."legacy_imports" add constraint "fixture_constraint_197" PRIMARY KEY (company_id, user_id, source);
alter table "public"."employees" add constraint "fixture_constraint_199" CHECK ((access_status = ANY (ARRAY['NONE'::text, 'INVITED'::text, 'ACTIVE'::text, 'DISABLED'::text])));
alter table "public"."employees" add constraint "fixture_constraint_200" CHECK (((status <> 'active'::text) OR ((btrim(first_name) <> ''::text) AND (btrim(last_name) <> ''::text) AND (btrim(COALESCE(personnel_no, ''::text)) <> ''::text) AND (btrim(role) <> ''::text) AND (btrim(employment) <> ''::text) AND (btrim(work_time_model) <> ''::text))));
alter table "public"."employees" add constraint "fixture_constraint_203" UNIQUE (company_id, legacy_id);
alter table "public"."employees" add constraint "fixture_constraint_205" PRIMARY KEY (id);
alter table "public"."employees" add constraint "fixture_constraint_206" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
alter table "public"."employees" add constraint "fixture_constraint_207" CHECK ((weekly_hours >= (0)::numeric));
alter table "public"."employees" add constraint "fixture_constraint_208" CHECK ((work_time_model = ANY (ARRAY['STANDARD'::text, 'SHIFT'::text, 'FLEXIBLE'::text, 'ON_CALL'::text])));
alter table "public"."employees" add constraint "fixture_constraint_209" CHECK (((deleted_at IS NULL) OR ((status = 'inactive'::text) AND (auth_user_id IS NULL) AND (access_status = 'DISABLED'::text))));
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_210" CHECK ((approval_type = ANY (ARRAY['EMPLOYEE'::text, 'WORKS_COUNCIL'::text, 'MANAGER'::text, 'COMPLIANCE'::text])));
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_211" UNIQUE (change_request_id, approval_type);
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_215" PRIMARY KEY (id);
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_216" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'NOT_REQUIRED'::text])));
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_218" CHECK ((critical_notice_hours > 0));
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_219" CHECK ((employee_confirmation_under_hours >= 0));
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_220" PRIMARY KEY (company_id);
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_221" CHECK ((short_notice_hours > 0));
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_222" CHECK ((standard_max_shift_hours > (0)::numeric));
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_223" CHECK ((standard_min_rest_hours > (0)::numeric));
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_226" CHECK (((end_window_minutes >= 0) AND (end_window_minutes <= 120)));
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_227" CHECK ((btrim(name) <> ''::text));
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_228" CHECK (((NOT is_active) OR (pilot_mode IS FALSE) OR (pilot_employee_id IS NOT NULL)));
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_230" PRIMARY KEY (id);
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_231" CHECK (((start_window_minutes >= 0) AND (start_window_minutes <= 60)));
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_232" UNIQUE (token_hash);
alter table "public"."time_qr_pilot_employees" add constraint "fixture_constraint_237" PRIMARY KEY (terminal_id, employee_id);
alter table "public"."time_qr_punches" add constraint "fixture_constraint_243" PRIMARY KEY (id);
alter table "public"."time_qr_punches" add constraint "fixture_constraint_244" CHECK ((punch_type = ANY (ARRAY['CLOCK_IN'::text, 'BREAK_START'::text, 'BREAK_END'::text, 'CLOCK_OUT'::text])));
alter table "private"."push_config" add constraint "fixture_constraint_246" CHECK (id);
alter table "private"."push_config" add constraint "fixture_constraint_247" PRIMARY KEY (id);
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_248" CHECK ((approval_mode = ANY (ARRAY['TWO_PERSON'::text, 'SOLE_OWNER_DELAYED'::text])));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_249" CHECK ((attempt_count >= 0));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_250" CHECK ((erase_after >= access_revoke_after));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_251" CHECK ((((status = 'EXECUTING'::text) AND (execution_phase = ANY (ARRAY['ACCESS'::text, 'ERASURE'::text]))) OR ((status <> 'EXECUTING'::text) AND (execution_phase IS NULL))));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_252" CHECK ((length(btrim(reason)) >= 10));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_253" CHECK ((request_kind = ANY (ARRAY['EMPLOYEE_OFFBOARDING'::text, 'COMPANY_OFFBOARDING'::text, 'RETENTION_PURGE'::text])));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_254" UNIQUE (idempotency_key);
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_255" PRIMARY KEY (id);
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_256" CHECK (((approval_mode = 'TWO_PERSON'::text) OR ((request_kind = 'EMPLOYEE_OFFBOARDING'::text) AND (employee_id IS NOT NULL) AND (first_session_fingerprint IS NOT NULL) AND (length(first_session_fingerprint) = 64) AND (preview_hash IS NOT NULL) AND (length(preview_hash) = 64) AND (confirmation_not_before IS NOT NULL) AND (confirmation_expires_at IS NOT NULL) AND (confirmation_not_before >= (requested_at + '24:00:00'::interval)) AND (confirmation_expires_at = (requested_at + '7 days'::interval)) AND (confirmation_expires_at > confirmation_not_before) AND (((confirmed_by IS NULL) AND (confirmed_at IS NULL) AND (confirmed_session_fingerprint IS NULL) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (status = 'PENDING_APPROVAL'::text)) OR ((confirmed_by = requested_by) AND (approved_by = confirmed_by) AND (approved_at = confirmed_at) AND (confirmed_at IS NOT NULL) AND (confirmed_session_fingerprint IS NOT NULL) AND ((confirmed_at >= confirmation_not_before) AND (confirmed_at <= confirmation_expires_at)) AND (length(confirmed_session_fingerprint) = 64) AND (confirmed_session_fingerprint <> first_session_fingerprint))))));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_257" CHECK ((status = ANY (ARRAY['PENDING_APPROVAL'::text, 'APPROVED'::text, 'EXECUTING'::text, 'ACCESS_REVOKED'::text, 'BLOCKED'::text, 'COMPLETED'::text, 'CANCELLED'::text])));
alter table "private"."privacy_lifecycle_requests" add constraint "fixture_constraint_258" CHECK ((((request_kind = 'EMPLOYEE_OFFBOARDING'::text) AND (employee_id IS NOT NULL)) OR (request_kind = ANY (ARRAY['COMPANY_OFFBOARDING'::text, 'RETENTION_PURGE'::text]))));
alter table "private"."push_dispatches" add constraint "fixture_constraint_259" CHECK ((attempts >= 0));
alter table "private"."push_dispatches" add constraint "fixture_constraint_260" CHECK ((delivered_count >= 0));
alter table "private"."push_dispatches" add constraint "fixture_constraint_261" CHECK ((failed_count >= 0));
alter table "private"."push_dispatches" add constraint "fixture_constraint_263" PRIMARY KEY (notification_id);
alter table "private"."push_dispatches" add constraint "fixture_constraint_264" CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'PARTIAL'::text, 'SKIPPED'::text, 'FAILED'::text])));
alter table "public"."push_subscriptions" add constraint "fixture_constraint_265" CHECK (((char_length(auth_key) >= 8) AND (char_length(auth_key) <= 256)));
alter table "public"."push_subscriptions" add constraint "fixture_constraint_266" CHECK ((endpoint ~ '^https://'::text));
alter table "public"."push_subscriptions" add constraint "fixture_constraint_267" UNIQUE (endpoint);
alter table "public"."push_subscriptions" add constraint "fixture_constraint_268" CHECK (((char_length(endpoint) >= 20) AND (char_length(endpoint) <= 4096)));
alter table "public"."push_subscriptions" add constraint "fixture_constraint_269" CHECK (((char_length(p256dh) >= 40) AND (char_length(p256dh) <= 512)));
alter table "public"."push_subscriptions" add constraint "fixture_constraint_270" PRIMARY KEY (id);
alter table "private"."sf_mfa_protected_rpcs" add constraint "fixture_constraint_271" CHECK ((function_name ~ '^[a-z][a-z0-9_]*$'::text));
alter table "private"."sf_mfa_protected_rpcs" add constraint "fixture_constraint_272" PRIMARY KEY (function_name);
alter table "private"."sf_mfa_protected_rpcs" add constraint "fixture_constraint_273" CHECK (((rollout_stage >= 2) AND (rollout_stage <= 5)));
alter table "private"."privacy_legal_holds" add constraint "fixture_constraint_274" CHECK ((category = ANY (ARRAY['ALL'::text, 'EMPLOYMENT'::text, 'TIME'::text, 'ABSENCE'::text, 'PERSONNEL_FILE'::text, 'AUDIT'::text, 'SECURITY_INCIDENT'::text])));
alter table "private"."privacy_legal_holds" add constraint "fixture_constraint_275" CHECK ((length(btrim(reason)) >= 10));
alter table "private"."privacy_legal_holds" add constraint "fixture_constraint_276" CHECK ((((status = 'ACTIVE'::text) AND (released_by IS NULL) AND (released_at IS NULL)) OR ((status = 'RELEASED'::text) AND (released_by IS NOT NULL) AND (released_at IS NOT NULL))));
alter table "private"."privacy_legal_holds" add constraint "fixture_constraint_277" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'RELEASED'::text])));
alter table "private"."privacy_legal_holds" add constraint "fixture_constraint_278" PRIMARY KEY (id);
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_279" CHECK ((((status = 'DRAFT'::text) AND (approved_by IS NULL) AND (approved_at IS NULL) AND ((approval_mode = 'TWO_PERSON'::text) OR ((approval_mode = 'SOLE_OWNER_DELAYED'::text) AND (COALESCE(length(btrim(approval_reference)), 0) >= 10) AND (rules_hash IS NOT NULL) AND (length(rules_hash) = 64) AND (first_session_fingerprint IS NOT NULL) AND (length(first_session_fingerprint) = 64) AND (confirmation_not_before IS NOT NULL) AND (confirmation_expires_at IS NOT NULL) AND (confirmation_not_before >= (created_at + '24:00:00'::interval)) AND (confirmation_expires_at = (created_at + '7 days'::interval)) AND (confirmed_session_fingerprint IS NULL)))) OR ((status = 'APPROVED'::text) AND (approved_by IS NOT NULL) AND (approved_at IS NOT NULL) AND (((approval_mode = 'TWO_PERSON'::text) AND (approved_by <> created_by)) OR ((approval_mode = 'SOLE_OWNER_DELAYED'::text) AND (approved_by = created_by) AND (COALESCE(length(btrim(approval_reference)), 0) >= 10) AND (rules_hash IS NOT NULL) AND (length(rules_hash) = 64) AND (first_session_fingerprint IS NOT NULL) AND (length(first_session_fingerprint) = 64) AND (confirmed_session_fingerprint IS NOT NULL) AND (length(confirmed_session_fingerprint) = 64) AND (confirmation_not_before IS NOT NULL) AND (confirmation_expires_at IS NOT NULL) AND (confirmed_session_fingerprint <> first_session_fingerprint) AND ((approved_at >= confirmation_not_before) AND (approved_at <= confirmation_expires_at))) OR ((approval_mode = 'CONTROLLED_MIGRATION'::text) AND (version = 2) AND (approved_by = created_by) AND (approval_reference = 'SF-RETENTION-V2-2026-09-18: einmalige kontrollierte Sofortkorrektur nach ausdruecklicher Betreiberfreigabe'::text) AND (rules_hash IS NOT NULL) AND (length(rules_hash) = 64) AND (first_session_fingerprint IS NULL) AND (confirmed_session_fingerprint IS NULL) AND (confirmation_not_before IS NULL) AND (confirmation_expires_at IS NULL) AND (approved_at = created_at) AND (((rules ->> 'timeEvidenceYears'::text))::integer = 6) AND (((rules ->> 'monthSnapshotYears'::text))::integer = 6) AND (((rules ->> 'datevAuditYears'::text))::integer = 6) AND (((rules ->> 'deletePersonnelDocuments'::text))::boolean = false) AND (((rules ->> 'deleteAuthAccount'::text))::boolean = false)))) OR ((status = 'REVOKED'::text) AND (revoked_at IS NOT NULL))));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_280" CHECK ((approval_mode = ANY (ARRAY['TWO_PERSON'::text, 'SOLE_OWNER_DELAYED'::text, 'CONTROLLED_MIGRATION'::text])));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_281" CHECK ((jsonb_typeof(rules) = 'object'::text));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_282" CHECK (((jsonb_typeof(rules) = 'object'::text) AND (rules ? 'contactDays'::text) AND (COALESCE((rules ->> 'contactDays'::text), ''::text) ~ '^\d{1,4}$'::text) AND ((((rules ->> 'contactDays'::text))::integer >= 0) AND (((rules ->> 'contactDays'::text))::integer <= 3650)) AND (rules ? 'planningYears'::text) AND (COALESCE((rules ->> 'planningYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'planningYears'::text))::integer >= 1) AND (((rules ->> 'planningYears'::text))::integer <= 20)) AND (rules ? 'absenceYears'::text) AND (COALESCE((rules ->> 'absenceYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'absenceYears'::text))::integer >= 1) AND (((rules ->> 'absenceYears'::text))::integer <= 20)) AND (rules ? 'timeEvidenceYears'::text) AND (COALESCE((rules ->> 'timeEvidenceYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'timeEvidenceYears'::text))::integer >= 2) AND (((rules ->> 'timeEvidenceYears'::text))::integer <= 20)) AND (rules ? 'personnelYears'::text) AND (COALESCE((rules ->> 'personnelYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'personnelYears'::text))::integer >= 1) AND (((rules ->> 'personnelYears'::text))::integer <= 20)) AND (rules ? 'auditYears'::text) AND (COALESCE((rules ->> 'auditYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'auditYears'::text))::integer >= 1) AND (((rules ->> 'auditYears'::text))::integer <= 20)) AND (rules ? 'monthSnapshotYears'::text) AND (COALESCE((rules ->> 'monthSnapshotYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'monthSnapshotYears'::text))::integer >= 1) AND (((rules ->> 'monthSnapshotYears'::text))::integer <= 20)) AND (rules ? 'datevAuditYears'::text) AND (COALESCE((rules ->> 'datevAuditYears'::text), ''::text) ~ '^\d{1,2}$'::text) AND ((((rules ->> 'datevAuditYears'::text))::integer >= 1) AND (((rules ->> 'datevAuditYears'::text))::integer <= 20)) AND (rules ? 'deletePersonnelDocuments'::text) AND (jsonb_typeof((rules -> 'deletePersonnelDocuments'::text)) = 'boolean'::text) AND (rules ? 'deleteAuthAccount'::text) AND (jsonb_typeof((rules -> 'deleteAuthAccount'::text)) = 'boolean'::text)));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_283" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'REVOKED'::text])));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_284" CHECK ((version > 0));
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_285" UNIQUE (company_id, version);
alter table "private"."privacy_retention_profiles" add constraint "fixture_constraint_286" PRIMARY KEY (id);
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_287" CHECK ((audit_eligible >= 0));
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_288" CHECK ((audit_redacted >= 0));
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_289" CHECK ((month_snapshot_eligible >= 0));
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_290" CHECK ((month_snapshot_redacted >= 0));
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_291" PRIMARY KEY (id);
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_293" CHECK ((status = ANY (ARRAY['RUNNING'::text, 'NOOP'::text, 'COMPLETED'::text, 'BLOCKED_LEGAL_HOLD'::text])));
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_295" CHECK (((ended_at IS NULL) OR (ended_at > started_at)));
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_298" PRIMARY KEY (id);
alter table "public"."company_planning_teams" add constraint "fixture_constraint_300" CHECK (((start_offset >= 0) AND (start_offset < cardinality(pattern))));
alter table "public"."company_planning_teams" add constraint "fixture_constraint_302" UNIQUE (company_id, team_code);
alter table "public"."company_planning_teams" add constraint "fixture_constraint_303" CHECK (((array_ndims(pattern) = 1) AND (array_lower(pattern, 1) = 1) AND ((cardinality(pattern) >= 1) AND (cardinality(pattern) <= 365)) AND (array_position(pattern, NULL::text) IS NULL)));
alter table "public"."company_planning_teams" add constraint "fixture_constraint_304" PRIMARY KEY (id);
alter table "public"."company_planning_teams" add constraint "fixture_constraint_305" CHECK ((team_code = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text])));
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_307" CHECK ((ends_at > starts_at));
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_310" PRIMARY KEY (id);
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_311" CHECK ((remaining_count >= 0));
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_312" CHECK ((status = ANY (ARRAY['MARKET_OPEN'::text, 'FILLED'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])));
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_317" PRIMARY KEY (id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_320" CHECK ((status = ANY (ARRAY['PENDING_MANAGER'::text, 'APPLIED'::text, 'REJECTED_MANAGER'::text, 'CANCELLED'::text, 'SUPERSEDED'::text])));
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_321" CHECK ((category = ANY (ARRAY['personal'::text, 'contact'::text, 'employment'::text, 'planning'::text, 'qualifications'::text, 'other'::text])));
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_322" CHECK ((((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((status <> 'pending'::text) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND ((length(btrim(review_note)) >= 5) AND (length(btrim(review_note)) <= 2000)))));
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_326" CHECK (((length(btrim(message)) >= 5) AND (length(btrim(message)) <= 2000)));
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_327" PRIMARY KEY (id);
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_329" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'rejected'::text])));
alter table "public"."shift_templates" add constraint "fixture_constraint_330" UNIQUE (company_id, code);
alter table "public"."shift_templates" add constraint "fixture_constraint_332" CHECK ((((coverage_group IS NULL) AND (coverage_required = 0)) OR ((coverage_group IS NOT NULL) AND ((length(btrim(coverage_group)) >= 1) AND (length(btrim(coverage_group)) <= 80)) AND ((coverage_required >= 1) AND (coverage_required <= 99)) AND (planning_mode = 'required'::text))));
alter table "public"."shift_templates" add constraint "fixture_constraint_333" CHECK (((NOT responsible_only) OR (planning_mode <> 'optional'::text) OR (optional_staffing <= 1)));
alter table "public"."shift_templates" add constraint "fixture_constraint_334" CHECK (((NOT exclusive_employees) OR ((cardinality(allowed_personnel_nos) > 0) AND (allowed_personnel_nos IS NOT NULL))));
alter table "public"."shift_templates" add constraint "fixture_constraint_335" CHECK (((morning_ot_switch_min >= 1) AND (morning_ot_switch_min <= 99)));
alter table "public"."shift_templates" add constraint "fixture_constraint_336" CHECK ((((cardinality(optional_weekdays) >= 1) AND (cardinality(optional_weekdays) <= 7)) AND (optional_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7])));
alter table "public"."shift_templates" add constraint "fixture_constraint_337" CHECK (((optional_staffing >= 0) AND (optional_staffing <= 99)));
alter table "public"."shift_templates" add constraint "fixture_constraint_338" CHECK (((planning_mode <> 'optional'::text) OR (optional_staffing > 0)));
alter table "public"."shift_templates" add constraint "fixture_constraint_339" PRIMARY KEY (id);
alter table "public"."shift_templates" add constraint "fixture_constraint_340" CHECK ((planning_mode = ANY (ARRAY['required'::text, 'optional'::text])));
alter table "public"."shift_templates" add constraint "fixture_constraint_342" CHECK (((rhythm_alias IS NULL) OR (requires_planning_team AND ((length(rhythm_alias) >= 1) AND (length(rhythm_alias) <= 20)))));
alter table "public"."employee_access_invites" add constraint "fixture_constraint_0" FOREIGN KEY (claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."employee_access_invites" add constraint "fixture_constraint_2" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_access_invites" add constraint "fixture_constraint_3" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."employee_access_invites" add constraint "fixture_constraint_4" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_details" add constraint "fixture_constraint_7" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_details" add constraint "fixture_constraint_8" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_qualifications" add constraint "fixture_constraint_11" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_qualifications" add constraint "fixture_constraint_12" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_documents" add constraint "fixture_constraint_15" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_documents" add constraint "fixture_constraint_16" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_notes" add constraint "fixture_constraint_20" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_personnel_notes" add constraint "fixture_constraint_21" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."absences" add constraint "fixture_constraint_24" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."absences" add constraint "fixture_constraint_26" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."notifications" add constraint "fixture_constraint_28" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."notifications" add constraint "fixture_constraint_29" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
alter table "public"."notifications" add constraint "fixture_constraint_31" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_33" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE SET NULL;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_35" FOREIGN KEY (change_request_id) REFERENCES shift_change_requests(id) ON DELETE SET NULL;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_37" FOREIGN KEY (colleague_decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_38" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_39" FOREIGN KEY (manager_decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_40" FOREIGN KEY (original_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_42" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_swap_requests" add constraint "fixture_constraint_44" FOREIGN KEY (target_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."time_entries" add constraint "fixture_constraint_45" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE CASCADE;
alter table "public"."time_entries" add constraint "fixture_constraint_49" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_entries" add constraint "fixture_constraint_50" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_entries" add constraint "fixture_constraint_51" FOREIGN KEY (correction_requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_entries" add constraint "fixture_constraint_55" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_account_settings" add constraint "fixture_constraint_60" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_account_settings" add constraint "fixture_constraint_64" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."employee_time_account_openings" add constraint "fixture_constraint_66" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employee_time_account_openings" add constraint "fixture_constraint_67" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."employee_time_account_openings" add constraint "fixture_constraint_69" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_month_closures" add constraint "fixture_constraint_71" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_77" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE CASCADE;
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_78" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_assignment_confirmations" add constraint "fixture_constraint_79" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."disruption_incidents" add constraint "fixture_constraint_83" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE CASCADE;
alter table "public"."disruption_incidents" add constraint "fixture_constraint_85" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."disruption_incidents" add constraint "fixture_constraint_86" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "public"."disruption_incidents" add constraint "fixture_constraint_89" FOREIGN KEY (original_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."disruption_incidents" add constraint "fixture_constraint_91" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
alter table "public"."disruption_offers" add constraint "fixture_constraint_93" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."disruption_offers" add constraint "fixture_constraint_95" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."disruption_offers" add constraint "fixture_constraint_97" FOREIGN KEY (incident_id) REFERENCES disruption_incidents(id) ON DELETE CASCADE;
alter table "public"."disruption_offers" add constraint "fixture_constraint_98" FOREIGN KEY (offered_by) REFERENCES auth.users(id);
alter table "public"."datev_lodas_settings" add constraint "fixture_constraint_103" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."datev_lodas_settings" add constraint "fixture_constraint_105" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."company_member_invites" add constraint "fixture_constraint_106" FOREIGN KEY (claimed_by) REFERENCES auth.users(id);
alter table "public"."company_member_invites" add constraint "fixture_constraint_108" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."company_member_invites" add constraint "fixture_constraint_109" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "public"."time_account_openings" add constraint "fixture_constraint_114" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
alter table "public"."time_qr_independent_shifts" add constraint "fixture_constraint_117" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_independent_shifts" add constraint "fixture_constraint_118" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."time_qr_independent_shifts" add constraint "fixture_constraint_120" FOREIGN KEY (terminal_id) REFERENCES time_qr_terminals(id) ON DELETE RESTRICT;
alter table "public"."time_qr_independent_events" add constraint "fixture_constraint_123" FOREIGN KEY (shift_id) REFERENCES time_qr_independent_shifts(id) ON DELETE CASCADE;
alter table "public"."time_qr_independent_breaks" add constraint "fixture_constraint_128" FOREIGN KEY (shift_id) REFERENCES time_qr_independent_shifts(id) ON DELETE CASCADE;
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_135" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_136" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."datev_lodas_rules" add constraint "fixture_constraint_138" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_qr_independent_sessions" add constraint "fixture_constraint_139" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_independent_sessions" add constraint "fixture_constraint_140" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."time_qr_independent_sessions" add constraint "fixture_constraint_142" FOREIGN KEY (terminal_id) REFERENCES time_qr_terminals(id) ON DELETE CASCADE;
alter table "public"."audit_events" add constraint "fixture_constraint_144" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."audit_events" add constraint "fixture_constraint_145" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."companies" add constraint "fixture_constraint_147" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "public"."company_members" add constraint "fixture_constraint_150" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."company_members" add constraint "fixture_constraint_154" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."shift_change_requests" add constraint "fixture_constraint_156" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE RESTRICT;
alter table "public"."shift_change_requests" add constraint "fixture_constraint_159" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_change_requests" add constraint "fixture_constraint_162" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."shift_change_requests" add constraint "fixture_constraint_165" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."global_staffing_requirements" add constraint "fixture_constraint_167" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."daily_staffing_overrides" add constraint "fixture_constraint_170" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."plan_publications" add constraint "fixture_constraint_173" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."plan_publications" add constraint "fixture_constraint_175" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_assignments" add constraint "fixture_constraint_178" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_assignments" add constraint "fixture_constraint_180" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_assignments" add constraint "fixture_constraint_181" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."shift_assignments" add constraint "fixture_constraint_182" FOREIGN KEY (last_change_request_id) REFERENCES shift_change_requests(id) ON DELETE SET NULL;
alter table "public"."compliance_check_runs" add constraint "fixture_constraint_186" FOREIGN KEY (change_request_id) REFERENCES shift_change_requests(id) ON DELETE CASCADE;
alter table "public"."compliance_check_runs" add constraint "fixture_constraint_187" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."compliance_findings" add constraint "fixture_constraint_190" FOREIGN KEY (change_request_id) REFERENCES shift_change_requests(id) ON DELETE CASCADE;
alter table "public"."compliance_findings" add constraint "fixture_constraint_191" FOREIGN KEY (check_run_id) REFERENCES compliance_check_runs(id) ON DELETE CASCADE;
alter table "public"."compliance_findings" add constraint "fixture_constraint_192" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."legacy_imports" add constraint "fixture_constraint_196" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."legacy_imports" add constraint "fixture_constraint_198" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."employees" add constraint "fixture_constraint_201" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."employees" add constraint "fixture_constraint_202" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."employees" add constraint "fixture_constraint_204" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_212" FOREIGN KEY (change_request_id) REFERENCES shift_change_requests(id) ON DELETE CASCADE;
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_213" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_change_approvals" add constraint "fixture_constraint_214" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."company_compliance_policy" add constraint "fixture_constraint_217" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_224" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_225" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_229" FOREIGN KEY (pilot_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
alter table "public"."time_qr_terminals" add constraint "fixture_constraint_233" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_qr_pilot_employees" add constraint "fixture_constraint_234" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_pilot_employees" add constraint "fixture_constraint_235" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_qr_pilot_employees" add constraint "fixture_constraint_236" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "public"."time_qr_pilot_employees" add constraint "fixture_constraint_238" FOREIGN KEY (terminal_id) REFERENCES time_qr_terminals(id) ON DELETE CASCADE;
alter table "public"."time_qr_punches" add constraint "fixture_constraint_239" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE RESTRICT;
alter table "public"."time_qr_punches" add constraint "fixture_constraint_240" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."time_qr_punches" add constraint "fixture_constraint_241" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_punches" add constraint "fixture_constraint_242" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."time_qr_punches" add constraint "fixture_constraint_245" FOREIGN KEY (terminal_id) REFERENCES time_qr_terminals(id) ON DELETE RESTRICT;
alter table "private"."push_dispatches" add constraint "fixture_constraint_262" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
alter table "private"."privacy_redaction_runs" add constraint "fixture_constraint_292" FOREIGN KEY (retention_profile_id) REFERENCES private.privacy_retention_profiles(id) ON DELETE SET NULL;
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_294" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id) ON DELETE RESTRICT;
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_296" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_297" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
alter table "public"."time_qr_breaks" add constraint "fixture_constraint_299" FOREIGN KEY (terminal_id) REFERENCES time_qr_terminals(id) ON DELETE RESTRICT;
alter table "public"."company_planning_teams" add constraint "fixture_constraint_301" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."company_planning_teams" add constraint "fixture_constraint_306" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_308" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."open_shift_market_offers" add constraint "fixture_constraint_309" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_313" FOREIGN KEY (assignment_id) REFERENCES shift_assignments(id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_314" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_315" FOREIGN KEY (employee_id) REFERENCES employees(id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_316" FOREIGN KEY (offer_id) REFERENCES open_shift_market_offers(id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_318" FOREIGN KEY (requested_by) REFERENCES auth.users(id);
alter table "public"."open_shift_market_claims" add constraint "fixture_constraint_319" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_323" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_324" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_325" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
alter table "private"."employee_profile_requests" add constraint "fixture_constraint_328" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table "public"."shift_templates" add constraint "fixture_constraint_331" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."shift_templates" add constraint "fixture_constraint_341" FOREIGN KEY (responsible_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION private.opening_affects_closed_month(p_company_id uuid, p_effective_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.status='CLOSED'
      and (c.month_start + interval '1 month - 1 day')::date >= p_effective_date
  );
$function$;

CREATE OR REPLACE FUNCTION private.sf_is_manager(p_company_id uuid, p_admin_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id=p_company_id
      and cm.user_id=(select auth.uid())
      and cm.status='ACTIVE'
      and (
        cm.role in ('OWNER','ADMIN')
        or (not p_admin_only and cm.role in ('DISPATCHER','PLANNER'))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.sf_is_time_month_closed(p_company_id uuid, p_day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id
      and c.month_start=date_trunc('month',p_day)::date
      and c.status='CLOSED'
  );
$function$;

CREATE OR REPLACE FUNCTION private.time_month_is_closed(p_company_id uuid, p_work_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id
      and c.month_start=date_trunc('month',p_work_date)::date
      and c.status='CLOSED'
  );
$function$;

CREATE OR REPLACE FUNCTION private.time_month_overlap_closed(p_company_id uuid, p_start date, p_end date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.status='CLOSED'
      and c.month_start <= p_end
      and (c.month_start + interval '1 month - 1 day')::date >= p_start
  );
$function$;

CREATE OR REPLACE FUNCTION private.sf_guard_absence_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_start date; v_end date;
begin
  if tg_op in ('UPDATE','DELETE') and exists (
    select 1 from public.time_month_closures c where c.company_id=old.company_id and c.status='CLOSED'
      and c.month_start<=old.end_date and (c.month_start+interval '1 month')::date>old.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op in ('INSERT','UPDATE') and exists (
    select 1 from public.time_month_closures c where c.company_id=new.company_id and c.status='CLOSED'
      and c.month_start<=new.end_date and (c.month_start+interval '1 month')::date>new.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_absence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if tg_op in ('UPDATE','DELETE') and private.time_month_overlap_closed(old.company_id,old.start_date,old.end_date) then
    raise exception 'Abwesenheit berührt einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.time_month_overlap_closed(new.company_id,new.start_date,new.end_date) then
    raise exception 'Für einen abgeschlossenen Monat können keine Abwesenheiten mehr angelegt oder geändert werden.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_company_id uuid := coalesce((v_new->>'company_id')::uuid, (v_old->>'company_id')::uuid);
  v_entity_id uuid := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_actor_role text;
begin
  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'ACTIVE';

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role,
    old_values, new_values, metadata
  ) values (
    v_company_id,
    upper(tg_op || '_' || tg_table_name),
    tg_table_name,
    v_entity_id,
    auth.uid(),
    coalesce(v_actor_role, 'SYSTEM'),
    v_old,
    v_new,
    jsonb_build_object('schema', tg_table_schema, 'backendCaptured', true)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE row_data public.time_entries%rowtype; work_day date; tz text;
BEGIN
 IF TG_OP='DELETE' THEN row_data:=old; ELSE row_data:=new; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=row_data.company_id;
 work_day:=coalesce((row_data.actual_start AT TIME ZONE tz)::date,
  (SELECT (a.starts_at AT TIME ZONE tz)::date FROM public.shift_assignments a WHERE a.id=row_data.assignment_id));
 IF private.sf_is_time_month_closed(row_data.company_id,work_day) THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF row_data.actual_end IS NULL THEN
   IF row_data.status<>'open' THEN RAISE EXCEPTION 'Ein fehlendes Ende ist nur fuer eine laufende Zeitbuchung zulaessig'; END IF;
  ELSE
   PERFORM private.sf_validate_time_values(row_data.actual_start,row_data.actual_end,row_data.break_minutes);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_assignment_id uuid := coalesce(new.assignment_id,old.assignment_id);
  v_company_id uuid := coalesce(new.company_id,old.company_id);
  v_work_date date;
begin
  select (timezone('Europe/Berlin',sa.starts_at))::date into v_work_date
  from public.shift_assignments sa where sa.id=v_assignment_id;
  if v_work_date is not null and private.time_month_is_closed(v_company_id,v_work_date) then
    raise exception 'Monat % ist abgeschlossen. Ist-Zeiten sind gesperrt.',to_char(v_work_date,'MM/YYYY');
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_account_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_company uuid:=coalesce(new.company_id,old.company_id);
begin
  if exists(select 1 from public.time_month_closures c where c.company_id=v_company and c.status='CLOSED') then
    raise exception 'Stundenkonto-Einstellungen sind gesperrt, solange abgeschlossene Monate existieren. Öffne den betroffenen Monatsabschluss zuerst wieder.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_account_opening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if tg_op in ('UPDATE','DELETE') and private.opening_affects_closed_month(old.company_id,old.effective_date) then
    raise exception 'Der Startsaldo beeinflusst einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.opening_affects_closed_month(new.company_id,new.effective_date) then
    raise exception 'Der Startsaldo würde einen abgeschlossenen Monat beeinflussen. Öffne den Monatsabschluss zuerst wieder.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='UPDATE'
     and current_setting('schichtfunk.privacy_redaction',true)='on' then
    perform private.sf_assert_service_role();

    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.event_type is distinct from old.event_type
       or new.entity_type is distinct from old.entity_type
       or new.created_at is distinct from old.created_at then
      raise exception 'Audit redaction may not change immutable event identity';
    end if;

    if new.entity_id is not null
       or new.actor_id is not null
       or new.actor_role is not null
       or new.old_values is not null
       or new.new_values is not null
       or coalesce(new.metadata->>'privacy_redacted','false') <> 'true'
       or (new.metadata - 'privacy_redacted' - 'redacted_at' - 'retention_profile_id' - 'redaction_run_id') <> '{}'::jsonb then
      raise exception 'Audit redaction shape rejected';
    end if;

    return new;
  end if;

  raise exception 'Audit-Protokolle sind unveraenderbar';
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_guard_shift_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE tz text;
BEGIN
 IF TG_OP IN('UPDATE','DELETE') THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=old.company_id;
  IF private.sf_is_time_month_closed(old.company_id,(old.starts_at AT TIME ZONE tz)::date)
  THEN RAISE EXCEPTION 'Der Monat der bisherigen Schicht ist abgeschlossen'; END IF;
 END IF;
 IF TG_OP IN('INSERT','UPDATE') THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=new.company_id;
  IF private.sf_is_time_month_closed(new.company_id,(new.starts_at AT TIME ZONE tz)::date)
  THEN RAISE EXCEPTION 'Der Monat der Schicht ist abgeschlossen'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.protect_published_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Ausschließlich der streng geschützte administrative Komplett-Reset darf
  -- veröffentlichte Schichten physisch entfernen. Normale Browser-/RLS-Pfade
  -- können dieses transaktionslokale Flag nicht setzen.
  if current_setting('app.schichtfunk_full_plan_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Confirmed profile removal may cancel only this employee's future duties.
  if tg_op='UPDATE' and new.status='CANCELLED' and old.starts_at>=now()
     and current_setting('app.schichtfunk_employee_removal',true)=old.employee_id::text
     and exists(select 1 from public.company_members where company_id=old.company_id and user_id=auth.uid()
       and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER'))
     and new.company_id=old.company_id and new.employee_id=old.employee_id and new.shift_code=old.shift_code
     and new.starts_at=old.starts_at and new.ends_at=old.ends_at and new.break_minutes=old.break_minutes
     and new.note is not distinct from old.note then return new; end if;

  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then
      raise exception 'Published assignments are append/change-request controlled and cannot be deleted directly';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.status='PUBLISHED' then
    if new.employee_id is not distinct from old.employee_id
       and new.shift_code is not distinct from old.shift_code
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.break_minutes is not distinct from old.break_minutes
       and new.note is not distinct from old.note
       and new.status is not distinct from old.status then
      return new;
    end if;
    if new.last_change_request_id is null or not exists(
      select 1 from public.shift_change_requests r
      where r.id=new.last_change_request_id
        and r.company_id=old.company_id
        and r.assignment_id=old.id
        and r.status='READY_TO_APPLY'
        and ((r.action='UPDATE' and new.status='PUBLISHED') or (r.action='DELETE' and new.status='CANCELLED'))
    ) then
      raise exception 'Published assignment changes require a READY_TO_APPLY change request';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.sf_notify_assignment_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_user uuid; v_tz text; v_local text;
begin
  if new.status='PUBLISHED' and new.published_at is not null
     and (tg_op='INSERT' or old.status is distinct from 'PUBLISHED' or old.published_at is null) then
    select e.auth_user_id into v_user from public.employees e where e.id=new.employee_id;
    select coalesce(c.timezone,'Europe/Berlin') into v_tz from public.companies c where c.id=new.company_id;
    v_local := to_char(new.starts_at at time zone coalesce(v_tz,'Europe/Berlin'),'DD.MM.YYYY HH24:MI');
    perform private.sf_put_notification(
      new.company_id,v_user,new.employee_id,'SCHEDULE_PUBLISHED','Dienstplan aktualisiert',
      'Dein veröffentlichter Dienstplan wurde aktualisiert. Nächste neue Information: '||new.shift_code||' · '||v_local||'.',
      'employee-shifts','company',new.company_id,
      jsonb_build_object('assignmentId',new.id,'shiftCode',new.shift_code,'startsAt',new.starts_at,'endsAt',new.ends_at)
    );
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_old_date date;
  v_new_date date;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_old_date := (timezone('Europe/Berlin',old.starts_at))::date;
    if private.time_month_is_closed(old.company_id,v_old_date) then
      raise exception 'Monat % ist abgeschlossen. Dienstplanänderungen sind gesperrt.',to_char(v_old_date,'MM/YYYY');
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_date := (timezone('Europe/Berlin',new.starts_at))::date;
    if private.time_month_is_closed(new.company_id,v_new_date) then
      raise exception 'Monat % ist abgeschlossen. Dienstplanänderungen sind gesperrt.',to_char(v_new_date,'MM/YYYY');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_removed_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN('postgres','service_role','supabase_admin') THEN RETURN new; END IF;
  IF old.deleted_at IS NOT NULL AND new.deleted_at IS DISTINCT FROM old.deleted_at THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ein gelöschtes Mitarbeiterprofil kann nicht erneut aktiviert werden.'; END IF;
  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL AND
    current_setting('app.schichtfunk_employee_removal',true) IS DISTINCT FROM old.id::text THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Bitte die gesonderte Löschbestätigung verwenden.'; END IF;
  RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin new.updated_at=now(); return new; end $function$;

CREATE TRIGGER absences_closed_month_guard BEFORE INSERT OR DELETE OR UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION private.sf_guard_absence_write();
CREATE TRIGGER trg_absences_closed_month BEFORE INSERT OR DELETE OR UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_absence();
CREATE TRIGGER sf_audit_time_entries AFTER INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION private.capture_audit_change();
CREATE TRIGGER time_entries_closed_month_guard BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION private.sf_guard_time_entry_write();
CREATE TRIGGER trg_time_entries_closed_month BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_time_entry();
CREATE TRIGGER trg_time_account_settings_closed_month BEFORE INSERT OR DELETE OR UPDATE ON public.time_account_settings FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_time_account_settings();
CREATE TRIGGER trg_time_account_openings_closed_month BEFORE INSERT OR DELETE OR UPDATE ON public.employee_time_account_openings FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_time_account_opening();
CREATE TRIGGER audit_events_no_update BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER shift_assignments_closed_month_guard BEFORE INSERT OR DELETE OR UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION private.sf_guard_shift_write();
CREATE TRIGGER shift_assignments_published_guard BEFORE DELETE OR UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION protect_published_assignment();
CREATE TRIGGER trg_sf_notify_assignment_published AFTER INSERT OR UPDATE OF status, published_at ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION private.sf_notify_assignment_published();
CREATE TRIGGER trg_shift_assignments_closed_month BEFORE INSERT OR DELETE OR UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_assignment();
CREATE TRIGGER employees_confirm_removal BEFORE UPDATE OF deleted_at ON public.employees FOR EACH ROW EXECUTE FUNCTION guard_removed_employee();
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sf_audit_employees AFTER INSERT OR DELETE OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION private.capture_audit_change();
grant usage on schema public,private,auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
grant execute on all functions in schema auth to authenticated,service_role;
