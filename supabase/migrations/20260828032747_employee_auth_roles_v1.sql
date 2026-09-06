-- SchichtFunk: Rollenmodell + echter Mitarbeiterzugang V1

alter table public.company_members
  drop constraint if exists company_members_role_check;

alter table public.company_members
  add constraint company_members_role_check
  check (role = any (array['OWNER','ADMIN','DISPATCHER','PLANNER','VIEWER']::text[]));

alter table public.employees
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists access_status text not null default 'NONE',
  add column if not exists access_linked_at timestamptz;

alter table public.employees
  drop constraint if exists employees_access_status_check;
alter table public.employees
  add constraint employees_access_status_check
  check (access_status = any (array['NONE','INVITED','ACTIVE','DISABLED']::text[]));

create unique index if not exists employees_auth_user_id_uidx
  on public.employees(auth_user_id)
  where auth_user_id is not null;

create table if not exists public.employee_access_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint employee_access_invites_company_employee_unique unique(company_id, employee_id)
);

alter table public.employee_access_invites enable row level security;
grant select, insert, update, delete on public.employee_access_invites to authenticated;

create index if not exists employee_access_invites_company_idx on public.employee_access_invites(company_id);
create index if not exists employee_access_invites_employee_idx on public.employee_access_invites(employee_id);
create index if not exists employee_access_invites_expiry_idx on public.employee_access_invites(expires_at) where claimed_at is null;

create policy employee_access_invites_select on public.employee_access_invites
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=employee_access_invites.company_id
    and cm.user_id=(select auth.uid())
    and cm.status='ACTIVE'
    and cm.role=any(array['OWNER','ADMIN','DISPATCHER','PLANNER']::text[])
));

create policy employee_access_invites_insert on public.employee_access_invites
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id=employee_access_invites.company_id
      and cm.user_id=(select auth.uid())
      and cm.status='ACTIVE'
      and cm.role=any(array['OWNER','ADMIN','DISPATCHER','PLANNER']::text[])
  )
  and exists (
    select 1 from public.employees e
    where e.id=employee_access_invites.employee_id
      and e.company_id=employee_access_invites.company_id
  )
);

create policy employee_access_invites_update on public.employee_access_invites
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=employee_access_invites.company_id
    and cm.user_id=(select auth.uid())
    and cm.status='ACTIVE'
    and cm.role=any(array['OWNER','ADMIN','DISPATCHER','PLANNER']::text[])
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=employee_access_invites.company_id
    and cm.user_id=(select auth.uid())
    and cm.status='ACTIVE'
    and cm.role=any(array['OWNER','ADMIN','DISPATCHER','PLANNER']::text[])
));

create policy employee_access_invites_delete on public.employee_access_invites
for delete to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=employee_access_invites.company_id
    and cm.user_id=(select auth.uid())
    and cm.status='ACTIVE'
    and cm.role=any(array['OWNER','ADMIN','DISPATCHER','PLANNER']::text[])
));

-- Mitarbeiter dürfen nur ihren eigenen Stammdatensatz lesen.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
for select to authenticated
using (
  auth_user_id=(select auth.uid())
  or exists (
    select 1 from public.company_members cm
    where cm.company_id=employees.company_id
      and cm.user_id=(select auth.uid())
      and cm.status='ACTIVE'
  )
);

-- Eigene Schichten, Abwesenheiten, Änderungsanträge und Zeiterfassung sind lesbar.
drop policy if exists assignments_select on public.shift_assignments;
create policy assignments_select on public.shift_assignments
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=shift_assignments.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id=shift_assignments.employee_id
      and e.auth_user_id=(select auth.uid())
  )
);

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=absences.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id=absences.employee_id
      and e.auth_user_id=(select auth.uid())
  )
);

drop policy if exists change_requests_select on public.shift_change_requests;
create policy change_requests_select on public.shift_change_requests
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=shift_change_requests.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id=shift_change_requests.employee_id
      and e.auth_user_id=(select auth.uid())
  )
);

drop policy if exists approvals_select on public.shift_change_approvals;
create policy approvals_select on public.shift_change_approvals
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=shift_change_approvals.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1
    from public.shift_change_requests cr
    join public.employees e on e.id=cr.employee_id
    where cr.id=shift_change_approvals.change_request_id
      and e.auth_user_id=(select auth.uid())
  )
);

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=time_entries.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1
    from public.shift_assignments sa
    join public.employees e on e.id=sa.employee_id
    where sa.id=time_entries.assignment_id
      and e.auth_user_id=(select auth.uid())
  )
);

-- Mitarbeiter dürfen die Basisdaten ihrer eigenen Firma und die eigenen Schichtbezeichnungen sehen.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select to authenticated
using (
  created_by=(select auth.uid())
  or exists (
    select 1 from public.company_members cm
    where cm.company_id=companies.id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id=companies.id and e.auth_user_id=(select auth.uid())
  )
);

drop policy if exists shift_templates_select on public.shift_templates;
create policy shift_templates_select on public.shift_templates
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id=shift_templates.company_id and e.auth_user_id=(select auth.uid())
  )
);

-- DISPATCHER erhält die bisherigen Planer-Schreibrechte.
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=employees.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

-- Invite-Token wird nur beim Erstellen des Auth-Kontos verarbeitet.
create or replace function private.handle_schichtfunk_employee_signup()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text;
  v_hash text;
  v_inv public.employee_access_invites%rowtype;
  v_emp public.employees%rowtype;
begin
  v_token := nullif(new.raw_user_meta_data->>'sf_employee_invite','');
  if v_token is null then
    return new;
  end if;

  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  select * into v_inv
  from public.employee_access_invites
  where token_hash=v_hash
    and claimed_at is null
    and expires_at>now()
  for update;

  if not found then
    raise exception 'SchichtFunk Mitarbeiter-Einladung ist ungültig oder abgelaufen.';
  end if;

  if lower(v_inv.email) <> lower(coalesce(new.email,'')) then
    raise exception 'Die E-Mail-Adresse passt nicht zur SchichtFunk Mitarbeiter-Einladung.';
  end if;

  select * into v_emp from public.employees where id=v_inv.employee_id for update;
  if not found or v_emp.company_id<>v_inv.company_id then
    raise exception 'Mitarbeiterdatensatz zur Einladung nicht gefunden.';
  end if;
  if v_emp.status<>'active' then
    raise exception 'Der Mitarbeiterzugang ist nicht aktivierbar.';
  end if;
  if v_emp.auth_user_id is not null and v_emp.auth_user_id<>new.id then
    raise exception 'Für diesen Mitarbeiter besteht bereits ein Zugang.';
  end if;

  update public.employees
    set auth_user_id=new.id,
        access_status='ACTIVE',
        access_linked_at=now(),
        updated_at=now()
  where id=v_inv.employee_id;

  update public.employee_access_invites
    set claimed_at=now(), claimed_by=new.id
  where id=v_inv.id;

  return new;
end
$$;

revoke all on function private.handle_schichtfunk_employee_signup() from public, anon, authenticated;

drop trigger if exists on_schichtfunk_employee_signup on auth.users;
create trigger on_schichtfunk_employee_signup
after insert on auth.users
for each row execute function private.handle_schichtfunk_employee_signup();;
