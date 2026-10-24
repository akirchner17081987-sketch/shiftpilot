-- Per-run objective presets remain private and cannot relax binding staffing rules.
alter function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) rename to sf_autonomy_control_before_goals;
create function private.sf_autonomy_control(company_ uuid,action_ text,config_ jsonb,run_ uuid,month_ date) returns jsonb language plpgsql security definer set search_path='' as $$
declare data_ jsonb; options_ jsonb;
begin
 if action_='RUN' and config_ is not null and config_<>'null'::jsonb and config_<>'{}'::jsonb then
  if jsonb_typeof(config_)<>'object' or exists(select 1 from jsonb_object_keys(config_) k where k not in('full_rebuild','goal','improve'))
   or config_ ? 'goal' and (jsonb_typeof(config_->'goal')<>'string' or config_->>'goal' not in('BALANCED','HOURS','WISHES'))
   or config_ ? 'improve' and jsonb_typeof(config_->'improve')<>'boolean' then raise exception 'Ungültige Planungsziele.';end if;
 end if;
 options_:=case when jsonb_typeof(config_)='object' then config_-'goal'-'improve' else config_ end;
 data_:=private.sf_autonomy_control_before_goals(company_,action_,options_,run_,month_);
 if action_='RUN' and (config_ ? 'goal' or config_ ? 'improve') then
  update private.autonomous_planning_runs set context=context||jsonb_build_object('planningGoal',coalesce(config_->>'goal','BALANCED'),'improveExisting',coalesce((config_->>'improve')::boolean,false))
  where id=(data_->'runs'->0->>'id')::uuid and company_id=company_ and actor_id=auth.uid() and source='MANUAL' and status='QUEUED';
 end if;
 if action_='GET' and jsonb_typeof(data_->'runs')='array' then
  data_:=jsonb_set(data_,'{runs}',(select coalesce(jsonb_agg(v||case when v->>'status'='CALCULATING' then jsonb_build_object('preflight',(select b.payload#>'{metadata,preflight}' from private.background_auto_plan_jobs b where b.id=(v->>'background_job_id')::uuid and b.company_id=company_)) else '{}'::jsonb end order by n),'[]'::jsonb) from jsonb_array_elements(data_->'runs') with ordinality x(v,n)));
 end if;
 return data_;
end $$;
revoke all on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) from public,anon;
grant execute on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) to authenticated;
revoke all on function private.sf_autonomy_control_before_goals(uuid,text,jsonb,uuid,date) from public,anon,authenticated;
-- Rebind pooled SQL callers to the new private wrapper.
create or replace function public.autonomous_planning_control(p_company_id uuid,p_action text default 'GET',p_config jsonb default null,p_run_id uuid default null,p_month date default null)
returns jsonb language sql set search_path='' set statement_timeout='60s' as $$select private.sf_autonomy_control(p_company_id,p_action,p_config,p_run_id,p_month)$$;
revoke all on function public.autonomous_planning_control(uuid,text,jsonb,uuid,date) from public,anon;
grant execute on function public.autonomous_planning_control(uuid,text,jsonb,uuid,date) to authenticated;
