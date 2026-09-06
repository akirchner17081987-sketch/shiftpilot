create table if not exists public.time_month_closures (
  company_id uuid not null references public.companies(id) on delete cascade,
  month_start date not null,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  revision integer not null default 0 check (revision >= 0),
  closed_at timestamptz,
  closed_by uuid,
  close_note text not null default '',
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_note text not null default '',
  report_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, month_start),
  check (month_start = date_trunc('month',month_start)::date),
  check ((status='OPEN') or (closed_at is not null and closed_by is not null and report_snapshot is not null))
);

alter table public.time_month_closures enable row level security;
revoke all on public.time_month_closures from anon, authenticated;

create or replace function private.time_month_is_closed(p_company_id uuid, p_work_date date)
returns boolean
language sql
stable
security definer
set search_path='public','private','pg_temp'
as $$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id
      and c.month_start=date_trunc('month',p_work_date)::date
      and c.status='CLOSED'
  );
$$;
revoke all on function private.time_month_is_closed(uuid,date) from public, anon;

create or replace function private.time_month_overlap_closed(p_company_id uuid, p_start date, p_end date)
returns boolean
language sql
stable
security definer
set search_path='public','private','pg_temp'
as $$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.status='CLOSED'
      and c.month_start <= p_end
      and (c.month_start + interval '1 month - 1 day')::date >= p_start
  );
$$;
revoke all on function private.time_month_overlap_closed(uuid,date,date) from public, anon;

create or replace function private.enforce_closed_month_time_entry()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
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
$$;
revoke all on function private.enforce_closed_month_time_entry() from public, anon, authenticated;

drop trigger if exists trg_time_entries_closed_month on public.time_entries;
create trigger trg_time_entries_closed_month
before insert or update or delete on public.time_entries
for each row execute function private.enforce_closed_month_time_entry();

create or replace function private.enforce_closed_month_assignment()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
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
$$;
revoke all on function private.enforce_closed_month_assignment() from public, anon, authenticated;

drop trigger if exists trg_shift_assignments_closed_month on public.shift_assignments;
create trigger trg_shift_assignments_closed_month
before insert or update or delete on public.shift_assignments
for each row execute function private.enforce_closed_month_assignment();

create or replace function private.enforce_closed_month_absence()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.status in ('Genehmigt','Erfasst')
     and private.time_month_overlap_closed(old.company_id,old.start_date,old.end_date) then
    raise exception 'Abwesenheit berührt einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.status in ('Genehmigt','Erfasst')
     and private.time_month_overlap_closed(new.company_id,new.start_date,new.end_date) then
    raise exception 'Abwesenheit berührt einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_closed_month_absence() from public, anon, authenticated;

drop trigger if exists trg_absences_closed_month on public.absences;
create trigger trg_absences_closed_month
before insert or update or delete on public.absences
for each row execute function private.enforce_closed_month_absence();

create or replace function private.manager_time_month_status_impl(p_company_id uuid,p_month date)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_missing int:=0;
  v_pending_abs int:=0;
  v_pending_time int:=0;
  v_c public.time_month_closures%rowtype;
begin
  select cm.role into v_role from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') limit 1;
  if v_role is null then raise exception 'Nicht berechtigt'; end if;

  select * into v_c from public.time_month_closures c
  where c.company_id=p_company_id and c.month_start=v_month;

  select count(*)::int into v_missing
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  where sa.company_id=p_company_id and sa.status='PUBLISHED'
    and (timezone('Europe/Berlin',sa.starts_at))::date between v_month and v_end
    and te.assignment_id is null;

  select count(*)::int into v_pending_time
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id
  where sa.company_id=p_company_id
    and (timezone('Europe/Berlin',sa.starts_at))::date between v_month and v_end
    and te.status in ('recorded','correction_requested');

  select count(*)::int into v_pending_abs
  from public.absences a
  where a.company_id=p_company_id and a.status='Beantragt'
    and a.start_date<=v_end and a.end_date>=v_month;

  return jsonb_build_object(
    'company_id',p_company_id,'month_start',v_month,'month_end',v_end,
    'status',coalesce(v_c.status,'OPEN'),'revision',coalesce(v_c.revision,0),
    'closed_at',v_c.closed_at,'closed_by',v_c.closed_by,'close_note',coalesce(v_c.close_note,''),
    'reopened_at',v_c.reopened_at,'reopened_by',v_c.reopened_by,'reopen_note',coalesce(v_c.reopen_note,''),
    'is_past_month',v_end<current_date,
    'missing_confirmed_assignments',v_missing,
    'pending_time_entries',v_pending_time,
    'pending_absence_requests',v_pending_abs,
    'can_close',(coalesce(v_c.status,'OPEN')<>'CLOSED' and v_end<current_date and v_missing=0 and v_pending_abs=0),
    'can_reopen',(coalesce(v_c.status,'OPEN')='CLOSED' and v_role='OWNER'),
    'role',v_role
  );
end;
$$;
revoke all on function private.manager_time_month_status_impl(uuid,date) from public, anon;
grant execute on function private.manager_time_month_status_impl(uuid,date) to authenticated;

create or replace function public.manager_time_month_status(p_company_id uuid,p_month date)
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.manager_time_month_status_impl(p_company_id,p_month); $$;
revoke all on function public.manager_time_month_status(uuid,date) from public, anon;
grant execute on function public.manager_time_month_status(uuid,date) to authenticated;

create or replace function private.manager_close_time_month_impl(p_company_id uuid,p_month date,p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_missing int;
  v_pending_abs int;
  v_snapshot jsonb;
  v_revision int;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN') limit 1;
  if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Monate abschließen'; end if;
  if v_end>=current_date then raise exception 'Der Monat kann erst nach Monatsende abgeschlossen werden'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||v_month::text,0));
  if exists(select 1 from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED') then
    raise exception 'Dieser Monat ist bereits abgeschlossen';
  end if;

  select count(*)::int into v_missing
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  where sa.company_id=p_company_id and sa.status='PUBLISHED'
    and (timezone('Europe/Berlin',sa.starts_at))::date between v_month and v_end
    and te.assignment_id is null;
  if v_missing>0 then raise exception 'Monatsabschluss nicht möglich: % veröffentlichte Schicht(en) ohne bestätigte Ist-Zeit',v_missing; end if;

  select count(*)::int into v_pending_abs from public.absences a
  where a.company_id=p_company_id and a.status='Beantragt'
    and a.start_date<=v_end and a.end_date>=v_month;
  if v_pending_abs>0 then raise exception 'Monatsabschluss nicht möglich: % offene Abwesenheitsanträge',v_pending_abs; end if;

  v_snapshot:=public.manager_time_report_bundle(p_company_id,v_month,null);

  insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,close_note,reopened_at,reopened_by,reopen_note,report_snapshot,created_at,updated_at)
  values(p_company_id,v_month,'CLOSED',1,now(),v_uid,left(coalesce(p_note,''),2000),null,null,'',v_snapshot,now(),now())
  on conflict(company_id,month_start) do update set
    status='CLOSED',revision=public.time_month_closures.revision+1,closed_at=now(),closed_by=v_uid,
    close_note=left(coalesce(p_note,''),2000),report_snapshot=v_snapshot,updated_at=now()
  returning revision into v_revision;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(p_company_id,'TIME_MONTH_CLOSED','TIME_MONTH',p_company_id,v_uid,v_role,
    jsonb_build_object('status','OPEN'),jsonb_build_object('status','CLOSED','revision',v_revision),
    jsonb_build_object('monthStart',v_month,'monthEnd',v_end,'note',left(coalesce(p_note,''),2000)));

  return jsonb_build_object('status','CLOSED','month_start',v_month,'month_end',v_end,'revision',v_revision,'closed_at',now());
end;
$$;
revoke all on function private.manager_close_time_month_impl(uuid,date,text) from public, anon;
grant execute on function private.manager_close_time_month_impl(uuid,date,text) to authenticated;

create or replace function public.manager_close_time_month(p_company_id uuid,p_month date,p_note text default '')
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.manager_close_time_month_impl(p_company_id,p_month,p_note); $$;
revoke all on function public.manager_close_time_month(uuid,date,text) from public, anon;
grant execute on function public.manager_close_time_month(uuid,date,text) to authenticated;

create or replace function private.manager_reopen_time_month_impl(p_company_id uuid,p_month date,p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_revision int;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role='OWNER' limit 1;
  if v_role is null then raise exception 'Nur OWNER darf einen Monatsabschluss wieder öffnen'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||v_month::text,0));
  update public.time_month_closures c set status='OPEN',reopened_at=now(),reopened_by=v_uid,
    reopen_note=left(coalesce(p_note,''),2000),updated_at=now()
  where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED'
  returning c.revision into v_revision;
  if v_revision is null then raise exception 'Dieser Monat ist nicht abgeschlossen'; end if;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(p_company_id,'TIME_MONTH_REOPENED','TIME_MONTH',p_company_id,v_uid,v_role,
    jsonb_build_object('status','CLOSED','revision',v_revision),jsonb_build_object('status','OPEN','revision',v_revision),
    jsonb_build_object('monthStart',v_month,'note',left(coalesce(p_note,''),2000)));

  return jsonb_build_object('status','OPEN','month_start',v_month,'revision',v_revision,'reopened_at',now());
end;
$$;
revoke all on function private.manager_reopen_time_month_impl(uuid,date,text) from public, anon;
grant execute on function private.manager_reopen_time_month_impl(uuid,date,text) to authenticated;

create or replace function public.manager_reopen_time_month(p_company_id uuid,p_month date,p_note text default '')
returns jsonb
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.manager_reopen_time_month_impl(p_company_id,p_month,p_note); $$;
revoke all on function public.manager_reopen_time_month(uuid,date,text) from public, anon;
grant execute on function public.manager_reopen_time_month(uuid,date,text) to authenticated;

create or replace function public.manager_time_report_bundle_v2(p_company_id uuid,p_month date,p_employee_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path='public','private','pg_temp'
as $$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_result jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then
    raise exception 'Nicht berechtigt';
  end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c
  where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is null then
    return public.manager_time_report_bundle(p_company_id,v_month,p_employee_id);
  end if;
  if p_employee_id is null then
    return v_snapshot || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED'));
  end if;
  v_result:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  v_result:=jsonb_set(v_result,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  return v_result || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED'));
end;
$$;
revoke all on function public.manager_time_report_bundle_v2(uuid,date,uuid) from public, anon;
grant execute on function public.manager_time_report_bundle_v2(uuid,date,uuid) to authenticated;

create or replace function public.manager_monthly_time_accounts(p_company_id uuid,p_month date)
returns setof jsonb
language plpgsql
security invoker
set search_path='public','private','pg_temp'
as $$
declare
  r record;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Nicht berechtigt'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    for r in select value as row from jsonb_array_elements(v_snapshot->'employees') loop return next r.row; end loop;
    return;
  end if;
  for r in select e.id from public.employees e where e.company_id=p_company_id
    and (e.start_date is null or e.start_date <= (v_month+interval '1 month - 1 day')::date)
    and (e.contract_end is null or e.contract_end >= v_month)
    order by e.last_name,e.first_name
  loop return next private.time_account_row_v1(r.id,v_month); end loop;
  return;
end;
$$;

create or replace function public.employee_my_time_account_month(p_month date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path='public','private','pg_temp'
as $$
declare
  v_employee_id uuid;
  v_company_id uuid;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_row jsonb;
begin
  select e.id,e.company_id into v_employee_id,v_company_id from public.employees e
  where e.auth_user_id=auth.uid() and e.access_status='ACTIVE' order by e.updated_at desc limit 1;
  if v_employee_id is null then raise exception 'Kein aktiver Mitarbeiterzugang'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=v_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    select x into v_row from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=v_employee_id::text limit 1;
    return v_row;
  end if;
  return private.time_account_row_v1(v_employee_id,v_month);
end;
$$;
;
