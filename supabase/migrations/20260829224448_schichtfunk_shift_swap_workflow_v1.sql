create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid references public.shift_assignments(id) on delete set null,
  original_employee_id uuid not null references public.employees(id) on delete restrict,
  target_employee_id uuid not null references public.employees(id) on delete restrict,
  assignment_version integer not null check (assignment_version >= 0),
  status text not null check (status in ('PENDING_COLLEAGUE','PENDING_MANAGER','REJECTED_COLLEAGUE','REJECTED_MANAGER','APPLIED','CANCELLED','SUPERSEDED')),
  reason text not null default '',
  colleague_comment text not null default '',
  manager_comment text not null default '',
  requested_by uuid references auth.users(id) on delete set null,
  colleague_decided_by uuid references auth.users(id) on delete set null,
  manager_decided_by uuid references auth.users(id) on delete set null,
  change_request_id uuid references public.shift_change_requests(id) on delete set null,
  requested_at timestamptz not null default now(),
  colleague_decided_at timestamptz,
  manager_decided_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  check (original_employee_id <> target_employee_id)
);

create index if not exists shift_swap_company_status_idx on public.shift_swap_requests(company_id,status,requested_at desc);
create index if not exists shift_swap_original_idx on public.shift_swap_requests(original_employee_id,requested_at desc);
create index if not exists shift_swap_target_idx on public.shift_swap_requests(target_employee_id,requested_at desc);
create unique index if not exists shift_swap_one_open_per_assignment_idx on public.shift_swap_requests(assignment_id) where status in ('PENDING_COLLEAGUE','PENDING_MANAGER');

alter table public.shift_swap_requests enable row level security;

drop policy if exists shift_swap_select_participants_and_managers on public.shift_swap_requests;
create policy shift_swap_select_participants_and_managers on public.shift_swap_requests
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=shift_swap_requests.company_id
      and cm.user_id=(select auth.uid())
      and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.id in (shift_swap_requests.original_employee_id,shift_swap_requests.target_employee_id)
      and e.auth_user_id=(select auth.uid())
      and e.status='active'
  )
);

revoke all privileges on table public.shift_swap_requests from anon, authenticated;
grant select on table public.shift_swap_requests to authenticated;

create or replace function private.sf_swap_candidate_reason(
  p_assignment_id uuid,
  p_target_employee_id uuid
) returns text
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  a public.shift_assignments%rowtype;
  e public.employees%rowtype;
  v_err text;
begin
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then return 'Schicht nicht gefunden'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then return 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then return 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  select * into e from public.employees where id=p_target_employee_id and company_id=a.company_id;
  if e.id is null or e.status<>'active' then return 'Mitarbeiter ist nicht aktiv'; end if;
  if e.id=a.employee_id then return 'Die Schicht gehört bereits diesem Mitarbeiter'; end if;
  if e.auth_user_id is null then return 'Der Kollege hat noch keinen aktiven SchichtFunk-Zugang'; end if;
  if not coalesce(a.shift_code=any(e.shift_permissions),false) then return 'Keine Freigabe für diese Schichtart'; end if;

  begin
    perform public.assert_standard_shift_rules(a.company_id,e.id,a.starts_at,a.ends_at,a.id);
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err='Shift overlaps another assignment' then return 'Bereits andere Schicht im Zeitraum'; end if;
    if v_err='Shift overlaps an approved absence' then return 'Genehmigte Abwesenheit im Zeitraum'; end if;
    if v_err='Standard minimum rest period not met before shift' then return 'Ruhezeit vor der Schicht nicht ausreichend'; end if;
    if v_err='Standard minimum rest period not met after shift' then return 'Ruhezeit nach der Schicht nicht ausreichend'; end if;
    if v_err='Standard maximum shift duration exceeded' then return 'Schicht überschreitet die Standard-Höchstdauer'; end if;
    return coalesce(v_err,'Kollege ist für diese Schicht nicht verfügbar');
  end;

  return null;
end
$$;

create or replace function private.employee_list_shift_swap_candidates_impl(p_assignment_id uuid)
returns table(employee_id uuid,display_name text,employee_role text)
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;

  return query
  select e.id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),coalesce(e.role,'Mitarbeiter')
  from public.employees e
  where e.company_id=a.company_id
    and e.id<>a.employee_id
    and e.status='active'
    and e.auth_user_id is not null
    and private.sf_swap_candidate_reason(a.id,e.id) is null
  order by e.last_name,e.first_name;
end
$$;

create or replace function public.employee_list_shift_swap_candidates(p_assignment_id uuid)
returns table(employee_id uuid,display_name text,employee_role text)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select * from private.employee_list_shift_swap_candidates_impl(p_assignment_id)
$$;

create or replace function private.employee_create_shift_swap_impl(
  p_assignment_id uuid,
  p_target_employee_id uuid,
  p_reason text default ''
) returns uuid
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  a public.shift_assignments%rowtype;
  req public.employees%rowtype;
  v_reason text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into req from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if req.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können getauscht werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht getauscht werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits eine Tauschanfrage';
  end if;

  v_reason:=private.sf_swap_candidate_reason(a.id,p_target_employee_id);
  if v_reason is not null then raise exception '%',v_reason; end if;

  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,p_target_employee_id,a.version,'PENDING_COLLEAGUE',left(coalesce(p_reason,''),1000),v_uid)
  returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(a.company_id,'SHIFT_SWAP_REQUESTED','shift_swap_request',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('assignmentId',a.id,'fromEmployeeId',a.employee_id,'toEmployeeId',p_target_employee_id,'status','PENDING_COLLEAGUE'),
    jsonb_build_object('reason',left(coalesce(p_reason,''),1000)));

  return v_id;
end
$$;

create or replace function public.employee_create_shift_swap(p_assignment_id uuid,p_target_employee_id uuid,p_reason text default '')
returns uuid
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select private.employee_create_shift_swap_impl(p_assignment_id,p_target_employee_id,p_reason)
$$;

create or replace function private.employee_respond_shift_swap_impl(
  p_swap_id uuid,
  p_decision text,
  p_comment text default ''
) returns text
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  s public.shift_swap_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_decision text:=upper(trim(coalesce(p_decision,'')));
  v_reason text;
  v_status text;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.target_employee_id and e.auth_user_id=v_uid and e.status='active') then
    raise exception 'Diese Tauschanfrage gehört nicht zum angemeldeten Mitarbeiter';
  end if;
  if s.status<>'PENDING_COLLEAGUE' then raise exception 'Diese Tauschanfrage wartet nicht mehr auf deine Entscheidung'; end if;

  if v_decision='REJECT' then
    v_status:='REJECTED_COLLEAGUE';
  else
    select * into a from public.shift_assignments where id=s.assignment_id;
    if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason','assignment_changed'));
      return 'SUPERSEDED';
    end if;
    v_reason:=private.sf_swap_candidate_reason(a.id,s.target_employee_id);
    if v_reason is not null then
      update public.shift_swap_requests set status='SUPERSEDED',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
      insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
      values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('reason',v_reason));
      return 'SUPERSEDED';
    end if;
    v_status:='PENDING_MANAGER';
  end if;

  update public.shift_swap_requests
  set status=v_status,colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now()
  where id=s.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,case when v_status='PENDING_MANAGER' then 'SHIFT_SWAP_COLLEAGUE_APPROVED' else 'SHIFT_SWAP_COLLEAGUE_REJECTED' end,
    'shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status',v_status),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));

  return v_status;
end
$$;

create or replace function public.employee_respond_shift_swap(p_swap_id uuid,p_decision text,p_comment text default '')
returns text
language sql
security invoker
set search_path='public','private','pg_temp'
as $$
  select private.employee_respond_shift_swap_impl(p_swap_id,p_decision,p_comment)
$$;

create or replace function private.employee_cancel_shift_swap_impl(p_swap_id uuid)
returns text
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.auth_user_id=v_uid and e.status='active') then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Diese Tauschanfrage kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values)
  values(s.company_id,'SHIFT_SWAP_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end
$$;

create or replace function public.employee_cancel_shift_swap(p_swap_id uuid)
returns text
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select private.employee_cancel_shift_swap_impl(p_swap_id) $$;

create or replace function private.manager_review_shift_swap_impl(
  p_swap_id uuid,
  p_decision text,
  p_comment text default ''
) returns table(status text,message text,assignment_id uuid)
language plpgsql
security definer
set search_path='public','private','auth','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  s public.shift_swap_requests%rowtype;
  a public.shift_assignments%rowtype;
  v_decision text:=upper(trim(coalesce(p_decision,'')));
  v_reason text;
  v_change_id uuid;
  v_assignment_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Tauschanfrage nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=s.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für diese Entscheidung'; end if;
  if s.status<>'PENDING_MANAGER' then raise exception 'Diese Tauschanfrage wartet nicht auf die Disposition'; end if;

  if v_decision='REJECT' then
    update public.shift_swap_requests set status='REJECTED_MANAGER',manager_comment=left(coalesce(p_comment,''),1000),manager_decided_by=v_uid,manager_decided_at=now(),updated_at=now() where id=s.id;
    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
    values(s.company_id,'SHIFT_SWAP_MANAGER_REJECTED','shift_swap_request',s.id,v_uid,v_role,jsonb_build_object('status',s.status),jsonb_build_object('status','REJECTED_MANAGER'),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));
    return query select 'REJECTED_MANAGER'::text,'Schichttausch abgelehnt. Die bisherige Planung bleibt bestehen.'::text,s.assignment_id;
    return;
  end if;

  select * into a from public.shift_assignments where id=s.assignment_id for update;
  if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' then
    update public.shift_swap_requests set status='SUPERSEDED',manager_comment=left(coalesce(p_comment,''),1000),manager_decided_by=v_uid,manager_decided_at=now(),updated_at=now() where id=s.id;
    return query select 'SUPERSEDED'::text,'Die Schicht wurde zwischenzeitlich verändert. Der Tausch wurde nicht angewendet.'::text,s.assignment_id;
    return;
  end if;

  v_reason:=private.sf_swap_candidate_reason(a.id,s.target_employee_id);
  if v_reason is not null then
    update public.shift_swap_requests set status='SUPERSEDED',manager_comment=left(coalesce(p_comment,''),1000),manager_decided_by=v_uid,manager_decided_at=now(),updated_at=now() where id=s.id;
    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
    values(s.company_id,'SHIFT_SWAP_SUPERSEDED','shift_swap_request',s.id,v_uid,v_role,jsonb_build_object('reason',v_reason));
    return query select 'SUPERSEDED'::text,('Tausch nicht mehr möglich: '||v_reason)::text,s.assignment_id;
    return;
  end if;

  v_old:=jsonb_build_object('employeeId',a.employee_id,'type',a.shift_code,'startsAt',a.starts_at,'endsAt',a.ends_at,'breakMinutes',a.break_minutes,'note',coalesce(a.note,''));
  v_new:=jsonb_build_object('employeeId',s.target_employee_id,'type',a.shift_code,'startsAt',a.starts_at,'endsAt',a.ends_at,'breakMinutes',a.break_minutes,'note',coalesce(a.note,''));

  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(s.company_id,a.id,'UPDATE',s.original_employee_id,a.version,v_old,v_new,'Schichttausch',left('Schichttausch #'||s.id::text||case when coalesce(s.reason,'')<>'' then ' · '||s.reason else '' end,2000),'YES',greatest(0,floor(extract(epoch from(a.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid)
  returning id into v_change_id;

  v_assignment_id:=public.apply_shift_change(v_change_id);

  update public.shift_swap_requests
  set status='APPLIED',manager_comment=left(coalesce(p_comment,''),1000),manager_decided_by=v_uid,manager_decided_at=now(),applied_at=now(),change_request_id=v_change_id,updated_at=now()
  where id=s.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,'SHIFT_SWAP_APPLIED','shift_swap_request',s.id,v_uid,v_role,
    jsonb_build_object('employeeId',s.original_employee_id,'assignmentId',a.id),
    jsonb_build_object('employeeId',s.target_employee_id,'assignmentId',a.id),
    jsonb_build_object('changeRequestId',v_change_id,'comment',left(coalesce(p_comment,''),1000)));

  return query select 'APPLIED'::text,'Schichttausch freigegeben und im veröffentlichten Dienstplan übernommen.'::text,v_assignment_id;
end
$$;

create or replace function public.manager_review_shift_swap(p_swap_id uuid,p_decision text,p_comment text default '')
returns table(status text,message text,assignment_id uuid)
language sql
security invoker
set search_path='public','private','pg_temp'
as $$ select * from private.manager_review_shift_swap_impl(p_swap_id,p_decision,p_comment) $$;

create or replace function private.sf_notify_shift_swap()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_original_user uuid;
  v_target_user uuid;
  v_original_name text;
  v_target_name text;
  v_tz text;
  v_when text;
  a public.shift_assignments%rowtype;
begin
  select e.auth_user_id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_original_user,v_original_name from public.employees e where e.id=new.original_employee_id;
  select e.auth_user_id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_target_user,v_target_name from public.employees e where e.id=new.target_employee_id;
  select * into a from public.shift_assignments where id=new.assignment_id;
  select coalesce(c.timezone,'Europe/Berlin') into v_tz from public.companies c where c.id=new.company_id;
  if a.id is not null then v_when:=to_char(a.starts_at at time zone coalesce(v_tz,'Europe/Berlin'),'DD.MM.YYYY HH24:MI'); else v_when:='veröffentlichte Schicht'; end if;

  if tg_op='INSERT' and new.status='PENDING_COLLEAGUE' then
    perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_COLLEAGUE','Schichttausch-Anfrage',coalesce(nullif(v_original_name,''),'Ein Kollege')||' möchte dir '||coalesce(a.shift_code,'eine Schicht')||' am '||v_when||' übertragen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='PENDING_MANAGER' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_COLLEAGUE_ACCEPTED','Schichttausch angenommen',coalesce(nullif(v_target_name,''),'Der Kollege')||' hat den Tausch angenommen. Die Disposition muss noch freigeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
      perform private.sf_notify_managers(new.company_id,'SHIFT_SWAP_MANAGER','Schichttausch wartet auf Freigabe',coalesce(nullif(v_original_name,''),'Mitarbeiter')||' → '||coalesce(nullif(v_target_name,''),'Mitarbeiter')||' · '||coalesce(a.shift_code,'Schicht')||' · '||v_when||'.','schedule','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
    elsif new.status='REJECTED_COLLEAGUE' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_REJECTED','Schichttausch abgelehnt',coalesce(nullif(v_target_name,''),'Der Kollege')||' hat deine Tauschanfrage abgelehnt.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    elsif new.status='REJECTED_MANAGER' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_MANAGER_REJECTED','Schichttausch nicht freigegeben','Die Disposition hat den Schichttausch nicht freigegeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'comment',new.manager_comment));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_MANAGER_REJECTED','Schichttausch nicht freigegeben','Die Disposition hat den Schichttausch nicht freigegeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'comment',new.manager_comment));
    elsif new.status='APPLIED' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_APPLIED','Schichttausch freigegeben','Deine Schicht wurde erfolgreich an '||coalesce(nullif(v_target_name,''),'den Kollegen')||' übertragen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_APPLIED','Neue Schicht durch Tausch','Der Schichttausch wurde freigegeben. Die Schicht '||coalesce(a.shift_code,'')||' am '||v_when||' ist jetzt dir zugeordnet.','employee-shifts','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
    elsif new.status='CANCELLED' then
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_CANCELLED','Schichttausch zurückgezogen',coalesce(nullif(v_original_name,''),'Der Mitarbeiter')||' hat die Tauschanfrage zurückgezogen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    elsif new.status='SUPERSEDED' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_SUPERSEDED','Schichttausch nicht mehr möglich','Die Schicht oder Verfügbarkeit hat sich geändert. Der Tausch wurde beendet.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_SUPERSEDED','Schichttausch nicht mehr möglich','Die Schicht oder Verfügbarkeit hat sich geändert. Der Tausch wurde beendet.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_shift_swap on public.shift_swap_requests;
create trigger trg_sf_notify_shift_swap
after insert or update of status on public.shift_swap_requests
for each row execute function private.sf_notify_shift_swap();

revoke all on function public.employee_list_shift_swap_candidates(uuid) from public,anon;
revoke all on function public.employee_create_shift_swap(uuid,uuid,text) from public,anon;
revoke all on function public.employee_respond_shift_swap(uuid,text,text) from public,anon;
revoke all on function public.employee_cancel_shift_swap(uuid) from public,anon;
revoke all on function public.manager_review_shift_swap(uuid,text,text) from public,anon;
grant execute on function public.employee_list_shift_swap_candidates(uuid) to authenticated;
grant execute on function public.employee_create_shift_swap(uuid,uuid,text) to authenticated;
grant execute on function public.employee_respond_shift_swap(uuid,text,text) to authenticated;
grant execute on function public.employee_cancel_shift_swap(uuid) to authenticated;
grant execute on function public.manager_review_shift_swap(uuid,text,text) to authenticated;

revoke all on function private.sf_swap_candidate_reason(uuid,uuid) from public,anon;
revoke all on function private.employee_list_shift_swap_candidates_impl(uuid) from public,anon;
revoke all on function private.employee_create_shift_swap_impl(uuid,uuid,text) from public,anon;
revoke all on function private.employee_respond_shift_swap_impl(uuid,text,text) from public,anon;
revoke all on function private.employee_cancel_shift_swap_impl(uuid) from public,anon;
revoke all on function private.manager_review_shift_swap_impl(uuid,text,text) from public,anon;
revoke all on function private.sf_notify_shift_swap() from public,anon,authenticated;
grant execute on function private.employee_list_shift_swap_candidates_impl(uuid) to authenticated;
grant execute on function private.employee_create_shift_swap_impl(uuid,uuid,text) to authenticated;
grant execute on function private.employee_respond_shift_swap_impl(uuid,text,text) to authenticated;
grant execute on function private.employee_cancel_shift_swap_impl(uuid) to authenticated;
grant execute on function private.manager_review_shift_swap_impl(uuid,text,text) to authenticated;
;
