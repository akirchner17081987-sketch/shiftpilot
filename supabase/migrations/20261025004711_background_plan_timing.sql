-- Return dispatch and previous checkpoint timestamps to the authenticated
-- worker. They are diagnostic only and do not enter the planner's input.
create or replace function private.sf_claim_background_auto_plan(p_job_id uuid,p_worker_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; token_ uuid:=gen_random_uuid(); previous_update_ timestamptz; dispatched_ timestamptz;
begin
 select * into j_ from private.background_auto_plan_jobs where id=p_job_id and worker_token=p_worker_token for update;
 if not found then raise exception 'Ungültiger Workerzugang.' using errcode='42501';end if;
 if j_.status not in('QUEUED','RUNNING') or j_.lease_until>now() then return null;end if;
 if not exists(select 1 from public.company_members where company_id=j_.company_id and user_id=j_.created_by and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.background_auto_plan_jobs set status='CANCELLED',last_error='Die Planungsberechtigung wurde entzogen.',completed_at=now() where id=j_.id;return null;end if;
 previous_update_:=j_.updated_at;dispatched_:=j_.dispatched_at;
 update private.background_auto_plan_jobs set status='RUNNING',lease_token=token_,lease_until=now()+interval '90 seconds',invocation_count=invocation_count+1,updated_at=now() where id=j_.id returning * into j_;
 return jsonb_build_object('id',j_.id,'payload',j_.payload,'server_wishes',j_.server_wishes,'checkpoint',j_.checkpoint,'lease',token_,'revision',j_.revision,'previous_update_at',previous_update_,'dispatched_at',dispatched_);
end $$;
