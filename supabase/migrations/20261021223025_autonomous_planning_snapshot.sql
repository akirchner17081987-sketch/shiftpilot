-- Authoritative static eligibility. No names, contact fields, medical categories or notes.
create function private.sf_autonomy_snapshot(company_ uuid,first_ date,count_ int,run_ uuid,history_ int) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare snap_ jsonb;tz_ text;finish_ date;from_ date;policy_ jsonb;people_ jsonb;original_ jsonb;base_ jsonb;moving_ jsonb;replace_ uuid[];types_ jsonb;demand_ jsonb;candidates_ jsonb;rhythms_ jsonb;days_ jsonb;wishes_ jsonb;learned_ jsonb;
begin
 perform private.sf_background_plan_authorize(company_);
 snap_:=private.sf_preview_planning_period(company_,first_,count_);
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=company_;
 select jsonb_build_object('standard_max_shift_hours',standard_max_shift_hours,'monthly_planning_max_hours',monthly_planning_max_hours,'monthly_planning_max_shifts',monthly_planning_max_shifts,'solid_planning_rules',solid_planning_rules) into policy_ from public.company_compliance_policy where company_id=company_;
 if policy_ is null then raise exception 'Die Unternehmensregeln sind nicht vollständig geladen.';end if;
 finish_:=(first_+make_interval(months=>count_))::date;from_:=(first_-make_interval(months=>greatest(0,least(6,history_))))::date;
 select coalesce(array_agg(a.id),array[]::uuid[]),coalesce(jsonb_agg(jsonb_build_object('id',coalesce(a.legacy_id,a.id::text),'_dbId',a.id)),'[]') into replace_,moving_ from public.shift_assignments a where a.company_id=company_ and a.status='DRAFT' and a.starts_at>=first_::timestamp at time zone tz_ and a.starts_at<finish_::timestamp at time zone tz_ and not (snap_->'protectedIds' @> to_jsonb(array[a.id]));
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(e.legacy_id,e.id::text),'_dbId',e.id,'personnelNo',e.personnel_no,'role',e.role,'employment',e.employment,'weeklyHours',e.weekly_hours,'shifts',e.shift_permissions,'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q ~ '^__sp:(monthlyHours|maxWeekly|maxConsecutive|planningTeam|rhythmMode|rhythmPattern|rhythmStart|rhythmOffset)='),'[]'),'startDate',e.start_date,'contractEnd',e.contract_end) order by e.id),'[]') into people_ from public.employees e where e.company_id=company_ and e.status='active' and e.deleted_at is null;
 if jsonb_array_length(people_)>300 then raise exception 'Die automatische Vorbereitung ist auf 300 aktive Mitarbeiter begrenzt.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.code,'start',to_char(t.default_start,'HH24:MI'),'end',to_char(t.default_end,'HH24:MI'),'active',t.active,'coverageGroup',t.coverage_group,'coverageRequired',t.coverage_required,'optionalWeekdays',t.optional_weekdays) order by t.sort_order,t.code),'[]') into types_ from public.shift_templates t where t.company_id=company_ and t.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(a.legacy_id,a.id::text),'_dbId',a.id,'employeeId',coalesce(e.legacy_id,e.id::text),'date',(a.starts_at at time zone tz_)::date,'type',a.shift_code,'start',to_char(a.starts_at at time zone tz_,'HH24:MI'),'end',to_char(a.ends_at at time zone tz_,'HH24:MI'),'_dbStatus',a.status,'status',a.status,'publishedAt',a.published_at,'resource',((a.starts_at at time zone tz_)::date)::text||'|'||case when a.shift_code in('OT1','OT2','OT3') and jsonb_typeof(policy_->'solid_planning_rules'->'otWeekdayRoster'->'employeeIds')='array' then 'OT-DAY' else coalesce(t.coverage_group,a.shift_code) end,'_moving',a.id=any(replace_)) order by a.id),'[]') into original_ from public.shift_assignments a join public.employees e on e.id=a.employee_id and e.company_id=company_ left join public.shift_templates t on t.company_id=company_ and t.code=a.shift_code where a.company_id=company_ and a.status<>'CANCELLED' and a.starts_at>=least(from_,first_-8)::timestamp at time zone tz_ and a.starts_at<(finish_+8)::timestamp at time zone tz_;
 select coalesce(jsonb_agg(v-'_moving'),'[]') into base_ from jsonb_array_elements(original_) v where not (v->>'_moving')::boolean;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day::date,'type',t.code,'count',case
  when t.code in('OT1','OT2','OT3') and private.sf_ot_day_holiday(company_,d.day::date) then 0
  when t.code='OT' and (policy_->'solid_planning_rules') ? 'otHolidayStatesBySite' and not private.sf_ot_day(company_,d.day::date,null) then 0
  when ov.required_count is not null then ov.required_count
  when not extract(isodow from d.day)::int=any(t.optional_weekdays) then 0
  when t.coverage_group is not null then coalesce(gov.required_count,t.coverage_required,0)
  when t.planning_mode='optional' then 0 else greatest(coalesce(g.required_count,0),coalesce(private.sf_ot_weekend_minimum(company_,d.day::date),0)*case when t.code='OT' then 1 else 0 end,
   coalesce((select max((v->>'fallbackCount')::int) from jsonb_array_elements(coalesce(policy_->'solid_planning_rules'->'conditionalStaffing','[]')) v where v->>'shift'=t.code and extract(isodow from d.day)<=5),0)) end) order by d.day,t.sort_order,t.code),'[]') into demand_ from generate_series(first_,finish_-1,interval '1 day') d(day) cross join public.shift_templates t left join public.global_staffing_requirements g on g.company_id=company_ and g.shift_code=t.code left join public.daily_staffing_overrides ov on ov.company_id=company_ and ov.shift_code=t.code and ov.work_date=d.day::date left join lateral(select max(x.required_count) required_count from public.daily_staffing_overrides x join public.shift_templates st on st.company_id=company_ and st.code=x.shift_code where x.company_id=company_ and x.work_date=d.day::date and st.coverage_group=t.coverage_group) gov on true where t.company_id=company_ and t.active;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date)||private.sf_month_rhythm(e,d.day::date)),'[]') into rhythms_ from public.employees e cross join generate_series(first_,finish_-1,interval '1 day') d(day) where e.company_id=company_ and e.status='active' and e.deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date,'type',t.code) order by d.day,t.sort_order,e.id),'[]') into candidates_ from public.employees e cross join generate_series(first_,finish_-1,interval '1 day') d(day) cross join public.shift_templates t cross join lateral(select (d.day::date+t.default_start) at time zone tz_ starts_at,((d.day::date+case when t.default_end<=t.default_start then 1 else 0 end)+t.default_end) at time zone tz_ ends_at,private.sf_month_rhythm(e,d.day::date) rhythm) x where e.company_id=company_ and e.status='active' and e.deleted_at is null and t.company_id=company_ and t.active and t.code=any(e.shift_permissions) and (e.start_date is null or e.start_date<=d.day::date) and (e.contract_end is null or e.contract_end>=d.day::date) and (not t.responsible_only or t.responsible_employee_id=e.id) and (t.code !~* '^(TL-LE|TL-RE|TEAMLEITER)$' or e.role in('Teamleiter','Schichtleiter')) and extract(epoch from x.ends_at-x.starts_at)/3600<=coalesce((policy_->>'standard_max_shift_hours')::numeric,10)+.000001 and (extract(isodow from d.day)::int=any(t.optional_weekdays) or exists(select 1 from public.daily_staffing_overrides ov where ov.company_id=company_ and ov.work_date=d.day::date and ov.shift_code=t.code) or t.code='OT' and private.sf_ot_day(company_,d.day::date,e.id)) and private.sf_shift_scope_error(company_,e.id,t.code,x.starts_at,x.ends_at) is null and not private.sf_approved_absence_overlaps(company_,e.id,x.starts_at,x.ends_at,tz_) and (x.rhythm->>'mode'<>'required' or x.rhythm->>'expected'='ALLE' or coalesce((x.rhythm->>'exemptOt')::boolean,false) and t.code in('OT1','OT2','OT3') or t.code=any(regexp_split_to_array(x.rhythm->>'expected','[+|/]'))) and not exists(select 1 from public.planning_wishes w where w.company_id=company_ and w.employee_id=e.id and w.kind='OFF' and w.status in('PROMISED','RELEASE_REQUESTED') and w.starts_at<x.ends_at and w.ends_at>x.starts_at);
 select coalesce(jsonb_agg(distinct jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date)),'[]') into days_ from public.absences a join public.employees e on e.id=a.employee_id and e.company_id=company_ cross join lateral generate_series(greatest(first_,a.start_date),least(finish_-1,a.end_date),interval '1 day') d(day) where a.company_id=company_ and a.status in('Genehmigt','Erfasst') and a.full_day;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'employee_id',coalesce(e.legacy_id,e.id::text),'kind',w.kind,'status',w.status,'start_date',w.start_date,'end_date',w.end_date,'starts_at',w.starts_at,'ends_at',w.ends_at,'shift_code',w.shift_code,'priority',w.priority)),'[]') into wishes_ from public.planning_wishes w join public.employees e on e.id=w.employee_id and e.company_id=company_ where w.company_id=company_ and w.start_date<=finish_+1 and w.end_date>=first_-1;
 select coalesce(jsonb_agg(config),'[]') into learned_ from (select config from public.planning_assistant_preferences where company_id=company_ and enabled order by created_at limit 100) p;
 return jsonb_build_object('version',1,'company',company_,'runId',run_,'timezone',tz_,'fingerprint',snap_->>'fingerprint','historyMonths',history_,'months',(select jsonb_agg(to_char(m,'YYYY-MM')) from generate_series(first_,finish_-interval '1 month',interval '1 month') m),'policy',policy_,'employees',people_,'types',types_,'base',base_,'original',original_,'movable',moving_,'demand',demand_,'candidates',candidates_,'rhythms',rhythms_,'unavailableDays',days_,'wishes',wishes_,'learned',learned_);
end $$;
revoke all on function private.sf_autonomy_snapshot(uuid,date,int,uuid,int) from public,anon,authenticated;

create function private.sf_autonomy_claim(id_ uuid,token_ uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare r private.autonomous_planning_runs;j private.background_auto_plan_jobs;
begin
 select * into r from private.autonomous_planning_runs where id=id_ and token=token_ for update;
 if not found then raise exception 'Ungültiger Workerzugang.' using errcode='42501';end if;
 if r.status not in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING') or r.lease_until>now() then return null;end if;
 if not exists(select 1 from public.company_members where company_id=r.company_id and user_id=r.actor_id and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.autonomous_planning_runs set status='CANCELLED',error='Die Planungsberechtigung wurde entzogen.',completed_at=now() where id=r.id;return null;end if;
 update private.autonomous_planning_runs set status=case when status in('ASSESS_QUEUED','ASSESSING') then 'ASSESSING' else 'PREPARING' end,lease=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() where id=r.id returning * into r;
 if r.status='ASSESSING' then select * into j from private.background_auto_plan_jobs where id=r.background_job_id and company_id=r.company_id;end if;
 return jsonb_build_object('id',r.id,'lease',r.lease,'revision',r.revision,'phase',r.status,'snapshot',r.context,'parts',r.parts,'payload',j.payload,'result',j.result);
end $$;
revoke all on function private.sf_autonomy_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function private.sf_autonomy_claim(uuid,uuid) to service_role;
create function public.claim_autonomous_planning(p_run_id uuid,p_token uuid) returns jsonb language sql security invoker set search_path='' set statement_timeout='60s' as $$select private.sf_autonomy_claim(p_run_id,p_token)$$;
revoke all on function public.claim_autonomous_planning(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_autonomous_planning(uuid,uuid) to service_role;

create function private.sf_autonomy_finish(id_ uuid,token_ uuid,lease_ uuid,revision_ int,part_ jsonb,payload_ jsonb,summary_ jsonb,error_ text) returns boolean language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
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
   if jsonb_typeof(part_)<>'object' or part_->'months'->>0 is distinct from r.context->'months'->>jsonb_array_length(r.parts) then raise exception 'Der vorbereitete Monat passt nicht zum Auftrag.';end if;
   update private.autonomous_planning_runs set parts=parts||jsonb_build_array(part_),status='QUEUED',lease=null,lease_until=null,dispatched_at=null,revision=revision+1,updated_at=now() where id=r.id;
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
 return true;
end $$;
revoke all on function private.sf_autonomy_finish(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function private.sf_autonomy_finish(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) to service_role;
create function public.finish_autonomous_planning(p_run_id uuid,p_token uuid,p_lease uuid,p_revision int,p_part jsonb default null,p_payload jsonb default null,p_summary jsonb default null,p_error text default null) returns boolean language sql security invoker set search_path='' set statement_timeout='60s' as $$select private.sf_autonomy_finish(p_run_id,p_token,p_lease,p_revision,p_part,p_payload,p_summary,p_error)$$;
revoke all on function public.finish_autonomous_planning(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_autonomous_planning(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text) to service_role;

create function private.sf_autonomy_tick() returns int language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare s private.autonomous_planning_settings;r private.autonomous_planning_runs;local_ timestamp;first_ date;count_ int;done_ int:=0;
begin
 -- A browser is never needed for change detection, preparation or finalization.
 update private.autonomous_planning_runs watched set status=case when j.status='SUCCEEDED' then 'ASSESS_QUEUED' when j.status='APPLIED' then 'APPLIED' when j.status='CANCELLED' then 'CANCELLED' else 'REVIEW' end,error=j.last_error,dispatched_at=null,updated_at=now() from private.background_auto_plan_jobs j where watched.background_job_id=j.id and watched.status='CALCULATING' and j.status in('SUCCEEDED','APPLIED','FAILED','CANCELLED');
 update private.autonomous_planning_runs set status='FAILED',error='Der Automatiklauf hat sein Zeit- oder Wiederholungslimit erreicht.',lease=null,lease_until=null,completed_at=now(),context=null,parts='[]' where status in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING') and (created_at<now()-interval '45 minutes' or attempts>=10);
 for s in select * from private.autonomous_planning_settings where enabled order by company_id limit 100 loop
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
select cron.schedule('schichtfunk-autonomous-planning','* * * * *',$$select private.sf_autonomy_tick();$$);
notify pgrst,'reload schema';
