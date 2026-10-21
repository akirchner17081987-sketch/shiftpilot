-- Production-schema smoke test with wholly synthetic records; ALWAYS rollback.
-- No real account, company, employee, schedule or notification is modified.
begin;
do $$
declare actor_ uuid:=gen_random_uuid();company_ uuid:=gen_random_uuid();original_ uuid:=gen_random_uuid();target_ uuid:=gen_random_uuid();source_ uuid;
begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
 values(actor_,'authenticated','authenticated','replacement-rollback-'||actor_||'@example.invalid','{}','{}',now(),now());
 perform set_config('request.jwt.claim.sub',actor_::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_,'role','authenticated','aal','aal2')::text,true);
 insert into public.companies(id,name,timezone,created_by) values(company_,'QA replacement rollback only','Europe/Berlin',actor_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(company_,actor_,'OWNER','ACTIVE','OWNER') on conflict(company_id,user_id) do update set role='OWNER',status='ACTIVE',access_role='OWNER';
 insert into public.company_compliance_policy(company_id,solid_planning_rules) values(company_,'{}') on conflict(company_id) do update set solid_planning_rules='{}',works_council_enabled=false;
 insert into public.shift_templates(company_id,code,name,default_start,default_end) values(company_,'QA','Rollback smoke test','06:00','14:00');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,shift_permissions)
 values(original_,company_,'Synthetic','Original','QA-1',array['QA']), (target_,company_,'Synthetic','Replacement','QA-2',array['QA']);
 insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
 values(company_,original_,'QA',date_trunc('minute',now())-interval '2 hours',date_trunc('minute',now())+interval '4 hours','PUBLISHED',now(),actor_) returning id into source_;
 insert into public.time_entries(assignment_id,company_id,actual_start,actual_end,status,source,updated_by)
 values(source_,company_,date_trunc('minute',now())-interval '2 hours',date_trunc('minute',now())-interval '30 minutes','recorded','MANAGER',actor_);
 perform set_config('test.replacement_company',company_::text,true);perform set_config('test.replacement_original',original_::text,true);perform set_config('test.replacement_target',target_::text,true);perform set_config('test.replacement_source',source_::text,true);
end $$;
set local role authenticated;
do $$
declare company_ uuid:=current_setting('test.replacement_company')::uuid;original_ uuid:=current_setting('test.replacement_original')::uuid;target_ uuid:=current_setting('test.replacement_target')::uuid;source_ uuid:=current_setting('test.replacement_source')::uuid;result_ jsonb;preview_ jsonb;cutoff_ timestamptz:=date_trunc('minute',now())+interval '1 minute';token_ uuid:=gen_random_uuid();future_ uuid;
begin
 preview_:=public.manager_disruption_replacement(company_,source_,jsonb_build_object('action','PREVIEW','mode','PARTIAL','from_local',to_char(cutoff_ at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:MI')));
 if (preview_->'assignment'->>'has_time_entries')::boolean is distinct from true or jsonb_array_length(preview_->'candidates')<>1 or preview_->'candidates'->0->>'block' is not null then raise exception 'SMOKE preview failed: %',preview_;end if;
 result_:=public.manager_disruption_replacement(company_,source_,jsonb_build_object('action','COMMIT','version',1,'token',token_,'mode','PARTIAL','from_local',to_char(cutoff_ at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:MI'),'employee_id',target_,'reason','Synthetic rollback only','consent','Synthetic confirmation only','agreed',true,'break_minutes',0));
 if result_->>'status'<>'APPLIED' then raise exception 'SMOKE direct not applied: %',result_;end if;
 if not exists(select 1 from public.shift_assignments where id=source_ and employee_id=original_ and ends_at=cutoff_) then raise exception 'SMOKE original changed incorrectly';end if;
 if not exists(select 1 from public.time_entries where assignment_id=source_ and actual_end=date_trunc('minute',now())-interval '30 minutes') then raise exception 'SMOKE attendance changed';end if;
 if not exists(select 1 from public.shift_assignments where company_id=company_ and employee_id=target_ and starts_at=cutoff_ and status='PUBLISHED') then raise exception 'SMOKE child missing';end if;
 if public.manager_disruption_replacement(company_,source_,jsonb_build_object('action','COMMIT','token',token_))->>'change_id' is distinct from result_->>'change_id' then raise exception 'SMOKE retry not idempotent';end if;
 update public.company_compliance_policy set works_council_enabled=true where company_id=company_;
 insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
 values(company_,original_,'QA',date_trunc('minute',now())+interval '3 days',date_trunc('minute',now())+interval '3 days 8 hours','PUBLISHED',now(),auth.uid()) returning id into future_;
 result_:=public.manager_disruption_replacement(company_,future_,jsonb_build_object('action','COMMIT','version',1,'token',gen_random_uuid(),'mode','WHOLE','employee_id',target_,'reason','Synthetic council rollback','consent','Synthetic confirmation only','agreed',true));
 if result_->>'status'<>'PENDING_WORKS_COUNCIL' then raise exception 'SMOKE council not pending';end if;
 if not exists(select 1 from public.shift_assignments where id=future_ and employee_id=original_ and version=1) then raise exception 'SMOKE premature plan change';end if;
 perform public.manager_cancel_disruption((result_->>'incident_id')::uuid,'Synthetic cancellation');
 if not exists(select 1 from public.shift_change_requests where id=(result_->>'change_id')::uuid and status='CANCELLED') then raise exception 'SMOKE cancellation failed';end if;
end $$;
reset role;
set constraints all immediate;
rollback;
