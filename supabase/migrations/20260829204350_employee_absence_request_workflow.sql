alter table public.absences
  add column if not exists request_source text not null default 'MANAGER',
  add column if not exists requested_by uuid,
  add column if not exists requested_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text not null default '';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.employee_submit_absence_request_impl(
  p_absence_type text,
  p_start_date date,
  p_end_date date,
  p_note text default '',
  p_full_day boolean default true,
  p_start_time time default null,
  p_end_time time default null,
  p_time_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_id uuid;
  v_type text := btrim(coalesce(p_absence_type,''));
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_type not in ('Urlaub','Krank','Frei','Fortbildung','Sperrzeit','Sonderurlaub','Sonstiges') then
    raise exception 'Ungültige Abwesenheitsart';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Bitte einen gültigen Zeitraum wählen';
  end if;
  if (p_end_date - p_start_date) > 366 then raise exception 'Der Zeitraum ist zu lang'; end if;
  if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then
    raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.auth_user_id=v_uid and e.status='active'
  limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  if exists (
    select 1 from public.absences a
    where a.employee_id=v_employee.id
      and a.status in ('Beantragt','Genehmigt','Erfasst')
      and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  insert into public.absences(
    company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,
    start_time,end_time,time_note,note,request_source,requested_by,requested_at
  ) values (
    v_employee.company_id,v_employee.id,null,p_start_date,p_end_date,v_type,'Beantragt',coalesce(p_full_day,true),
    case when coalesce(p_full_day,true) then null else p_start_time end,
    case when coalesce(p_full_day,true) then null else p_end_time end,
    coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',v_uid,now()
  ) returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_employee.company_id,'ABSENCE_REQUEST_CREATED','absence',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('status','Beantragt','type',v_type,'startDate',p_start_date,'endDate',p_end_date),
    jsonb_build_object('source','EMPLOYEE_PORTAL'));

  return v_id;
end $$;

revoke all on function private.employee_submit_absence_request_impl(text,date,date,text,boolean,time,time,text) from public, anon;
grant execute on function private.employee_submit_absence_request_impl(text,date,date,text,boolean,time,time,text) to authenticated;

create or replace function public.employee_submit_absence_request(
  p_absence_type text,
  p_start_date date,
  p_end_date date,
  p_note text default '',
  p_full_day boolean default true,
  p_start_time time default null,
  p_end_time time default null,
  p_time_note text default ''
) returns uuid
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.employee_submit_absence_request_impl(p_absence_type,p_start_date,p_end_date,p_note,p_full_day,p_start_time,p_end_time,p_time_note)
$$;
revoke all on function public.employee_submit_absence_request(text,date,date,text,boolean,time,time,text) from public, anon;
grant execute on function public.employee_submit_absence_request(text,date,date,text,boolean,time,time,text) to authenticated;

create or replace function private.manager_review_absence_request_impl(
  p_absence_id uuid,
  p_decision text,
  p_review_note text default ''
) returns text
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_abs public.absences%rowtype;
  v_role text;
  v_new_status text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into v_abs from public.absences where id=p_absence_id for update;
  if v_abs.id is null then raise exception 'Abwesenheitsantrag nicht gefunden'; end if;

  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=v_abs.company_id and cm.user_id=v_uid and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER')
  limit 1;
  if v_role is null then raise exception 'Keine Berechtigung für diese Entscheidung'; end if;
  if v_abs.status <> 'Beantragt' then raise exception 'Dieser Antrag ist nicht mehr offen'; end if;

  if v_decision='APPROVE' then
    v_new_status := case when v_abs.absence_type='Krank' then 'Erfasst' else 'Genehmigt' end;
  else
    v_new_status := 'Abgelehnt';
  end if;

  update public.absences
  set status=v_new_status,
      reviewed_by=v_uid,
      reviewed_at=now(),
      review_note=left(coalesce(p_review_note,''),2000),
      legacy_id=case when v_decision='APPROVE' then coalesce(legacy_id,'absence-request:'||id::text) else legacy_id end,
      updated_at=now()
  where id=v_abs.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_abs.company_id,
    case when v_decision='APPROVE' then 'ABSENCE_REQUEST_APPROVED' else 'ABSENCE_REQUEST_REJECTED' end,
    'absence',v_abs.id,v_uid,v_role,
    jsonb_build_object('status',v_abs.status),jsonb_build_object('status',v_new_status),
    jsonb_build_object('reviewNote',left(coalesce(p_review_note,''),2000),'source',v_abs.request_source));

  return v_new_status;
end $$;

revoke all on function private.manager_review_absence_request_impl(uuid,text,text) from public, anon;
grant execute on function private.manager_review_absence_request_impl(uuid,text,text) to authenticated;

create or replace function public.manager_review_absence_request(
  p_absence_id uuid,
  p_decision text,
  p_review_note text default ''
) returns text
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.manager_review_absence_request_impl(p_absence_id,p_decision,p_review_note)
$$;
revoke all on function public.manager_review_absence_request(uuid,text,text) from public, anon;
grant execute on function public.manager_review_absence_request(uuid,text,text) to authenticated;;
