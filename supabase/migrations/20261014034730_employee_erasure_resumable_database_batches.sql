-- Bound each database request; preserve checkpoints for retries and page reloads.
CREATE OR REPLACE FUNCTION private.server_commit_employee_erasure(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; refs text[]; names text[]; eids uuid[]; item record; column_info record; expression text; has_company boolean; uuid_refs jsonb; other_ids text[]; phase_ integer; column_cursor_ integer; column_index_ integer:=0; started_ timestamptz:=clock_timestamp(); audit_cursor_ uuid; scanned_ integer:=0; total_scanned_ bigint;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id for update;
 if not found or job.requested_by<>p_actor then raise exception 'Löschauftrag wurde nicht gefunden'; end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 if job.status='DATABASE_DONE' then return jsonb_build_object('database_done',true); end if;
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||job.company_id::text,0));
 perform 1 from public.employees where id=job.employee_id and company_id=job.company_id for update;
 if exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and (o.name=any(array(select jsonb_array_elements_text(job.plan->'storage_paths'))) or exists(select 1 from jsonb_array_elements_text(job.plan->'employee_ids') e where o.name like job.company_id::text||'/'||e||'/%'))) then raise exception 'Die Dokumentdateien sind noch nicht vollständig gelöscht'; end if;
 if exists(select 1 from private.privacy_legal_holds where company_id=job.company_id and (employee_id is null or employee_id=job.employee_id) and status='ACTIVE' and (hold_until is null or hold_until>=now())) then raise exception 'Es besteht eine aktive Löschsperre'; end if;
 refs:=array(select jsonb_array_elements_text(job.plan->'references')); names:=array(select jsonb_array_elements_text(job.plan->'names'));
 uuid_refs:=private.sf_erasure_uuid_map(refs); other_ids:=private.sf_erasure_other_ids(refs);
 eids:=array(select jsonb_array_elements_text(job.plan->'employee_ids')::uuid);
 insert into private.employee_erasure_context values(txid_current(),pg_backend_pid(),job.company_id,job.plan||jsonb_build_object('_uuid_refs',uuid_refs,'_other_ids',to_jsonb(other_ids)));

 phase_:=coalesce((job.plan->>'_database_phase')::integer,0);
 column_cursor_:=coalesce((job.plan->>'_columns_cursor')::integer,0);
 audit_cursor_:=nullif(job.plan->>'_audit_cursor','')::uuid;
 total_scanned_:=coalesce((job.plan->>'_audits_scanned')::bigint,0);
if phase_=0 then
 -- Shared company records keep their identity and all data belonging to other employees.
 update public.shift_templates t set responsible_employee_id=case when responsible_employee_id=any(eids) then null else responsible_employee_id end,
  responsible_only=case when responsible_employee_id=any(eids) then false else responsible_only end,
  active=case when responsible_employee_id=any(eids) and responsible_only then false when exclusive_employees and allowed_personnel_nos=ARRAY[job.plan->>'personnel_no'] then false else active end,
  exclusive_employees=case when allowed_personnel_nos=ARRAY[job.plan->>'personnel_no'] then false else exclusive_employees end,
  allowed_personnel_nos=array_remove(allowed_personnel_nos,job.plan->>'personnel_no')
 where t.company_id=job.company_id and (responsible_employee_id=any(eids) or (job.plan->>'personnel_no')=any(allowed_personnel_nos));
 update public.time_qr_terminals set pilot_employee_id=null,is_active=case when pilot_mode then false else is_active end where company_id=job.company_id and pilot_employee_id=any(eids);
 update public.time_month_closures c set report_snapshot=private.sf_erasure_scrub_prepared(report_snapshot,refs,names,uuid_refs,other_ids)
 where company_id=job.company_id and private.sf_erasure_scrub_prepared(report_snapshot,refs,names,uuid_refs,other_ids) is distinct from report_snapshot;
 for rel in select value from jsonb_array_elements(job.plan->'relations') loop
  if rel->>'schema'='public' and rel->>'table'='employees' then continue; end if;
  select exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',rel->>'schema',rel->>'table')) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) into has_company;
  execute format('delete from %I.%I where %I::text=any($1)%s',rel->>'schema',rel->>'table',rel->>'key',case when has_company then ' and company_id=$2' else '' end)
   using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
 end loop;
update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',1) where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',false,'phase','SHARED_DATA','processed',0);
end if;
if phase_=1 then
 -- Remove strings and JSON references in shared notes, settings and company-wide snapshots.
 for column_info in select c.table_schema,c.table_name,c.column_name,c.data_type,c.is_nullable from information_schema.columns c
  where c.table_schema in('public','private') and c.data_type in('text','jsonb','uuid')
   and c.table_name not in('employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation')
   and c.column_name not in('id','company_id','user_id')
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',c.table_schema,c.table_name)) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) order by c.table_schema,c.table_name,c.column_name loop
  column_index_:=column_index_+1;
  if column_index_<=column_cursor_ then continue; end if;
  if column_info.data_type='uuid' then
   if column_info.is_nullable<>'YES' then continue; end if;
   expression:='null::uuid';
  elsif column_info.data_type='jsonb' then expression:=format('coalesce(private.sf_erasure_scrub_prepared(%I,$2,$3,$4,$5),''{}''::jsonb)',column_info.column_name);
  else expression:=format('coalesce(private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5)#>>''{}'','''')',column_info.column_name); end if;
  execute format('update %I.%I set %I=%s where company_id=$1 and case when private.sf_erasure_matches(case when jsonb_typeof(to_jsonb(%I))=''string'' then to_jsonb(%I)#>>''{}'' else to_jsonb(%I)::text end,$4,$5||coalesce($3,''{}'')) then private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5) is distinct from to_jsonb(%I) else false end',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name)
   using job.company_id,refs,names,uuid_refs,other_ids;
  if clock_timestamp()-started_>=interval '1 second' then
   update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',1,'_columns_cursor',column_index_) where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',false,'phase','SHARED_DATA','processed',column_index_);

  end if;
 end loop;
update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',2) where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',false,'phase','AUDIT','processed',0);
end if;
 if job.plan->>'auth_user_id' is not null then
  delete from public.company_members where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid and role='VIEWER';
 end if;
 if (job.plan->>'delete_auth')::boolean then
  delete from public.push_subscriptions where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid;
  delete from public.company_member_invites where company_id=job.company_id and (claimed_by=(job.plan->>'auth_user_id')::uuid or lower(email)=any(array(select lower(x) from unnest(names) x)));
 end if;
-- Scan audit history in bounded, resumable windows, including nonmatching rows.
 for item in select * from public.audit_events a
  where a.company_id=job.company_id and (audit_cursor_ is null or a.id>audit_cursor_)
  order by a.id limit 500 for update loop
  audit_cursor_:=item.id; scanned_:=scanned_+1;
  if (case when private.sf_erasure_matches(to_jsonb(item)::text,uuid_refs,other_ids||coalesce(names,'{}')) then private.sf_erasure_scrub_prepared(to_jsonb(item),refs,names,uuid_refs,other_ids) is distinct from to_jsonb(item) else false end) then
  if item.entity_id::text=any(refs) or (private.sf_erasure_scrub_prepared(item.old_values,refs,names,uuid_refs,other_ids) is null and private.sf_erasure_scrub_prepared(item.new_values,refs,names,uuid_refs,other_ids) is null) then
   delete from public.audit_events where id=item.id;
  else
   update public.audit_events set old_values=private.sf_erasure_scrub_prepared(item.old_values,refs,names,uuid_refs,other_ids),new_values=private.sf_erasure_scrub_prepared(item.new_values,refs,names,uuid_refs,other_ids),
    metadata=coalesce(private.sf_erasure_scrub_prepared(item.metadata,refs,names,uuid_refs,other_ids),'{}'),actor_id=case when item.actor_id::text=any(refs) then null else item.actor_id end where id=item.id;
  end if;

  end if;
  exit when clock_timestamp()-started_>=interval '1 second';
 end loop;
 total_scanned_:=total_scanned_+scanned_;
 if exists(select 1 from public.audit_events a where a.company_id=job.company_id and (audit_cursor_ is null or a.id>audit_cursor_)) then
  update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',2,'_audit_cursor',audit_cursor_,'_audits_scanned',total_scanned_) where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',false,'phase','AUDIT','processed',total_scanned_);

 end if;
 -- Keep the frozen employee profile visible until all database batches are complete.
 delete from public.employees where company_id=job.company_id and id=any(eids);
 insert into private.employee_roster_generation(company_id,generation) values(job.company_id,1)
  on conflict(company_id) do update set generation=private.employee_roster_generation.generation+1;
 update private.employee_erasure_jobs set status='DATABASE_DONE' where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',true);
end $function$;

notify pgrst,'reload schema';

-- Word tokens embedded inside unrelated identifiers cannot be scrubbed.
-- Exact scalar matches and arbitrary punctuation tokens remain candidates.
create or replace function private.sf_erasure_matches(p_serialized text,p_uuid_refs jsonb,p_other_tokens text[]) returns boolean
language plpgsql immutable set search_path='' as $$
declare serialized text:=lower(p_serialized); token text; escaped text;
begin
 if p_serialized is null then return false; end if;
 foreach token in array coalesce(p_other_tokens,'{}') loop
  if token<>'' and strpos(serialized,lower(token))>0 then
   if serialized=lower(token) then return true; end if;
   if left(token,1) ~ '^[[:alnum:]_]$' and right(token,1) ~ '^[[:alnum:]_]$' then
    escaped:=regexp_replace(token,'([\\.\^$|?*+(){}\[\]])','\\\1','g');
    if serialized ~* ('\m'||escaped||'\M') then return true; end if;
   else return true;
   end if;
  end if;
 end loop;
 if p_uuid_refs='{}'::jsonb then return false; end if;
 -- Consume 28 characters, validating the last eight via lookahead.
 -- Any overlapping UUID can begin no earlier than character 29.
 return exists(select 1 from regexp_matches(serialized,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}(?=[0-9a-f]{8})','g') m
  where p_uuid_refs ? m[1]);
end $$;
notify pgrst,'reload schema';
