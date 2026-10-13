-- Keep confirmed wishes outside the large solver graph. NULL preserves legacy jobs.
alter table private.background_auto_plan_jobs add column server_wishes jsonb;
create or replace function private.sf_start_background_auto_plan(company_ uuid,request_ uuid,payload_ jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; first_ date; months_ int; snapshot_ jsonb; input_ jsonb; wishes_ jsonb; rules_ jsonb; employee_keys_ text[];
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
 select solid_planning_rules into rules_ from public.company_compliance_policy where company_id=company_;
 select array_agg(k) into employee_keys_ from public.employees db cross join lateral unnest(array[db.legacy_id,db.id::text]) k where db.company_id=company_ and db.deleted_at is null and db.status='active' and k is not null;
 for input_ in select payload_->'minimumInput' union all select v from jsonb_array_elements(payload_->'monthInputs') v loop
  if input_->'solidRules' is distinct from rules_ then raise exception 'Die Planungsregeln wurden geändert. Bitte erneut vorbereiten.'; end if;
  if jsonb_array_length(input_->'employees')>300 or jsonb_array_length(input_->'groups')>12000 or jsonb_array_length(input_->'candidates')>40000 then raise exception 'Bitte einen kürzeren Planungszeitraum auswählen.'; end if;
  if exists(select 1 from jsonb_array_elements(input_->'employees') e where not coalesce(e->>'id'=any(employee_keys_),false)) then raise exception 'Ein Mitarbeiter gehört nicht zum aktiven Unternehmen.'; end if;
 end loop;
 snapshot_:=private.sf_preview_planning_period(company_,first_,months_);
 if snapshot_->>'fingerprint' is distinct from payload_->'metadata'->>'fingerprint' then raise exception 'Die Planungsdaten wurden geändert. Bitte erneut vorbereiten.'; end if;
 if (select count(*) from private.background_auto_plan_jobs where company_id=company_ and created_at>now()-interval '1 hour')>=20 then raise exception 'Zu viele neue Planungsaufträge. Bitte später erneut versuchen.'; end if;
 -- Confirmed promises come from the database even if the browser wish feed was unavailable.
 select coalesce(jsonb_agg((to_jsonb(w)-'comment')||jsonb_build_object('employee_id',coalesce(e.legacy_id,e.id::text)) order by w.id),'[]'::jsonb) into wishes_ from public.planning_wishes w join public.employees e on e.id=w.employee_id and e.company_id=company_ where w.company_id=company_;
 insert into private.background_auto_plan_jobs(company_id,created_by,request_id,first_month,month_count,payload,server_wishes,fingerprint) values(company_,auth.uid(),request_,first_,months_,payload_,wishes_,snapshot_->>'fingerprint') returning * into j_;
 perform private.sf_dispatch_background_plans(j_.id);
 return private.sf_background_plan_status(j_);
end $$;

create or replace function private.sf_claim_background_auto_plan(p_job_id uuid,p_worker_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.background_auto_plan_jobs; token_ uuid:=gen_random_uuid();
begin
 select * into j_ from private.background_auto_plan_jobs where id=p_job_id and worker_token=p_worker_token for update;
 if not found then raise exception 'Ungültiger Workerzugang.' using errcode='42501';end if;
 if j_.status not in('QUEUED','RUNNING') or j_.lease_until>now() then return null;end if;
 if not exists(select 1 from public.company_members where company_id=j_.company_id and user_id=j_.created_by and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then update private.background_auto_plan_jobs set status='CANCELLED',last_error='Die Planungsberechtigung wurde entzogen.',completed_at=now() where id=j_.id;return null;end if;
 update private.background_auto_plan_jobs set status='RUNNING',lease_token=token_,lease_until=now()+interval '90 seconds',invocation_count=invocation_count+1,updated_at=now() where id=j_.id returning * into j_;
 return jsonb_build_object('id',j_.id,'payload',j_.payload,'server_wishes',j_.server_wishes,'checkpoint',j_.checkpoint,'lease',token_,'revision',j_.revision);
end $$;

-- Scoped REST budgets; all other API calls keep their existing role-level limits.
alter function public.start_background_auto_plan(uuid,uuid,jsonb) set statement_timeout='60s';
alter function public.preview_planning_period(uuid,date,int) set statement_timeout='60s';
alter function public.claim_background_auto_plan(uuid,uuid) set statement_timeout='60s';
alter function public.save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) set statement_timeout='60s';
notify pgrst,'reload schema';
