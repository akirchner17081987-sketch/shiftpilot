create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  kind text not null,
  title text not null,
  message text not null default '',
  link_view text,
  entity_type text not null,
  entity_id uuid not null,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, kind, entity_id)
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_company_idx on public.notifications(company_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke insert, delete on public.notifications from anon, authenticated;
grant select, update on public.notifications to authenticated;

create or replace function private.sf_put_notification(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_kind text,
  p_title text,
  p_message text,
  p_link_view text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
begin
  if p_user_id is null or p_company_id is null or p_entity_id is null then return; end if;
  insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  values(p_company_id,p_user_id,p_employee_id,p_kind,left(coalesce(p_title,''),180),left(coalesce(p_message,''),1200),p_link_view,p_entity_type,p_entity_id,coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,kind,entity_id)
  do update set
    employee_id=excluded.employee_id,
    title=excluded.title,
    message=excluded.message,
    link_view=excluded.link_view,
    entity_type=excluded.entity_type,
    metadata=excluded.metadata,
    is_read=false,
    read_at=null,
    created_at=now();
end
$$;

create or replace function private.sf_notify_managers(
  p_company_id uuid,
  p_kind text,
  p_title text,
  p_message text,
  p_link_view text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare r record;
begin
  for r in
    select cm.user_id
    from public.company_members cm
    where cm.company_id=p_company_id
      and cm.status='ACTIVE'
      and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  loop
    perform private.sf_put_notification(p_company_id,r.user_id,null,p_kind,p_title,p_message,p_link_view,p_entity_type,p_entity_id,p_metadata);
  end loop;
end
$$;

create or replace function private.sf_notify_assignment_published()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_user uuid; v_tz text; v_local text;
begin
  if new.status='PUBLISHED' and new.published_at is not null
     and (tg_op='INSERT' or old.status is distinct from 'PUBLISHED' or old.published_at is null) then
    select e.auth_user_id into v_user from public.employees e where e.id=new.employee_id;
    select coalesce(c.timezone,'Europe/Berlin') into v_tz from public.companies c where c.id=new.company_id;
    v_local := to_char(new.starts_at at time zone coalesce(v_tz,'Europe/Berlin'),'DD.MM.YYYY HH24:MI');
    perform private.sf_put_notification(
      new.company_id,v_user,new.employee_id,'SCHEDULE_PUBLISHED','Dienstplan aktualisiert',
      'Dein veröffentlichter Dienstplan wurde aktualisiert. Nächste neue Information: '||new.shift_code||' · '||v_local||'.',
      'employee-shifts','company',new.company_id,
      jsonb_build_object('assignmentId',new.id,'shiftCode',new.shift_code,'startsAt',new.starts_at,'endsAt',new.ends_at)
    );
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_assignment_published on public.shift_assignments;
create trigger trg_sf_notify_assignment_published
after insert or update of status,published_at on public.shift_assignments
for each row execute function private.sf_notify_assignment_published();

create or replace function private.sf_notify_shift_change_created()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_user uuid; v_title text; v_msg text;
begin
  select e.auth_user_id into v_user from public.employees e where e.id=new.employee_id;
  if v_user is not null then
    if coalesce(new.requires_employee_approval,false) then
      v_title := 'Schichtänderung wartet auf Bestätigung';
      v_msg := 'Eine Änderung deiner veröffentlichten Schicht wartet auf deine Bestätigung oder Ablehnung.';
    else
      v_title := 'Schichtänderung erfasst';
      v_msg := 'Für eine deiner veröffentlichten Schichten wurde eine Änderung erfasst.';
    end if;
    perform private.sf_put_notification(new.company_id,v_user,new.employee_id,'SHIFT_CHANGE_REQUEST',v_title,v_msg,'employee-changes','shift_change_request',new.id,jsonb_build_object('status',new.status,'reasonCode',new.reason_code,'requiresEmployeeApproval',new.requires_employee_approval));
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_shift_change_created on public.shift_change_requests;
create trigger trg_sf_notify_shift_change_created
after insert on public.shift_change_requests
for each row execute function private.sf_notify_shift_change_created();

create or replace function private.sf_notify_shift_change_applied()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_user uuid;
begin
  if new.status='APPLIED' and old.status is distinct from 'APPLIED' then
    select e.auth_user_id into v_user from public.employees e where e.id=new.employee_id;
    perform private.sf_put_notification(new.company_id,v_user,new.employee_id,'SHIFT_CHANGE_APPLIED','Schichtänderung übernommen','Die bestätigte Änderung wurde in deinen veröffentlichten Dienstplan übernommen.','employee-shifts','shift_change_request',new.id,jsonb_build_object('status',new.status,'appliedAt',new.applied_at));
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_shift_change_applied on public.shift_change_requests;
create trigger trg_sf_notify_shift_change_applied
after update of status on public.shift_change_requests
for each row execute function private.sf_notify_shift_change_applied();

create or replace function private.sf_notify_absence_inserted()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_name text; v_range text;
begin
  if new.request_source='EMPLOYEE' and new.status='Beantragt' then
    select trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_name from public.employees e where e.id=new.employee_id;
    v_range := to_char(new.start_date,'DD.MM.YYYY') || case when new.end_date<>new.start_date then '–'||to_char(new.end_date,'DD.MM.YYYY') else '' end;
    perform private.sf_notify_managers(new.company_id,'ABSENCE_REQUESTED','Neuer Abwesenheitsantrag',coalesce(nullif(v_name,''),'Mitarbeiter')||' hat '||new.absence_type||' für '||v_range||' beantragt.','absence','absence',new.id,jsonb_build_object('employeeId',new.employee_id,'type',new.absence_type,'startDate',new.start_date,'endDate',new.end_date));
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_absence_inserted on public.absences;
create trigger trg_sf_notify_absence_inserted
after insert on public.absences
for each row execute function private.sf_notify_absence_inserted();

create or replace function private.sf_notify_absence_decided()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_user uuid; v_name text; v_range text; v_title text; v_msg text; v_conflicts integer;
begin
  if old.status='Beantragt' and new.status in ('Genehmigt','Erfasst','Abgelehnt') then
    select e.auth_user_id, trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_user,v_name from public.employees e where e.id=new.employee_id;
    v_range := to_char(new.start_date,'DD.MM.YYYY') || case when new.end_date<>new.start_date then '–'||to_char(new.end_date,'DD.MM.YYYY') else '' end;
    if new.status='Abgelehnt' then
      v_title := 'Abwesenheitsantrag abgelehnt';
      v_msg := 'Dein Antrag ('||new.absence_type||' · '||v_range||') wurde abgelehnt.';
    elsif new.status='Erfasst' then
      v_title := 'Abwesenheit erfasst';
      v_msg := 'Deine Meldung ('||new.absence_type||' · '||v_range||') wurde erfasst.';
    else
      v_title := 'Abwesenheitsantrag genehmigt';
      v_msg := 'Dein Antrag ('||new.absence_type||' · '||v_range||') wurde genehmigt.';
    end if;
    if coalesce(new.review_note,'')<>'' then v_msg := v_msg||' Rückmeldung: '||left(new.review_note,500); end if;
    perform private.sf_put_notification(new.company_id,v_user,new.employee_id,'ABSENCE_DECISION',v_title,v_msg,'employee-absences','absence',new.id,jsonb_build_object('status',new.status,'type',new.absence_type,'startDate',new.start_date,'endDate',new.end_date));

    if new.status in ('Genehmigt','Erfasst') then
      select count(*) into v_conflicts
      from public.shift_assignments s
      where s.company_id=new.company_id and s.employee_id=new.employee_id and s.status<>'CANCELLED'
        and (s.starts_at at time zone coalesce((select c.timezone from public.companies c where c.id=new.company_id),'Europe/Berlin'))::date <= new.end_date
        and (s.ends_at at time zone coalesce((select c.timezone from public.companies c where c.id=new.company_id),'Europe/Berlin'))::date >= new.start_date;
      if v_conflicts>0 then
        perform private.sf_notify_managers(new.company_id,'ABSENCE_CONFLICT','Planungskonflikt durch Abwesenheit',coalesce(nullif(v_name,''),'Mitarbeiter')||' hat jetzt eine wirksame Abwesenheit. '||v_conflicts||' bereits geplante Schicht'||case when v_conflicts=1 then ' ist' else 'en sind' end||' betroffen.','schedule','absence',new.id,jsonb_build_object('employeeId',new.employee_id,'conflictCount',v_conflicts));
      end if;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_absence_decided on public.absences;
create trigger trg_sf_notify_absence_decided
after update of status on public.absences
for each row execute function private.sf_notify_absence_decided();

create or replace function private.sf_notify_employee_change_response()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare v_req public.shift_change_requests%rowtype; v_name text; v_msg text;
begin
  if new.approval_type='EMPLOYEE' and new.status in ('APPROVED','REJECTED')
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select * into v_req from public.shift_change_requests where id=new.change_request_id;
    if v_req.id is not null then
      select trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_name from public.employees e where e.id=v_req.employee_id;
      v_msg := coalesce(nullif(v_name,''),'Mitarbeiter')||case when new.status='APPROVED' then ' hat eine Schichtänderung bestätigt.' else ' hat eine Schichtänderung abgelehnt.' end;
      perform private.sf_notify_managers(v_req.company_id,'SHIFT_CHANGE_RESPONSE','Mitarbeiterantwort zur Schichtänderung',v_msg,'schedule','shift_change_request',v_req.id,jsonb_build_object('employeeId',v_req.employee_id,'decision',new.status,'comment',new.comment));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_sf_notify_employee_change_response on public.shift_change_approvals;
create trigger trg_sf_notify_employee_change_response
after insert or update of status on public.shift_change_approvals
for each row execute function private.sf_notify_employee_change_response();

revoke all on function private.sf_put_notification(uuid,uuid,uuid,text,text,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.sf_notify_managers(uuid,text,text,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.sf_notify_assignment_published() from public, anon, authenticated;
revoke all on function private.sf_notify_shift_change_created() from public, anon, authenticated;
revoke all on function private.sf_notify_shift_change_applied() from public, anon, authenticated;
revoke all on function private.sf_notify_absence_inserted() from public, anon, authenticated;
revoke all on function private.sf_notify_absence_decided() from public, anon, authenticated;
revoke all on function private.sf_notify_employee_change_response() from public, anon, authenticated;

insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
select cm.company_id,cm.user_id,null,'SYSTEM_ENABLED','Benachrichtigungen aktiviert','SchichtFunk informiert dich ab jetzt über wichtige Änderungen und offene Aufgaben.','schedule','company',cm.company_id,'{}'::jsonb
from public.company_members cm
where cm.status='ACTIVE'
on conflict(user_id,kind,entity_id) do nothing;

insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
select e.company_id,e.auth_user_id,e.id,'SYSTEM_ENABLED','Benachrichtigungen aktiviert','SchichtFunk informiert dich ab jetzt über neue Dienstpläne, Schichtänderungen und Entscheidungen zu Abwesenheiten.','employee-shifts','company',e.company_id,'{}'::jsonb
from public.employees e
where e.auth_user_id is not null and e.status='active'
on conflict(user_id,kind,entity_id) do nothing;;
