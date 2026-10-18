-- Server-only operational reminders. No free-text task content leaves the portal.
create table private.handover_reminder_log(
 company_id uuid not null references public.companies(id) on delete cascade,
 board_id uuid not null references public.shift_handovers(id) on delete cascade,
 item_id uuid references public.shift_handover_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id uuid references public.employees(id) on delete cascade,
 kind text not null check(kind in('HANDOVER_PENDING','HANDOVER_CRITICAL_OVERDUE')),
 entity_id uuid not null,
 cycle text not null,
 sent_count integer not null default 0 check(sent_count between 0 and 3),
 last_sent_at timestamptz,
 resolved_at timestamptz,
 primary key(user_id,kind,entity_id),
 check((kind='HANDOVER_PENDING' and item_id is null) or
       (kind='HANDOVER_CRITICAL_OVERDUE' and item_id=entity_id))
);
create index handover_reminder_company on private.handover_reminder_log(company_id);
create index handover_reminder_board on private.handover_reminder_log(board_id);
create index handover_reminder_item on private.handover_reminder_log(item_id);
create index handover_reminder_employee on private.handover_reminder_log(employee_id);
alter table private.handover_reminder_log enable row level security;
revoke all on private.handover_reminder_log from public,anon,authenticated;
create policy handover_reminder_server_only on private.handover_reminder_log for all to authenticated using(false) with check(false);

create or replace function private.sf_handover_reminder_candidates(p_company uuid,p_now timestamptz)
returns table(kind text,entity_id uuid,board_id uuid,item_id uuid,user_id uuid,employee_id uuid,cycle text,starts_at timestamptz,is_manager boolean)
language sql stable security definer set search_path='' as $$
 with boards as (
  select b.* from public.shift_handovers b
  where b.company_id=p_company and b.starts_at<=p_now
  and not exists(select 1 from private.employee_erasure_jobs j where j.company_id=p_company and j.status='EXTERNAL')
  and exists(select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
    where a.company_id=b.company_id and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at
    and a.status='PUBLISHED' and a.published_at is not null and t.site_id is not distinct from b.site_id)
 ), crew as (
  select distinct b.id board_id,e.id employee_id,e.auth_user_id user_id
  from boards b join public.shift_assignments a on a.company_id=b.company_id and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at
  join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code and t.site_id is not distinct from b.site_id
  join public.employees e on e.id=a.employee_id and e.company_id=b.company_id
  where a.status='PUBLISHED' and a.published_at is not null and b.ends_at>p_now
  and e.auth_user_id is not null and e.deleted_at is null and e.status='active' and e.access_status='ACTIVE'
  and not exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=e.auth_user_id
    and (m.status<>'ACTIVE' or m.role in('TIME_TRACKING','VIEWER') or 'read_only'=any(m.extra_permissions)))
 ), managers as (
  select m.user_id from public.company_members m where m.company_id=p_company and m.status='ACTIVE'
  and m.role in('OWNER','ADMIN','PLANNER','DISPATCHER') and not ('read_only'=any(m.extra_permissions))
 ), events as (
  select 'HANDOVER_PENDING'::text kind,s.id entity_id,b.id board_id,null::uuid item_id,extract(epoch from s.sent_at)::text cycle,b.starts_at,null::uuid responsible
  from public.shift_handovers s join boards b on b.id=s.target_id and b.company_id=s.company_id
  where s.state='SENT' and s.sent_at is not null and s.received_at is null
  and p_now>=greatest(b.starts_at,s.sent_at)+interval '15 minutes'
  union all
  select 'HANDOVER_CRITICAL_OVERDUE',i.id,b.id,i.id,extract(epoch from i.due_at)::text,b.starts_at,i.responsible_employee_id
  from boards b join public.shift_handover_items i on i.board_id=b.id and i.company_id=b.company_id
  where b.state='WORKING' and i.critical and i.due_at<=p_now and i.status in('OPEN','IN_PROGRESS')
 ), recipients as (
  select ev.*,c.user_id,c.employee_id,false is_manager from events ev join crew c on c.board_id=ev.board_id
  where ev.kind='HANDOVER_PENDING' or ev.responsible is null or ev.responsible=c.employee_id
  union all
  select ev.*,m.user_id,null::uuid,true from events ev cross join managers m
 )
 select r.kind,r.entity_id,r.board_id,r.item_id,r.user_id,
   (array_agg(r.employee_id) filter(where r.employee_id is not null))[1],r.cycle,r.starts_at,bool_or(r.is_manager)
 from recipients r where private.sf_push_recipient_active(p_company,r.user_id)
 group by r.kind,r.entity_id,r.board_id,r.item_id,r.user_id,r.cycle,r.starts_at
$$;
revoke all on function private.sf_handover_reminder_candidates(uuid,timestamptz) from public,anon,authenticated;

create or replace function private.sf_run_handover_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare company_ uuid;r record;claim_ integer;sent_ integer:=0;
begin
 -- Serialize overlapping workers. Shared company locks also serialize user edits.
 if not pg_try_advisory_xact_lock(hashtextextended('handover-reminders',0)) then return 0;end if;
 for company_ in select distinct company_id from public.shift_handovers order by company_id loop
  if not pg_try_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0)) then continue;end if;
  -- Ineligible recipients, received handovers, completed/carried tasks and cancelled
  -- duties resolve their current reminder episode without sending another push.
  update private.handover_reminder_log l set resolved_at=p_now
  where l.company_id=company_ and l.resolved_at is null and not exists(
    select 1 from private.sf_handover_reminder_candidates(company_,p_now) c
    where c.user_id=l.user_id and c.kind=l.kind and c.entity_id=l.entity_id and c.cycle=l.cycle);
  update public.notifications n set is_read=true,read_at=coalesce(n.read_at,p_now),
    metadata=n.metadata||jsonb_build_object('resolved',true)
  from private.handover_reminder_log l where l.company_id=company_ and l.resolved_at is not null
    and n.company_id=l.company_id and n.user_id=l.user_id and n.kind=l.kind and n.entity_id=l.entity_id
    and n.metadata->>'resolved' is distinct from 'true';
  for r in select * from private.sf_handover_reminder_candidates(company_,p_now) order by kind,entity_id,user_id loop
   claim_:=null;
   insert into private.handover_reminder_log as l(company_id,board_id,item_id,user_id,employee_id,kind,entity_id,cycle,sent_count,last_sent_at)
   values(company_,r.board_id,r.item_id,r.user_id,r.employee_id,r.kind,r.entity_id,r.cycle,1,p_now)
   on conflict(user_id,kind,entity_id) do update set
     cycle=excluded.cycle,employee_id=excluded.employee_id,resolved_at=null,last_sent_at=p_now,
     sent_count=case when l.resolved_at is not null or l.cycle<>excluded.cycle then 1 else l.sent_count+1 end
   where l.resolved_at is not null or l.cycle<>excluded.cycle or (l.sent_count<3 and l.last_sent_at<=p_now-interval '1 hour')
   returning sent_count into claim_;
   if claim_ is null then continue;end if;
   perform private.sf_put_notification(company_,r.user_id,r.employee_id,r.kind,
     case when r.kind='HANDOVER_PENDING' then 'Schichtübergabe: Übernahme ausstehend' else 'Kritische Aufgabe überfällig' end,
     case when r.kind='HANDOVER_PENDING' then 'Bitte die eingegangene Schichtübergabe prüfen und die Übernahme im Portal bestätigen.'
       else 'Bitte die kritische Aufgabe und den vereinbarten Eskalationsweg in der Schichtübergabe prüfen.' end,
     case when r.is_manager then 'handover' else 'employee-handover' end,
     'handover_reminder',r.entity_id,
     jsonb_build_object('board_id',r.board_id,'item_id',r.item_id,'starts_at',r.starts_at,
       'company_id',company_,'cycle',r.cycle,'reminder_count',claim_,'resolved',false));
   sent_:=sent_+1;
  end loop;
 end loop;
 return sent_;
end $$;
revoke all on function private.sf_run_handover_reminders(timestamptz) from public,anon,authenticated;

-- Check the actual source again immediately before a delayed/retried push.
create or replace function public.server_handover_reminder_active(p_notification_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n
 join private.handover_reminder_log l on l.company_id=n.company_id and l.user_id=n.user_id and l.kind=n.kind and l.entity_id=n.entity_id
 join lateral private.sf_handover_reminder_candidates(n.company_id,now()) c
   on c.user_id=l.user_id and c.kind=l.kind and c.entity_id=l.entity_id and c.cycle=l.cycle
 where n.id=p_notification_id and l.resolved_at is null and n.metadata->>'cycle'=l.cycle
 and n.metadata->>'resolved'='false')
$$;
revoke all on function public.server_handover_reminder_active(uuid) from public,anon,authenticated;
grant execute on function public.server_handover_reminder_active(uuid) to service_role;

select cron.schedule('schichtfunk-handover-reminders','*/5 * * * *','select private.sf_run_handover_reminders()');
notify pgrst,'reload schema';
