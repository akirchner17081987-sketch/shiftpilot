-- Derivative references only: no source documents or employee profiles are copied.
create table private.employee_erasure_index_sources (
 source_oid oid primary key, schema_name name not null, table_name name not null,
 json_columns text[] not null, ready boolean not null default false,
 backfill_cursor uuid, indexed_rows bigint not null default 0
);
create table private.employee_erasure_reference_index (
 source_oid oid not null references private.employee_erasure_index_sources on delete cascade,
 row_id uuid not null, company_id uuid not null references public.companies(id) on delete cascade,
 uuid_prefixes text[] not null, terms text[] not null,
 primary key(source_oid,row_id)
);
create index employee_erasure_reference_scope on private.employee_erasure_reference_index(company_id,source_oid,row_id);
create index employee_erasure_reference_uuids on private.employee_erasure_reference_index using gin(uuid_prefixes);
create index employee_erasure_reference_terms on private.employee_erasure_reference_index using gin(terms);
create table private.employee_erasure_metrics (
 job_id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
 started_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz, phase text not null default 'PREPARATION', percentage integer not null default 0 check(percentage between 0 and 100),
 cleanup_work jsonb not null, verify_work jsonb not null,
 phase_ms jsonb not null default '{}', calls integer not null default 0,
 last_batch_ms double precision not null default 0, last_batch_rows integer not null default 0
);
create index employee_erasure_metrics_company on private.employee_erasure_metrics(company_id);
alter table private.employee_erasure_index_sources enable row level security;
alter table private.employee_erasure_reference_index enable row level security;
alter table private.employee_erasure_metrics enable row level security;
revoke all on private.employee_erasure_index_sources, private.employee_erasure_reference_index, private.employee_erasure_metrics from public,anon,authenticated,service_role;

create function private.sf_erasure_reference_tokens(p_value jsonb)
returns table(uuid_prefixes text[],terms text[]) language sql immutable set search_path='' as $$
 with serialized as materialized(select lower(p_value::text) s),
 -- Decode actual strings and keys before tokenizing: JSON escapes must not hide
 -- whitespace, literal backslashes or quotes inside a legacy ID or a name.
 word_text as materialized (
  select lower(string_agg(v#>>'{}',' ')) s from (
   select v from jsonb_path_query(p_value,'strict $.** ? (@.type() == "string")') q(v)
   union all select v from jsonb_path_query(p_value,'strict $.** ? (@.type() == "object").keyvalue().key') q(v)
  ) decoded
 ),
 words as materialized (
  select m[1] word,ord from word_text,regexp_matches(s,'[[:alnum:]_]+','g') with ordinality q(m,ord)
 ), pairs as (select word,lead(word) over(order by ord) next_word from words)
 select coalesce((select array_agg(distinct m[1]) from serialized,
  regexp_matches(s,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}(?=[0-9a-f]{8})','g') m),'{}'::text[]),
 coalesce((select array_agg(distinct term) from (select word term from pairs union all select word||' '||next_word from pairs where next_word is not null) q),'{}'::text[])
$$;

create function private.sf_erasure_reference_query(p_ids text[],p_names text[])
returns jsonb language plpgsql immutable set search_path='' as $$
declare token text; words_ text[]; terms_ text[]:='{}'; fallback_ boolean:=false;
begin
 foreach token in array private.sf_erasure_other_ids(p_ids)||coalesce(p_names,'{}') loop
  if token='' then continue; end if;
  -- Exact word/phrase candidates; punctuation tokens retain a complete scan.
  if left(token,1) !~ '^[[:alnum:]_]$' or right(token,1) !~ '^[[:alnum:]_]$' then fallback_:=true;continue;end if;
  words_:=array(select m[1] from regexp_matches(lower(token),'[[:alnum:]_]+','g') m);
  terms_:=array_append(terms_,case when cardinality(words_)>1 then words_[1]||' '||words_[2] else words_[1] end);
 end loop;
 return jsonb_build_object('prefixes',coalesce((select jsonb_agg(k) from jsonb_object_keys(private.sf_erasure_uuid_map(p_ids)) k where length(k)=28),'[]'),
  'terms',to_jsonb(terms_),'fallback',fallback_);
end $$;

create function private.sf_erasure_refresh_reference_index() returns trigger
language plpgsql security definer set search_path='' as $$
declare columns_ text[]; value_ jsonb; tokens_ record;
begin
 if tg_op='DELETE' then
  delete from private.employee_erasure_reference_index where source_oid=tg_relid and row_id=old.id;
  return old;
 end if;
 select json_columns into columns_ from private.employee_erasure_index_sources where source_oid=tg_relid;
 if not found then return new;end if;
 select jsonb_object_agg(k,v) into value_ from jsonb_each(to_jsonb(new)) q(k,v) where k=any(columns_);
 if tg_op='UPDATE' and old.id=new.id and old.company_id=new.company_id and value_=(
  select jsonb_object_agg(k,v) from jsonb_each(to_jsonb(old)) q(k,v) where k=any(columns_)) then return new;end if;
 select * into tokens_ from private.sf_erasure_reference_tokens(value_);
 if tg_op='UPDATE' and old.id<>new.id then
  delete from private.employee_erasure_reference_index where source_oid=tg_relid and row_id=old.id;
 end if;
 insert into private.employee_erasure_reference_index values(tg_relid,new.id,new.company_id,tokens_.uuid_prefixes,tokens_.terms)
 on conflict(source_oid,row_id) do update set company_id=excluded.company_id,uuid_prefixes=excluded.uuid_prefixes,terms=excluded.terms;
 return new;
end $$;

create function private.sf_erasure_guard_reference_writes() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_ jsonb; company_ uuid; job_ record; refs_ text[]; names_ text[];
begin
 if tg_op='INSERT' then
  if not exists(select 1 from private.employee_erasure_jobs where company_id=new.company_id)
   or private.sf_erasure_context_plan(new.company_id) is not null then return new;end if;
 elsif tg_op='DELETE' then
  if not exists(select 1 from private.employee_erasure_jobs where company_id=old.company_id)
   or private.sf_erasure_context_plan(old.company_id) is not null then return old;end if;
 else
  if not exists(select 1 from private.employee_erasure_jobs where company_id in(old.company_id,new.company_id)) then return new;end if;
  if old.company_id is not distinct from new.company_id and private.sf_erasure_context_plan(new.company_id) is not null then return new;end if;
 end if;
 for row_ in select value from (values(case when tg_op<>'INSERT' then to_jsonb(old) end),(case when tg_op<>'DELETE' then to_jsonb(new) end)) q(value) where value is not null loop
  company_:=(row_->>'company_id')::uuid;
  if private.sf_erasure_context_plan(company_) is not null then continue;end if;
  for job_ in select plan from private.employee_erasure_jobs where company_id=company_ loop
   perform pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
   refs_:=array(select jsonb_array_elements_text(job_.plan->'references'));
   names_:=array(select jsonb_array_elements_text(job_.plan->'names'));
   if private.sf_erasure_scrub(row_,refs_,names_) is distinct from row_ then
    raise exception 'Für diesen Mitarbeiter läuft die endgültige Löschung. Änderungen sind bis zum Abschluss gesperrt';
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;

-- Register existing JSON sources. New/changed schemas safely fall back to scanning.
do $$declare source_ record; columns_sql_ text;
begin
 for source_ in
  select c.oid,n.nspname,c.relname,array_agg(a.attname::text order by a.attname) cols
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.atttypid='jsonb'::regtype and a.attnum>0 and not a.attisdropped
  where n.nspname in('public','private') and c.relkind='r'
   and c.relname not in('employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context',
    'employee_erasure_metrics','employee_erasure_index_sources','employee_erasure_reference_index')
   and exists(select 1 from pg_catalog.pg_attribute x where x.attrelid=c.oid and x.attname='id' and x.atttypid='uuid'::regtype and x.attnum>0 and not x.attisdropped)
   and exists(select 1 from pg_catalog.pg_attribute x where x.attrelid=c.oid and x.attname='company_id' and x.attnum>0 and not x.attisdropped)
  group by c.oid,n.nspname,c.relname
 loop
  insert into private.employee_erasure_index_sources(source_oid,schema_name,table_name,json_columns) values(source_.oid,source_.nspname,source_.relname,source_.cols);
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=source_.oid and tgfoid in(select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('sf_guard_erasure_shared_writes','sf_erasure_guard_reference_writes')) and not tgisinternal) then
   execute format('create trigger sf_employee_erasure_reference_freeze before insert or update or delete on %I.%I for each row execute function private.sf_erasure_guard_reference_writes()',source_.nspname,source_.relname);
  end if;
  select string_agg(format('%I',x),',') into columns_sql_ from unnest(source_.cols||array['id','company_id']) x;
  execute format('create trigger sf_employee_erasure_references after insert or delete or update of %s on %I.%I for each row execute function private.sf_erasure_refresh_reference_index()',columns_sql_,source_.nspname,source_.relname);
 end loop;
end $$;

create function private.server_backfill_employee_erasure_references() returns jsonb
language plpgsql security definer set search_path='' as $$
declare source_ record; row_ record; tokens_ record; cols_sql_ text; started_ timestamptz:=clock_timestamp(); processed_ int:=0; cursor_ uuid;
begin
 perform private.sf_assert_service_role();
 for source_ in select * from private.employee_erasure_index_sources where not ready order by schema_name,table_name for no key update loop
  select string_agg(format('%L,to_jsonb(t.%I)',x,x),',') into cols_sql_ from unnest(source_.json_columns) x;
  cursor_:=source_.backfill_cursor;
  for row_ in execute format('select id,company_id,jsonb_build_object(%s) value from %I.%I t where ($1 is null or id>$1) order by id limit 100 for share',cols_sql_,source_.schema_name,source_.table_name) using cursor_ loop
   select * into tokens_ from private.sf_erasure_reference_tokens(row_.value);
   insert into private.employee_erasure_reference_index values(source_.source_oid,row_.id,row_.company_id,tokens_.uuid_prefixes,tokens_.terms)
   on conflict(source_oid,row_id) do update set company_id=excluded.company_id,uuid_prefixes=excluded.uuid_prefixes,terms=excluded.terms;
   cursor_:=row_.id;processed_:=processed_+1;
   update private.employee_erasure_index_sources set backfill_cursor=cursor_,indexed_rows=indexed_rows+1 where source_oid=source_.source_oid;
   if clock_timestamp()-started_>=interval '2 seconds' then return jsonb_build_object('complete',false,'processed',processed_);end if;
  end loop;
  execute format('select exists(select 1 from %I.%I where $1 is null or id>$1)',source_.schema_name,source_.table_name) into source_.ready using cursor_;
  if not source_.ready then update private.employee_erasure_index_sources set ready=true where source_oid=source_.source_oid;end if;
  if source_.ready then return jsonb_build_object('complete',false,'processed',processed_);end if;
 end loop;
 return jsonb_build_object('complete',true,'processed',processed_);
end $$;
create function public.server_backfill_employee_erasure_references() returns jsonb
language sql set search_path='' as $$select private.server_backfill_employee_erasure_references()$$;

create function private.sf_erasure_metrics_init(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs; col_ record; table_ record; counts_ jsonb:='{}'; cleanup_ jsonb:='[]'; verify_ jsonb:='[]'; n_ bigint; units_ bigint; key_ text;
begin
 if exists(select 1 from private.employee_erasure_metrics where job_id=p_job) then return;end if;
 select * into job from private.employee_erasure_jobs where id=p_job;
 if not found then return;end if;
 for col_ in select row_number() over(order by c.table_schema,c.table_name,c.column_name) position,c.* from information_schema.columns c
  where c.table_schema in('public','private') and c.data_type in('text','jsonb','uuid')
  and c.table_name not in('employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation',
   'employee_erasure_metrics','employee_erasure_index_sources','employee_erasure_reference_index')
  and c.column_name not in('id','company_id','user_id')
  and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(format('%I.%I',c.table_schema,c.table_name)) and a.attname='company_id' and a.attnum>0 and not a.attisdropped)
 loop
  key_:=col_.table_schema||'.'||col_.table_name;
  units_:=case when col_.data_type='uuid' and col_.is_nullable<>'YES' then 0 else 1 end;
  if col_.data_type='jsonb' then
   if not counts_ ? key_ then
    execute format('select count(*) from %I.%I where company_id=$1',col_.table_schema,col_.table_name) into n_ using job.company_id;
    counts_:=counts_||jsonb_build_object(key_,n_);
   end if;
   units_:=greatest((counts_->>key_)::bigint,1);
  end if;
  cleanup_:=cleanup_||jsonb_build_array(jsonb_build_object('position',col_.position,'table',key_,'schema',col_.table_schema,'name',col_.table_name,'column',col_.column_name,'type',col_.data_type,'units',units_));
 end loop;
 for table_ in select n.nspname schema_name,c.relname table_name from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','private') and c.relkind in('r','p')
  and c.relname not in('employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context','audit_events',
   'employee_erasure_metrics','employee_erasure_index_sources','employee_erasure_reference_index')
  and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and a.attnum>0 and not a.attisdropped) order by n.nspname,c.relname
 loop
  execute format('select count(*) from %I.%I where company_id=$1',table_.schema_name,table_.table_name) into n_ using job.company_id;
  verify_:=verify_||jsonb_build_array(jsonb_build_object('schema',table_.schema_name,'name',table_.table_name,'units',greatest(n_,1)));
 end loop;
 insert into private.employee_erasure_metrics(job_id,company_id,cleanup_work,verify_work) values(job.id,job.company_id,cleanup_,verify_) on conflict do nothing;
end $$;

create function private.sf_erasure_progress(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs; metrics_ private.employee_erasure_metrics; unit_ jsonb; current_ jsonb; position_ int; table_ int; phase_ int; percent_ int:=0; done_ numeric:=0; total_ numeric:=0; rows_ bigint; all_ bigint; cursor_ uuid; ratio_ numeric; label_ text:='PREPARATION';
begin
 select * into metrics_ from private.employee_erasure_metrics where job_id=p_job;
 if not found then return jsonb_build_object('percentage',0,'phase','PREPARATION');end if;
 if metrics_.completed_at is not null then return jsonb_build_object('percentage',100,'phase','COMPLETE','phaseMs',metrics_.phase_ms);end if;
 select * into job from private.employee_erasure_jobs where id=p_job;
 if not found then return jsonb_build_object('percentage',metrics_.percentage,'phase',metrics_.phase);end if;
 phase_:=coalesce((job.plan->>'_database_phase')::int,0);
 if job.status<>'DATABASE_DONE' then
  if phase_=0 then percent_:=case when metrics_.phase_ms ? 'FILES' then 5 else 0 end;label_:=case when percent_=5 then 'FILES' else 'PREPARATION' end;
  elsif phase_=1 then
   position_:=coalesce((job.plan->>'_columns_cursor')::int,0);cursor_:=nullif(job.plan->>'_column_row_cursor','')::uuid;
   select value into current_ from jsonb_array_elements(metrics_.cleanup_work) where (value->>'position')::int=position_+1;
   rows_:=0;all_:=1;
   if cursor_ is not null and current_ is not null then
    execute format('select count(*) filter(where id<=$2),count(*) from %I.%I where company_id=$1',current_->>'schema',current_->>'name') into rows_,all_ using job.company_id,cursor_;
   end if;
   for unit_ in select value from jsonb_array_elements(metrics_.cleanup_work) loop
    total_:=total_+(unit_->>'units')::numeric;
    if (unit_->>'position')::int<=position_ or (unit_->>'type'='jsonb' and coalesce(job.plan->'_json_tables_done','[]') ? (unit_->>'table')) then done_:=done_+(unit_->>'units')::numeric;
    elsif cursor_ is not null and unit_->>'type'='jsonb' and unit_->>'table'=current_->>'table' then done_:=done_+(unit_->>'units')::numeric*least(1,rows_::numeric/greatest(all_,1));
    end if;
   end loop;
   percent_:=10+floor(55*least(1,done_/greatest(total_,1)));label_:='SHARED_DATA';
  else
   select count(*) into all_ from public.audit_events where company_id=job.company_id;
   done_:=coalesce((job.plan->>'_audits_scanned')::numeric,0);
   percent_:=65+floor(5*least(1,done_/greatest(all_,done_,1)));label_:='AUDIT';
  end if;
 else
  phase_:=coalesce((job.plan->>'_verify_phase')::int,0);label_:='VERIFY';
  if phase_<=1 then
   table_:=coalesce((job.plan->>'_verify_table')::int,0);cursor_:=nullif(job.plan->>'_verify_row','')::uuid;
   for unit_ in select value from jsonb_array_elements(metrics_.verify_work) with ordinality q(value,ord) where ord<=table_ loop done_:=done_+(unit_->>'units')::numeric;end loop;
   select coalesce(sum((value->>'units')::numeric),1) into total_ from jsonb_array_elements(metrics_.verify_work);
   if cursor_ is not null then
    current_:=metrics_.verify_work->table_;
    if current_ is not null then
     execute format('select count(*) filter(where id<=$2),count(*) from %I.%I where company_id=$1',current_->>'schema',current_->>'name') into rows_,all_ using job.company_id,cursor_;
     done_:=done_+(current_->>'units')::numeric*least(1,rows_::numeric/greatest(all_,1));
    end if;
   end if;
   percent_:=70+floor(25*least(1,done_/greatest(total_,1)));
  elsif phase_=2 then percent_:=96;else percent_:=99;end if;
 end if;
 percent_:=greatest(metrics_.percentage,least(percent_,99));
 update private.employee_erasure_metrics set percentage=percent_,phase=label_,updated_at=clock_timestamp() where job_id=p_job;
 return jsonb_build_object('percentage',percent_,'phase',label_,'phaseMs',metrics_.phase_ms);
end $$;

create function private.sf_erasure_record_batch(p_job uuid,p_phase text,p_ms double precision,p_rows int default 0) returns void
language sql security definer set search_path='' as $$
 update private.employee_erasure_metrics set phase_ms=phase_ms||jsonb_build_object(p_phase,coalesce((phase_ms->>p_phase)::numeric,0)+greatest(p_ms,0)),
  calls=calls+1,last_batch_ms=greatest(p_ms,0),last_batch_rows=greatest(p_rows,0),updated_at=clock_timestamp() where job_id=p_job
$$;
create function private.sf_erasure_batch_limit(p_job uuid) returns int
language sql stable security definer set search_path='' as $$
 select coalesce((select greatest(1,least(200,floor(2500/greatest(last_batch_ms/greatest(last_batch_rows,1),1))::int))
  from private.employee_erasure_metrics where job_id=p_job and last_batch_rows>0),100)
$$;

create function private.server_record_employee_erasure_step(p_job_id uuid,p_actor uuid,p_phase text,p_elapsed_ms double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found then raise exception 'Löschauftrag wurde nicht gefunden';end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 if p_phase not in('PREPARATION','FILES','LOGIN') then raise exception 'Ungültiger Löschschritt';end if;
 perform private.sf_erasure_metrics_init(job.id);
 perform private.sf_erasure_record_batch(job.id,p_phase,least(greatest(p_elapsed_ms,0),600000));
 return private.sf_erasure_progress(job.id);
end $$;
create function public.server_record_employee_erasure_step(p_job_id uuid,p_actor uuid,p_phase text,p_elapsed_ms double precision) returns jsonb
language sql set search_path='' as $$select private.server_record_employee_erasure_step(p_job_id,p_actor,p_phase,p_elapsed_ms)$$;

create function private.owner_employee_erasure_progress(p_company_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare id_ uuid;
begin
 perform private.sf_erasure_owner(p_company_id,auth.uid());
 select id into id_ from private.employee_erasure_jobs where company_id=p_company_id and employee_id=p_employee_id;
 if not found then return jsonb_build_object('percentage',0,'phase','PREPARATION');end if;
 -- Read the last committed checkpoint; polling never locks or advances erasure.
 return coalesce((select jsonb_build_object('percentage',percentage,'phase',phase) from private.employee_erasure_metrics where job_id=id_),jsonb_build_object('percentage',0,'phase','PREPARATION'));
end $$;
create function public.owner_employee_erasure_progress(p_company_id uuid,p_employee_id uuid) returns jsonb
language sql set search_path='' as $$select private.owner_employee_erasure_progress(p_company_id,p_employee_id)$$;

CREATE OR REPLACE FUNCTION private.sf_employee_erasure_commit_batch_v2(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; refs text[]; names text[]; eids uuid[]; item record; column_info record; expression text; has_company boolean; uuid_refs jsonb; other_ids text[]; phase_ integer; column_cursor_ integer; column_index_ integer:=0; started_ timestamptz:=clock_timestamp(); audit_cursor_ uuid; scanned_ integer:=0; total_scanned_ bigint; row_cursor_ uuid; batch_rows_ integer; row_ record; cleaned_ jsonb; uuid_key_ boolean; table_key_ text; columns_ text[]; columns_sql_ text; changed_sql_ text; values_sql_ text; object_sql_ text; indexed_ boolean; query_ jsonb; prefixes_ text[]; terms_ text[]; fallback_ boolean; batch_limit_ int;
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
 if phase_=1 and job.plan->>'_bundle_version' is distinct from '2' then
  job.plan:=(job.plan-'_column_row_cursor')||jsonb_build_object('_columns_cursor',0,'_json_tables_done','[]'::jsonb,'_bundle_version',2);
  update private.employee_erasure_jobs set plan=job.plan where id=job.id;
 end if;
 query_:=private.sf_erasure_reference_query(refs,names);
 prefixes_:=array(select jsonb_array_elements_text(query_->'prefixes'));
 terms_:=array(select jsonb_array_elements_text(query_->'terms'));
 fallback_:=(query_->>'fallback')::boolean;
 batch_limit_:=private.sf_erasure_batch_limit(job.id);
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
   and c.table_name not in('employee_erasure_metrics','employee_erasure_index_sources','employee_erasure_reference_index','employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation')
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
   table_key_:=column_info.table_schema||'.'||column_info.table_name;
   if coalesce(job.plan->'_json_tables_done','[]') ? table_key_ then continue;end if;
   select array_agg(c.column_name::text order by c.column_name) into columns_ from information_schema.columns c
    where c.table_schema=column_info.table_schema and c.table_name=column_info.table_name and c.data_type='jsonb'
     and c.column_name not in('id','company_id','user_id');
   select string_agg(format('%I',x),','),string_agg(format('%L,to_jsonb(t.%I)',x,x),',') into columns_sql_,object_sql_ from unnest(columns_) x;
   select coalesce((select ready and json_columns=columns_ from private.employee_erasure_index_sources
    where source_oid=to_regclass(format('%I.%I',column_info.table_schema,column_info.table_name))),false) into indexed_;
   row_cursor_:=case when column_index_=column_cursor_+1 then nullif(job.plan->>'_column_row_cursor','')::uuid end;
   batch_rows_:=0;
   for row_ in execute format('select t.id,jsonb_build_object(%s) value from %I.%I t
    left join private.employee_erasure_reference_index ix on ix.source_oid=%s::oid and ix.row_id=t.id
    where t.company_id=$1 and ($2 is null or t.id>$2)
     and ($6 or ix.row_id is null or ix.uuid_prefixes && $3 or ix.terms && $4 or $5)
    order by t.id limit %s for update of t',object_sql_,column_info.table_schema,column_info.table_name,
    to_regclass(format('%I.%I',column_info.table_schema,column_info.table_name))::oid,batch_limit_)
    using job.company_id,row_cursor_,prefixes_,terms_,fallback_,not indexed_ loop
    row_cursor_:=row_.id;batch_rows_:=batch_rows_+1;
    select jsonb_object_agg(key,coalesce(private.sf_erasure_scrub_prepared(value,refs,names,uuid_refs,other_ids),'{}'::jsonb))
     into cleaned_ from jsonb_each(row_.value);
    if cleaned_ is distinct from row_.value then
     -- Assign only changed JSON fields directly. jsonb_populate_record would
     -- turn an unchanged JSON null into SQL NULL in another field.
     select string_agg(format('%I',key),',' order by key),string_agg(format('($3::jsonb->%L)',key),',' order by key)
      into changed_sql_,values_sql_ from jsonb_each(cleaned_) where value is distinct from row_.value->key;
     execute format('update %I.%I set (%s)=(select %s) where company_id=$1 and id=$2',
      column_info.table_schema,column_info.table_name,changed_sql_,values_sql_)
      using job.company_id,row_.id,cleaned_;
    end if;
    if batch_rows_>=batch_limit_ or clock_timestamp()-started_>=interval '2500 milliseconds' then
     update private.employee_erasure_jobs set plan=plan||jsonb_build_object('_database_phase',1,'_columns_cursor',column_index_-1,'_column_row_cursor',row_cursor_,'_bundle_version',2) where id=job.id;
     delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
     return jsonb_build_object('database_done',false,'phase','SHARED_DATA','processed',column_index_-1,'batch_rows',batch_rows_);
    end if;
   end loop;
   job.plan:=(job.plan-'_column_row_cursor')||jsonb_build_object('_json_tables_done',coalesce(job.plan->'_json_tables_done','[]')||to_jsonb(table_key_));
   update private.employee_erasure_jobs set plan=(plan-'_column_row_cursor')||jsonb_build_object('_json_tables_done',job.plan->'_json_tables_done','_bundle_version',2) where id=job.id;
  else
  execute format('update %I.%I set %I=%s where company_id=$1 and case when private.sf_erasure_matches(case when jsonb_typeof(to_jsonb(%I))=''string'' then to_jsonb(%I)#>>''{}'' else to_jsonb(%I)::text end,$4,$5||coalesce($3,''{}'')) then private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5) is distinct from to_jsonb(%I) else false end',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name)
   using job.company_id,refs,names,uuid_refs,other_ids;
  end if;
  if clock_timestamp()-started_>=interval '2500 milliseconds' then
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
  exit when clock_timestamp()-started_>=interval '2500 milliseconds';
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

CREATE OR REPLACE FUNCTION private.sf_employee_erasure_finish_batch_v2(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and c.relname not in('employee_erasure_metrics','employee_erasure_index_sources','employee_erasure_reference_index','employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context','audit_events')
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
     if rows_>=2000 or clock_timestamp()-started_>=interval '2500 milliseconds' then
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
   if clock_timestamp()-started_>=interval '2500 milliseconds' then
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
   if rows_>=2000 or clock_timestamp()-started_>=interval '2500 milliseconds' then
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
   if rows_>=2000 or clock_timestamp()-started_>=interval '2500 milliseconds' then
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
end $function$;

create or replace function private.server_commit_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_ jsonb; progress_ jsonb; started_ timestamptz:=clock_timestamp(); phase_ text; job private.employee_erasure_jobs;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found then raise exception 'Löschauftrag wurde nicht gefunden';end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 perform private.sf_erasure_metrics_init(p_job_id);
 phase_:=case coalesce(job.plan->>'_database_phase','0') when '0' then 'DATA' when '1' then 'SHARED_DATA' else 'AUDIT' end;
 result_:=private.sf_employee_erasure_commit_batch_v2(p_job_id,p_actor);
 perform private.sf_erasure_record_batch(p_job_id,phase_,extract(epoch from(clock_timestamp()-started_))*1000,coalesce((result_->>'batch_rows')::int,0));
 progress_:=private.sf_erasure_progress(p_job_id);
 return result_||progress_;
end $$;
create or replace function private.server_finish_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_ jsonb; started_ timestamptz:=clock_timestamp(); job private.employee_erasure_jobs;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found or job.status<>'DATABASE_DONE' then raise exception 'Die Datenbanklöschung ist noch nicht abgeschlossen';end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 perform private.sf_erasure_metrics_init(p_job_id);
 result_:=private.sf_employee_erasure_finish_batch_v2(p_job_id,p_actor);
 perform private.sf_erasure_record_batch(p_job_id,'VERIFY',extract(epoch from(clock_timestamp()-started_))*1000);
 if result_->>'complete'='true' and result_->>'verified'='true' then
  update private.employee_erasure_metrics set completed_at=clock_timestamp(),phase='COMPLETE',percentage=100 where job_id=p_job_id;
 end if;
 return result_||private.sf_erasure_progress(p_job_id);
end $$;

-- All new helpers remain private. The progress endpoint checks current ownership;
-- maintenance and timing endpoints are available only to the existing server worker.
do $$declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.proname in(
   'sf_erasure_guard_reference_writes','sf_erasure_reference_tokens','sf_erasure_reference_query','sf_erasure_refresh_reference_index',
   'server_backfill_employee_erasure_references','sf_erasure_metrics_init','sf_erasure_progress',
   'sf_erasure_record_batch','sf_erasure_batch_limit','server_record_employee_erasure_step',
   'owner_employee_erasure_progress','sf_employee_erasure_commit_batch_v2','sf_employee_erasure_finish_batch_v2') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.owner_employee_erasure_progress(uuid,uuid),private.owner_employee_erasure_progress(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
