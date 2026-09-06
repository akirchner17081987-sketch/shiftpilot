create extension if not exists pg_cron;

create table if not exists private.personnel_expiry_reminder_log (
  company_id uuid not null,
  recipient_user_id uuid not null,
  entity_type text not null check (entity_type in ('PERSONNEL_QUALIFICATION','PERSONNEL_DOCUMENT')),
  entity_id uuid not null,
  employee_id uuid not null,
  expires_on date not null,
  milestone_days integer not null check (milestone_days in (90,60,30,14,7,1,0)),
  actual_days integer not null,
  sent_at timestamptz not null default now(),
  primary key (company_id, recipient_user_id, entity_type, entity_id, expires_on, milestone_days)
);

revoke all on table private.personnel_expiry_reminder_log from public, anon, authenticated;

create or replace function private.sf_personnel_expiry_milestone(p_days integer)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_days <= 0 then 0
    when p_days <= 1 then 1
    when p_days <= 7 then 7
    when p_days <= 14 then 14
    when p_days <= 30 then 30
    when p_days <= 60 then 60
    when p_days <= 90 then 90
    else null
  end
$$;

revoke all on function private.sf_personnel_expiry_milestone(integer) from public, anon, authenticated;

create or replace function private.sf_send_personnel_expiry_reminder(
  p_company_id uuid,
  p_employee_id uuid,
  p_employee_name text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_title text,
  p_expires_on date,
  p_actual_days integer,
  p_milestone_days integer
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  r record;
  v_inserted integer;
  v_sent integer := 0;
  v_kind text;
  v_title text;
  v_message text;
  v_label text;
  v_tab text;
begin
  if p_company_id is null or p_employee_id is null or p_entity_id is null or p_expires_on is null or p_milestone_days is null then
    return 0;
  end if;
  if p_entity_type not in ('PERSONNEL_QUALIFICATION','PERSONNEL_DOCUMENT') then
    raise exception 'Ungültiger Erinnerungstyp';
  end if;

  v_label := case when p_entity_type='PERSONNEL_QUALIFICATION' then 'Qualifikation' else 'Dokument' end;
  v_tab := case when p_entity_type='PERSONNEL_QUALIFICATION' then 'qualifications' else 'documents' end;
  v_kind := case
    when p_milestone_days=0 then p_entity_type||'_EXPIRED'
    else p_entity_type||'_EXPIRY_'||p_milestone_days::text||'D'
  end;

  if p_actual_days < 0 then
    v_title := v_label||' abgelaufen';
    v_message := coalesce(nullif(btrim(p_employee_name),''),'Mitarbeiter')||' · '||coalesce(nullif(btrim(p_entity_title),''),v_label)||' ist seit '||abs(p_actual_days)||' Tag'||case when abs(p_actual_days)=1 then '' else 'en' end||' abgelaufen (Ablauf '||to_char(p_expires_on,'DD.MM.YYYY')||').';
  elsif p_actual_days = 0 then
    v_title := v_label||' läuft heute ab';
    v_message := coalesce(nullif(btrim(p_employee_name),''),'Mitarbeiter')||' · '||coalesce(nullif(btrim(p_entity_title),''),v_label)||' läuft heute ab ('||to_char(p_expires_on,'DD.MM.YYYY')||').';
  else
    v_title := v_label||' läuft in '||p_actual_days||' Tag'||case when p_actual_days=1 then '' else 'en' end||' ab';
    v_message := coalesce(nullif(btrim(p_employee_name),''),'Mitarbeiter')||' · '||coalesce(nullif(btrim(p_entity_title),''),v_label)||' · Ablauf '||to_char(p_expires_on,'DD.MM.YYYY')||'.';
  end if;

  for r in
    select cm.user_id
    from public.company_members cm
    where cm.company_id=p_company_id
      and cm.status='ACTIVE'
      and cm.role in ('OWNER','ADMIN')
  loop
    v_inserted := null;
    insert into private.personnel_expiry_reminder_log(
      company_id,recipient_user_id,entity_type,entity_id,employee_id,expires_on,milestone_days,actual_days
    ) values (
      p_company_id,r.user_id,p_entity_type,p_entity_id,p_employee_id,p_expires_on,p_milestone_days,p_actual_days
    )
    on conflict do nothing
    returning 1 into v_inserted;

    if v_inserted=1 then
      perform private.sf_put_notification(
        p_company_id,
        r.user_id,
        p_employee_id,
        v_kind,
        v_title,
        v_message,
        'employees',
        lower(p_entity_type),
        p_entity_id,
        jsonb_build_object(
          'employeeId',p_employee_id,
          'employeeName',p_employee_name,
          'personnelTab',v_tab,
          'entityTitle',p_entity_title,
          'expiresOn',p_expires_on,
          'daysUntilExpiry',p_actual_days,
          'milestoneDays',p_milestone_days
        )
      );
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end
$$;

revoke all on function private.sf_send_personnel_expiry_reminder(uuid,uuid,text,text,uuid,text,date,integer,integer) from public, anon, authenticated;

create or replace function private.sf_run_personnel_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  r record;
  v_milestone integer;
  v_sent integer := 0;
begin
  for r in
    select
      q.company_id,q.employee_id,q.id as entity_id,q.title as entity_title,q.expires_on,
      trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) as employee_name,
      (q.expires_on - ((now() at time zone coalesce(c.timezone,'Europe/Berlin'))::date))::integer as actual_days
    from public.employee_personnel_qualifications q
    join public.employees e on e.id=q.employee_id and e.company_id=q.company_id
    join public.companies c on c.id=q.company_id
    where q.expires_on is not null
      and e.status='active'
      and q.expires_on <= ((now() at time zone coalesce(c.timezone,'Europe/Berlin'))::date + 90)
  loop
    v_milestone := private.sf_personnel_expiry_milestone(r.actual_days);
    if v_milestone is not null then
      v_sent := v_sent + private.sf_send_personnel_expiry_reminder(
        r.company_id,r.employee_id,r.employee_name,'PERSONNEL_QUALIFICATION',r.entity_id,r.entity_title,r.expires_on,r.actual_days,v_milestone
      );
    end if;
  end loop;

  for r in
    select
      d.company_id,d.employee_id,d.id as entity_id,d.title as entity_title,d.expires_on,
      trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) as employee_name,
      (d.expires_on - ((now() at time zone coalesce(c.timezone,'Europe/Berlin'))::date))::integer as actual_days
    from public.employee_personnel_documents d
    join public.employees e on e.id=d.employee_id and e.company_id=d.company_id
    join public.companies c on c.id=d.company_id
    where d.expires_on is not null
      and e.status='active'
      and d.expires_on <= ((now() at time zone coalesce(c.timezone,'Europe/Berlin'))::date + 90)
  loop
    v_milestone := private.sf_personnel_expiry_milestone(r.actual_days);
    if v_milestone is not null then
      v_sent := v_sent + private.sf_send_personnel_expiry_reminder(
        r.company_id,r.employee_id,r.employee_name,'PERSONNEL_DOCUMENT',r.entity_id,r.entity_title,r.expires_on,r.actual_days,v_milestone
      );
    end if;
  end loop;

  return v_sent;
end
$$;

revoke all on function private.sf_run_personnel_expiry_reminders() from public, anon, authenticated;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname='schichtfunk-personnel-expiry-reminders' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'schichtfunk-personnel-expiry-reminders',
    '20 5 * * *',
    $cron$select private.sf_run_personnel_expiry_reminders();$cron$
  );
end
$$;;
