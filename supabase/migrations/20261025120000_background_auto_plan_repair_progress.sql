-- A new repair attempt restarts the progress scale; subsequent steps remain monotonic.
create or replace function private.sf_save_background_auto_plan_step(p_job_id uuid,p_lease uuid,p_revision int,p_checkpoint jsonb,p_progress jsonb,p_result jsonb default null,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
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
 update private.background_auto_plan_jobs set checkpoint=case when p_error is null and p_result is null then p_checkpoint else null end,result=case when p_error is null then p_result else null end,status=case when p_error is not null then 'FAILED' when p_result is not null then 'SUCCEEDED' else 'QUEUED' end,progress=case when p_error is null and p_result is not null then 100 else least(99,case when p_progress->>'label'='Reparaturbereich erweitern' then coalesce((p_progress->>'percent')::int,1) else greatest(progress,coalesce((p_progress->>'percent')::int,progress)) end) end,label=coalesce(p_progress->>'label',label),detail=coalesce(p_progress->>'detail',''),last_error=left(p_error,1000),completed_at=case when p_error is not null or p_result is not null then now() else null end,updated_at=now(),revision=revision+1,lease_token=null,lease_until=null,dispatched_at=null,next_run_at=now() where id=j_.id;
 if p_error is null and p_result is null then perform private.sf_dispatch_background_plans(j_.id);end if;
 return true;
end $$;
