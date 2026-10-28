-- Portal-only alert once per recipient and QR shift after more than 60 minutes.
create table if not exists private.qr_pause_alert_receipts (
  company_id uuid not null,
  recipient_id uuid not null,
  source text not null,
  shift_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, recipient_id, source, shift_id)
);
revoke all on private.qr_pause_alert_receipts from public, anon, authenticated;

create or replace function private.sf_enqueue_push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'QR_BREAK_OVER_LIMIT' then return new; end if;
  insert into private.push_dispatches(notification_id) values(new.id) on conflict do nothing;
  perform private.sf_request_push_dispatch(new.id);
  return new;
end;
$$;

create or replace function private.sf_notify_long_qr_breaks()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; recipient_ record; inserted_ integer; sent_ integer := 0; now_ timestamptz := clock_timestamp(); name_ text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('qr-pause-over-limit',0)) then return 0; end if;
  for r in
    select s.company_id,s.employee_id,s.id shift_id,'independent'::text source,
           sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at))) seconds
    from public.time_qr_independent_shifts s
    join public.time_qr_independent_breaks b on b.shift_id=s.id
    where s.ended_at is null or s.ended_at > now_ - interval '5 minutes'
    group by s.company_id,s.employee_id,s.id
    having sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at))) > 3600
    union all
    select b.company_id,b.employee_id,b.assignment_id,'assigned'::text,
           sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at)))
    from public.time_qr_breaks b
    join public.time_entries t on t.assignment_id=b.assignment_id and t.company_id=b.company_id
    where t.actual_end is null or t.actual_end > now_ - interval '5 minutes'
    group by b.company_id,b.employee_id,b.assignment_id
    having sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at))) > 3600
  loop
    select nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), '')
      into name_ from public.employees e where e.id=r.employee_id and e.company_id=r.company_id;
    for recipient_ in select distinct cm.user_id from public.company_members cm
      where cm.company_id=r.company_id and cm.status='ACTIVE'
        and (cm.role='ADMIN' or cm.access_role='ADMIN' or cm.access_role='TEAM_LEAD')
    loop
      insert into private.qr_pause_alert_receipts(company_id,recipient_id,source,shift_id)
      values(r.company_id,recipient_.user_id,r.source,r.shift_id) on conflict do nothing;
      get diagnostics inserted_ = row_count;
      if inserted_ = 1 then
        insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
        values(r.company_id,recipient_.user_id,r.employee_id,'QR_BREAK_OVER_LIMIT','Pausenzeit überschritten',
          coalesce(name_,'Mitarbeiter') || ': Die erfassten Pausen einer Schicht überschreiten insgesamt 60 Minuten.',
          'time','qr_shift',r.shift_id,
          jsonb_build_object('employeeId',r.employee_id,'source',r.source));
        sent_ := sent_ + 1;
      end if;
    end loop;
  end loop;
  return sent_;
end;
$$;
revoke all on function private.sf_notify_long_qr_breaks() from public, anon, authenticated;

do $$
declare job_ record;
begin
  for job_ in select jobid from cron.job where jobname='schichtfunk-qr-pause-admin-alert' loop
    perform cron.unschedule(job_.jobid);
  end loop;
  perform cron.schedule('schichtfunk-qr-pause-admin-alert','10 seconds',
    'select private.sf_notify_long_qr_breaks();');
end;
$$;
