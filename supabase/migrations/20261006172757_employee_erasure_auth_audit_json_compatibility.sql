CREATE OR REPLACE FUNCTION private.server_finish_employee_erasure(p_job_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; remaining integer; refs text[]; names text[]; has_company boolean; checked_table record;
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found or job.status<>'DATABASE_DONE' then raise exception 'Die Datenbanklöschung ist noch nicht abgeschlossen'; end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 if (job.plan->>'delete_auth')::boolean and exists(select 1 from auth.users where id=(job.plan->>'auth_user_id')::uuid) then raise exception 'Der Mitarbeiterzugang ist noch nicht vollständig gelöscht'; end if;
 refs:=array(select jsonb_array_elements_text(job.plan->'references')); names:=array(select jsonb_array_elements_text(job.plan->'names'));
 if (job.plan->>'delete_auth')::boolean then
  delete from auth.audit_log_entries where private.sf_erasure_scrub(payload::jsonb,refs,names) is distinct from payload::jsonb;
 end if;
 for rel in select value from jsonb_array_elements(job.plan->'relations') loop
  select exists(select 1 from information_schema.columns where table_schema=rel->>'schema' and table_name=rel->>'table' and column_name='company_id') into has_company;
  execute format('select count(*) from %I.%I where %I::text=any($1)%s',rel->>'schema',rel->>'table',rel->>'key',case when has_company then ' and company_id=$2' else '' end)
   into remaining using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
  if remaining<>0 then raise exception 'Die abschließende Löschprüfung hat verbleibende Datensätze gefunden'; end if;
 end loop;
 -- Independently inspect all company-scoped application tables, including shared JSON,
 -- strings and arrays, rather than treating the planned row list as sufficient proof.
 for checked_table in select c.table_schema,c.table_name from information_schema.columns c
  join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
  where c.table_schema in('public','private') and c.column_name='company_id'
   and c.table_name not in('employee_erasure_jobs','employee_erasure_context','employee_roster_generation','employee_roster_sync_context') loop
  execute format('select count(*) from %I.%I t where company_id=$1 and private.sf_erasure_scrub(to_jsonb(t),$2,$3) is distinct from to_jsonb(t)',checked_table.table_schema,checked_table.table_name)
   into remaining using job.company_id,refs,names;
  if remaining<>0 then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten in % gefunden',checked_table.table_name; end if;
 end loop;
 if exists(select 1 from public.audit_events a where company_id=job.company_id and private.sf_erasure_scrub(to_jsonb(a),refs,names) is distinct from to_jsonb(a))
  or exists(select 1 from public.time_month_closures where company_id=job.company_id and private.sf_erasure_scrub(report_snapshot,refs,names) is distinct from report_snapshot)
  or exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and exists(select 1 from jsonb_array_elements_text(job.plan->'employee_ids') e where o.name like job.company_id::text||'/'||e||'/%')) then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten gefunden'; end if;
 delete from private.employee_erasure_jobs where id=job.id;
 return jsonb_build_object('complete',true,'verified',true);
end $function$
