-- A failed bounded planning slice must not hold the visible job for 90 seconds.
create or replace function private.sf_claim_background_auto_plan(p_job_id uuid,p_worker_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; token_ uuid:=gen_random_uuid(); previous_update_ timestamptz; dispatched_ timestamptz; started_ timestamptz; bounded_ boolean;
begin
 select * into j_ from private.background_auto_plan_jobs where id=p_job_id and worker_token=p_worker_token for update;
 if not found then raise exception 'Ungültiger Workerzugang.' using errcode='42501';end if;
 if j_.status not in('QUEUED','RUNNING') or j_.lease_until>now() then return null;end if;
 if not exists(select 1 from public.company_members where company_id=j_.company_id and user_id=j_.created_by and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.background_auto_plan_jobs set status='CANCELLED',last_error='Die Planungsberechtigung wurde entzogen.',completed_at=now() where id=j_.id;return null;end if;
 previous_update_:=j_.updated_at;dispatched_:=j_.dispatched_at;
 select created_at into started_ from private.autonomous_planning_runs where background_job_id=j_.id;
 bounded_:=coalesce((j_.checkpoint->>'boundedSearch')::boolean,true);
 update private.background_auto_plan_jobs set status='RUNNING',lease_token=token_,lease_until=now()+(case when bounded_ then interval '20 seconds' else interval '90 seconds' end),invocation_count=invocation_count+1,updated_at=now() where id=j_.id returning * into j_;
 return jsonb_build_object('id',j_.id,'payload',j_.payload,'server_wishes',j_.server_wishes,'checkpoint',j_.checkpoint,'lease',token_,'revision',j_.revision,'previous_update_at',previous_update_,'dispatched_at',dispatched_,'started_at',coalesce(started_,j_.created_at));
end $$;

create or replace function private.sf_dispatch_background_plans(job_id_ uuid default null) returns int
language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; count_ int:=0;
begin
 update private.background_auto_plan_jobs j set status='FAILED',last_error='Der Auftrag hat sein Zeit- oder Aufruflimit erreicht. Bitte den Zeitraum verkürzen und erneut starten.',completed_at=now(),updated_at=now(),lease_token=null,lease_until=null
 where j.status in('QUEUED','RUNNING') and (j.created_at<now()-interval '1 hour' or j.invocation_count>=5000 or j.retry_count>=10);
 for j_ in select * from private.background_auto_plan_jobs j where j.status in('QUEUED','RUNNING') and (job_id_ is null or j.id=job_id_) and j.next_run_at<=now() and (j.lease_until is null or j.lease_until<now()) and (j.dispatched_at is null or j.dispatched_at<now()-(case when coalesce((j.checkpoint->>'boundedSearch')::boolean,true) then interval '20 seconds' else interval '90 seconds' end)) order by j.created_at limit 2 for update skip locked loop
  if j_.status='RUNNING' then update private.background_auto_plan_jobs set retry_count=retry_count+1 where id=j_.id; end if;
  perform net.http_post(url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/background-auto-plan',headers:=jsonb_build_object('Content-Type','application/json','x-background-job-token',j_.worker_token::text,'x-region','eu-central-1'),body:=jsonb_build_object('job_id',j_.id),timeout_milliseconds:=120000);
  update private.background_auto_plan_jobs set dispatched_at=now() where id=j_.id;count_:=count_+1;
 end loop;
 return count_;
end $$;
