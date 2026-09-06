create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'Europe/Berlin',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'OWNER' check (role in ('OWNER','ADMIN','PLANNER','VIEWER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INVITED','DISABLED')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  default_start time not null,
  default_end time not null,
  css_class text not null default 'teal',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table public.global_staffing_requirements (
  company_id uuid not null references public.companies(id) on delete cascade,
  shift_code text not null,
  required_count integer not null default 0 check (required_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(company_id, shift_code)
);

create table public.daily_staffing_overrides (
  company_id uuid not null references public.companies(id) on delete cascade,
  work_date date not null,
  shift_code text not null,
  required_count integer not null check (required_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(company_id, work_date, shift_code)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_id text,
  first_name text not null,
  last_name text not null,
  personnel_no text,
  role text not null default 'Sicherheitsmitarbeiter',
  employment text not null default 'Vollzeit',
  weekly_hours numeric(6,2) not null default 40 check (weekly_hours >= 0),
  start_date date,
  contract_end date,
  birth_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  email text,
  phone text,
  address text,
  zip text,
  city text,
  shift_permissions text[] not null default '{}',
  qualifications text[] not null default '{}',
  work_time_model text not null default 'SHIFT' check (work_time_model in ('STANDARD','SHIFT','FLEXIBLE','ON_CALL')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, legacy_id)
);
create unique index employees_personnel_no_uq on public.employees(company_id, lower(personnel_no)) where personnel_no is not null and personnel_no <> '';
create index employees_company_status_idx on public.employees(company_id,status,last_name,first_name);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  legacy_id text,
  start_date date not null,
  end_date date not null,
  absence_type text not null,
  status text not null default 'Genehmigt',
  full_day boolean not null default true,
  start_time time,
  end_time time,
  time_note text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date >= start_date),
  unique(company_id, legacy_id)
);
create index absences_employee_dates_idx on public.absences(company_id,employee_id,start_date,end_date);

create table public.plan_publications (
  company_id uuid not null references public.companies(id) on delete cascade,
  week_start date not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  primary key(company_id,week_start)
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  legacy_id text,
  shift_code text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  note text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CANCELLED')),
  published_at timestamptz,
  version integer not null default 1 check (version > 0),
  last_change_request_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at > starts_at),
  unique(company_id,legacy_id)
);
create index shift_assignments_employee_time_idx on public.shift_assignments(company_id,employee_id,starts_at,ends_at);
create index shift_assignments_company_time_idx on public.shift_assignments(company_id,starts_at);

create table public.time_entries (
  assignment_id uuid primary key references public.shift_assignments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actual_start timestamptz,
  actual_end timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  status text not null default 'open' check(status in ('open','recorded','confirmed')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check(actual_end is null or actual_start is null or actual_end > actual_start)
);

create table public.company_compliance_policy (
  company_id uuid primary key references public.companies(id) on delete cascade,
  short_notice_hours integer not null default 48 check(short_notice_hours > 0),
  critical_notice_hours integer not null default 24 check(critical_notice_hours > 0),
  employee_confirmation_under_hours integer not null default 24 check(employee_confirmation_under_hours >= 0),
  standard_min_rest_hours numeric(5,2) not null default 11 check(standard_min_rest_hours > 0),
  standard_max_shift_hours numeric(5,2) not null default 10 check(standard_max_shift_hours > 0),
  works_council_enabled boolean not null default false,
  require_reason_for_published_change boolean not null default true,
  sector text not null default 'security',
  updated_at timestamptz not null default now()
);

create table public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid references public.shift_assignments(id) on delete restrict,
  legacy_id text,
  action text not null check(action in ('CREATE','UPDATE','DELETE')),
  employee_id uuid references public.employees(id) on delete restrict,
  base_version integer not null default 0 check(base_version >= 0),
  old_snapshot jsonb,
  proposed_snapshot jsonb,
  reason_code text not null,
  reason_text text not null default '',
  predictable text not null default 'UNKNOWN' check(predictable in ('NO','PARTLY','YES','UNKNOWN')),
  notice_minutes integer,
  compliance_status text not null check(compliance_status in ('GREEN','REVIEW','BLOCK')),
  status text not null check(status in ('DRAFT','PENDING_EMPLOYEE','PENDING_WORKS_COUNCIL','READY_TO_APPLY','BLOCKED','APPLIED','REJECTED','CANCELLED','SUPERSEDED')),
  requires_employee_approval boolean not null default false,
  requires_works_council boolean not null default false,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  applied_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id,legacy_id),
  check((action='CREATE' and assignment_id is null and proposed_snapshot is not null) or (action='UPDATE' and assignment_id is not null and proposed_snapshot is not null) or (action='DELETE' and assignment_id is not null))
);
create index shift_change_requests_company_status_idx on public.shift_change_requests(company_id,status,requested_at desc);
create index shift_change_requests_assignment_idx on public.shift_change_requests(assignment_id,requested_at desc);

alter table public.shift_assignments add constraint shift_assignments_last_change_request_fk foreign key(last_change_request_id) references public.shift_change_requests(id) on delete set null;

create table public.compliance_check_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  change_request_id uuid not null references public.shift_change_requests(id) on delete cascade,
  rule_engine_version text not null,
  overall_status text not null check(overall_status in ('GREEN','REVIEW','BLOCK')),
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create table public.compliance_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  check_run_id uuid not null references public.compliance_check_runs(id) on delete cascade,
  change_request_id uuid not null references public.shift_change_requests(id) on delete cascade,
  rule_code text not null,
  status text not null check(status in ('PASS','REVIEW','BLOCK')),
  severity text not null default 'INFO' check(severity in ('INFO','WARNING','ERROR')),
  actual_value text,
  required_value text,
  legal_basis text,
  message text not null,
  rule_version text not null,
  created_at timestamptz not null default now()
);

create table public.shift_change_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  change_request_id uuid not null references public.shift_change_requests(id) on delete cascade,
  approval_type text not null check(approval_type in ('EMPLOYEE','WORKS_COUNCIL','MANAGER','COMPLIANCE')),
  required boolean not null default true,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','NOT_REQUIRED')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique(change_request_id,approval_type)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_company_created_idx on public.audit_events(company_id,created_at desc);
create index audit_events_entity_idx on public.audit_events(entity_type,entity_id,created_at desc);

create table public.legacy_imports (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'localstorage_v1',
  imported_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb,
  primary key(company_id,user_id,source)
);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin new.updated_at=now(); return new; end $$;
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger shift_templates_updated_at before update on public.shift_templates for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger absences_updated_at before update on public.absences for each row execute function public.set_updated_at();
create trigger shift_assignments_updated_at before update on public.shift_assignments for each row execute function public.set_updated_at();
create trigger company_compliance_policy_updated_at before update on public.company_compliance_policy for each row execute function public.set_updated_at();

create or replace function public.prevent_audit_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_no_update before update or delete on public.audit_events for each row execute function public.prevent_audit_mutation();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.shift_templates enable row level security;
alter table public.global_staffing_requirements enable row level security;
alter table public.daily_staffing_overrides enable row level security;
alter table public.employees enable row level security;
alter table public.absences enable row level security;
alter table public.plan_publications enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.company_compliance_policy enable row level security;
alter table public.shift_change_requests enable row level security;
alter table public.compliance_check_runs enable row level security;
alter table public.compliance_findings enable row level security;
alter table public.shift_change_approvals enable row level security;
alter table public.audit_events enable row level security;
alter table public.legacy_imports enable row level security;

create policy companies_select on public.companies for select to authenticated using (created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy companies_insert on public.companies for insert to authenticated with check (created_by=(select auth.uid()));
create policy companies_update on public.companies for update to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));

create policy company_members_select on public.company_members for select to authenticated using (user_id=(select auth.uid()));
create policy company_members_insert on public.company_members for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.created_by=(select auth.uid())));
create policy company_members_update on public.company_members for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create policy shift_templates_select on public.shift_templates for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy shift_templates_write on public.shift_templates for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','PLANNER'))) with check (exists(select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','PLANNER')));

create policy global_staff_select on public.global_staffing_requirements for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy global_staff_write on public.global_staffing_requirements for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy daily_staff_select on public.daily_staffing_overrides for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy daily_staff_write on public.daily_staffing_overrides for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy employees_select on public.employees for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy employees_write on public.employees for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy absences_select on public.absences for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy absences_write on public.absences for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy publications_select on public.plan_publications for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy publications_write on public.plan_publications for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy assignments_select on public.shift_assignments for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy assignments_write on public.shift_assignments for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy time_entries_select on public.time_entries for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy time_entries_write on public.time_entries for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy compliance_policy_select on public.company_compliance_policy for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=company_compliance_policy.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy compliance_policy_write on public.company_compliance_policy for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=company_compliance_policy.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=company_compliance_policy.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN') and cm.status='ACTIVE'));

create policy change_requests_select on public.shift_change_requests for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy change_requests_write on public.shift_change_requests for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy check_runs_select on public.compliance_check_runs for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=compliance_check_runs.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy check_runs_write on public.compliance_check_runs for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=compliance_check_runs.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=compliance_check_runs.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy findings_select on public.compliance_findings for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=compliance_findings.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy findings_write on public.compliance_findings for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=compliance_findings.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=compliance_findings.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy approvals_select on public.shift_change_approvals for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy approvals_write on public.shift_change_approvals for all to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE')) with check (exists(select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role in ('OWNER','ADMIN','PLANNER') and cm.status='ACTIVE'));

create policy audit_select on public.audit_events for select to authenticated using (exists(select 1 from public.company_members cm where cm.company_id=audit_events.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy audit_insert on public.audit_events for insert to authenticated with check (actor_id=(select auth.uid()) and exists(select 1 from public.company_members cm where cm.company_id=audit_events.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));

create policy imports_select on public.legacy_imports for select to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.company_members cm where cm.company_id=legacy_imports.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));
create policy imports_insert on public.legacy_imports for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.company_members cm where cm.company_id=legacy_imports.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'));

revoke all on all tables in schema public from anon;
grant select,insert,update,delete on public.companies,public.company_members,public.shift_templates,public.global_staffing_requirements,public.daily_staffing_overrides,public.employees,public.absences,public.plan_publications,public.shift_assignments,public.time_entries,public.company_compliance_policy,public.shift_change_requests,public.compliance_check_runs,public.compliance_findings,public.shift_change_approvals to authenticated;
grant select,insert on public.audit_events,public.legacy_imports to authenticated;

create or replace function public.bootstrap_company(p_name text default 'SchichtFunk') returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_company uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.company_members where user_id=v_user and status='ACTIVE') then
    select company_id into v_company from public.company_members where user_id=v_user and status='ACTIVE' order by created_at limit 1;
    return v_company;
  end if;
  insert into public.companies(name,created_by) values(coalesce(nullif(trim(p_name),''),'SchichtFunk'),v_user) returning id into v_company;
  insert into public.company_members(company_id,user_id,role,status) values(v_company,v_user,'OWNER','ACTIVE');
  insert into public.shift_templates(company_id,code,name,default_start,default_end,css_class,sort_order) values
    (v_company,'O1','O1','07:00','15:00','violet',1),(v_company,'O2','O2','15:00','23:00','blue',2),(v_company,'Teamleiter','Teamleiter','08:00','16:00','amber',3),(v_company,'O3','O3','23:00','07:00','pink',4),(v_company,'OT1','OT1','10:00','18:00','teal',5),(v_company,'OT2','OT2','12:00','20:00','cyan',6),(v_company,'OT','OT','18:00','02:00','violet',7);
  insert into public.global_staffing_requirements(company_id,shift_code,required_count) values
    (v_company,'O1',3),(v_company,'O2',2),(v_company,'Teamleiter',2),(v_company,'O3',2),(v_company,'OT1',1),(v_company,'OT2',2),(v_company,'OT',3);
  insert into public.company_compliance_policy(company_id) values(v_company);
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values) values(v_company,'COMPANY_BOOTSTRAPPED','company',v_company,v_user,'OWNER',jsonb_build_object('name',p_name));
  return v_company;
end $$;
revoke all on function public.bootstrap_company(text) from public,anon;
grant execute on function public.bootstrap_company(text) to authenticated;

create or replace function public.assert_standard_shift_rules(p_company_id uuid,p_employee_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_ignore_assignment_id uuid default null) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_min_rest numeric(5,2):=11; v_max_shift numeric(5,2):=10; v_prev_end timestamptz; v_next_start timestamptz; v_duration numeric;
begin
  if p_ends_at<=p_starts_at then raise exception 'Invalid shift interval'; end if;
  select standard_min_rest_hours,standard_max_shift_hours into v_min_rest,v_max_shift from public.company_compliance_policy where company_id=p_company_id;
  v_min_rest:=coalesce(v_min_rest,11); v_max_shift:=coalesce(v_max_shift,10); v_duration:=extract(epoch from(p_ends_at-p_starts_at))/3600.0;
  if v_duration>v_max_shift then raise exception 'Standard maximum shift duration exceeded'; end if;
  if exists(select 1 from public.shift_assignments s where s.company_id=p_company_id and s.employee_id=p_employee_id and s.status<>'CANCELLED' and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id) and tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'Shift overlaps another assignment'; end if;
  select max(s.ends_at) into v_prev_end from public.shift_assignments s where s.company_id=p_company_id and s.employee_id=p_employee_id and s.status<>'CANCELLED' and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id) and s.ends_at<=p_starts_at;
  if v_prev_end is not null and extract(epoch from(p_starts_at-v_prev_end))/3600.0<v_min_rest then raise exception 'Standard minimum rest period not met before shift'; end if;
  select min(s.starts_at) into v_next_start from public.shift_assignments s where s.company_id=p_company_id and s.employee_id=p_employee_id and s.status<>'CANCELLED' and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id) and s.starts_at>=p_ends_at;
  if v_next_start is not null and extract(epoch from(v_next_start-p_ends_at))/3600.0<v_min_rest then raise exception 'Standard minimum rest period not met after shift'; end if;
end $$;
revoke all on function public.assert_standard_shift_rules(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.assert_standard_shift_rules(uuid,uuid,timestamptz,timestamptz,uuid) to authenticated;

create or replace function public.apply_shift_change(p_change_id uuid) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.shift_change_requests%rowtype; a public.shift_assignments%rowtype; v_id uuid; v_employee uuid; v_type text; v_start timestamptz; v_end timestamptz; v_break integer; v_note text; v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into r from public.shift_change_requests where id=p_change_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if not exists(select 1 from public.company_members cm where cm.company_id=r.company_id and cm.user_id=v_actor and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','PLANNER')) then raise exception 'Not authorized'; end if;
  if r.status<>'READY_TO_APPLY' then raise exception 'Change request is not READY_TO_APPLY'; end if;
  if r.compliance_status='BLOCK' then raise exception 'Blocked compliance request cannot be applied'; end if;
  if r.requires_employee_approval and not exists(select 1 from public.shift_change_approvals x where x.change_request_id=r.id and x.approval_type='EMPLOYEE' and x.status='APPROVED') then raise exception 'Employee approval missing'; end if;
  if r.requires_works_council and not exists(select 1 from public.shift_change_approvals x where x.change_request_id=r.id and x.approval_type='WORKS_COUNCIL' and x.status='APPROVED') then raise exception 'Works council approval missing'; end if;
  if exists(select 1 from public.compliance_findings f where f.change_request_id=r.id and f.status='BLOCK') then raise exception 'Blocking compliance finding exists'; end if;
  if r.action in ('UPDATE','DELETE') then
    select * into a from public.shift_assignments where id=r.assignment_id for update;
    if not found then update public.shift_change_requests set status='SUPERSEDED' where id=r.id; raise exception 'Original assignment no longer exists'; end if;
    if a.version<>r.base_version then update public.shift_change_requests set status='SUPERSEDED' where id=r.id; raise exception 'Assignment version changed'; end if;
  end if;
  if r.action in ('CREATE','UPDATE') then
    v_employee:=(r.proposed_snapshot->>'employeeId')::uuid; v_type:=r.proposed_snapshot->>'type'; v_start:=(r.proposed_snapshot->>'startsAt')::timestamptz; v_end:=(r.proposed_snapshot->>'endsAt')::timestamptz; v_break:=coalesce((r.proposed_snapshot->>'breakMinutes')::integer,0); v_note:=coalesce(r.proposed_snapshot->>'note','');
    perform public.assert_standard_shift_rules(r.company_id,v_employee,v_start,v_end,case when r.action='UPDATE' then r.assignment_id else null end);
  end if;
  if r.action='UPDATE' then update public.shift_assignments set employee_id=v_employee,shift_code=v_type,starts_at=v_start,ends_at=v_end,break_minutes=v_break,note=v_note,version=version+1,last_change_request_id=r.id where id=r.assignment_id returning id into v_id;
  elsif r.action='CREATE' then insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,status,published_at,version,last_change_request_id,created_by) values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,'PUBLISHED',now(),1,r.id,v_actor) returning id into v_id;
  else v_id:=r.assignment_id; update public.shift_assignments set status='CANCELLED',version=version+1,last_change_request_id=r.id where id=r.assignment_id;
  end if;
  update public.shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) values(r.company_id,'SHIFT_CHANGE_APPLIED','shift_change_request',r.id,v_actor,'PLANNER',r.old_snapshot,r.proposed_snapshot,jsonb_build_object('assignment_id',v_id,'action',r.action));
  return v_id;
end $$;
revoke all on function public.apply_shift_change(uuid) from public,anon;
grant execute on function public.apply_shift_change(uuid) to authenticated;;
