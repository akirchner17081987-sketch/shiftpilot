-- A complete, rule-valid proposal can remain in REVIEW for unavoidable
-- monthly target shortfalls. Keep it as the best comparable draft.
create or replace function private.sf_autonomy_rank(summary_ jsonb,result_ jsonb)
returns numeric[] language sql immutable set search_path='' as $$
 select array[
  case when coalesce((summary_->>'canApply')::boolean,false) then 0 else 1 end,
  coalesce((summary_#>>'{quality,leaderOpen}')::numeric,(select sum(coalesce((q->>'leaderOpen')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_->>'critical')::numeric,1e9),
  coalesce((summary_->>'open')::numeric,1e9),
  coalesce((summary_->>'errors')::numeric,1e9),
  greatest(0,coalesce((summary_->>'spread')::numeric,1e9)-coalesce((summary_->>'maximumShift')::numeric,0)),
  coalesce((summary_#>>'{quality,priorityDeficit}')::numeric,(select sum(coalesce((q->>'priorityDeficit')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_#>>'{quality,teamLeaderDeficit}')::numeric,(select sum(coalesce((q->>'teamLeaderDeficit')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_#>>'{quality,deficit}')::numeric,(select sum(coalesce((q->>'deficit')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_#>>'{quality,imbalance}')::numeric,(select sum(coalesce((q->>'imbalance')::numeric,(q->>'squared')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_#>>'{quality,burdenPenalty}')::numeric,(select sum(coalesce((q->>'burdenPenalty')::numeric,0)) from jsonb_array_elements(coalesce(result_->'quality','[]')) q),0),
  coalesce((summary_#>>'{continuity,total}')::numeric,0)
 ]::numeric[]
$$;

create or replace function private.sf_autonomy_best(company_ uuid,first_ date,count_ int,fp_ text)
returns uuid language plpgsql security definer set search_path='' as $$
declare id_ uuid;
begin
 perform private.sf_background_plan_authorize(company_);
 select r.id into id_
 from private.autonomous_planning_runs r
 join private.background_auto_plan_jobs j on j.id=r.background_job_id and j.company_id=r.company_id
 where r.company_id=company_ and r.first_month=first_ and r.month_count=count_
   and j.status='SUCCEEDED' and (fp_ is null or j.fingerprint=fp_)
   and jsonb_typeof(j.result->'preview')='array'
   and ((r.status='READY' and coalesce((r.summary->>'canApply')::boolean,false))
     or (r.status='REVIEW' and coalesce((r.summary->>'canPreserve')::boolean,false)))
 order by private.sf_autonomy_rank(r.summary,j.result),r.created_at,r.id
 limit 1;
 return id_;
end $$;
revoke all on function private.sf_autonomy_rank(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.sf_autonomy_best(uuid,date,int,text) from public,anon,authenticated;
