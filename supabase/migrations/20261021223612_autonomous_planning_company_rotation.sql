-- Do not starve companies after the first hundred enabled configurations.
create or replace function private.sf_autonomy_tick() returns int language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare s private.autonomous_planning_settings;r private.autonomous_planning_runs;local_ timestamp;first_ date;count_ int;done_ int:=0;
begin
 -- A browser is never needed for change detection, preparation or finalization.
 update private.autonomous_planning_runs watched set status=case when j.status='SUCCEEDED' then 'ASSESS_QUEUED' when j.status='APPLIED' then 'APPLIED' when j.status='CANCELLED' then 'CANCELLED' else 'REVIEW' end,error=j.last_error,dispatched_at=null,updated_at=now() from private.background_auto_plan_jobs j where watched.background_job_id=j.id and watched.status='CALCULATING' and j.status in('SUCCEEDED','APPLIED','FAILED','CANCELLED');
 update private.autonomous_planning_runs set status='FAILED',error='Der Automatiklauf hat sein Zeit- oder Wiederholungslimit erreicht.',lease=null,lease_until=null,completed_at=now(),context=null,parts='[]' where status in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING') and (created_at<now()-interval '45 minutes' or attempts>=10);
 for s in select * from private.autonomous_planning_settings where enabled order by company_id loop
  if exists(select 1 from private.autonomous_planning_runs where company_id=s.company_id and status in('QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING')) or exists(select 1 from private.background_auto_plan_jobs where company_id=s.company_id and status in('QUEUED','RUNNING')) then continue;end if;
  select now() at time zone coalesce(c.timezone,'Europe/Berlin') into local_ from public.companies c where c.id=s.company_id;
  begin
   if s.on_changes and s.dirty_at<now()-interval '1 minute' then
    first_:=date_trunc('month',s.dirty_first)::date;
    count_:=(extract(year from age(date_trunc('month',s.dirty_last),first_))*12+extract(month from age(date_trunc('month',s.dirty_last),first_)))::int+1;
    if count_>3 then
     insert into private.autonomous_planning_runs(company_id,actor_id,source,schedule_key,first_month,month_count,settings_revision,status,error,completed_at) values(s.company_id,s.actor_id,'CHANGE','change:'||s.dirty_revision,first_,1,s.revision,'REVIEW','Die Änderungen betreffen mehr als drei Monate. Bitte den Zeitraum gezielt prüfen.',now()) on conflict do nothing;
    else perform private.sf_autonomy_queue(s.company_id,s.actor_id,first_,greatest(1,count_),'CHANGE','change:'||s.dirty_revision);end if;
    update private.autonomous_planning_settings set dirty_at=null,dirty_first=null,dirty_last=null where company_id=s.company_id and dirty_revision=s.dirty_revision;
   elsif extract(day from local_)>=least(s.run_day,extract(day from (date_trunc('month',local_)+interval '1 month - 1 day'))::int) and local_::time>=s.run_time then
    first_:=(date_trunc('month',local_)+make_interval(months=>s.lead_months))::date;
    perform private.sf_autonomy_queue(s.company_id,s.actor_id,first_,s.month_count,'MONTHLY','monthly:'||to_char(local_,'YYYY-MM'));
   end if;
  exception when others then
   -- A revoked actor cannot create background work. Keep the configuration visible.
   if SQLSTATE='42501' then update private.autonomous_planning_settings set enabled=false,revision=revision+1,updated_at=now() where company_id=s.company_id;end if;
  end;
 end loop;
 for r in select * from private.autonomous_planning_runs where status in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING') and (lease_until is null or lease_until<now()) and (dispatched_at is null or dispatched_at<now()-interval '95 seconds') order by created_at limit 2 for update skip locked loop
  perform net.http_post(url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/autonomous-planning',headers:=jsonb_build_object('Content-Type','application/json','x-autonomy-token',r.token::text,'x-region','eu-central-1'),body:=jsonb_build_object('run_id',r.id),timeout_milliseconds:=120000);
  update private.autonomous_planning_runs set dispatched_at=now() where id=r.id;done_:=done_+1;
 end loop;
 return done_;
end $$;
revoke all on function private.sf_autonomy_tick() from public,anon,authenticated;
