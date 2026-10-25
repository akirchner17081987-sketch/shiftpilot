-- Start preparation and final assessment as soon as their inputs are committed.
-- The periodic scheduler remains the fallback after a failed network dispatch.
create or replace function private.sf_autonomy_continue(id_ uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r private.autonomous_planning_runs;
begin
 select * into r from private.autonomous_planning_runs where id=id_ and status in('QUEUED','ASSESS_QUEUED') and lease is null for update;
 if not found then return;end if;
 perform net.http_post(url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/autonomous-planning',headers:=jsonb_build_object('Content-Type','application/json','x-autonomy-token',r.token::text,'x-region','eu-central-1'),body:=jsonb_build_object('run_id',r.id),timeout_milliseconds:=120000);
 update private.autonomous_planning_runs set dispatched_at=now() where id=r.id;
end $$;

create or replace function private.sf_autonomy_queue(company_ uuid,actor_ uuid,first_ date,count_ int,source_ text,key_ text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.autonomous_planning_settings;r private.autonomous_planning_runs;claims_ text;sub_ text;
begin
 perform pg_advisory_xact_lock(hashtextextended('autonomy:'||company_::text,0));
 if not exists(select 1 from public.company_members where company_id=company_ and user_id=actor_ and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then raise exception 'Aktive Planungsrechte fehlen.' using errcode='42501';end if;
 if first_ is null or extract(day from first_)<>1 or count_ not between 1 and 3 then raise exception 'Ungültiger Automatikzeitraum.';end if;
 select * into r from private.autonomous_planning_runs where company_id=company_ and schedule_key=key_;if found then return private.sf_autonomy_status(r);end if;
 if exists(select 1 from private.autonomous_planning_runs where company_id=company_ and status in('QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING')) or exists(select 1 from private.background_auto_plan_jobs where company_id=company_ and status in('QUEUED','RUNNING')) then raise exception 'Für dieses Unternehmen läuft bereits eine Planung.';end if;
 if (select count(*) from private.autonomous_planning_runs where company_id=company_ and created_at>now()-interval '1 hour')>=12 then raise exception 'Zu viele Automatikläufe. Bitte später erneut versuchen.';end if;
 insert into private.autonomous_planning_settings(company_id) values(company_) on conflict do nothing;
 select * into s from private.autonomous_planning_settings where company_id=company_;
 insert into private.autonomous_planning_runs(company_id,actor_id,source,schedule_key,first_month,month_count,settings_revision) values(company_,actor_,source_,key_,first_,count_,s.revision) returning * into r;
 claims_:=current_setting('request.jwt.claims',true);sub_:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',actor_::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_,'role','authenticated')::text,true);
 begin update private.autonomous_planning_runs set context=private.sf_autonomy_snapshot(company_,first_,count_,r.id,s.history_months) where id=r.id returning * into r;
 exception when others then update private.autonomous_planning_runs set status='REVIEW',error=left(SQLERRM,700),completed_at=now() where id=r.id returning * into r;end;
 perform set_config('request.jwt.claim.sub',coalesce(sub_,''),true);perform set_config('request.jwt.claims',coalesce(claims_,'{}'),true);
 if r.status='QUEUED' then begin perform private.sf_autonomy_continue(r.id);exception when others then null;end;end if;
 return private.sf_autonomy_status(r);
end $$;

create function private.sf_autonomy_completion_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare run_id_ uuid;
begin
 update private.autonomous_planning_runs r set status=case when NEW.status='SUCCEEDED' then 'ASSESS_QUEUED' when NEW.status='APPLIED' then 'APPLIED' when NEW.status='CANCELLED' then 'CANCELLED' else 'REVIEW' end,error=NEW.last_error,dispatched_at=null,updated_at=now()
 where r.background_job_id=NEW.id and r.status='CALCULATING' returning r.id into run_id_;
 if run_id_ is not null and NEW.status='SUCCEEDED' then
  begin perform private.sf_autonomy_continue(run_id_);exception when others then null;end;
 end if;
 return null;
end $$;
revoke all on function private.sf_autonomy_completion_notify() from public,anon,authenticated;
create trigger sf_autonomy_completion_notify after update of status on private.background_auto_plan_jobs
for each row when (OLD.status is distinct from NEW.status and NEW.status in ('SUCCEEDED','FAILED','CANCELLED','APPLIED'))
execute function private.sf_autonomy_completion_notify();
