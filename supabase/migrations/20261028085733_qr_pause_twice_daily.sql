-- Twice-daily QR pause check; retain ended shifts for 24 hours.
CREATE OR REPLACE FUNCTION private.sf_notify_long_qr_breaks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; recipient_ record; inserted_ integer; sent_ integer := 0; now_ timestamptz := clock_timestamp(); name_ text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('qr-pause-over-limit',0)) then return 0; end if;
  for r in
    select s.company_id,s.employee_id,s.id shift_id,'independent'::text source,
           sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at))) seconds
    from public.time_qr_independent_shifts s
    join public.time_qr_independent_breaks b on b.shift_id=s.id
    where s.ended_at is null or s.ended_at > now_ - interval '24 hours'
    group by s.company_id,s.employee_id,s.id
    having sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at))) > 3600
    union all
    select b.company_id,b.employee_id,b.assignment_id,'assigned'::text,
           sum(extract(epoch from (coalesce(b.ended_at,now_)-b.started_at)))
    from public.time_qr_breaks b
    join public.time_entries t on t.assignment_id=b.assignment_id and t.company_id=b.company_id
    where t.actual_end is null or t.actual_end > now_ - interval '24 hours'
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
$function$
;

-- pg_cron runs in GMT. DST changes the matching UTC hour, so the four
-- candidate slots invoke the worker only at 08:30 and 19:30 Europe/Berlin.
do $schedule$
declare job_ bigint;
begin
  select jobid into strict job_ from cron.job where jobname='schichtfunk-qr-pause-admin-alert';
  perform cron.alter_job(job_, schedule := '30 6,7,17,18 * * *',
    command := $command$select private.sf_notify_long_qr_breaks() where extract(hour from (current_timestamp at time zone 'Europe/Berlin')) in (8,19);$command$, active := true);
end
$schedule$;

