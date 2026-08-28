-- SchichtFunk / ShiftPilot – Server-side Compliance schema (PostgreSQL/Supabase-ready)
-- Version 2, 2026-08-28
-- IMPORTANT: The current web app still uses LocalStorage. This migration is the backend target
-- for the next phase. Wire company/user membership and RLS policies before production use.

create extension if not exists pgcrypto;

create table if not exists company_compliance_policy (
  company_id uuid primary key,
  short_notice_hours integer not null default 48 check (short_notice_hours > 0),
  critical_notice_hours integer not null default 24 check (critical_notice_hours > 0),
  employee_confirmation_under_hours integer not null default 24 check (employee_confirmation_under_hours >= 0),
  standard_min_rest_hours numeric(5,2) not null default 11 check (standard_min_rest_hours > 0),
  standard_max_shift_hours numeric(5,2) not null default 10 check (standard_max_shift_hours > 0),
  works_council_enabled boolean not null default false,
  require_reason_for_published_change boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  shift_type_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  note text not null default '',
  status text not null default 'PUBLISHED' check (status in ('DRAFT','PUBLISHED','CANCELLED')),
  published_at timestamptz,
  version integer not null default 1 check (version > 0),
  last_change_request_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists shift_assignments_employee_time_idx on shift_assignments(company_id, employee_id, starts_at, ends_at);
create index if not exists shift_assignments_company_time_idx on shift_assignments(company_id, starts_at);

create table if not exists shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  assignment_id uuid references shift_assignments(id) on delete restrict,
  action text not null check (action in ('CREATE','UPDATE','DELETE')),
  employee_id uuid not null,
  base_version integer not null default 0 check (base_version >= 0),
  old_snapshot jsonb,
  proposed_snapshot jsonb,
  reason_code text not null,
  reason_text text not null default '',
  predictable text not null default 'UNKNOWN' check (predictable in ('NO','PARTLY','YES','UNKNOWN')),
  notice_minutes integer,
  compliance_status text not null check (compliance_status in ('GREEN','REVIEW','BLOCK')),
  status text not null check (status in ('DRAFT','PENDING_EMPLOYEE','PENDING_WORKS_COUNCIL','READY_TO_APPLY','BLOCKED','APPLIED','REJECTED','CANCELLED','SUPERSEDED')),
  requires_employee_approval boolean not null default false,
  requires_works_council boolean not null default false,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  applied_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (action = 'CREATE' and assignment_id is null and proposed_snapshot is not null)
    or (action = 'UPDATE' and assignment_id is not null and proposed_snapshot is not null)
    or (action = 'DELETE' and assignment_id is not null)
  )
);
create index if not exists shift_change_requests_company_status_idx on shift_change_requests(company_id, status, requested_at desc);
create index if not exists shift_change_requests_assignment_idx on shift_change_requests(assignment_id, requested_at desc);

alter table shift_assignments
  drop constraint if exists shift_assignments_last_change_request_fk;
alter table shift_assignments
  add constraint shift_assignments_last_change_request_fk
  foreign key (last_change_request_id) references shift_change_requests(id) on delete set null;

create table if not exists compliance_check_runs (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references shift_change_requests(id) on delete cascade,
  rule_engine_version text not null,
  overall_status text not null check (overall_status in ('GREEN','REVIEW','BLOCK')),
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);
create index if not exists compliance_check_runs_change_idx on compliance_check_runs(change_request_id, completed_at desc);

create table if not exists compliance_findings (
  id uuid primary key default gen_random_uuid(),
  check_run_id uuid not null references compliance_check_runs(id) on delete cascade,
  change_request_id uuid not null references shift_change_requests(id) on delete cascade,
  rule_code text not null,
  status text not null check (status in ('PASS','REVIEW','BLOCK')),
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','ERROR')),
  actual_value text,
  required_value text,
  legal_basis text,
  message text not null,
  rule_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists compliance_findings_change_idx on compliance_findings(change_request_id, status);

create table if not exists shift_change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references shift_change_requests(id) on delete cascade,
  approval_type text not null check (approval_type in ('EMPLOYEE','WORKS_COUNCIL','MANAGER','COMPLIANCE')),
  required boolean not null default true,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','NOT_REQUIRED')),
  decided_by uuid,
  decided_at timestamptz,
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique(change_request_id, approval_type)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid,
  actor_role text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_company_created_idx on audit_events(company_id, created_at desc);
create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id, created_at desc);

create or replace function prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

drop trigger if exists audit_events_no_update on audit_events;
create trigger audit_events_no_update before update or delete on audit_events
for each row execute function prevent_audit_mutation();

-- Standard safety gate. It intentionally blocks the standard >10h / <11h cases.
-- A future legally-reviewed exception module should be explicit rather than bypassing this function.
create or replace function assert_standard_shift_rules(
  p_company_id uuid,
  p_employee_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_assignment_id uuid default null
) returns void
language plpgsql
as $$
declare
  v_min_rest numeric(5,2) := 11;
  v_max_shift numeric(5,2) := 10;
  v_prev_end timestamptz;
  v_next_start timestamptz;
  v_duration numeric;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'Invalid shift interval';
  end if;

  select standard_min_rest_hours, standard_max_shift_hours
    into v_min_rest, v_max_shift
  from company_compliance_policy
  where company_id = p_company_id;

  v_min_rest := coalesce(v_min_rest, 11);
  v_max_shift := coalesce(v_max_shift, 10);
  v_duration := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;

  if v_duration > v_max_shift then
    raise exception 'Standard maximum shift duration exceeded: % h > % h', round(v_duration,2), v_max_shift;
  end if;

  if exists (
    select 1 from shift_assignments s
    where s.company_id = p_company_id
      and s.employee_id = p_employee_id
      and s.status <> 'CANCELLED'
      and (p_ignore_assignment_id is null or s.id <> p_ignore_assignment_id)
      and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'Shift overlaps another assignment';
  end if;

  select max(s.ends_at) into v_prev_end
  from shift_assignments s
  where s.company_id = p_company_id
    and s.employee_id = p_employee_id
    and s.status <> 'CANCELLED'
    and (p_ignore_assignment_id is null or s.id <> p_ignore_assignment_id)
    and s.ends_at <= p_starts_at;

  if v_prev_end is not null and extract(epoch from (p_starts_at - v_prev_end))/3600.0 < v_min_rest then
    raise exception 'Standard minimum rest period not met before shift';
  end if;

  select min(s.starts_at) into v_next_start
  from shift_assignments s
  where s.company_id = p_company_id
    and s.employee_id = p_employee_id
    and s.status <> 'CANCELLED'
    and (p_ignore_assignment_id is null or s.id <> p_ignore_assignment_id)
    and s.starts_at >= p_ends_at;

  if v_next_start is not null and extract(epoch from (v_next_start - p_ends_at))/3600.0 < v_min_rest then
    raise exception 'Standard minimum rest period not met after shift';
  end if;
end;
$$;

create or replace function apply_shift_change(p_change_id uuid, p_actor_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_change_requests%rowtype;
  a shift_assignments%rowtype;
  v_id uuid;
  v_employee uuid;
  v_type text;
  v_start timestamptz;
  v_end timestamptz;
  v_break integer;
  v_note text;
begin
  select * into r from shift_change_requests where id = p_change_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if r.status <> 'READY_TO_APPLY' then raise exception 'Change request is not READY_TO_APPLY'; end if;
  if r.compliance_status = 'BLOCK' then raise exception 'Blocked compliance request cannot be applied'; end if;

  if r.requires_employee_approval and not exists (
    select 1 from shift_change_approvals x where x.change_request_id=r.id and x.approval_type='EMPLOYEE' and x.status='APPROVED'
  ) then raise exception 'Employee approval missing'; end if;

  if r.requires_works_council and not exists (
    select 1 from shift_change_approvals x where x.change_request_id=r.id and x.approval_type='WORKS_COUNCIL' and x.status='APPROVED'
  ) then raise exception 'Works council approval missing'; end if;

  if exists (
    select 1 from compliance_findings f where f.change_request_id=r.id and f.status='BLOCK'
  ) then raise exception 'Blocking compliance finding exists'; end if;

  if r.action in ('UPDATE','DELETE') then
    select * into a from shift_assignments where id=r.assignment_id for update;
    if not found then
      update shift_change_requests set status='SUPERSEDED' where id=r.id;
      raise exception 'Original assignment no longer exists';
    end if;
    if a.version <> r.base_version then
      update shift_change_requests set status='SUPERSEDED' where id=r.id;
      raise exception 'Assignment version changed; request is superseded';
    end if;
  end if;

  if r.action in ('CREATE','UPDATE') then
    v_employee := (r.proposed_snapshot->>'employeeId')::uuid;
    v_type := r.proposed_snapshot->>'type';
    v_start := (r.proposed_snapshot->>'startsAt')::timestamptz;
    v_end := (r.proposed_snapshot->>'endsAt')::timestamptz;
    v_break := coalesce((r.proposed_snapshot->>'breakMinutes')::integer,0);
    v_note := coalesce(r.proposed_snapshot->>'note','');
    perform assert_standard_shift_rules(r.company_id,v_employee,v_start,v_end,case when r.action='UPDATE' then r.assignment_id else null end);
  end if;

  if r.action='UPDATE' then
    update shift_assignments set
      employee_id=v_employee,shift_type_id=v_type,starts_at=v_start,ends_at=v_end,
      break_minutes=v_break,note=v_note,version=version+1,last_change_request_id=r.id,updated_at=now()
    where id=r.assignment_id returning id into v_id;
  elsif r.action='CREATE' then
    insert into shift_assignments(company_id,employee_id,shift_type_id,starts_at,ends_at,break_minutes,note,status,published_at,version,last_change_request_id,created_by)
    values(r.company_id,v_employee,v_type,v_start,v_end,v_break,v_note,'PUBLISHED',now(),1,r.id,p_actor_id)
    returning id into v_id;
  else
    v_id := r.assignment_id;
    update shift_assignments set status='CANCELLED',version=version+1,last_change_request_id=r.id,updated_at=now() where id=r.assignment_id;
  end if;

  update shift_change_requests set status='APPLIED',applied_at=now() where id=r.id;
  insert into audit_events(company_id,event_type,entity_type,entity_id,actor_id,old_values,new_values,metadata)
  values(r.company_id,'SHIFT_CHANGE_APPLIED','shift_change_request',r.id,p_actor_id,r.old_snapshot,r.proposed_snapshot,jsonb_build_object('assignment_id',v_id,'action',r.action));
  return v_id;
end;
$$;

-- RLS intentionally requires the project's real company-membership/auth model.
-- Enable these when that model exists, then add tenant policies for company_id.
-- alter table shift_assignments enable row level security;
-- alter table shift_change_requests enable row level security;
-- alter table compliance_check_runs enable row level security;
-- alter table compliance_findings enable row level security;
-- alter table shift_change_approvals enable row level security;
-- alter table audit_events enable row level security;
-- alter table company_compliance_policy enable row level security;
