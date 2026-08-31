-- SchichtFunk – Einsatzbereitschafts-Ampel V1
-- Mitarbeiter bestaetigen ausschliesslich ihre eigenen, veroeffentlichten Schichten.

create table if not exists public.shift_assignment_confirmations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.shift_assignments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status text not null check (status in ('CONFIRMED', 'ISSUE_REPORTED')),
  note text not null default '' check (char_length(note) <= 1000),
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, employee_id)
);

create index if not exists shift_assignment_confirmations_company_idx
  on public.shift_assignment_confirmations (company_id, status);
create index if not exists shift_assignment_confirmations_employee_idx
  on public.shift_assignment_confirmations (employee_id, assignment_id);

alter table public.shift_assignment_confirmations enable row level security;

revoke all on table public.shift_assignment_confirmations from public, anon, authenticated;
grant select, insert, update on table public.shift_assignment_confirmations to authenticated;

drop policy if exists shift_confirmation_select on public.shift_assignment_confirmations;
create policy shift_confirmation_select
on public.shift_assignment_confirmations
for select
to authenticated
using (
  employee_id in (
    select e.id from public.employees e
    where e.auth_user_id = (select auth.uid())
  )
  or company_id in (
    select cm.company_id from public.company_members cm
    where cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
      and cm.role in ('OWNER', 'ADMIN', 'DISPATCHER', 'PLANNER')
  )
);

drop policy if exists shift_confirmation_insert_own on public.shift_assignment_confirmations;
create policy shift_confirmation_insert_own
on public.shift_assignment_confirmations
for insert
to authenticated
with check (
  employee_id in (
    select e.id from public.employees e
    where e.auth_user_id = (select auth.uid())
      and e.company_id = shift_assignment_confirmations.company_id
      and e.status = 'active'
  )
  and exists (
    select 1 from public.shift_assignments sa
    where sa.id = shift_assignment_confirmations.assignment_id
      and sa.company_id = shift_assignment_confirmations.company_id
      and sa.employee_id = shift_assignment_confirmations.employee_id
      and sa.status = 'PUBLISHED'
      and sa.published_at is not null
  )
);

drop policy if exists shift_confirmation_update_own on public.shift_assignment_confirmations;
create policy shift_confirmation_update_own
on public.shift_assignment_confirmations
for update
to authenticated
using (
  employee_id in (
    select e.id from public.employees e
    where e.auth_user_id = (select auth.uid())
      and e.company_id = shift_assignment_confirmations.company_id
      and e.status = 'active'
  )
)
with check (
  employee_id in (
    select e.id from public.employees e
    where e.auth_user_id = (select auth.uid())
      and e.company_id = shift_assignment_confirmations.company_id
      and e.status = 'active'
  )
  and exists (
    select 1 from public.shift_assignments sa
    where sa.id = shift_assignment_confirmations.assignment_id
      and sa.company_id = shift_assignment_confirmations.company_id
      and sa.employee_id = shift_assignment_confirmations.employee_id
      and sa.status = 'PUBLISHED'
      and sa.published_at is not null
  )
);

