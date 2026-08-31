-- SchichtFunk – Stoerfall-Autopilot V1

create table if not exists public.disruption_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid not null references public.shift_assignments(id) on delete cascade,
  original_employee_id uuid not null references public.employees(id) on delete restrict,
  assignment_version integer not null check (assignment_version > 0),
  incident_type text not null check (incident_type in ('SICKNESS','NO_SHOW','EMERGENCY','OTHER')),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','CANCELLED','SUPERSEDED')),
  created_by uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists disruption_one_open_incident_per_assignment
  on public.disruption_incidents (assignment_id) where status = 'OPEN';
create index if not exists disruption_incidents_company_status_idx
  on public.disruption_incidents (company_id, status, created_at desc);
create index if not exists disruption_incidents_original_employee_idx
  on public.disruption_incidents (original_employee_id);
create index if not exists disruption_incidents_created_by_idx
  on public.disruption_incidents (created_by);
create index if not exists disruption_incidents_resolved_by_idx
  on public.disruption_incidents (resolved_by) where resolved_by is not null;

create table if not exists public.disruption_offers (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.disruption_incidents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  rank_score integer not null default 0,
  rank_reasons text[] not null default '{}',
  status text not null default 'OFFERED' check (status in ('OFFERED','ACCEPTED','DECLINED','EXPIRED','REVOKED')),
  employee_comment text not null default '' check (char_length(employee_comment) <= 1000),
  offered_by uuid not null references auth.users(id),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (incident_id, employee_id)
);

create index if not exists disruption_offers_company_status_idx
  on public.disruption_offers (company_id, status, offered_at desc);
create index if not exists disruption_offers_employee_status_idx
  on public.disruption_offers (employee_id, status, offered_at desc);
create index if not exists disruption_offers_incident_idx
  on public.disruption_offers (incident_id, status);
create index if not exists disruption_offers_offered_by_idx
  on public.disruption_offers (offered_by);

alter table public.disruption_incidents enable row level security;
alter table public.disruption_offers enable row level security;
revoke all on table public.disruption_incidents, public.disruption_offers from public, anon, authenticated;
grant select on table public.disruption_incidents, public.disruption_offers to authenticated;

drop policy if exists disruption_incidents_manager_select on public.disruption_incidents;
create policy disruption_incidents_manager_select on public.disruption_incidents
for select to authenticated using (
  company_id in (
    select cm.company_id from public.company_members cm
    where cm.user_id = (select auth.uid()) and cm.status = 'ACTIVE'
      and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  )
);

drop policy if exists disruption_offers_authorized_select on public.disruption_offers;
create policy disruption_offers_authorized_select on public.disruption_offers
for select to authenticated using (
  employee_id in (
    select e.id from public.employees e
    where e.auth_user_id = (select auth.uid()) and e.status = 'active'
  )
  or company_id in (
    select cm.company_id from public.company_members cm
    where cm.user_id = (select auth.uid()) and cm.status = 'ACTIVE'
      and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  )
);

create or replace function private.manager_create_disruption_impl(
  p_company_id uuid, p_assignment_id uuid, p_incident_type text, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_assignment public.shift_assignments%rowtype;
  v_id uuid;
  v_type text := upper(trim(coalesce(p_incident_type,'')));
begin
  select cm.role into v_role from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  if v_type not in ('SICKNESS','NO_SHOW','EMERGENCY','OTHER') then raise exception 'Ungültige Störfallart'; end if;

  select * into v_assignment from public.shift_assignments
  where id=p_assignment_id and company_id=p_company_id for update;
  if v_assignment.id is null then raise exception 'Schicht nicht gefunden'; end if;
  if v_assignment.status<>'PUBLISHED' or v_assignment.published_at is null then raise exception 'Nur veröffentlichte Schichten können als Störfall gemeldet werden'; end if;
  if v_assignment.starts_at<=now() then raise exception 'Die Schicht hat bereits begonnen'; end if;
  if exists(select 1 from public.disruption_incidents d where d.assignment_id=v_assignment.id and d.status='OPEN') then raise exception 'Für diese Schicht besteht bereits ein offener Störfall'; end if;

  insert into public.disruption_incidents(company_id,assignment_id,original_employee_id,assignment_version,incident_type,note,status,created_by)
  values(p_company_id,v_assignment.id,v_assignment.employee_id,v_assignment.version,v_type,left(coalesce(p_note,''),1000),'OPEN',v_uid)
  returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
  values(p_company_id,'DISRUPTION_CREATED','disruption_incident',v_id,v_uid,v_role,
    jsonb_build_object('assignmentId',v_assignment.id,'incidentType',v_type,'status','OPEN'));
  return v_id;
end $$;

create or replace function private.manager_list_disruptions_impl(p_company_id uuid)
returns table(
  id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,
  original_employee_id uuid,original_employee text,incident_type text,note text,created_at timestamptz,
  offer_count bigint,pending_count bigint,accepted_employee text
) language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  return query
  select d.id,d.status,d.assignment_id,a.shift_code,a.starts_at,a.ends_at,d.original_employee_id,
    trim(o.first_name||' '||o.last_name),d.incident_type,d.note,d.created_at,
    count(x.id),count(x.id) filter(where x.status='OFFERED' and x.expires_at>now()),
    max(trim(e.first_name||' '||e.last_name)) filter(where x.status='ACCEPTED')
  from public.disruption_incidents d
  join public.shift_assignments a on a.id=d.assignment_id
  join public.employees o on o.id=d.original_employee_id
  left join public.disruption_offers x on x.incident_id=d.id
  left join public.employees e on e.id=x.employee_id
  where d.company_id=p_company_id
  group by d.id,a.id,o.id
  order by case when d.status='OPEN' then 0 else 1 end,d.created_at desc
  limit 100;
end $$;

create or replace function private.manager_list_disruption_candidates_impl(p_incident_id uuid)
returns table(employee_id uuid,employee_name text,employee_role text,score integer,planned_hours numeric,reasons text[],offer_status text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype;
begin
  select * into v_incident from public.disruption_incidents where id=p_incident_id;
  if v_incident.id is null then raise exception 'Störfall nicht gefunden'; end if;
  if not exists(select 1 from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id;
  return query
  with candidate as (
    select e.*,
      coalesce((select sum(extract(epoch from (s.ends_at-s.starts_at))/3600 - s.break_minutes/60.0)
        from public.shift_assignments s where s.employee_id=e.id and s.status='PUBLISHED'
          and s.starts_at>=date_trunc('week',v_assignment.starts_at)
          and s.starts_at<date_trunc('week',v_assignment.starts_at)+interval '7 days'),0)::numeric(7,2) hours,
      case when lower(v_assignment.shift_code)='teamleiter' and e.role!~*'teamleiter|schichtleiter' then 'Teamleiterrolle erforderlich'
        else private.sf_swap_candidate_reason(v_assignment.id,e.id) end block_reason
    from public.employees e
    where e.company_id=v_incident.company_id and e.status='active' and e.id<>v_incident.original_employee_id and e.auth_user_id is not null
  )
  select c.id,trim(c.first_name||' '||c.last_name),c.role,
    (100-least(45,round(c.hours)::integer)+case when c.role~*'teamleiter|schichtleiter' then 5 else 0 end)::integer,
    c.hours,array['Schichtfreigabe vorhanden','Ruhezeit und Verfügbarkeit geprüft',trim(to_char(c.hours,'FM999990D0'))||' h in der Schichtwoche geplant']::text[],x.status
  from candidate c left join public.disruption_offers x on x.incident_id=v_incident.id and x.employee_id=c.id
  where c.block_reason is null
  order by 4 desc,c.last_name,c.first_name limit 12;
end $$;

create or replace function private.manager_send_disruption_offers_impl(p_incident_id uuid,p_employee_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_role text; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype;
  v_employee public.employees%rowtype; v_employee_id uuid; v_reason text; v_count integer:=0; v_offer_id uuid; v_hours numeric; v_score integer;
begin
  if coalesce(array_length(p_employee_ids,1),0)=0 then raise exception 'Keine Ersatzkräfte ausgewählt'; end if;
  if array_length(p_employee_ids,1)>10 then raise exception 'Maximal 10 Ersatzkräfte pro Anfrage'; end if;
  select * into v_incident from public.disruption_incidents where id=p_incident_id for update;
  if v_incident.id is null or v_incident.status<>'OPEN' then raise exception 'Der Störfall ist nicht mehr offen'; end if;
  select cm.role into v_role from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then raise exception 'Die Schicht wurde zwischenzeitlich verändert'; end if;

  for v_employee_id in select distinct unnest(p_employee_ids) loop
    select * into v_employee from public.employees where id=v_employee_id and company_id=v_incident.company_id and status='active';
    if v_employee.id is null or v_employee.auth_user_id is null then raise exception 'Ersatzkraft ist nicht aktiv erreichbar'; end if;
    if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception '% ist keine Teamleitung',trim(v_employee.first_name||' '||v_employee.last_name); end if;
    v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id);
    if v_reason is not null then raise exception '%: %',trim(v_employee.first_name||' '||v_employee.last_name),v_reason; end if;
    select coalesce(sum(extract(epoch from (s.ends_at-s.starts_at))/3600-s.break_minutes/60.0),0) into v_hours from public.shift_assignments s where s.employee_id=v_employee.id and s.status='PUBLISHED' and s.starts_at>=date_trunc('week',v_assignment.starts_at) and s.starts_at<date_trunc('week',v_assignment.starts_at)+interval '7 days';
    v_score:=100-least(45,round(v_hours)::integer)+case when v_employee.role~*'teamleiter|schichtleiter' then 5 else 0 end;
    insert into public.disruption_offers(incident_id,company_id,employee_id,rank_score,rank_reasons,status,offered_by,offered_at,expires_at,responded_at,employee_comment,updated_at)
    values(v_incident.id,v_incident.company_id,v_employee.id,v_score,array['Schichtfreigabe vorhanden','Ruhezeit und Verfügbarkeit geprüft',trim(to_char(v_hours,'FM999990D0'))||' h in der Schichtwoche geplant'],'OFFERED',v_uid,now(),least(v_assignment.starts_at,now()+interval '4 hours'),null,'',now())
    on conflict(incident_id,employee_id) do update set rank_score=excluded.rank_score,rank_reasons=excluded.rank_reasons,status='OFFERED',offered_by=v_uid,offered_at=now(),expires_at=excluded.expires_at,responded_at=null,employee_comment='',updated_at=now()
    returning id into v_offer_id;
    insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
    values(v_incident.company_id,v_employee.auth_user_id,v_employee.id,'DISRUPTION_OFFER','Dringende Ersatzanfrage',v_assignment.shift_code||' · '||to_char(v_assignment.starts_at at time zone 'Europe/Berlin','DD.MM.YYYY HH24:MI'),'employee-disruptions','disruption_offer',v_offer_id,jsonb_build_object('incidentId',v_incident.id,'assignmentId',v_assignment.id))
    on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  values(v_incident.company_id,'DISRUPTION_OFFERS_SENT','disruption_incident',v_incident.id,v_uid,v_role,jsonb_build_object('count',v_count,'employeeIds',p_employee_ids));
  return v_count;
end $$;

create or replace function private.manager_cancel_disruption_impl(p_incident_id uuid,p_comment text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_role text; v_incident public.disruption_incidents%rowtype;
begin
  select * into v_incident from public.disruption_incidents where id=p_incident_id for update;
  if v_incident.id is null then raise exception 'Störfall nicht gefunden'; end if;
  select cm.role into v_role from public.company_members cm where cm.company_id=v_incident.company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER') limit 1;
  if v_role is null then raise exception 'Keine Berechtigung'; end if;
  if v_incident.status<>'OPEN' then raise exception 'Der Störfall ist bereits abgeschlossen'; end if;
  update public.disruption_incidents set status='CANCELLED',note=left(concat_ws(' · ',nullif(note,''),nullif(p_comment,'')),1000),resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  update public.disruption_offers set status='REVOKED',updated_at=now() where incident_id=v_incident.id and status='OFFERED';
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values) values(v_incident.company_id,'DISRUPTION_CANCELLED','disruption_incident',v_incident.id,v_uid,v_role,jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $$;

create or replace function private.employee_list_disruption_offers_impl()
returns table(offer_id uuid,offer_status text,incident_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,incident_type text,note text,expires_at timestamptz,employee_comment text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees e where e.auth_user_id=v_uid and e.status='active' limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query select x.id,
    case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
    d.id,a.shift_code,a.starts_at,a.ends_at,d.incident_type,d.note,x.expires_at,x.employee_comment
  from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id join public.shift_assignments a on a.id=d.assignment_id
  where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
  order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $$;

create or replace function private.employee_respond_disruption_offer_impl(p_offer_id uuid,p_decision text,p_comment text default '')
returns table(status text,message text,assignment_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid:=auth.uid(); v_decision text:=upper(trim(coalesce(p_decision,''))); v_pre public.disruption_offers%rowtype;
  v_offer public.disruption_offers%rowtype; v_incident public.disruption_incidents%rowtype; v_assignment public.shift_assignments%rowtype; v_employee public.employees%rowtype;
  v_reason text; v_change_id uuid; v_result uuid; v_old jsonb; v_new jsonb;
begin
  if v_decision not in ('ACCEPT','DECLINE') then raise exception 'Ungültige Entscheidung'; end if;
  select * into v_pre from public.disruption_offers where id=p_offer_id;
  if v_pre.id is null then raise exception 'Angebot nicht gefunden'; end if;
  select * into v_incident from public.disruption_incidents where id=v_pre.incident_id for update;
  select * into v_offer from public.disruption_offers where id=p_offer_id for update;
  select * into v_employee from public.employees e where e.id=v_offer.employee_id and e.auth_user_id=v_uid and e.status='active';
  if v_employee.id is null then raise exception 'Dieses Angebot gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if v_offer.status<>'OFFERED' then raise exception 'Dieses Angebot wurde bereits beantwortet'; end if;
  if v_decision='DECLINE' then
    update public.disruption_offers set status='DECLINED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
    return query select 'DECLINED'::text,'Anfrage abgelehnt. Die Disposition wurde informiert.'::text,v_incident.assignment_id; return;
  end if;
  if v_incident.status<>'OPEN' then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Der Störfall wurde bereits abgeschlossen'; end if;
  if v_offer.expires_at<=now() then update public.disruption_offers set status='EXPIRED',updated_at=now() where id=v_offer.id; raise exception 'Das Angebot ist abgelaufen'; end if;
  select * into v_assignment from public.shift_assignments where id=v_incident.assignment_id for update;
  if v_assignment.version<>v_incident.assignment_version or v_assignment.employee_id<>v_incident.original_employee_id or v_assignment.status<>'PUBLISHED' then
    update public.disruption_incidents set status='SUPERSEDED',resolved_at=now(),updated_at=now() where id=v_incident.id;
    update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.status='OFFERED';
    raise exception 'Die Schicht wurde zwischenzeitlich verändert';
  end if;
  if lower(v_assignment.shift_code)='teamleiter' and v_employee.role!~*'teamleiter|schichtleiter' then raise exception 'Teamleiterrolle erforderlich'; end if;
  v_reason:=private.sf_swap_candidate_reason(v_assignment.id,v_employee.id); if v_reason is not null then raise exception '%',v_reason; end if;
  v_old:=jsonb_build_object('employeeId',v_assignment.employee_id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  v_new:=jsonb_build_object('employeeId',v_employee.id,'type',v_assignment.shift_code,'startsAt',v_assignment.starts_at,'endsAt',v_assignment.ends_at,'breakMinutes',v_assignment.break_minutes,'note',coalesce(v_assignment.note,''));
  insert into public.shift_change_requests(company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
  values(v_incident.company_id,v_assignment.id,'UPDATE',v_employee.id,v_assignment.version,v_old,v_new,'Störfall-Ersatz',left('Störfall-Autopilot #'||v_incident.id::text||case when v_incident.note<>'' then ' · '||v_incident.note else '' end,2000),'NO',greatest(0,floor(extract(epoch from(v_assignment.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,v_uid)
  returning id into v_change_id;
  v_result:=public.apply_shift_change(v_change_id);
  update public.disruption_offers set status='ACCEPTED',employee_comment=left(coalesce(p_comment,''),1000),responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.disruption_offers x set status='EXPIRED',updated_at=now() where x.incident_id=v_incident.id and x.id<>v_offer.id and x.status='OFFERED';
  update public.disruption_incidents set status='RESOLVED',resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_incident.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_incident.company_id,'DISRUPTION_RESOLVED','disruption_incident',v_incident.id,v_uid,'EMPLOYEE',jsonb_build_object('employeeId',v_incident.original_employee_id),jsonb_build_object('employeeId',v_employee.id),jsonb_build_object('assignmentId',v_result,'changeRequestId',v_change_id));
  insert into public.notifications(company_id,user_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  select v_incident.company_id,cm.user_id,'DISRUPTION_RESOLVED','Störfall gelöst',trim(v_employee.first_name||' '||v_employee.last_name)||' übernimmt '||v_assignment.shift_code,'disruptions','disruption_incident',v_incident.id,jsonb_build_object('assignmentId',v_result)
  from public.company_members cm where cm.company_id=v_incident.company_id and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER');
  return query select 'ACCEPTED'::text,'Schicht übernommen und Dienstplan sofort aktualisiert.'::text,v_result;
end $$;

create or replace function public.manager_create_disruption(p_company_id uuid,p_assignment_id uuid,p_incident_type text,p_note text default '') returns uuid language sql set search_path='' as $$select private.manager_create_disruption_impl(p_company_id,p_assignment_id,p_incident_type,p_note)$$;
create or replace function public.manager_list_disruptions(p_company_id uuid) returns table(id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,original_employee_id uuid,original_employee text,incident_type text,note text,created_at timestamptz,offer_count bigint,pending_count bigint,accepted_employee text) language sql set search_path='' as $$select * from private.manager_list_disruptions_impl(p_company_id)$$;
create or replace function public.manager_list_disruption_candidates(p_incident_id uuid) returns table(employee_id uuid,employee_name text,employee_role text,score integer,planned_hours numeric,reasons text[],offer_status text) language sql set search_path='' as $$select * from private.manager_list_disruption_candidates_impl(p_incident_id)$$;
create or replace function public.manager_send_disruption_offers(p_incident_id uuid,p_employee_ids uuid[]) returns integer language sql set search_path='' as $$select private.manager_send_disruption_offers_impl(p_incident_id,p_employee_ids)$$;
create or replace function public.manager_cancel_disruption(p_incident_id uuid,p_comment text default '') returns text language sql set search_path='' as $$select private.manager_cancel_disruption_impl(p_incident_id,p_comment)$$;
create or replace function public.employee_list_disruption_offers() returns table(offer_id uuid,offer_status text,incident_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,incident_type text,note text,expires_at timestamptz,employee_comment text) language sql set search_path='' as $$select * from private.employee_list_disruption_offers_impl()$$;
create or replace function public.employee_respond_disruption_offer(p_offer_id uuid,p_decision text,p_comment text default '') returns table(status text,message text,assignment_id uuid) language sql set search_path='' as $$select * from private.employee_respond_disruption_offer_impl(p_offer_id,p_decision,p_comment)$$;

revoke all on function public.manager_create_disruption(uuid,uuid,text,text),public.manager_list_disruptions(uuid),public.manager_list_disruption_candidates(uuid),public.manager_send_disruption_offers(uuid,uuid[]),public.manager_cancel_disruption(uuid,text),public.employee_list_disruption_offers(),public.employee_respond_disruption_offer(uuid,text,text) from public,anon;
grant execute on function public.manager_create_disruption(uuid,uuid,text,text),public.manager_list_disruptions(uuid),public.manager_list_disruption_candidates(uuid),public.manager_send_disruption_offers(uuid,uuid[]),public.manager_cancel_disruption(uuid,text),public.employee_list_disruption_offers(),public.employee_respond_disruption_offer(uuid,text,text) to authenticated;
