-- Durable planning previews. No worker operation changes the duty roster.
create table private.background_auto_plan_jobs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 created_by uuid not null, request_id uuid not null, first_month date not null, month_count int not null check(month_count between 1 and 12),
 status text not null default 'QUEUED' check(status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','APPLIED')),
 payload jsonb not null, checkpoint jsonb, result jsonb, fingerprint text not null,
 progress int not null default 0 check(progress between 0 and 100), label text not null default 'Auftrag gespeichert', detail text not null default '',
 invocation_count int not null default 0, retry_count int not null default 0, revision int not null default 0,
 worker_token uuid not null default gen_random_uuid(), lease_token uuid, lease_until timestamptz,
 dispatched_at timestamptz, next_run_at timestamptz not null default now(), last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
 unique(company_id,created_by,request_id)
);
alter table private.background_auto_plan_jobs enable row level security;
create policy background_auto_plan_no_direct_access on private.background_auto_plan_jobs for all to anon,authenticated using(false) with check(false);
revoke all on private.background_auto_plan_jobs from public,anon,authenticated;
create unique index background_auto_plan_one_active_company on private.background_auto_plan_jobs(company_id) where status in('QUEUED','RUNNING');
create index background_auto_plan_due on private.background_auto_plan_jobs(next_run_at) where status in('QUEUED','RUNNING');
create index background_auto_plan_company_created on private.background_auto_plan_jobs(company_id,created_at desc);

create function private.sf_background_plan_authorize(company_ uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=company_ and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then raise exception 'Für dieses Unternehmen fehlen aktive Planungsrechte.' using errcode='42501'; end if;
end $$;
revoke all on function private.sf_background_plan_authorize(uuid) from public,anon;
grant execute on function private.sf_background_plan_authorize(uuid) to authenticated,service_role;

create function private.sf_background_plan_status(job_ private.background_auto_plan_jobs) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',(job_).id,'company_id',(job_).company_id,'status',(job_).status,'first_month',(job_).first_month,'month_count',(job_).month_count,'progress',(job_).progress,'label',(job_).label,'detail',(job_).detail,'created_at',(job_).created_at,'updated_at',(job_).updated_at,'completed_at',(job_).completed_at,'invocations',(job_).invocation_count,'error',(job_).last_error,'result',case when (job_).status='SUCCEEDED' then (job_).result else null end)
$$;
revoke all on function private.sf_background_plan_status(private.background_auto_plan_jobs) from public,anon,authenticated;

-- Internal dispatcher only. An idle cron tick does not invoke an Edge Function.
create function private.sf_dispatch_background_plans(job_id_ uuid default null) returns int language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; count_ int:=0;
begin
 update private.background_auto_plan_jobs j set status='FAILED',last_error='Der Auftrag hat sein Zeit- oder Aufruflimit erreicht. Bitte den Zeitraum verkürzen und erneut starten.',completed_at=now(),updated_at=now(),lease_token=null,lease_until=null
 where j.status in('QUEUED','RUNNING') and (j.created_at<now()-interval '1 hour' or j.invocation_count>=5000 or j.retry_count>=10);
 for j_ in select * from private.background_auto_plan_jobs j where j.status in('QUEUED','RUNNING') and (job_id_ is null or j.id=job_id_) and j.next_run_at<=now() and (j.lease_until is null or j.lease_until<now()) and (j.dispatched_at is null or j.dispatched_at<now()-interval '90 seconds') order by j.created_at limit 2 for update skip locked loop
  if j_.status='RUNNING' then update private.background_auto_plan_jobs set retry_count=retry_count+1 where id=j_.id; end if;
  perform net.http_post(url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/background-auto-plan',headers:=jsonb_build_object('Content-Type','application/json','x-background-job-token',j_.worker_token::text,'x-region','eu-central-1'),body:=jsonb_build_object('job_id',j_.id),timeout_milliseconds:=120000);
  update private.background_auto_plan_jobs set dispatched_at=now() where id=j_.id;count_:=count_+1;
 end loop;
 return count_;
end $$;
revoke all on function private.sf_dispatch_background_plans(uuid) from public,anon,authenticated;

create function private.sf_start_background_auto_plan(company_ uuid,request_ uuid,payload_ jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; first_ date; months_ int; snapshot_ jsonb; input_ jsonb; wishes_ jsonb;
begin
 perform private.sf_background_plan_authorize(company_);
 perform pg_advisory_xact_lock(hashtextextended('background-plan:'||company_::text,0));
 select * into j_ from private.background_auto_plan_jobs where company_id=company_ and created_by=auth.uid() and request_id=request_;
 if found then return private.sf_background_plan_status(j_); end if;
 select * into j_ from private.background_auto_plan_jobs where company_id=company_ and status in('QUEUED','RUNNING');
 if found then
  if payload_->'metadata'->>'fingerprint'=j_.fingerprint and payload_->'months'->>0=to_char(j_.first_month,'YYYY-MM') and jsonb_array_length(payload_->'months')=j_.month_count then return private.sf_background_plan_status(j_);end if;
  raise exception 'Für dieses Unternehmen läuft bereits eine Hintergrundplanung. Bitte den vorhandenen Auftrag ansehen oder abbrechen.';
 end if;
 if request_ is null or coalesce((payload_->>'version')::int,0)<>1 or jsonb_typeof(payload_->'months')<>'array' or octet_length(payload_::text)>16000000 then raise exception 'Ungültiger oder zu großer Planungsauftrag.'; end if;
 months_:=jsonb_array_length(payload_->'months');first_:=(payload_->'months'->>0||'-01')::date;
 if months_ not between 1 and 12 or jsonb_array_length(payload_->'monthInputs')<>months_ or (payload_->'metadata'->>'company') is distinct from company_::text then raise exception 'Die Planungsmonate oder das Unternehmen passen nicht zum Auftrag.'; end if;
 for input_ in select v from jsonb_array_elements(jsonb_build_array(payload_->'minimumInput')||(payload_->'monthInputs')) v loop
  if input_->'solidRules' is distinct from (select solid_planning_rules from public.company_compliance_policy where company_id=company_) then raise exception 'Die Planungsregeln wurden geändert. Bitte erneut vorbereiten.'; end if;
  if jsonb_array_length(input_->'employees')>300 or jsonb_array_length(input_->'groups')>12000 or jsonb_array_length(input_->'candidates')>40000 then raise exception 'Bitte einen kürzeren Planungszeitraum auswählen.'; end if;
  if exists(select 1 from jsonb_array_elements(input_->'employees') e where not exists(select 1 from public.employees db where db.company_id=company_ and db.deleted_at is null and db.status='active' and (db.legacy_id=e->>'id' or db.id::text=e->>'id'))) then raise exception 'Ein Mitarbeiter gehört nicht zum aktiven Unternehmen.'; end if;
 end loop;
 snapshot_:=private.sf_preview_planning_period(company_,first_,months_);
 if snapshot_->>'fingerprint' is distinct from payload_->'metadata'->>'fingerprint' then raise exception 'Die Planungsdaten wurden geändert. Bitte erneut vorbereiten.'; end if;
 if (select count(*) from private.background_auto_plan_jobs where company_id=company_ and created_at>now()-interval '1 hour')>=20 then raise exception 'Zu viele neue Planungsaufträge. Bitte später erneut versuchen.'; end if;
 -- Confirmed promises come from the database even if the browser wish feed was unavailable.
 select coalesce(jsonb_agg((to_jsonb(w)-'comment')||jsonb_build_object('employee_id',coalesce(e.legacy_id,e.id::text)) order by w.id),'[]'::jsonb) into wishes_ from public.planning_wishes w join public.employees e on e.id=w.employee_id and e.company_id=company_ where w.company_id=company_;
 payload_:=jsonb_set(payload_,'{minimumInput,wishes}',wishes_,true);
 payload_:=jsonb_set(payload_,'{monthInputs}',(select jsonb_agg(jsonb_set(v,'{wishes}',wishes_,true)) from jsonb_array_elements(payload_->'monthInputs')v),true);
 insert into private.background_auto_plan_jobs(company_id,created_by,request_id,first_month,month_count,payload,fingerprint) values(company_,auth.uid(),request_,first_,months_,payload_,snapshot_->>'fingerprint') returning * into j_;
 perform private.sf_dispatch_background_plans(j_.id);
 return private.sf_background_plan_status(j_);
end $$;
revoke all on function private.sf_start_background_auto_plan(uuid,uuid,jsonb) from public,anon;
grant execute on function private.sf_start_background_auto_plan(uuid,uuid,jsonb) to authenticated;
create function public.start_background_auto_plan(p_company_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_start_background_auto_plan(p_company_id,p_request_id,p_payload) $$;
revoke all on function public.start_background_auto_plan(uuid,uuid,jsonb) from public,anon;
grant execute on function public.start_background_auto_plan(uuid,uuid,jsonb) to authenticated;

create function private.sf_get_background_auto_plan(company_ uuid,job_ uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs;
begin
 perform private.sf_background_plan_authorize(company_);
 select * into j_ from private.background_auto_plan_jobs where company_id=company_ and (job_ is null and status in('QUEUED','RUNNING','SUCCEEDED','FAILED') and created_at>now()-interval '7 days' or id=job_) order by case when status in('QUEUED','RUNNING') then 0 else 1 end,created_at desc limit 1;
 if not found then return null; end if;return private.sf_background_plan_status(j_);
end $$;
revoke all on function private.sf_get_background_auto_plan(uuid,uuid) from public,anon;
grant execute on function private.sf_get_background_auto_plan(uuid,uuid) to authenticated;
create function public.get_background_auto_plan(p_company_id uuid,p_job_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_get_background_auto_plan(p_company_id,p_job_id) $$;
revoke all on function public.get_background_auto_plan(uuid,uuid) from public,anon;
grant execute on function public.get_background_auto_plan(uuid,uuid) to authenticated;

create function private.sf_change_background_auto_plan(company_ uuid,job_ uuid,action_ text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs;
begin
 perform private.sf_background_plan_authorize(company_);
 select * into j_ from private.background_auto_plan_jobs where id=job_ and company_id=company_ for update;
 if not found then raise exception 'Planungsauftrag nicht gefunden.';end if;
 if action_='CANCEL' and j_.status not in('APPLIED','CANCELLED') then update private.background_auto_plan_jobs set status='CANCELLED',lease_token=null,lease_until=null,completed_at=now(),updated_at=now() where id=job_ returning * into j_;
 elsif action_='APPLIED' and j_.status='SUCCEEDED' then update private.background_auto_plan_jobs set status='APPLIED',completed_at=now(),updated_at=now(),payload='{}',checkpoint=null,result=null where id=job_ returning * into j_;
 end if;return private.sf_background_plan_status(j_);
end $$;
revoke all on function private.sf_change_background_auto_plan(uuid,uuid,text) from public,anon;
grant execute on function private.sf_change_background_auto_plan(uuid,uuid,text) to authenticated;
create function public.cancel_background_auto_plan(p_company_id uuid,p_job_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_change_background_auto_plan(p_company_id,p_job_id,'CANCEL') $$;
create function public.mark_background_auto_plan_applied(p_company_id uuid,p_job_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_change_background_auto_plan(p_company_id,p_job_id,'APPLIED') $$;
revoke all on function public.cancel_background_auto_plan(uuid,uuid),public.mark_background_auto_plan_applied(uuid,uuid) from public,anon;
grant execute on function public.cancel_background_auto_plan(uuid,uuid),public.mark_background_auto_plan_applied(uuid,uuid) to authenticated;

-- Worker-only APIs: the random per-job dispatch token and a lease/revision prevent duplicate commits.
create function private.sf_claim_background_auto_plan(p_job_id uuid,p_worker_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; token_ uuid:=gen_random_uuid();
begin
 select * into j_ from private.background_auto_plan_jobs where id=p_job_id and worker_token=p_worker_token for update;
 if not found then raise exception 'Ungültiger Workerzugang.' using errcode='42501';end if;
 if j_.status not in('QUEUED','RUNNING') or j_.lease_until>now() then return null;end if;
 if not exists(select 1 from public.company_members where company_id=j_.company_id and user_id=j_.created_by and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.background_auto_plan_jobs set status='CANCELLED',last_error='Die Planungsberechtigung wurde entzogen.',completed_at=now() where id=j_.id;return null;end if;
 update private.background_auto_plan_jobs set status='RUNNING',lease_token=token_,lease_until=now()+interval '90 seconds',invocation_count=invocation_count+1,updated_at=now() where id=j_.id returning * into j_;
 return jsonb_build_object('id',j_.id,'payload',j_.payload,'checkpoint',j_.checkpoint,'lease',token_,'revision',j_.revision);
end $$;
revoke all on function private.sf_claim_background_auto_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function private.sf_claim_background_auto_plan(uuid,uuid) to service_role;

create function private.sf_save_background_auto_plan_step(p_job_id uuid,p_lease uuid,p_revision int,p_checkpoint jsonb,p_progress jsonb,p_result jsonb default null,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; snapshot_ jsonb; old_claims_ text; old_sub_ text;
begin
 select * into j_ from private.background_auto_plan_jobs where id=p_job_id for update;
 if not found or j_.status<>'RUNNING' or j_.lease_token is distinct from p_lease or j_.revision<>p_revision or j_.lease_until<now() then return false;end if;
 if p_error is null and p_result is not null then
  old_claims_:=current_setting('request.jwt.claims',true);old_sub_:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',j_.created_by::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',j_.created_by,'role','authenticated')::text,true);
  begin snapshot_:=private.sf_preview_planning_period(j_.company_id,j_.first_month,j_.month_count);if snapshot_->>'fingerprint' is distinct from j_.fingerprint then p_error:='Die Planungsdaten wurden während der Berechnung geändert. Bitte neu starten.';end if;
  exception when others then p_error:='Die Planungsdaten oder Freigaben haben sich geändert. Bitte den Dienstplan prüfen und neu starten.';end;
  perform set_config('request.jwt.claim.sub',coalesce(old_sub_,''),true);perform set_config('request.jwt.claims',coalesce(old_claims_,'{}'),true);
 end if;
 update private.background_auto_plan_jobs set checkpoint=case when p_error is null and p_result is null then p_checkpoint else null end,result=case when p_error is null then p_result else null end,status=case when p_error is not null then 'FAILED' when p_result is not null then 'SUCCEEDED' else 'QUEUED' end,progress=case when p_error is null and p_result is not null then 100 else least(99,greatest(progress,coalesce((p_progress->>'percent')::int,progress))) end,label=coalesce(p_progress->>'label',label),detail=coalesce(p_progress->>'detail',''),last_error=left(p_error,1000),completed_at=case when p_error is not null or p_result is not null then now() else null end,updated_at=now(),revision=revision+1,lease_token=null,lease_until=null,dispatched_at=null,next_run_at=now() where id=j_.id;
 if p_error is null and p_result is null then perform private.sf_dispatch_background_plans(j_.id);end if;
 return true;
end $$;
revoke all on function private.sf_save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function private.sf_save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) to service_role;

-- Retain resumable previews for seven days; remove transient inputs after completion/cancellation.
select cron.schedule('schichtfunk-background-planning-dispatch','10 seconds',$$select private.sf_dispatch_background_plans(null);$$);
select cron.schedule('schichtfunk-background-planning-retention','35 3 * * *',$$delete from private.background_auto_plan_jobs where status in('SUCCEEDED','FAILED','CANCELLED','APPLIED') and created_at<now()-interval '7 days';$$);

create function public.claim_background_auto_plan(p_job_id uuid,p_worker_token uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_claim_background_auto_plan(p_job_id,p_worker_token) $$;
create function public.save_background_auto_plan_step(p_job_id uuid,p_lease uuid,p_revision int,p_checkpoint jsonb,p_progress jsonb,p_result jsonb default null,p_error text default null) returns boolean language sql security invoker set search_path='' as $$ select private.sf_save_background_auto_plan_step(p_job_id,p_lease,p_revision,p_checkpoint,p_progress,p_result,p_error) $$;
revoke all on function public.claim_background_auto_plan(uuid,uuid),public.save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_background_auto_plan(uuid,uuid),public.save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) to service_role;
