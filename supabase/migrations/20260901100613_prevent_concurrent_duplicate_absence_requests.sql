create or replace function private.employee_submit_absence_request_impl(
  p_absence_type text,
  p_start_date date,
  p_end_date date,
  p_note text default '',
  p_full_day boolean default true,
  p_start_time time without time zone default null,
  p_end_time time without time zone default null,
  p_time_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'auth', 'private', 'pg_temp'
as $function$
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

  -- Serialize absence submissions for the same employee. Without this lock,
  -- concurrent requests can both pass the overlap check before either inserts.
  perform pg_advisory_xact_lock(
    hashtextextended('absence-request:' || v_employee.id::text, 0)
  );

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
end
$function$;
