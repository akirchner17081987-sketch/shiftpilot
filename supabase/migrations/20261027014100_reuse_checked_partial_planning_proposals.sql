-- Keep the best current partial result available for independently rechecked repair.
-- Authorization and snapshot construction still run through the existing helper.
create or replace function private.sf_autonomy_snapshot(company_ uuid, first_ date, count_ integer, run_ uuid, history_ integer)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='60s' as $function$
declare s jsonb;best_ uuid;reference_ jsonb;
begin
 s:=private.sf_autonomy_snapshot_before_continuity(company_,first_,count_,run_,history_);
 best_:=private.sf_autonomy_best(company_,first_,count_,s->>'fingerprint');
 if best_ is null then
  select r.id into best_
  from private.autonomous_planning_runs r
  join private.background_auto_plan_jobs j on j.id=r.background_job_id and j.company_id=r.company_id
  where r.company_id=company_ and r.first_month=first_ and r.month_count=count_ and r.id<>run_
   and r.status='REVIEW' and j.status='SUCCEEDED' and j.fingerprint=s->>'fingerprint'
   and jsonb_typeof(j.result->'preview')='array' and jsonb_array_length(j.result->'preview') between 1 and 5000
   and coalesce((r.summary->>'open')::int,0)>0
   and coalesce((r.summary->>'errors')::int,0)=(
    select count(*) from jsonb_array_elements(coalesce(r.summary#>'{hours,rows}','[]'::jsonb)) h
    where (h->>'missing')::numeric>coalesce((h->>'tolerance')::numeric,1000000000)+0.001
      and not coalesce((h->>'approvedDeviation')::boolean,false))
  order by (r.summary->>'open')::int,coalesce((r.summary->>'critical')::int,0),r.created_at desc,r.id
  limit 1;
 end if;
 if best_ is null then best_:=private.sf_autonomy_best(company_,first_,count_,null);end if;
 if best_ is not null then
  select jsonb_build_object('runId',r.id,'source','PROPOSAL','fingerprint',j.fingerprint,'preview',j.result->'preview')
  into reference_ from private.autonomous_planning_runs r
  join private.background_auto_plan_jobs j on j.id=r.background_job_id and j.company_id=r.company_id
  where r.id=best_ and jsonb_array_length(j.result->'preview')<=5000;
 end if;
 return s||jsonb_build_object('reference',reference_);
end $function$;
revoke all on function private.sf_autonomy_snapshot(uuid,date,integer,uuid,integer) from public,anon,authenticated,service_role;
