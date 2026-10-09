-- Isolated PostgreSQL fixture: no production data, no external services.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private; create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',aud text,role text,created_at timestamptz,updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
grant usage on schema public,private,auth to authenticated;
grant execute on all functions in schema auth to authenticated;
create table public.audit_events(id uuid default gen_random_uuid(),
company_id uuid,
event_type text,
entity_type text,
entity_id uuid,
actor_id uuid,
actor_role text,
old_values jsonb,
new_values jsonb,
metadata jsonb,
created_at timestamp with time zone default now());
create table public.companies(id uuid default gen_random_uuid(),
name text,
timezone text,
created_by uuid,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone);
create table public.company_member_invites(id uuid default gen_random_uuid(),
company_id uuid,
email text,
role text,
token_hash text,
status text,
expires_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone default now(),
claimed_by uuid,
claimed_at timestamp with time zone);
create table public.company_members(company_id uuid,
user_id uuid,
role text,
status text,
created_at timestamp with time zone default now());
create table public.employee_access_invites(id uuid default gen_random_uuid(),
company_id uuid,
employee_id uuid,
email text,
token_hash text,
expires_at timestamp with time zone,
claimed_at timestamp with time zone,
claimed_by uuid,
created_by uuid,
created_at timestamp with time zone default now());
create table public.employees(id uuid default gen_random_uuid(),
company_id uuid,
legacy_id text,
first_name text,
last_name text,
personnel_no text,
role text,
employment text,
weekly_hours numeric(6,2),
start_date date,
contract_end date,
birth_date date,
status text,
email text,
phone text,
address text,
zip text,
city text,
shift_permissions text[],
qualifications text[],
work_time_model text,
note text,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone,
auth_user_id uuid,
access_status text,
access_linked_at timestamp with time zone,
deleted_at timestamp with time zone,
deleted_by uuid);
create table public.plan_publications(company_id uuid,
week_start date,
published_at timestamp with time zone,
published_by uuid);
create table public.shift_assignments(id uuid default gen_random_uuid(),
company_id uuid,
employee_id uuid,
legacy_id text,
shift_code text,
starts_at timestamp with time zone,
ends_at timestamp with time zone,
break_minutes integer,
note text,
status text,
published_at timestamp with time zone,
version integer default 1,
last_change_request_id uuid,
created_by uuid,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone);
create table public.shift_templates(id uuid default gen_random_uuid(),
company_id uuid,
code text,
name text,
default_start time without time zone,
default_end time without time zone,
css_class text,
active boolean,
sort_order integer,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone,
planning_mode text,
optional_staffing integer,
responsible_employee_id uuid,
responsible_only boolean,
optional_weekdays integer[],
coverage_group text,
coverage_required integer,
morning_ot_switch_min integer,
allowed_personnel_nos text[],
exclusive_employees boolean,
requires_planning_team boolean,
strict_weekdays boolean,
strict_times boolean,
rhythm_alias text);
create table public.time_entries(assignment_id uuid,
company_id uuid,
actual_start timestamp with time zone,
actual_end timestamp with time zone,
break_minutes integer,
status text,
updated_by uuid,
updated_at timestamp with time zone,
employee_note text,
manager_note text,
source text,
submitted_at timestamp with time zone,
confirmed_by uuid,
confirmed_at timestamp with time zone,
correction_requested_by uuid,
correction_requested_at timestamp with time zone,
correction_note text,
created_at timestamp with time zone default now(),
version integer default 1);
create table public.time_month_closures(company_id uuid,
month_start date,
status text,
revision integer,
closed_at timestamp with time zone,
closed_by uuid,
close_note text,
reopened_at timestamp with time zone,
reopened_by uuid,
reopen_note text,
report_snapshot jsonb,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone);
create table public.time_qr_independent_breaks(id uuid default gen_random_uuid(),
shift_id uuid,
ordinal smallint,
started_at timestamp with time zone,
ended_at timestamp with time zone);
create table public.time_qr_independent_shifts(id uuid default gen_random_uuid(),
company_id uuid,
employee_id uuid,
terminal_id uuid,
started_at timestamp with time zone,
ended_at timestamp with time zone,
created_at timestamp with time zone default clock_timestamp());

alter table public.companies add primary key(id);
alter table public.company_members add primary key(company_id,user_id);
alter table public.company_member_invites add primary key(id);
alter table public.company_member_invites add unique(company_id,email);
alter table public.employees add primary key(id);
alter table public.employee_access_invites add primary key(id);
alter table public.employee_access_invites add unique(company_id,employee_id);
alter table public.shift_assignments add primary key(id);
alter table public.time_entries add primary key(assignment_id);
alter table public.shift_templates add unique(company_id,code);
alter table public.plan_publications add primary key(company_id,week_start);
alter table public.employees enable row level security;
create policy existing_employee_reads on public.employees for select to authenticated using(exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=auth.uid() and cm.status='ACTIVE'));
grant select on public.employees to authenticated;
grant select on public.company_members to authenticated;
alter table public.company_members enable row level security;
create policy existing_member_reads on public.company_members for select to authenticated using(user_id=auth.uid());
create function private.sf_is_manager(c uuid,admin_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and (role in ('OWNER','ADMIN') or not admin_only and role in ('PLANNER','DISPATCHER')))$$;
create function private.can_manage_company_users(c uuid) returns boolean language sql stable security definer set search_path='' as $$select private.sf_is_manager(c,true)$$;
-- Existing month-closure/privacy guards are independently tested in their suites.
create function private.sf_erasure_row_allowed(c uuid,r jsonb) returns boolean language sql stable as $$select false$$;
create function private.sf_is_time_month_closed(c uuid,d date) returns boolean language sql stable as $$select false$$;
create function private.sf_assert_aal2(p_action text default 'sensitive_action') returns void language plpgsql stable set search_path='' as $$begin if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' or auth.role()<>'authenticated' then raise exception 'MFA_REQUIRED'; end if; end$$;
create function private.sf_validate_time_values(s timestamptz,e timestamptz,b integer) returns void language plpgsql stable set search_path='' as $$begin if s is null or e is null or e<=s or e>clock_timestamp()+interval '5 seconds' or b<0 or b>=extract(epoch from(e-s))/60 then raise exception 'Ungültige Ist-Zeit'; end if; end$$;

