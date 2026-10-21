-- Small durable preparation chunks stay below the Edge CPU budget.
create function private.sf_autonomy_continue(id_ uuid) returns void language plpgsql security definer set search_path='' as $$
declare r private.autonomous_planning_runs;
begin
 select * into r from private.autonomous_planning_runs where id=id_ and status='QUEUED' and lease is null for update;
 if not found then return;end if;
 perform net.http_post(url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/autonomous-planning',headers:=jsonb_build_object('Content-Type','application/json','x-autonomy-token',r.token::text,'x-region','eu-central-1'),body:=jsonb_build_object('run_id',r.id),timeout_milliseconds:=120000);
 update private.autonomous_planning_runs set dispatched_at=now() where id=r.id;
end $$;
revoke all on function private.sf_autonomy_continue(uuid) from public,anon,authenticated;

create or replace function private.sf_autonomy_finish(id_ uuid,token_ uuid,lease_ uuid,revision_ int,part_ jsonb,payload_ jsonb,summary_ jsonb,error_ text) returns boolean language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare r private.autonomous_planning_runs;s private.autonomous_planning_settings;j private.background_auto_plan_jobs;created_ jsonb;claims_ text;sub_ text;tz_ text;rows_ jsonb;replace_ uuid[];oldflag_ text;
begin
 select * into r from private.autonomous_planning_runs where id=id_ and token=token_ for update;
 if not found or r.status not in('PREPARING','ASSESSING') or r.lease is distinct from lease_ or r.revision<>revision_ or r.lease_until<now() then return false;end if;
 if not exists(select 1 from public.company_members where company_id=r.company_id and user_id=r.actor_id and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.autonomous_planning_runs set status='CANCELLED',completed_at=now(),lease=null,lease_until=null where id=r.id;return false;end if;
 if error_ is not null then update private.autonomous_planning_runs set status='FAILED',error=left(error_,700),context=null,parts='[]',lease=null,lease_until=null,completed_at=now(),updated_at=now() where id=r.id;return true;end if;
 claims_:=current_setting('request.jwt.claims',true);sub_:=current_setting('request.jwt.claim.sub',true);oldflag_:=current_setting('sf.autonomy_mutation',true);
 perform set_config('request.jwt.claim.sub',r.actor_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',r.actor_id,'role','authenticated')::text,true);
 begin
 if r.status='PREPARING' then
  if payload_ is null then
   if part_->>'preparation'='true' then
    if part_->>'month' is distinct from r.context->'months'->>jsonb_array_length(r.parts) or (part_->>'offset')::int is distinct from coalesce((r.context#>>'{preparation,offset}')::int,0)+3 or (part_->>'offset')::int>=jsonb_array_length(r.context->'employees') or part_#>>'{part,metadata,company}' is distinct from r.company_id::text or part_#>>'{part,metadata,fingerprint}' is distinct from r.context->>'fingerprint' then raise exception 'Der Mitarbeiterteil passt nicht zum Auftrag.';end if;
    update private.autonomous_planning_runs set context=jsonb_set(context,'{preparation}',part_-'preparation'),status='QUEUED',lease=null,lease_until=null,dispatched_at=null,revision=revision+1,updated_at=now() where id=r.id;
   else
    if jsonb_typeof(part_)<>'object' or part_->'months'->>0 is distinct from r.context->'months'->>jsonb_array_length(r.parts) then raise exception 'Der vorbereitete Monat passt nicht zum Auftrag.';end if;
    update private.autonomous_planning_runs set context=context-'preparation',parts=parts||jsonb_build_array(part_),status='QUEUED',lease=null,lease_until=null,dispatched_at=null,revision=revision+1,updated_at=now() where id=r.id;
   end if;
  else
   if payload_->'metadata'->>'company' is distinct from r.company_id::text or payload_->'metadata'->>'autonomousRunId' is distinct from r.id::text or payload_->'metadata'->>'fingerprint' is distinct from r.context->>'fingerprint' or jsonb_array_length(payload_->'months')<>r.month_count then raise exception 'Der Planungsauftrag passt nicht zum Server-Datenstand.';end if;
   created_:=private.sf_start_background_auto_plan(r.company_id,r.id,payload_);
   update private.autonomous_planning_runs set status='CALCULATING',background_job_id=(created_->>'id')::uuid,context=null,parts='[]',lease=null,lease_until=null,revision=revision+1,updated_at=now() where id=r.id;
  end if;
 else
  select * into j from private.background_auto_plan_jobs where id=r.background_job_id and company_id=r.company_id for update;
  if j.status='APPLIED' then update private.autonomous_planning_runs set status='APPLIED',lease=null,lease_until=null,completed_at=now() where id=r.id;
  elsif j.status<>'SUCCEEDED' or j.result is null then raise exception 'Der gespeicherte Hintergrundvorschlag ist nicht mehr verfügbar.';
  else
   if jsonb_typeof(summary_)<>'object' or (summary_->>'checked')::int<>jsonb_array_length(j.result->'preview') then raise exception 'Die Abschlussprüfung passt nicht zum gespeicherten Vorschlag.';end if;
   select * into s from private.autonomous_planning_settings where company_id=r.company_id;
   update private.autonomous_planning_runs set summary=summary_,status=case when coalesce((summary_->>'canApply')::boolean,false) then 'READY' else 'REVIEW' end,lease=null,lease_until=null,completed_at=now(),updated_at=now(),revision=revision+1 where id=r.id;
   if r.source<>'MANUAL' and s.enabled and s.mode='DRAFT' and r.settings_revision=s.revision and coalesce((summary_->>'canApply')::boolean,false) and (summary_->>'open')::int=0 and (summary_->>'critical')::int=0 and (summary_->>'errors')::int=0 then
    select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=r.company_id;
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',e.id,'shift_code',v->>'type','starts_at',(((v->>'date')::date+(v->>'start')::time) at time zone tz_),'ends_at',((((v->>'date')::date+case when (v->>'end')::time<=(v->>'start')::time then 1 else 0 end)+(v->>'end')::time) at time zone tz_),'legacy_id','autonomy-'||r.id::text||'-'||n::text,'note','Automatisch geprüfter Entwurf')),'[]') into rows_ from jsonb_array_elements(j.result->'preview') with ordinality a(v,n) join public.employees e on e.company_id=r.company_id and coalesce(e.legacy_id,e.id::text)=v->>'employeeId';
    if jsonb_array_length(rows_)<>jsonb_array_length(j.result->'preview') then raise exception 'Ein Mitarbeiter ist nicht mehr zugeordnet.';end if;
    select coalesce(array_agg((v->>'_dbId')::uuid),array[]::uuid[]) into replace_ from jsonb_array_elements(j.payload->'metadata'->'movable') v;
    if jsonb_array_length(rows_)>0 then
     perform set_config('sf.autonomy_mutation','yes',true);
     created_:=private.sf_apply_planning_period(r.company_id,r.first_month,r.month_count,j.fingerprint,replace_,rows_,true);
     set constraints all immediate;
     perform private.sf_change_background_auto_plan(r.company_id,j.id,'APPLIED');
     update private.autonomous_planning_runs set status='APPLIED',summary=summary_||jsonb_build_object('saved',created_),error=null where id=r.id;
    end if;
   end if;
  end if;
 end if;
 exception when others then
  update private.autonomous_planning_runs set status='REVIEW',summary=summary_,error=left(SQLERRM,700),context=null,parts='[]',lease=null,lease_until=null,completed_at=now(),updated_at=now() where id=r.id;
 end;
 perform set_config('sf.autonomy_mutation',coalesce(oldflag_,''),true);perform set_config('request.jwt.claim.sub',coalesce(sub_,''),true);perform set_config('request.jwt.claims',coalesce(claims_,'{}'),true);
 begin perform private.sf_autonomy_continue(r.id);exception when others then null;end;
 return true;
end $$;
revoke all on function private.sf_autonomy_finish(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function private.sf_autonomy_finish(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) to service_role;

-- Do not starve companies after the first hundred enabled configurations.
create or replace function private.sf_autonomy_tick() returns int language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare s private.autonomous_planning_settings;r private.autonomous_planning_runs;local_ timestamp;first_ date;count_ int;done_ int:=0;
begin
 -- A browser is never needed for change detection, preparation or finalization.
 update private.autonomous_planning_runs watched set status=case when j.status='SUCCEEDED' then 'ASSESS_QUEUED' when j.status='APPLIED' then 'APPLIED' when j.status='CANCELLED' then 'CANCELLED' else 'REVIEW' end,error=j.last_error,dispatched_at=null,updated_at=now() from private.background_auto_plan_jobs j where watched.background_job_id=j.id and watched.status='CALCULATING' and j.status in('SUCCEEDED','APPLIED','FAILED','CANCELLED');
 update private.autonomous_planning_runs set status='FAILED',error='Der Automatiklauf hat sein Zeit- oder Wiederholungslimit erreicht.',lease=null,lease_until=null,completed_at=now(),context=null,parts='[]' where status in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING') and (created_at<now()-interval '45 minutes' or attempts>=512);
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
