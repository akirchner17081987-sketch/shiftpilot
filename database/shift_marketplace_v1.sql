-- SchichtFunk: offener Schicht-Marktplatz mit verbindlicher Planerfreigabe
alter table public.shift_swap_requests alter column target_employee_id drop not null;
alter table public.shift_swap_requests drop constraint if exists shift_swap_requests_status_check;
alter table public.shift_swap_requests add constraint shift_swap_requests_status_check check (status in (
  'MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER','REJECTED_COLLEAGUE',
  'REJECTED_MANAGER','APPLIED','CANCELLED','SUPERSEDED'
));

create unique index if not exists shift_swap_one_active_per_assignment
  on public.shift_swap_requests(assignment_id)
  where status in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER');

create or replace function private.employee_offer_shift_marketplace_impl(p_assignment_id uuid,p_reason text default '')
returns uuid language plpgsql security definer
set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid(); a public.shift_assignments%rowtype; e public.employees%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if a.id is null then raise exception 'Schicht nicht gefunden'; end if;
  select * into e from public.employees where id=a.employee_id and auth_user_id=v_uid and status='active';
  if e.id is null then raise exception 'Diese Schicht gehört nicht zum angemeldeten Mitarbeiter'; end if;
  if a.status<>'PUBLISHED' or a.published_at is null then raise exception 'Nur veröffentlichte Schichten können angeboten werden'; end if;
  if a.starts_at<=now() then raise exception 'Bereits begonnene Schichten können nicht angeboten werden'; end if;
  if exists(select 1 from public.shift_swap_requests s where s.assignment_id=a.id and s.status in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER')) then
    raise exception 'Für diese Schicht läuft bereits ein Angebot';
  end if;
  insert into public.shift_swap_requests(company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,reason,requested_by)
  values(a.company_id,a.id,a.employee_id,null,a.version,'MARKET_OPEN',left(coalesce(p_reason,''),1000),v_uid) returning id into v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values)
  values(a.company_id,'SHIFT_MARKET_OFFERED','shift_swap_request',v_id,v_uid,'EMPLOYEE',jsonb_build_object('assignmentId',a.id,'status','MARKET_OPEN'));
  return v_id;
end $$;

create or replace function private.employee_claim_shift_marketplace_impl(p_offer_id uuid,p_comment text default '')
returns text language plpgsql security definer
set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype; s public.shift_swap_requests%rowtype; a public.shift_assignments%rowtype; v_reason text;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_offer_id for update;
  if s.id is null or s.status<>'MARKET_OPEN' then raise exception 'Dieses Angebot ist nicht mehr verfügbar'; end if;
  select * into v_emp from public.employees where auth_user_id=v_uid and company_id=s.company_id and status='active' limit 1;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  if v_emp.id=s.original_employee_id then raise exception 'Eigene Schichten können nicht übernommen werden'; end if;
  select * into a from public.shift_assignments where id=s.assignment_id for update;
  if a.id is null or a.version<>s.assignment_version or a.employee_id<>s.original_employee_id or a.status<>'PUBLISHED' or a.starts_at<=now() then
    update public.shift_swap_requests set status='SUPERSEDED',updated_at=now() where id=s.id;
    raise exception 'Die Schicht wurde verändert und ist nicht mehr verfügbar';
  end if;
  v_reason:=private.sf_swap_candidate_reason(a.id,v_emp.id);
  if v_reason is not null then raise exception '%',v_reason; end if;
  update public.shift_swap_requests set target_employee_id=v_emp.id,status='PENDING_MANAGER',colleague_comment=left(coalesce(p_comment,''),1000),colleague_decided_by=v_uid,colleague_decided_at=now(),updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(s.company_id,'SHIFT_MARKET_CLAIMED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status','MARKET_OPEN'),jsonb_build_object('status','PENDING_MANAGER','targetEmployeeId',v_emp.id),jsonb_build_object('comment',left(coalesce(p_comment,''),1000)));
  return 'PENDING_MANAGER';
end $$;

create or replace function private.employee_list_shift_marketplace_impl()
returns table(id uuid,is_own boolean,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,employee_role text,reason text,requested_at timestamptz,can_take boolean,block_reason text)
language plpgsql security definer set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid(); v_emp public.employees%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into v_emp from public.employees where auth_user_id=v_uid and status='active' limit 1;
  if v_emp.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
  return query
  select s.id,s.original_employee_id=v_emp.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,
    trim(o.first_name||' '||o.last_name),o.role,s.reason,s.requested_at,
    (s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id and private.sf_swap_candidate_reason(a.id,v_emp.id) is null),
    case when s.status='MARKET_OPEN' and s.original_employee_id<>v_emp.id then private.sf_swap_candidate_reason(a.id,v_emp.id) else null end
  from public.shift_swap_requests s join public.shift_assignments a on a.id=s.assignment_id join public.employees o on o.id=s.original_employee_id
  where s.company_id=v_emp.company_id and (s.status='MARKET_OPEN' or s.original_employee_id=v_emp.id or s.target_employee_id=v_emp.id)
  order by case when s.status='MARKET_OPEN' then 0 else 1 end,s.requested_at desc limit 100;
end $$;

create or replace function private.manager_list_shift_marketplace_impl(p_company_id uuid)
returns table(id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,claimed_by text,reason text,colleague_comment text,requested_at timestamptz)
language plpgsql security definer set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid();
begin
  if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=v_uid and status='ACTIVE' and role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  return query select s.id,s.status,s.assignment_id,a.shift_code,a.starts_at,a.ends_at,trim(o.first_name||' '||o.last_name),trim(coalesce(t.first_name,'')||' '||coalesce(t.last_name,'')),s.reason,s.colleague_comment,s.requested_at
  from public.shift_swap_requests s join public.shift_assignments a on a.id=s.assignment_id join public.employees o on o.id=s.original_employee_id left join public.employees t on t.id=s.target_employee_id
  where s.company_id=p_company_id and s.status in ('MARKET_OPEN','PENDING_MANAGER') order by case when s.status='PENDING_MANAGER' then 0 else 1 end,s.requested_at;
end $$;

create or replace function public.employee_offer_shift_marketplace(p_assignment_id uuid,p_reason text default '') returns uuid language sql set search_path='public','private','pg_temp' as $$select private.employee_offer_shift_marketplace_impl(p_assignment_id,p_reason)$$;
create or replace function public.employee_claim_shift_marketplace(p_offer_id uuid,p_comment text default '') returns text language sql set search_path='public','private','pg_temp' as $$select private.employee_claim_shift_marketplace_impl(p_offer_id,p_comment)$$;
create or replace function public.employee_list_shift_marketplace() returns table(id uuid,is_own boolean,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,employee_role text,reason text,requested_at timestamptz,can_take boolean,block_reason text) language sql set search_path='public','private','pg_temp' as $$select * from private.employee_list_shift_marketplace_impl()$$;
create or replace function public.manager_list_shift_marketplace(p_company_id uuid) returns table(id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,offered_by text,claimed_by text,reason text,colleague_comment text,requested_at timestamptz) language sql set search_path='public','private','pg_temp' as $$select * from private.manager_list_shift_marketplace_impl(p_company_id)$$;

revoke all on function public.employee_offer_shift_marketplace(uuid,text),public.employee_claim_shift_marketplace(uuid,text),public.employee_list_shift_marketplace(),public.manager_list_shift_marketplace(uuid) from public,anon;
grant execute on function public.employee_offer_shift_marketplace(uuid,text),public.employee_claim_shift_marketplace(uuid,text),public.employee_list_shift_marketplace(),public.manager_list_shift_marketplace(uuid) to authenticated;

create or replace function private.employee_cancel_shift_swap_impl(p_swap_id uuid) returns text language plpgsql security definer set search_path='public','private','auth','pg_temp' as $$
declare v_uid uuid:=auth.uid(); s public.shift_swap_requests%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.shift_swap_requests where id=p_swap_id for update;
  if s.id is null then raise exception 'Angebot nicht gefunden'; end if;
  if not exists(select 1 from public.employees e where e.id=s.original_employee_id and e.auth_user_id=v_uid and e.status='active') then raise exception 'Nicht berechtigt'; end if;
  if s.status not in ('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER') then raise exception 'Dieses Angebot kann nicht mehr zurückgezogen werden'; end if;
  update public.shift_swap_requests set status='CANCELLED',updated_at=now() where id=s.id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values) values(s.company_id,'SHIFT_MARKET_CANCELLED','shift_swap_request',s.id,v_uid,'EMPLOYEE',jsonb_build_object('status',s.status),jsonb_build_object('status','CANCELLED'));
  return 'CANCELLED';
end $$;
