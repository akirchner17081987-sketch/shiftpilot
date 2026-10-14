-- Reuse the prepared lookup in every row-level erasure guard.
-- Full reference comparison remains mandatory before bypassing any write guard.
create or replace function private.sf_erasure_row_allowed(p_company uuid,p_row jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; refs text[]; uuid_refs jsonb; other_ids text[];
begin
 plan:=private.sf_erasure_context_plan(p_company);
 if plan is null then return false; end if;
 refs:=array(select jsonb_array_elements_text(plan->'references'));
 uuid_refs:=coalesce(plan->'_uuid_refs',private.sf_erasure_uuid_map(refs));
 other_ids:=case when plan ? '_other_ids' then array(select jsonb_array_elements_text(plan->'_other_ids')) else private.sf_erasure_other_ids(refs) end;
 return private.sf_erasure_scrub_prepared(p_row,refs,'{}',uuid_refs,other_ids) is distinct from p_row;
end $$;
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
 insert into private.employee_erasure_context values(txid_current(),pg_backend_pid(),job.company_id,job.plan||jsonb_build_object('_uuid_refs',uuid_refs,'_other_ids',to_jsonb(other_ids)));
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
  execute format('update %I.%I set %I=%s where company_id=$1 and case when private.sf_erasure_matches(case when jsonb_typeof(to_jsonb(%I))=''string'' then to_jsonb(%I)#>>''{}'' else to_jsonb(%I)::text end,$4,$5||coalesce($3,''{}'')) then private.sf_erasure_scrub_prepared(to_jsonb(%I),$2,$3,$4,$5) is distinct from to_jsonb(%I) else false end',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name,column_info.column_name)
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
 for item in select * from public.audit_events a where a.company_id=job.company_id and case when private.sf_erasure_matches(to_jsonb(a)::text,uuid_refs,other_ids||coalesce(names,'{}')) then private.sf_erasure_scrub_prepared(to_jsonb(a),refs,names,uuid_refs,other_ids) is distinct from to_jsonb(a) else false end for update loop
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


notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION private.capture_audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_company_id uuid := coalesce((v_new->>'company_id')::uuid, (v_old->>'company_id')::uuid);
  v_entity_id uuid := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_actor_role text;
  plan_ jsonb; refs_ text[]; names_ text[]; uuid_refs_ jsonb; other_ids_ text[];
begin
  plan_:=private.sf_erasure_context_plan(v_company_id);
  if plan_ is not null then
   refs_:=array(select jsonb_array_elements_text(plan_->'references'));
   names_:=array(select jsonb_array_elements_text(plan_->'names'));
   uuid_refs_:=coalesce(plan_->'_uuid_refs',private.sf_erasure_uuid_map(refs_));
   other_ids_:=case when plan_ ? '_other_ids' then array(select jsonb_array_elements_text(plan_->'_other_ids')) else private.sf_erasure_other_ids(refs_) end;
  end if;
  if plan_ is not null then
    if private.sf_erasure_row_allowed(v_company_id,coalesce(v_old,v_new))
      or private.sf_erasure_scrub_prepared(v_old,refs_,names_,uuid_refs_,other_ids_) is distinct from v_old then
      return case when tg_op='DELETE' then old else new end;
    end if;
  end if;

  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'ACTIVE';

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role,
    old_values, new_values, metadata
  ) values (
    v_company_id,
    upper(tg_op || '_' || tg_table_name),
    tg_table_name,
    v_entity_id,
    auth.uid(),
    coalesce(v_actor_role, 'SYSTEM'),
    v_old,
    v_new,
    jsonb_build_object('schema', tg_table_schema, 'backendCaptured', true)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare plan_ jsonb; refs_ text[]; names_ text[]; uuid_refs_ jsonb; other_ids_ text[];
begin
  plan_:=private.sf_erasure_context_plan(old.company_id);
  if plan_ is not null then
   refs_:=array(select jsonb_array_elements_text(plan_->'references'));
   names_:=array(select jsonb_array_elements_text(plan_->'names'));
   uuid_refs_:=coalesce(plan_->'_uuid_refs',private.sf_erasure_uuid_map(refs_));
   other_ids_:=case when plan_ ? '_other_ids' then array(select jsonb_array_elements_text(plan_->'_other_ids')) else private.sf_erasure_other_ids(refs_) end;
  end if;
  if plan_ is not null
    and private.sf_erasure_scrub_prepared(to_jsonb(old),refs_,names_,uuid_refs_,other_ids_) is distinct from to_jsonb(old) then
    if tg_op='DELETE' and (old.entity_id::text=any(refs_)
      or (private.sf_erasure_scrub_prepared(old.old_values,refs_,names_,uuid_refs_,other_ids_) is null
       and private.sf_erasure_scrub_prepared(old.new_values,refs_,names_,uuid_refs_,other_ids_) is null)) then return old; end if;
    if tg_op='UPDATE'
      and (to_jsonb(new)-'old_values'-'new_values'-'metadata'-'actor_id')=(to_jsonb(old)-'old_values'-'new_values'-'metadata'-'actor_id')
      and new.old_values is not distinct from private.sf_erasure_scrub_prepared(old.old_values,refs_,names_,uuid_refs_,other_ids_)
      and new.new_values is not distinct from private.sf_erasure_scrub_prepared(old.new_values,refs_,names_,uuid_refs_,other_ids_)
      and new.metadata is not distinct from coalesce(private.sf_erasure_scrub_prepared(old.metadata,refs_,names_,uuid_refs_,other_ids_),'{}'::jsonb)
      and new.actor_id is not distinct from (case when old.actor_id::text=any(refs_) then null else old.actor_id end)
      then return new; end if;
    raise exception 'Die Löschfreigabe umfasst diese Protokolländerung nicht';
  end if;
  -- The Auth API can clear only the FK actor attribution of an explicitly staged,
  -- exclusive account after its database data was removed.
  if tg_op='UPDATE' and current_user in('supabase_auth_admin','postgres')
    and old.actor_id is not null and new.actor_id is null
    and (to_jsonb(new)-'actor_id')=(to_jsonb(old)-'actor_id')
    and private.sf_erasure_auth_actor_clear(old.actor_id) then return new; end if;

  if tg_op='UPDATE'
     and current_setting('schichtfunk.privacy_redaction',true)='on' then
    perform private.sf_assert_service_role();

    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.event_type is distinct from old.event_type
       or new.entity_type is distinct from old.entity_type
       or new.created_at is distinct from old.created_at then
      raise exception 'Audit redaction may not change immutable event identity';
    end if;

    if new.entity_id is not null
       or new.actor_id is not null
       or new.actor_role is not null
       or new.old_values is not null
       or new.new_values is not null
       or coalesce(new.metadata->>'privacy_redacted','false') <> 'true'
       or (new.metadata - 'privacy_redacted' - 'redacted_at' - 'retention_profile_id' - 'redaction_run_id') <> '{}'::jsonb then
      raise exception 'Audit redaction shape rejected';
    end if;

    return new;
  end if;

  raise exception 'Audit-Protokolle sind unveraenderbar';
end;
$function$;
