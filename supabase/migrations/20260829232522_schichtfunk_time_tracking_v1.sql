alter table public.time_entries
  add column if not exists employee_note text not null default '',
  add column if not exists manager_note text not null default '',
  add column if not exists source text not null default 'EMPLOYEE',
  add column if not exists submitted_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists correction_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists correction_requested_at timestamptz,
  add column if not exists correction_note text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists version integer not null default 1;

alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check
  check (status in ('open','recorded','correction_requested','confirmed'));
alter table public.time_entries drop constraint if exists time_entries_source_check;
alter table public.time_entries add constraint time_entries_source_check
  check (source in ('EMPLOYEE','MANAGER'));
alter table public.time_entries drop constraint if exists time_entries_version_check;
alter table public.time_entries add constraint time_entries_version_check check (version > 0);
alter table public.time_entries drop constraint if exists time_entries_break_not_longer_than_shift;
alter table public.time_entries add constraint time_entries_break_not_longer_than_shift
  check (actual_start is null or actual_end is null or break_minutes <= floor(extract(epoch from (actual_end-actual_start))/60));

create index if not exists time_entries_status_idx on public.time_entries(company_id,status,updated_at desc);
create index if not exists time_entries_confirmed_idx on public.time_entries(company_id,confirmed_at desc) where status='confirmed';

-- Alle Schreibvorgänge laufen über geprüfte RPCs. Lesen bleibt durch bestehende RLS geschützt.
revoke all privileges on table public.time_entries from anon, authenticated;
grant select on table public.time_entries to authenticated;

create or replace function private.employee_submit_time_entry_impl(
  p_assignment_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer,
  p_note text default ''
) returns table(status text,message text,version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  old_te public.time_entries%rowtype;
  new_te public.time_entries%rowtype;
  v_break integer := greatest(0,coalesce(p_break_minutes,0));
  v_event text;
  v_minutes numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_actual_start is null or p_actual_end is null then raise exception 'Tatsächlicher Beginn und tatsächliches Ende sind erforderlich'; end if;
  if p_actual_end <= p_actual_start then raise exception 'Das tatsächliche Ende muss nach dem Beginn liegen'; end if;
  if p_actual_end > now() + interval '5 minutes' then raise exception 'Eine Arbeitszeit kann nicht in der Zukunft enden'; end if;
  if p_actual_start > now() + interval '5 minutes' then raise exception 'Eine Arbeitszeit kann nicht in der Zukunft beginnen'; end if;
  if p_actual_end - p_actual_start > interval '24 hours' then raise exception 'Arbeitszeit über 24 Stunden ist nicht plausibel'; end if;
  v_minutes := extract(epoch from (p_actual_end-p_actual_start))/60.0;
  if v_break > floor(v_minutes) then raise exception 'Die Pause darf nicht länger als die Arbeitszeit sein'; end if;

  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id for update;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  if a.status <> 'PUBLISHED' and a.published_at is null then raise exception 'Ist-Zeit kann nur für veröffentlichte Schichten gemeldet werden'; end if;

  select emp.* into e from public.employees emp
  where emp.id=a.employee_id and emp.auth_user_id=v_user and emp.status='active';
  if not found then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;

  if p_actual_start < a.starts_at - interval '24 hours' or p_actual_end > a.ends_at + interval '36 hours' then
    raise exception 'Die Ist-Zeit liegt zu weit außerhalb der geplanten Schicht';
  end if;

  select * into old_te from public.time_entries where assignment_id=a.id for update;
  if found and old_te.status='confirmed' then
    raise exception 'Diese Ist-Zeit ist bereits bestätigt und kann nur durch die Verwaltung geändert werden';
  end if;
  v_event := case when found then 'TIME_ENTRY_RESUBMITTED' else 'TIME_ENTRY_RECORDED' end;

  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,updated_by,updated_at,
    employee_note,manager_note,source,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,correction_note,version
  ) values(
    a.id,a.company_id,p_actual_start,p_actual_end,v_break,'recorded',v_user,now(),
    left(coalesce(p_note,''),1000),'','EMPLOYEE',now(),null,null,null,null,'',
    case when old_te.assignment_id is null then 1 else old_te.version+1 end
  )
  on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,
    actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,
    status='recorded',
    updated_by=v_user,
    updated_at=now(),
    employee_note=excluded.employee_note,
    manager_note='',
    source='EMPLOYEE',
    submitted_at=now(),
    confirmed_by=null,
    confirmed_at=null,
    correction_requested_by=null,
    correction_requested_at=null,
    correction_note='',
    version=public.time_entries.version+1
  returning * into new_te;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,v_event,'time_entry',a.id,v_user,'EMPLOYEE',
    case when old_te.assignment_id is null then null else jsonb_build_object('actualStart',old_te.actual_start,'actualEnd',old_te.actual_end,'breakMinutes',old_te.break_minutes,'status',old_te.status,'version',old_te.version) end,
    jsonb_build_object('actualStart',new_te.actual_start,'actualEnd',new_te.actual_end,'breakMinutes',new_te.break_minutes,'status',new_te.status,'version',new_te.version),
    jsonb_build_object('shiftCode',a.shift_code,'employeeId',a.employee_id));

  perform private.sf_notify_managers(
    a.company_id,'TIME_ENTRY_REVIEW','Ist-Zeit wartet auf Prüfung',
    trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,''))||' hat die Ist-Zeit für '||a.shift_code||' gemeldet.',
    'time','time_entry',a.id,
    jsonb_build_object('assignmentId',a.id,'employeeId',a.employee_id,'status','recorded')
  );

  return query select new_te.status,'Ist-Zeit gespeichert und zur Prüfung gesendet.'::text,new_te.version;
end
$$;

create or replace function public.employee_submit_time_entry(
  p_assignment_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer,
  p_note text default ''
) returns table(status text,message text,version integer)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select * from private.employee_submit_time_entry_impl(p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note)
$$;

create or replace function private.manager_save_time_entry_impl(
  p_assignment_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer,
  p_note text default '',
  p_confirm boolean default false
) returns table(status text,message text,version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  old_te public.time_entries%rowtype;
  new_te public.time_entries%rowtype;
  v_role text;
  v_break integer := greatest(0,coalesce(p_break_minutes,0));
  v_minutes numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id for update;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=a.company_id and cm.user_id=v_user and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für die Zeiterfassung'; end if;
  if p_actual_start is null or p_actual_end is null or p_actual_end<=p_actual_start then raise exception 'Ungültige Ist-Zeit'; end if;
  if p_actual_end-p_actual_start>interval '24 hours' then raise exception 'Arbeitszeit über 24 Stunden ist nicht plausibel'; end if;
  v_minutes:=extract(epoch from(p_actual_end-p_actual_start))/60.0;
  if v_break>floor(v_minutes) then raise exception 'Die Pause darf nicht länger als die Arbeitszeit sein'; end if;
  select emp.* into e from public.employees emp where emp.id=a.employee_id;
  select * into old_te from public.time_entries where assignment_id=a.id for update;

  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,updated_by,updated_at,
    employee_note,manager_note,source,submitted_at,confirmed_by,confirmed_at,
    correction_requested_by,correction_requested_at,correction_note,version
  ) values(
    a.id,a.company_id,p_actual_start,p_actual_end,v_break,case when p_confirm then 'confirmed' else 'recorded' end,v_user,now(),
    coalesce(old_te.employee_note,''),left(coalesce(p_note,''),1000),'MANAGER',coalesce(old_te.submitted_at,now()),
    case when p_confirm then v_user else null end,case when p_confirm then now() else null end,
    null,null,'',case when old_te.assignment_id is null then 1 else old_te.version+1 end
  )
  on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,break_minutes=excluded.break_minutes,
    status=excluded.status,updated_by=v_user,updated_at=now(),manager_note=excluded.manager_note,source='MANAGER',
    submitted_at=coalesce(public.time_entries.submitted_at,now()),confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,correction_note='',version=public.time_entries.version+1
  returning * into new_te;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,'TIME_ENTRY_MANAGER_UPDATED','time_entry',a.id,v_user,v_role,
    case when old_te.assignment_id is null then null else jsonb_build_object('actualStart',old_te.actual_start,'actualEnd',old_te.actual_end,'breakMinutes',old_te.break_minutes,'status',old_te.status,'version',old_te.version) end,
    jsonb_build_object('actualStart',new_te.actual_start,'actualEnd',new_te.actual_end,'breakMinutes',new_te.break_minutes,'status',new_te.status,'version',new_te.version),
    jsonb_build_object('comment',left(coalesce(p_note,''),1000),'confirmed',p_confirm));

  perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,
    case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_UPDATED' end,
    case when p_confirm then 'Arbeitszeit bestätigt' else 'Arbeitszeit aktualisiert' end,
    case when p_confirm then 'Deine Ist-Zeit für '||a.shift_code||' wurde bestätigt.' else 'Die Verwaltung hat deine Ist-Zeit für '||a.shift_code||' aktualisiert.' end,
    'employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status',new_te.status));

  return query select new_te.status,case when p_confirm then 'Ist-Zeit gespeichert und bestätigt.' else 'Ist-Zeit gespeichert.' end,new_te.version;
end
$$;

create or replace function public.manager_save_time_entry(
  p_assignment_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_break_minutes integer,
  p_note text default '',
  p_confirm boolean default false
) returns table(status text,message text,version integer)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select * from private.manager_save_time_entry_impl(p_assignment_id,p_actual_start,p_actual_end,p_break_minutes,p_note,p_confirm)
$$;

create or replace function private.manager_review_time_entry_impl(
  p_assignment_id uuid,
  p_decision text,
  p_comment text default ''
) returns table(status text,message text,version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision,'')));
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  te public.time_entries%rowtype;
  old_te public.time_entries%rowtype;
  v_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_decision not in ('CONFIRM','CORRECTION') then raise exception 'Decision must be CONFIRM or CORRECTION'; end if;
  select sa.* into a from public.shift_assignments sa where sa.id=p_assignment_id;
  if not found then raise exception 'Schicht nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=a.company_id and cm.user_id=v_user and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für die Zeiterfassung'; end if;
  select * into te from public.time_entries where assignment_id=a.id for update;
  if not found then raise exception 'Noch keine Ist-Zeit vorhanden'; end if;
  old_te:=te;
  select emp.* into e from public.employees emp where emp.id=a.employee_id;

  if v_decision='CONFIRM' then
    if te.actual_start is null or te.actual_end is null then raise exception 'Unvollständige Ist-Zeit kann nicht bestätigt werden'; end if;
    update public.time_entries set status='confirmed',confirmed_by=v_user,confirmed_at=now(),manager_note=left(coalesce(p_comment,''),1000),
      correction_requested_by=null,correction_requested_at=null,correction_note='',updated_by=v_user,updated_at=now(),version=version+1
    where assignment_id=a.id returning * into te;
    perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,'TIME_ENTRY_CONFIRMED','Arbeitszeit bestätigt',
      'Deine Ist-Zeit für '||a.shift_code||' wurde bestätigt.','employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status','confirmed'));
  else
    if length(trim(coalesce(p_comment,'')))<3 then raise exception 'Bitte einen kurzen Korrekturhinweis angeben'; end if;
    update public.time_entries set status='correction_requested',correction_requested_by=v_user,correction_requested_at=now(),correction_note=left(p_comment,1000),
      manager_note=left(p_comment,1000),confirmed_by=null,confirmed_at=null,updated_by=v_user,updated_at=now(),version=version+1
    where assignment_id=a.id returning * into te;
    perform private.sf_put_notification(a.company_id,e.auth_user_id,a.employee_id,'TIME_ENTRY_CORRECTION','Korrektur der Arbeitszeit erforderlich',
      'Bitte prüfe deine Ist-Zeit für '||a.shift_code||'. Hinweis: '||left(p_comment,500),
      'employee-times','time_entry',a.id,jsonb_build_object('assignmentId',a.id,'status','correction_requested'));
  end if;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(a.company_id,case when v_decision='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',a.id,v_user,v_role,
    jsonb_build_object('status',old_te.status,'version',old_te.version),
    jsonb_build_object('status',te.status,'version',te.version),
    jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));

  return query select te.status,case when v_decision='CONFIRM' then 'Ist-Zeit bestätigt.' else 'Korrektur wurde angefordert.' end,te.version;
end
$$;

create or replace function public.manager_review_time_entry(
  p_assignment_id uuid,
  p_decision text,
  p_comment text default ''
) returns table(status text,message text,version integer)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select * from private.manager_review_time_entry_impl(p_assignment_id,p_decision,p_comment)
$$;

create or replace function public.manager_list_time_entries(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
) returns table(
  assignment_id uuid,employee_id uuid,employee_name text,shift_code text,starts_at timestamptz,ends_at timestamptz,
  planned_break_minutes integer,actual_start timestamptz,actual_end timestamptz,actual_break_minutes integer,
  entry_status text,employee_note text,manager_note text,correction_note text,source text,submitted_at timestamptz,confirmed_at timestamptz,entry_version integer
)
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_tz text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=v_user and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER')) then
    raise exception 'Keine Berechtigung für die Zeiterfassung';
  end if;
  select coalesce(c.timezone,'Europe/Berlin') into v_tz from public.companies c where c.id=p_company_id;
  return query
  select sa.id,e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),sa.shift_code,sa.starts_at,sa.ends_at,sa.break_minutes,
    te.actual_start,te.actual_end,coalesce(te.break_minutes,0),coalesce(te.status,'open'),coalesce(te.employee_note,''),coalesce(te.manager_note,''),coalesce(te.correction_note,''),
    coalesce(te.source,'EMPLOYEE'),te.submitted_at,te.confirmed_at,coalesce(te.version,0)
  from public.shift_assignments sa
  join public.employees e on e.id=sa.employee_id
  left join public.time_entries te on te.assignment_id=sa.id
  where sa.company_id=p_company_id and sa.status='PUBLISHED'
    and (sa.starts_at at time zone v_tz)::date between p_start_date and p_end_date
  order by sa.starts_at,e.last_name,e.first_name;
end
$$;

revoke all on function public.employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text) from public,anon;
revoke all on function public.manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean) from public,anon;
revoke all on function public.manager_review_time_entry(uuid,text,text) from public,anon;
revoke all on function public.manager_list_time_entries(uuid,date,date) from public,anon;
grant execute on function public.employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text) to authenticated;
grant execute on function public.manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.manager_review_time_entry(uuid,text,text) to authenticated;
grant execute on function public.manager_list_time_entries(uuid,date,date) to authenticated;

revoke all on function private.employee_submit_time_entry_impl(uuid,timestamptz,timestamptz,integer,text) from public,anon;
revoke all on function private.manager_save_time_entry_impl(uuid,timestamptz,timestamptz,integer,text,boolean) from public,anon;
revoke all on function private.manager_review_time_entry_impl(uuid,text,text) from public,anon;
grant execute on function private.employee_submit_time_entry_impl(uuid,timestamptz,timestamptz,integer,text) to authenticated;
grant execute on function private.manager_save_time_entry_impl(uuid,timestamptz,timestamptz,integer,text,boolean) to authenticated;
grant execute on function private.manager_review_time_entry_impl(uuid,text,text) to authenticated;;
