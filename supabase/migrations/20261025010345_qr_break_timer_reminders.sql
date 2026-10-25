-- Optional targets only: elapsed paid attendance and manual punches are unchanged.
alter table public.time_qr_independent_breaks
 add column planned_minutes smallint check(planned_minutes in (10,15,20)),
 add column reminder_sent_at timestamptz;
create index qr_break_reminders_due on public.time_qr_independent_breaks(started_at)
 where ended_at is null and planned_minutes is not null and reminder_sent_at is null;

-- Invoke the authoritative booking engine first, preserving its employee lock,
-- terminal/company/PIN revocation checks and exact-request replay protection.
create function private.qr_break_timer_request(
 p_terminal_token text,p_terminal_id uuid,p_session_token text,p_action text,
 p_request_id text,p_planned_minutes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result_ jsonb; session_ public.time_qr_independent_sessions%rowtype;
 break_ public.time_qr_independent_breaks%rowtype; user_ uuid; push_ boolean;
begin
 if p_planned_minutes is not null and (p_planned_minutes not in (10,15,20) or upper(p_action)<>'BREAK_START') then
  raise exception 'Bitte 10, 15, 20 Minuten oder unbegrenzt auswählen';
 end if;
 if p_terminal_id is null then
  result_:=public.qr_independent_action(p_terminal_token,p_session_token,p_action,p_request_id);
 else
  result_:=public.qr_desktop_request(p_terminal_id,p_action,null,null,p_session_token,null,p_request_id);
 end if;
 select * into strict session_ from public.time_qr_independent_sessions
  where token_hash=extensions.digest(lower(p_session_token),'sha256');
 select b.* into break_ from public.time_qr_independent_breaks b
  join public.time_qr_independent_shifts s on s.id=b.shift_id
  where s.employee_id=session_.employee_id and s.company_id=session_.company_id
   and s.ended_at is null and b.ended_at is null for update of b;
 if upper(p_action)='BREAK_START' and not coalesce((result_->>'replayed')::boolean,false) and break_.id is not null then
  update public.time_qr_independent_breaks set planned_minutes=p_planned_minutes
   where id=break_.id returning * into break_;
 end if;
 select auth_user_id into user_ from public.employees where id=session_.employee_id and company_id=session_.company_id;
 push_:=coalesce(private.sf_push_recipient_active(session_.company_id,user_),false)
  and exists(select 1 from public.push_subscriptions where user_id=user_ and enabled);
 return result_||jsonb_build_object('break_timer',case when break_.id is null then null else
  jsonb_build_object('planned_minutes',break_.planned_minutes,'started_at',break_.started_at,
   'ends_at',case when break_.planned_minutes is not null then break_.started_at+make_interval(mins=>break_.planned_minutes) end,
   'remind_at',case when break_.planned_minutes is not null then break_.started_at+make_interval(mins=>break_.planned_minutes-2) end) end,
  'break_push_available',push_);
end $$;
revoke all on function private.qr_break_timer_request(text,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function private.qr_break_timer_request(text,uuid,text,text,text,integer) to service_role;
create function public.qr_break_timer_request(
 p_terminal_token text,p_terminal_id uuid,p_session_token text,p_action text,p_request_id text,p_planned_minutes integer
) returns jsonb language sql security invoker set search_path='' as $$
 select private.qr_break_timer_request(p_terminal_token,p_terminal_id,p_session_token,p_action,p_request_id,p_planned_minutes)
$$;
revoke all on function public.qr_break_timer_request(text,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.qr_break_timer_request(text,uuid,text,text,text,integer) to service_role;

-- This guard runs again immediately before provider dispatch, including retries.
create function private.qr_break_reminder_expiry(p_notification_id uuid)
returns timestamptz language sql stable security definer set search_path='' as $$
 select b.started_at+make_interval(mins=>b.planned_minutes)
 from public.notifications n
 join public.time_qr_independent_breaks b on b.id=n.entity_id
 join public.time_qr_independent_shifts s on s.id=b.shift_id and s.company_id=n.company_id
 join public.employees e on e.id=s.employee_id and e.company_id=s.company_id and e.auth_user_id=n.user_id
 where n.id=p_notification_id and n.kind='BREAK_ENDING' and n.employee_id=e.id
  and b.ended_at is null and s.ended_at is null and b.planned_minutes is not null
  and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
  and private.sf_push_recipient_active(n.company_id,n.user_id)
  and clock_timestamp()>=b.started_at+make_interval(mins=>b.planned_minutes-2)
  and clock_timestamp()<b.started_at+make_interval(mins=>b.planned_minutes)
$$;
revoke all on function private.qr_break_reminder_expiry(uuid) from public,anon,authenticated;
grant execute on function private.qr_break_reminder_expiry(uuid) to service_role;
create function public.server_qr_break_reminder_expiry(p_notification_id uuid)
returns timestamptz language sql security invoker set search_path='' as $$
 select private.qr_break_reminder_expiry(p_notification_id)
$$;
revoke all on function public.server_qr_break_reminder_expiry(uuid) from public,anon,authenticated;
grant execute on function public.server_qr_break_reminder_expiry(uuid) to service_role;

create function private.sf_run_qr_break_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare r record; sent_ integer:=0; now_ timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('qr-break-reminders',0)) then return 0; end if;
 for r in select b.id,s.employee_id,s.company_id,e.auth_user_id user_id
  from public.time_qr_independent_breaks b
  join public.time_qr_independent_shifts s on s.id=b.shift_id
  join public.employees e on e.id=s.employee_id and e.company_id=s.company_id
  where b.ended_at is null and s.ended_at is null and b.planned_minutes is not null and b.reminder_sent_at is null
   and now_>=b.started_at+make_interval(mins=>b.planned_minutes-2)
   and now_<b.started_at+make_interval(mins=>b.planned_minutes)
   and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
   and private.sf_push_recipient_active(s.company_id,e.auth_user_id)
   and exists(select 1 from public.push_subscriptions ps where ps.user_id=e.auth_user_id and ps.enabled)
  order by b.started_at limit 100 for update of b skip locked
 loop
  -- The row lock serializes cancellation with enqueue; the dispatch guard catches
  -- a manual end after this transaction commits. Never end a break automatically.
  update public.time_qr_independent_breaks set reminder_sent_at=now_ where id=r.id;
  insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
   values(r.company_id,r.user_id,r.employee_id,'BREAK_ENDING','Deine Pause endet bald',
    'Deine gewählte Pausenzeit endet in etwa 2 Minuten. Bitte die Pause anschließend selbst beenden.',
    'employee-times','qr_break',r.id,jsonb_build_object('company_id',r.company_id));
  sent_:=sent_+1;
 end loop;
 return sent_;
end $$;
revoke all on function private.sf_run_qr_break_reminders() from public,anon,authenticated;
select cron.schedule('schichtfunk-qr-break-reminders','10 seconds','select private.sf_run_qr_break_reminders()');
notify pgrst,'reload schema';
