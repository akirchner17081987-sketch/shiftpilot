-- Prepared token lookup: extract UUIDs once per value and use JSONB key lookup.
-- Keep arbitrary legacy IDs and names as literal, case-insensitive substrings.
create function private.sf_erasure_uuid_map(p_ids text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(lower(token),true),'{}'::jsonb)
 from unnest(coalesce(p_ids,'{}')) token
 where token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
create function private.sf_erasure_other_ids(p_ids text[]) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(token),'{}'::text[]) from unnest(coalesce(p_ids,'{}')) token
 where token<>'' and token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
create function private.sf_erasure_matches(p_serialized text,p_uuid_refs jsonb,p_other_tokens text[]) returns boolean
language plpgsql immutable set search_path='' as $$
declare serialized text:=lower(p_serialized); token text; position_ integer:=1; found_ integer;
begin
 if p_serialized is null then return false; end if;
 foreach token in array coalesce(p_other_tokens,'{}') loop
  if token<>'' and strpos(serialized,lower(token))>0 then return true; end if;
 end loop;
 if p_uuid_refs='{}'::jsonb then return false; end if;
 loop
  found_:=regexp_instr(serialized,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',position_);
  if found_=0 then return false; end if;
  if p_uuid_refs ? substr(serialized,found_,36) then return true; end if;
  -- Advance one character so overlapping literal UUID substrings remain detectable.
  position_:=found_+1;
 end loop;
end $$;

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
  result:='{}';
  for k,v in select * from jsonb_each(p_value) loop
   if k=any(p_ids) then continue; end if;
   cleaned:=private.sf_erasure_scrub_prepared(v,p_ids,names,p_uuid_refs,p_other_ids);
   if cleaned is not null then result:=result||jsonb_build_object(k,cleaned); end if;
  end loop;
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

create or replace function private.sf_erasure_scrub(p_value jsonb,p_ids text[],p_names text[]) returns jsonb
language sql immutable set search_path='' as $$
 select private.sf_erasure_scrub_prepared(p_value,p_ids,p_names,private.sf_erasure_uuid_map(p_ids),private.sf_erasure_other_ids(p_ids))
$$;

CREATE OR REPLACE FUNCTION private.server_commit_employee_erasure(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; refs text[]; names text[]; eids uuid[]; item record; column_info record; expression text; has_company boolean; uuid_refs jsonb; other_ids text[];
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
 insert into private.employee_erasure_context values(txid_current(),pg_backend_pid(),job.company_id,job.plan);
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
  select exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',rel->>'schema',rel->>'table')) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) into has_company;
  execute format('delete from %I.%I where %I::text=any($1)%s',rel->>'schema',rel->>'table',rel->>'key',case when has_company then ' and company_id=$2' else '' end)
   using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
 end loop;
 -- Remove strings and JSON references in shared notes, settings and company-wide snapshots.
 for column_info in select c.table_schema,c.table_name,c.column_name,c.data_type,c.is_nullable from information_schema.columns c
  where c.table_schema in('public','private') and c.data_type in('text','jsonb','uuid')
   and c.table_name not in('employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation')
   and c.column_name not in('id','company_id','user_id')
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',c.table_schema,c.table_name)) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) loop
  if column_info.data_type='uuid' then
   if column_info.is_nullable<>'YES' then continue; end if;
   expression:='null::uuid';
  elsif column_info.data_type='jsonb' then expression:=format('coalesce(private.sf_erasure_scrub_prepared(%I,$2,$3,$4,$5),''{}''::jsonb)',column_info.column_name);
  else expression:=format('coalesce(private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5)#>>''{}'','''')',column_info.column_name); end if;
  execute format('update %I.%I set %I=%s where company_id=$1 and private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5) is distinct from to_jsonb(%I)',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name)
   using job.company_id,refs,names,uuid_refs,other_ids;
 end loop;
 if job.plan->>'auth_user_id' is not null then
  delete from public.company_members where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid and role='VIEWER';
 end if;
 if (job.plan->>'delete_auth')::boolean then
  delete from public.push_subscriptions where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid;
  delete from public.company_member_invites where company_id=job.company_id and (claimed_by=(job.plan->>'auth_user_id')::uuid or lower(email)=any(array(select lower(x) from unnest(names) x)));
 end if;
 -- Audit events owned by the employee are deleted; mixed reports are scrubbed in place.
 for item in select * from public.audit_events a where a.company_id=job.company_id and private.sf_erasure_scrub_prepared(to_jsonb(a),refs,names,uuid_refs,other_ids) is distinct from to_jsonb(a) for update loop
  if item.entity_id::text=any(refs) or (private.sf_erasure_scrub_prepared(item.old_values,refs,names,uuid_refs,other_ids) is null and private.sf_erasure_scrub_prepared(item.new_values,refs,names,uuid_refs,other_ids) is null) then
   delete from public.audit_events where id=item.id;
  else
   update public.audit_events set old_values=private.sf_erasure_scrub_prepared(item.old_values,refs,names,uuid_refs,other_ids),new_values=private.sf_erasure_scrub_prepared(item.new_values,refs,names,uuid_refs,other_ids),
    metadata=coalesce(private.sf_erasure_scrub_prepared(item.metadata,refs,names,uuid_refs,other_ids),'{}'),actor_id=case when item.actor_id::text=any(refs) then null else item.actor_id end where id=item.id;
  end if;
 end loop;
 insert into private.employee_roster_generation(company_id,generation) values(job.company_id,1)
  on conflict(company_id) do update set generation=private.employee_roster_generation.generation+1;
 update private.employee_erasure_jobs set status='DATABASE_DONE' where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',true);
end $function$;

CREATE OR REPLACE FUNCTION private.server_finish_employee_erasure(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; remaining integer; refs text[]; names text[]; has_company boolean; uuid_refs jsonb; other_ids text[]; checked_table record;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found or job.status<>'DATABASE_DONE' then raise exception 'Die Datenbanklöschung ist noch nicht abgeschlossen'; end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 if (job.plan->>'delete_auth')::boolean and exists(select 1 from auth.users where id=(job.plan->>'auth_user_id')::uuid) then raise exception 'Der Mitarbeiterzugang ist noch nicht vollständig gelöscht'; end if;
 refs:=array(select jsonb_array_elements_text(job.plan->'references')); names:=array(select jsonb_array_elements_text(job.plan->'names'));
 uuid_refs:=private.sf_erasure_uuid_map(refs); other_ids:=private.sf_erasure_other_ids(refs);
 if (job.plan->>'delete_auth')::boolean then
  delete from auth.audit_log_entries where private.sf_erasure_scrub_prepared(payload::jsonb,refs,names,uuid_refs,other_ids) is distinct from payload::jsonb;
 end if;
 for rel in select value from jsonb_array_elements(job.plan->'relations') loop
  select exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',rel->>'schema',rel->>'table')) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) into has_company;
  execute format('select count(*) from %I.%I where %I::text=any($1)%s',rel->>'schema',rel->>'table',rel->>'key',case when has_company then ' and company_id=$2' else '' end)
   into remaining using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
  if remaining<>0 then raise exception 'Die abschließende Löschprüfung hat verbleibende Datensätze gefunden'; end if;
 end loop;
 -- Independently inspect all company-scoped application tables, including shared JSON,
 -- strings and arrays, rather than treating the planned row list as sufficient proof.
 for checked_table in select n.nspname as table_schema,c.relname as table_name from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='company_id' and a.attnum>0 and not a.attisdropped
  where n.nspname in('public','private') and c.relkind in('r','p')
   and c.relname not in('employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context') loop
  execute format('select count(*) from %I.%I t where company_id=$1 and private.sf_erasure_scrub_prepared(to_jsonb(t),$2,$3,$4,$5) is distinct from to_jsonb(t)',checked_table.table_schema,checked_table.table_name)
   into remaining using job.company_id,refs,names,uuid_refs,other_ids;
  if remaining<>0 then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten in % gefunden',checked_table.table_name; end if;
 end loop;
 if exists(select 1 from public.audit_events a where company_id=job.company_id and private.sf_erasure_scrub_prepared(to_jsonb(a),refs,names,uuid_refs,other_ids) is distinct from to_jsonb(a))
  or exists(select 1 from public.time_month_closures where company_id=job.company_id and private.sf_erasure_scrub_prepared(report_snapshot,refs,names,uuid_refs,other_ids) is distinct from report_snapshot)
  or exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and exists(select 1 from jsonb_array_elements_text(job.plan->'employee_ids') e where o.name like job.company_id::text||'/'||e||'/%')) then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten gefunden'; end if;
 delete from private.employee_erasure_jobs where id=job.id;
 return jsonb_build_object('complete',true,'verified',true);
end $function$;


revoke all on function private.sf_erasure_uuid_map(text[]),private.sf_erasure_other_ids(text[]),private.sf_erasure_matches(text,jsonb,text[]),private.sf_erasure_scrub_prepared(jsonb,text[],text[],jsonb,text[]) from public,anon;
grant execute on function private.sf_erasure_uuid_map(text[]),private.sf_erasure_other_ids(text[]),private.sf_erasure_matches(text,jsonb,text[]),private.sf_erasure_scrub_prepared(jsonb,text[],text[],jsonb,text[]) to authenticated,service_role,supabase_auth_admin;
-- Restrict the longer transaction budget to the server-only erasure RPCs.
alter function public.server_stage_employee_erasure(uuid,uuid,uuid,uuid,text,boolean,text) set statement_timeout='60s';
alter function public.server_commit_employee_erasure(uuid,uuid) set statement_timeout='60s';
alter function public.server_finish_employee_erasure(uuid,uuid) set statement_timeout='60s';
notify pgrst,'reload schema';
