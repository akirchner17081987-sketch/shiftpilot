-- Bounded shared-data cleanup and independent verification; no employee data is deleted by this migration.
-- Company + UUID order matches the resumable audit scan (63k+ rows in production).
create index if not exists sf_audit_erasure_company_id_idx on public.audit_events(company_id,id);
CREATE OR REPLACE FUNCTION private.sf_erasure_scrub_prepared(p_value jsonb, p_ids text[], p_names text[], p_uuid_refs jsonb, p_other_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare k text; v jsonb; cleaned jsonb; result jsonb; s text; token text; escaped text; names text[]:=p_names;
begin
 if p_value is null then return null; end if;
 if not private.sf_erasure_matches(case when jsonb_typeof(p_value)='string' then p_value#>>'{}' else p_value::text end,p_uuid_refs,p_other_ids||coalesce(p_names,'{}')) then return p_value; end if;
 if jsonb_typeof(p_value)='object' then
  if coalesce(p_value->>'employee_id',p_value->>'employeeId',p_value->>'id','')=any(p_ids) then return null; end if;
  if coalesce(p_value->>'assignment_id',p_value->>'assignmentId',p_value->>'shift_id',p_value->>'shiftId','')=any(p_ids)
   and (coalesce(p_value->>'employee_id',p_value->>'employeeId','')='' or coalesce(p_value->>'employee_id',p_value->>'employeeId','')=any(p_ids)) then return null; end if;
  -- Names alone must never remove a different, identified employee with the same name.
  if coalesce(p_value->>'employee_id',p_value->>'employeeId','')<>'' then names:='{}'; end if;
  -- Aggregate once: repeated object concatenation copies the entire growing map.
  with scrubbed as materialized (
   select key,private.sf_erasure_scrub_prepared(value,p_ids,names,p_uuid_refs,p_other_ids) value
   from jsonb_each(p_value) where not(key=any(p_ids))
  ) select coalesce(jsonb_object_agg(key,value) filter(where value is not null),'{}'::jsonb)
    into result from scrubbed;
  return result;
 elsif jsonb_typeof(p_value)='array' then
  with scrubbed as materialized (
   select ord,private.sf_erasure_scrub_prepared(value,p_ids,names,p_uuid_refs,p_other_ids) as value
   from jsonb_array_elements(p_value) with ordinality q(value,ord)
  ) select coalesce(jsonb_agg(value order by ord) filter(where value is not null),'[]'::jsonb) into result from scrubbed;
  return result;
 elsif jsonb_typeof(p_value)='string' then
  s:=p_value#>>'{}';
  foreach token in array coalesce(p_ids,'{}')||coalesce(names,'{}') loop
   if token='' then continue; end if;
   if strpos(lower(s),lower(token))=0 then continue; end if;
   if lower(s)=lower(token) then return null; end if;
   escaped:=regexp_replace(token,'([\\.\^$|?*+(){}\[\]])','\\\1','g');
   s:=regexp_replace(s,'\m'||escaped||'\M','[entfernt]','gi');
  end loop;
  return to_jsonb(s);
 end if;
 return p_value;
end $function$;

-- Verification uses its own cursors: processing checkpoints are never accepted as proof.
CREATE OR REPLACE FUNCTION private.server_finish_employee_erasure(p_job_id uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare
 job private.employee_erasure_jobs%rowtype; refs text[]; names text[]; uuid_refs jsonb; other_ids text[];
 rel jsonb; has_company boolean; remains boolean; checked_table record; row_ record;
 table_index_ integer:=0; table_cursor_ integer; row_cursor_ uuid; uuid_key_ boolean;
 started_ timestamptz:=clock_timestamp(); processed_ bigint; rows_ integer; phase_ integer;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found or job.status<>'DATABASE_DONE' then raise exception 'Die Datenbanklöschung ist noch nicht abgeschlossen'; end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||job.company_id::text,0));
 if (job.plan->>'delete_auth')::boolean and exists(select 1 from auth.users where id=(job.plan->>'auth_user_id')::uuid) then
  raise exception 'Der Mitarbeiterzugang ist noch nicht vollständig gelöscht';
 end if;
 refs:=array(select jsonb_array_elements_text(job.plan->'references'));
 names:=array(select jsonb_array_elements_text(job.plan->'names'));
 uuid_refs:=private.sf_erasure_uuid_map(refs); other_ids:=private.sf_erasure_other_ids(refs);
 phase_:=coalesce((job.plan->>'_verify_phase')::integer,0);
 processed_:=coalesce((job.plan->>'_verified_rows')::bigint,0);
 if phase_=0 then
  -- The original manifest is rechecked, including relations without a company column.
  for rel in select value from jsonb_array_elements(job.plan->'relations') loop
   select exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(format('%I.%I',rel->>'schema',rel->>'table'))
    and a.attname='company_id' and a.attnum>0 and not a.attisdropped) into has_company;
   execute format('select exists(select 1 from %I.%I where %I::text=any($1)%s)',rel->>'schema',rel->>'table',rel->>'key',
    case when has_company then ' and company_id=$2' else '' end)
    into remains using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
   if remains then raise exception 'Die abschließende Löschprüfung hat verbleibende Datensätze gefunden'; end if;
  end loop;
  update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_verify_phase',1) where id=job.id;
  phase_:=1;
 end if;
 if phase_=1 then
  table_cursor_:=coalesce((job.plan->>'_verify_table')::integer,0);
  for checked_table in
   select n.nspname schema_name,c.relname table_name,c.oid from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('public','private') and c.relkind in('r','p')
    and c.relname not in('employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context','audit_events')
    and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and a.attnum>0 and not a.attisdropped)
   order by n.nspname,c.relname loop
   table_index_:=table_index_+1;
   if table_index_<=table_cursor_ then continue; end if;
   select exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=checked_table.oid and a.attname='id'
    and a.atttypid='uuid'::regtype and a.attnum>0 and not a.attisdropped) into uuid_key_;
   if uuid_key_ then
    row_cursor_:=case when table_index_=table_cursor_+1 then nullif(job.plan->>'_verify_row','')::uuid end;
    rows_:=0;
    for row_ in execute format('select id,to_jsonb(t) value from %I.%I t where company_id=$1 and ($2 is null or id>$2) order by id limit 2000',checked_table.schema_name,checked_table.table_name)
     using job.company_id,row_cursor_ loop
     row_cursor_:=row_.id; rows_:=rows_+1; processed_:=processed_+1;
     if private.sf_erasure_scrub_prepared(row_.value,refs,names,uuid_refs,other_ids) is distinct from row_.value then
      raise exception 'Die abschließende Löschprüfung hat verbleibende Daten in % gefunden',checked_table.table_name;
     end if;
     if rows_>=2000 or clock_timestamp()-started_>=interval '1 second' then
      update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_verify_phase',1,'_verify_table',table_index_-1,'_verify_row',row_cursor_,'_verified_rows',processed_) where id=job.id;
      return jsonb_build_object('complete',false,'pending',true,'phase','VERIFY','processed',processed_);
     end if;
    end loop;
    job.plan:=job.plan-'_verify_row';
   else
    execute format('select exists(select 1 from %I.%I t where company_id=$1 and private.sf_erasure_scrub_prepared(to_jsonb(t),$2,$3,$4,$5) is distinct from to_jsonb(t))',checked_table.schema_name,checked_table.table_name)
     into remains using job.company_id,refs,names,uuid_refs,other_ids;
    if remains then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten in % gefunden',checked_table.table_name; end if;
   end if;
   if clock_timestamp()-started_>=interval '1 second' then
    update private.employee_erasure_jobs set plan=(plan-'_verify_row')||jsonb_build_object('_verify_phase',1,'_verify_table',table_index_,'_verified_rows',processed_) where id=job.id;
    return jsonb_build_object('complete',false,'pending',true,'phase','VERIFY','processed',processed_);
   end if;
  end loop;
  update private.employee_erasure_jobs set plan=(plan-'_verify_row')||jsonb_build_object('_verify_phase',2) where id=job.id;
  phase_:=2;
 end if;
 if phase_=2 then
  row_cursor_:=nullif(job.plan->>'_verify_audit','')::uuid; rows_:=0;
  for row_ in select id,to_jsonb(a) value from public.audit_events a
   where company_id=job.company_id and (row_cursor_ is null or id>row_cursor_) order by id limit 2000 loop
   row_cursor_:=row_.id; rows_:=rows_+1; processed_:=processed_+1;
   if private.sf_erasure_scrub_prepared(row_.value,refs,names,uuid_refs,other_ids) is distinct from row_.value then
    raise exception 'Die abschließende Löschprüfung hat verbleibende Protokolldaten gefunden';
   end if;
   if rows_>=2000 or clock_timestamp()-started_>=interval '1 second' then
    update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_verify_phase',2,'_verify_audit',row_cursor_,'_verified_rows',processed_) where id=job.id;
    return jsonb_build_object('complete',false,'pending',true,'phase','VERIFY','processed',processed_);
   end if;
  end loop;
  update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_verify_phase',3) where id=job.id;
  phase_:=3;
 end if;
 if phase_=3 and (job.plan->>'delete_auth')::boolean then
  row_cursor_:=nullif(job.plan->>'_verify_auth','')::uuid; rows_:=0;
  for row_ in select id,payload::jsonb value from auth.audit_log_entries where row_cursor_ is null or id>row_cursor_ order by id limit 2000 loop
   row_cursor_:=row_.id; rows_:=rows_+1;
   if private.sf_erasure_scrub_prepared(row_.value,refs,names,uuid_refs,other_ids) is distinct from row_.value then
    delete from auth.audit_log_entries where id=row_.id;
   end if;
   if rows_>=2000 or clock_timestamp()-started_>=interval '1 second' then
    update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_verify_phase',3,'_verify_auth',row_cursor_) where id=job.id;
    return jsonb_build_object('complete',false,'pending',true,'phase','VERIFY','processed',processed_);
   end if;
  end loop;
 end if;
 -- Storage freeze remains active until the final verified completion.
 if exists(select 1 from storage.objects o where o.bucket_id='personnel-documents'
  and (o.name=any(array(select jsonb_array_elements_text(job.plan->'storage_paths')))
   or exists(select 1 from jsonb_array_elements_text(job.plan->'employee_ids') e where o.name like job.company_id::text||'/'||e||'/%'))) then
  raise exception 'Die abschließende Löschprüfung hat verbleibende Dokumentdateien gefunden';
 end if;
 delete from private.employee_erasure_jobs where id=job.id;
 return jsonb_build_object('complete',true,'verified',true);
end $$;

notify pgrst,'reload schema';

create or replace function private.sf_guard_employee_erasure_pending() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; job private.employee_erasure_jobs%rowtype; company uuid; employee_ids uuid[]; linked_employee uuid;
begin
 for row_data in select v from (values(case when tg_op<>'INSERT' then to_jsonb(old) end),(case when tg_op<>'DELETE' then to_jsonb(new) end)) q(v) where v is not null loop
  company:=nullif(row_data->>'company_id','')::uuid;
  if company is not null and private.sf_erasure_row_allowed(company,row_data) then continue; end if;
  if company is null and exists(select 1 from private.employee_erasure_context ctx where ctx.transaction_id=txid_current() and ctx.backend_pid=pg_backend_pid()
   and private.sf_erasure_has(row_data,array(select jsonb_array_elements_text(ctx.plan->'references')))) then continue; end if;
  select coalesce(array_agg(distinct value::uuid),'{}') into employee_ids from jsonb_each_text(row_data)
   where key in('employee_id','original_employee_id','target_employee_id','responsible_employee_id','pilot_employee_id') and value is not null;
  if tg_table_name='employees' then employee_ids:=employee_ids||(row_data->>'id')::uuid; end if;
  if row_data->>'assignment_id' is not null then select employee_id into linked_employee from public.shift_assignments where id=(row_data->>'assignment_id')::uuid;employee_ids:=employee_ids||linked_employee; end if;
  if row_data->>'shift_id' is not null then select employee_id into linked_employee from public.time_qr_independent_shifts where id=(row_data->>'shift_id')::uuid;employee_ids:=employee_ids||linked_employee; end if;
  perform 1 from public.employees where id=any(employee_ids) order by id for key share;
  for job in select * from private.employee_erasure_jobs where status in('EXTERNAL','DATABASE_DONE') and (company is null or company_id=company) loop
   if private.sf_erasure_has(row_data,array(select jsonb_array_elements_text(job.plan->'references'))) then
    raise exception 'Für diesen Mitarbeiter läuft die endgültige Löschung. Änderungen sind gesperrt';
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Prevent reintroduction into an already verified table between verification batches.
-- Unrelated employees and company data remain writable. Internal cleanup uses the
-- existing private transaction-bound context; client session settings cannot forge it.
create or replace function private.sf_guard_erasure_shared_writes() returns trigger
language plpgsql security definer set search_path='' as $$
declare company_ uuid; row_ jsonb; job_ record; refs_ text[]; names_ text[];
begin
 for row_ in select v from (values(case when tg_op<>'INSERT' then to_jsonb(old) end),(case when tg_op<>'DELETE' then to_jsonb(new) end)) q(v) where v is not null loop
  company_:=nullif(row_->>'company_id','')::uuid;
  if company_ is null or private.sf_erasure_context_plan(company_) is not null then continue; end if;
  for job_ in select plan from private.employee_erasure_jobs where company_id=company_ loop
   perform pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
   refs_:=array(select jsonb_array_elements_text(job_.plan->'references'));
   names_:=array(select jsonb_array_elements_text(job_.plan->'names'));
   if private.sf_erasure_scrub(row_,refs_,names_) is distinct from row_ then
    raise exception 'Für diesen Mitarbeiter läuft die endgültige Löschung. Änderungen sind bis zum Abschluss gesperrt';
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.sf_guard_erasure_shared_writes() from public,anon,authenticated,service_role;
do $$declare table_ record; begin
 for table_ in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','private') and c.relkind='r'
   and c.relname not in('employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context')
   and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and a.attnum>0 and not a.attisdropped) loop
  execute format('create trigger a01_employee_erasure_shared_freeze before insert or update or delete on %I.%I for each row execute function private.sf_guard_erasure_shared_writes()',table_.nspname,table_.relname);
 end loop;
end $$;
-- Bound each database request; preserve checkpoints for retries and page reloads.
CREATE OR REPLACE FUNCTION private.server_commit_employee_erasure(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; refs text[]; names text[]; eids uuid[]; item record; column_info record; expression text; has_company boolean; uuid_refs jsonb; other_ids text[]; phase_ integer; column_cursor_ integer; column_index_ integer:=0; started_ timestamptz:=clock_timestamp(); audit_cursor_ uuid; scanned_ integer:=0; total_scanned_ bigint; row_cursor_ uuid; batch_rows_ integer; row_ record; cleaned_ jsonb; uuid_key_ boolean;
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
  -- Large UUID-keyed tables resume inside the column, not after a whole-table UPDATE.
  select exists(select 1 from pg_catalog.pg_attribute a
   where a.attrelid=pg_catalog.to_regclass(format('%I.%I',column_info.table_schema,column_info.table_name))
    and a.attname='id' and a.atttypid='uuid'::regtype and a.attnum>0 and not a.attisdropped)
    into uuid_key_;
  if uuid_key_ and column_info.data_type='jsonb' then
   row_cursor_:=case when column_index_=column_cursor_+1 then nullif(job.plan->>'_column_row_cursor','')::uuid end;
   batch_rows_:=0;
   for row_ in execute format('select id,to_jsonb(%I) value from %I.%I where company_id=$1 and ($2 is null or id>$2) order by id limit 100 for update',column_info.column_name,column_info.table_schema,column_info.table_name)
    using job.company_id,row_cursor_ loop
    row_cursor_:=row_.id; batch_rows_:=batch_rows_+1;
    cleaned_:=private.sf_erasure_scrub_prepared(row_.value,refs,names,uuid_refs,other_ids);
    if cleaned_ is distinct from row_.value then
     -- Exactly the same fallback and type conversion as the original column update.
     execute format('update %I.%I set %I=%s where company_id=$1 and id=$2',column_info.table_schema,column_info.table_name,column_info.column_name,
      case when column_info.data_type='uuid' then 'null::uuid'
       when column_info.data_type='jsonb' then 'coalesce($3,''{}''::jsonb)'
       else 'coalesce($3#>>''{}'','''')' end) using job.company_id,row_.id,cleaned_;
    end if;
    if batch_rows_>=100 or clock_timestamp()-started_>=interval '1 second' then
     update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',1,'_columns_cursor',column_index_-1,'_column_row_cursor',row_cursor_) where id=job.id;
     delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
     return jsonb_build_object('database_done',false,'phase','SHARED_DATA','processed',column_index_-1);
    end if;
   end loop;
   -- A completed column must not pass its row cursor to the next column.
   job.plan:=job.plan-'_column_row_cursor';
  else
  execute format('update %I.%I set %I=%s where company_id=$1 and case when private.sf_erasure_matches(case when jsonb_typeof(to_jsonb(%I))=''string'' then to_jsonb(%I)#>>''{}'' else to_jsonb(%I)::text end,$4,$5||coalesce($3,''{}'')) then private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5) is distinct from to_jsonb(%I) else false end',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name)
   using job.company_id,refs,names,uuid_refs,other_ids;
  end if;
  if clock_timestamp()-started_>=interval '1 second' then
   update private.employee_erasure_jobs set plan=(plan-'_column_row_cursor')||jsonb_build_object('_database_phase',1,'_columns_cursor',column_index_) where id=job.id;
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
  order by a.id limit 2000 for update loop
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

