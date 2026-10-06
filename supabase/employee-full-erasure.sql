-- Explicit owner-authorised erasure of one employee in one company.
-- This is a separate action from ordinary offboarding and retention processing.
-- No triggers are disabled; exceptions are limited to a private, transaction-bound context.
create table private.employee_erasure_jobs (
 id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null, requested_by uuid not null, employee_name text not null,
 plan jsonb not null, status text not null default 'EXTERNAL' check(status in('EXTERNAL','DATABASE_DONE')),
 created_at timestamptz not null default now(), unique(company_id,employee_id)
);
create table private.employee_erasure_context (
 transaction_id bigint not null, backend_pid integer not null,
 company_id uuid not null, plan jsonb not null, primary key(transaction_id,backend_pid)
);
create table private.employee_roster_generation (
 company_id uuid primary key references public.companies(id) on delete cascade,
 generation bigint not null default 0
);
alter table private.employee_erasure_jobs enable row level security;
alter table private.employee_erasure_context enable row level security;
alter table private.employee_roster_generation enable row level security;
revoke all on private.employee_erasure_jobs,private.employee_erasure_context,private.employee_roster_generation from public,anon,authenticated,service_role;

create function private.sf_erasure_owner(p_company uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or not exists(select 1 from public.company_members where company_id=p_company and user_id=p_actor and role='OWNER' and status='ACTIVE') then
  raise exception 'Nur der aktive Unternehmensinhaber darf Mitarbeiter vollständig löschen';
 end if;
end $$;

create function private.sf_erasure_scrub(p_value jsonb,p_ids text[],p_names text[]) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; cleaned jsonb; result jsonb; s text; token text; escaped text; names text[]:=p_names;
begin
 if p_value is null then return null; end if;
 if jsonb_typeof(p_value)='object' then
  if coalesce(p_value->>'employee_id',p_value->>'employeeId',p_value->>'id','')=any(p_ids) then return null; end if;
  -- Names alone must never remove a different, identified employee with the same name.
  if coalesce(p_value->>'employee_id',p_value->>'employeeId','')<>'' then names:='{}'; end if;
  result:='{}';
  for k,v in select * from jsonb_each(p_value) loop
   if k=any(p_ids) then continue; end if;
   cleaned:=private.sf_erasure_scrub(v,p_ids,names);
   if cleaned is not null then result:=result||jsonb_build_object(k,cleaned); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p_value)='array' then
  result:='[]';
  for v in select value from jsonb_array_elements(p_value) loop
   cleaned:=private.sf_erasure_scrub(v,p_ids,names);
   if cleaned is not null then result:=result||jsonb_build_array(cleaned); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p_value)='string' then
  s:=p_value#>>'{}';
  foreach token in array coalesce(p_ids,'{}')||coalesce(names,'{}') loop
   if token='' then continue; end if;
   if lower(s)=lower(token) then return null; end if;
   escaped:=regexp_replace(token,'([\\.\^$|?*+(){}\[\]])','\\\1','g');
   s:=regexp_replace(s,'\m'||escaped||'\M','[entfernt]','gi');
  end loop;
  return to_jsonb(s);
 end if;
 return p_value;
end $$;

create function private.sf_erasure_has(p_value jsonb,p_ids text[]) returns boolean
language sql immutable set search_path='' as $$
 select private.sf_erasure_scrub(p_value,p_ids,'{}') is distinct from p_value
$$;

create function private.sf_erasure_context_plan(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select plan from private.employee_erasure_context
 where transaction_id=txid_current() and backend_pid=pg_backend_pid() and company_id=p_company
$$;

create function private.sf_erasure_row_allowed(p_company uuid,p_row jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.sf_erasure_has(p_row,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(p_company)->'references'))),false)
 and private.sf_erasure_context_plan(p_company) is not null
$$;

create function private.sf_erasure_auth_actor_clear(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.employee_erasure_jobs j where j.status='DATABASE_DONE'
  and (j.plan->>'delete_auth')::boolean and j.plan->>'auth_user_id'=p_actor::text)
$$;

create function private.server_validate_employee_erasure_session(p_actor uuid,p_session uuid,p_aal text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_assert_service_role();
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) then raise exception 'Bitte erneut anmelden'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=p_actor and status='verified') and p_aal is distinct from 'aal2' then raise exception 'Bitte die Zwei-Faktor-Anmeldung abschließen'; end if;
 return true;
end $$;
create function public.server_validate_employee_erasure_session(p_actor uuid,p_session uuid,p_aal text) returns boolean
language sql security invoker set search_path='' as $$select private.server_validate_employee_erasure_session(p_actor,p_session,p_aal)$$;

create function private.sf_erasure_relations(p_company uuid,p_employees uuid[],p_assignments uuid[],p_shifts uuid[],p_requests uuid[],p_incidents uuid[],p_notifications uuid[],p_checks uuid[])
returns table(schema_name text,table_name text,key_name text,predicate text)
language sql immutable set search_path='' as $$
 select * from (values
 ('public','compliance_findings','id','change_request_id=any($5) or check_run_id=any($8)'),
 ('public','compliance_check_runs','id','change_request_id=any($5)'),
 ('public','shift_change_approvals','id','change_request_id=any($5)'),
 ('private','push_dispatches','notification_id','notification_id=any($7)'),
 ('public','notifications','id','id=any($7)'),
 ('public','disruption_offers','id','employee_id=any($2) or incident_id=any($6)'),
 ('public','disruption_incidents','id','id=any($6)'),
 ('public','open_shift_market_claims','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','shift_swap_requests','id','original_employee_id=any($2) or target_employee_id=any($2) or assignment_id=any($3) or change_request_id=any($5)'),
 ('public','shift_assignment_confirmations','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_breaks','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_punches','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_pilot_employees','employee_id','employee_id=any($2)'),
 ('public','time_qr_independent_sessions','token_hash','employee_id=any($2)'),
 ('public','time_qr_independent_breaks','id','shift_id=any($4)'),
 ('public','time_qr_independent_events','id','shift_id=any($4)'),
 ('public','time_qr_independent_shifts','id','id=any($4)'),
 ('public','time_entries','assignment_id','assignment_id=any($3)'),
 ('public','shift_change_requests','id','id=any($5)'),
 ('public','shift_assignments','id','id=any($3)'),
 ('public','absences','id','employee_id=any($2)'),
 ('private','employee_profile_requests','id','employee_id=any($2)'),
 ('private','personnel_expiry_reminder_log','employee_id','employee_id=any($2)'),
 ('private','privacy_lifecycle_requests','id','employee_id=any($2)'),
 ('private','privacy_legal_holds','id','employee_id=any($2)'),
 ('public','employee_access_invites','id','employee_id=any($2)'),
 ('public','employee_personnel_documents','id','employee_id=any($2)'),
 ('public','employee_personnel_notes','id','employee_id=any($2)'),
 ('public','employee_personnel_qualifications','id','employee_id=any($2)'),
 ('public','employee_time_account_openings','employee_id','employee_id=any($2)'),
 ('public','time_account_openings','employee_id','employee_id=any($2)'),
 ('public','employee_personnel_details','employee_id','employee_id=any($2)'),
 ('public','employees','id','id=any($2)')
 ) q
$$;

create function private.sf_employee_erasure_plan(p_company uuid,p_employee uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.employees%rowtype; eids uuid[]; aids uuid[]; qids uuid[]; rids uuid[]; iids uuid[]; nids uuid[]; cids uuid[];
 refs text[]; names text[]; paths text[]; auth_id uuid; delete_auth boolean; rel record; keys jsonb; row_hash text; count_rows integer;
 manifest jsonb:='[]'; result jsonb; has_company boolean; generation bigint;
begin
 select * into e from public.employees where company_id=p_company and id=p_employee;
 if not found then raise exception 'Mitarbeiter wurde nicht gefunden'; end if;
 if exists(select 1 from private.privacy_legal_holds where company_id=p_company and (employee_id is null or employee_id=e.id) and status='ACTIVE' and (hold_until is null or hold_until>=now())) then raise exception 'Eine aktive Löschsperre muss zuerst im Datenschutzbereich aufgehoben werden'; end if;
 if exists(select 1 from private.privacy_lifecycle_requests where company_id=p_company and employee_id=e.id and legal_hold_until>=now()) then raise exception 'Eine aktive Löschsperre muss zuerst im Datenschutzbereich aufgehoben werden'; end if;
 select coalesce(array_agg(distinct id),'{}') into eids from (
  select e.id as id union all
  select a.entity_id from public.audit_events a where a.company_id=p_company and a.entity_type='employees' and a.entity_id is not null
   and not exists(select 1 from public.employees other where other.id=a.entity_id and other.id<>e.id)
   and exists(select 1 from (values(a.old_values),(a.new_values)) j(v) where v->>'first_name'=e.first_name and v->>'last_name'=e.last_name
    and ((e.legacy_id is not null and v->>'legacy_id'=e.legacy_id) or (e.personnel_no is not null and v->>'personnel_no'=e.personnel_no)))
 ) x;
 select coalesce(array_agg(distinct id),'{}') into aids from (
  select id from public.shift_assignments where company_id=p_company and employee_id=any(eids)
  union all select a.entity_id from public.audit_events a where a.company_id=p_company and a.entity_type='shift_assignments' and a.entity_id is not null
   and not exists(select 1 from public.shift_assignments current_row where current_row.id=a.entity_id and not(current_row.employee_id=any(eids)))
   and (coalesce(a.old_values->>'employee_id','')=any(eids::text[]) or coalesce(a.new_values->>'employee_id','')=any(eids::text[]))
 ) x;
 select coalesce(array_agg(id),'{}') into qids from public.time_qr_independent_shifts where company_id=p_company and employee_id=any(eids);
 select coalesce(array_agg(id),'{}') into rids from public.shift_change_requests where company_id=p_company and (employee_id=any(eids) or assignment_id=any(aids) or private.sf_erasure_has(old_snapshot,eids::text[]) or private.sf_erasure_has(proposed_snapshot,eids::text[]));
 select coalesce(array_agg(id),'{}') into iids from public.disruption_incidents where company_id=p_company and (original_employee_id=any(eids) or assignment_id=any(aids));
 select coalesce(array_agg(id),'{}') into cids from public.compliance_check_runs where company_id=p_company and change_request_id=any(rids);
 refs:=eids::text[]||aids::text[]||qids::text[]||rids::text[]||iids::text[]||cids::text[];
 select coalesce(array_agg(distinct n),'{}') into names from (
  select btrim(e.first_name||' '||e.last_name) n union all
  select btrim((v->>'first_name')||' '||(v->>'last_name')) from public.audit_events a cross join lateral (values(a.old_values),(a.new_values)) j(v)
   where a.company_id=p_company and a.entity_type='employees' and a.entity_id=any(eids)
  union all select e.email where coalesce(e.email,'')<>''
 ) x where n<>'' and not exists(select 1 from public.employees other where other.company_id=p_company and other.id<>e.id
  and (lower(btrim(other.first_name||' '||other.last_name))=lower(n) or (coalesce(other.email,'')<>'' and lower(other.email)=lower(n))));
 select coalesce(array_agg(id),'{}') into nids from public.notifications where company_id=p_company
  and (employee_id=any(eids) or entity_id::text=any(refs) or private.sf_erasure_scrub(to_jsonb(notifications),refs,names) is distinct from to_jsonb(notifications));
 for rel in select * from private.sf_erasure_relations(p_company,eids,aids,qids,rids,iids,nids,cids) loop
  select exists(select 1 from information_schema.columns where table_schema=rel.schema_name and table_name=rel.table_name and column_name='company_id') into has_company;
  execute format('select coalesce(jsonb_agg(distinct t.%I::text),''[]''::jsonb),md5(coalesce(jsonb_agg(to_jsonb(t) order by t.%I::text)::text,''[]'')),count(*) from %I.%I t where %s (%s)',rel.key_name,rel.key_name,rel.schema_name,rel.table_name,case when has_company then 'company_id=$1 and' else '' end,rel.predicate)
   into keys,row_hash,count_rows using p_company,eids,aids,qids,rids,iids,nids,cids;
  manifest:=manifest||jsonb_build_array(jsonb_build_object('schema',rel.schema_name,'table',rel.table_name,'key',rel.key_name,'ids',keys,'count',count_rows,'hash',row_hash));
  if rel.key_name='id' then refs:=refs||array(select jsonb_array_elements_text(keys)); end if;
 end loop;
 select coalesce(array_agg(distinct p),'{}') into paths from (
  select storage_path p from public.employee_personnel_documents where company_id=p_company and employee_id=any(eids)
  union all select o.name from storage.objects o where o.bucket_id='personnel-documents' and exists(select 1 from unnest(eids) id where o.name like p_company::text||'/'||id::text||'/%')
 ) x;
 if exists(select 1 from unnest(paths) p where not exists(select 1 from unnest(eids) id where p like p_company::text||'/'||id::text||'/%')) then raise exception 'Ein Dokumentpfad gehört nicht eindeutig zu diesem Mitarbeiter'; end if;
 auth_id:=e.auth_user_id;
 if auth_id is null then
  select (v->>'auth_user_id')::uuid into auth_id from public.audit_events a cross join lateral (values(a.old_values),(a.new_values)) j(v)
   where a.company_id=p_company and a.entity_type='employees' and a.entity_id=any(eids) and nullif(v->>'auth_user_id','') is not null
   order by a.created_at desc limit 1;
 end if;
 delete_auth:=auth_id is not null and not exists(select 1 from public.employees where auth_user_id=auth_id and not(id=any(eids)))
  and not exists(select 1 from public.company_members where user_id=auth_id and (company_id<>p_company or role<>'VIEWER'));
 if delete_auth then refs:=refs||auth_id::text; end if;
 if e.legacy_id is not null then refs:=refs||e.legacy_id; end if;
 select coalesce(g.generation,0) into generation from (select 1) x left join private.employee_roster_generation g on g.company_id=p_company;
 result:=jsonb_build_object('employee_id',e.id,'employee_name',btrim(e.first_name||' '||e.last_name),'personnel_no',e.personnel_no,'company_id',p_company,
  'company_name',(select name from public.companies where id=p_company),'employee_ids',to_jsonb(eids),'assignment_ids',to_jsonb(aids),
  'references',to_jsonb(refs),'names',to_jsonb(names),'relations',manifest,'storage_paths',to_jsonb(paths),'auth_user_id',auth_id,'delete_auth',delete_auth,
  'generation',generation,'profile_hash',md5(to_jsonb(e)::text),
  'snapshot_hash',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by month_start)::text,'[]')) from public.time_month_closures c where company_id=p_company),
  'audit_hash',(select md5(coalesce(jsonb_agg(id order by id)::text,'[]')) from public.audit_events a where company_id=p_company and private.sf_erasure_scrub(to_jsonb(a),refs,names) is distinct from to_jsonb(a)));
 return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;

create function private.sf_erasure_public_preview(p_plan jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select p_plan-'references'-'names'-'profile_hash'-'snapshot_hash'-'audit_hash'-'employee_ids'-'assignment_ids'-'storage_paths'-'auth_user_id'-'relations'
  ||jsonb_build_object('counts',(select jsonb_object_agg(x->>'table',x->'count') from jsonb_array_elements(p_plan->'relations') x),
    'documents',jsonb_array_length(p_plan->'storage_paths'),'shared_login',p_plan->>'auth_user_id' is not null and not (p_plan->>'delete_auth')::boolean)
$$;

create function private.owner_employee_erasure_list(p_company_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.sf_erasure_owner(p_company_id,auth.uid());
 return coalesce((select jsonb_agg(x order by x->>'employee_name') from (
  select jsonb_build_object('employee_id',e.id,'employee_name',btrim(e.first_name||' '||e.last_name),'personnel_no',e.personnel_no,'removed',e.deleted_at is not null,'pending',j.id is not null) x
  from public.employees e left join private.employee_erasure_jobs j on j.employee_id=e.id and j.company_id=e.company_id where e.company_id=p_company_id
  union all select jsonb_build_object('employee_id',j.employee_id,'employee_name',j.employee_name,'personnel_no',j.plan->>'personnel_no','removed',true,'pending',true)
  from private.employee_erasure_jobs j where j.company_id=p_company_id and not exists(select 1 from public.employees where id=j.employee_id)
 ) q),'[]');
end $$;

create function private.owner_employee_erasure_preview(p_company_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs%rowtype;
begin
 perform private.sf_erasure_owner(p_company_id,auth.uid());
 select * into job from private.employee_erasure_jobs where company_id=p_company_id and employee_id=p_employee_id;
 if job.id is not null then return private.sf_erasure_public_preview(job.plan)||jsonb_build_object('pending',true,'job_id',job.id); end if;
 return private.sf_erasure_public_preview(private.sf_employee_erasure_plan(p_company_id,p_employee_id));
end $$;

create function public.owner_employee_erasure_list(p_company_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.owner_employee_erasure_list(p_company_id)$$;
create function public.owner_employee_erasure_preview(p_company_id uuid,p_employee_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.owner_employee_erasure_preview(p_company_id,p_employee_id)$$;

create function private.server_stage_employee_erasure(p_company_id uuid,p_employee_id uuid,p_actor uuid,p_operation_id uuid,p_confirmation text,p_acknowledged boolean,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; job private.employee_erasure_jobs%rowtype;
begin
 perform private.sf_assert_service_role(); perform private.sf_erasure_owner(p_company_id,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 perform 1 from public.company_members where company_id=p_company_id and user_id=p_actor and role='OWNER' and status='ACTIVE' for share;
 select * into job from private.employee_erasure_jobs where company_id=p_company_id and employee_id=p_employee_id for update;
 if job.id is not null then
  if job.requested_by<>p_actor or not coalesce(p_acknowledged,false) or btrim(p_confirmation)<>job.employee_name then raise exception 'Löschbestätigung fehlt'; end if;
  return jsonb_build_object('job_id',job.id,'status',job.status,'plan',job.plan);
 end if;
 perform 1 from public.employees where id=p_employee_id and company_id=p_company_id for update;
 plan:=private.sf_employee_erasure_plan(p_company_id,p_employee_id);
 if not coalesce(p_acknowledged,false) or btrim(p_confirmation)<>plan->>'employee_name' then raise exception 'Bitte den vollständigen Namen und die unwiderrufliche Löschung bestätigen'; end if;
 if p_fingerprint is distinct from plan->>'fingerprint' then raise exception 'Die Daten haben sich geändert. Bitte die Löschübersicht erneut öffnen'; end if;
 update public.employees set status='inactive',access_status='DISABLED' where id=p_employee_id and company_id=p_company_id;
 update public.company_members set status='DISABLED' where company_id=p_company_id and role='VIEWER' and user_id=(plan->>'auth_user_id')::uuid;
 delete from public.time_qr_independent_sessions where company_id=p_company_id and employee_id=p_employee_id;
 insert into private.employee_erasure_jobs(id,company_id,employee_id,requested_by,employee_name,plan) values(p_operation_id,p_company_id,p_employee_id,p_actor,plan->>'employee_name',plan) returning * into job;
 -- Freeze profile and existing viewer access immediately. The job blocks all further employee writes.
 if (plan->>'delete_auth')::boolean then delete from auth.sessions where user_id=(plan->>'auth_user_id')::uuid; end if;
 return jsonb_build_object('job_id',job.id,'status',job.status,'plan',job.plan);
end $$;

create function private.sf_guard_employee_erasure_pending() returns trigger
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
  for job in select * from private.employee_erasure_jobs where status='EXTERNAL' and (company is null or company_id=company) loop
   if private.sf_erasure_has(row_data,array(select jsonb_array_elements_text(job.plan->'references'))) then
    raise exception 'Für diesen Mitarbeiter läuft die endgültige Löschung. Änderungen sind gesperrt';
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;

create function private.sf_erasure_storage_write_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.employee_erasure_jobs j cross join lateral jsonb_array_elements_text(j.plan->'employee_ids') e
  where p_path like j.company_id::text||'/'||e||'/%')
$$;
create policy personnel_erasure_freeze_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'personnel-documents' or private.sf_erasure_storage_write_allowed(name));
create policy personnel_erasure_freeze_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'personnel-documents' or private.sf_erasure_storage_write_allowed(name))
 with check(bucket_id<>'personnel-documents' or private.sf_erasure_storage_write_allowed(name));

create function private.server_commit_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; refs text[]; names text[]; eids uuid[]; item record; column_info record; expression text; has_company boolean;
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
 update public.time_month_closures c set report_snapshot=private.sf_erasure_scrub(report_snapshot,refs,names)
 where company_id=job.company_id and private.sf_erasure_scrub(report_snapshot,refs,names) is distinct from report_snapshot;
 for rel in select value from jsonb_array_elements(job.plan->'relations') loop
  select exists(select 1 from information_schema.columns where table_schema=rel->>'schema' and table_name=rel->>'table' and column_name='company_id') into has_company;
  execute format('delete from %I.%I where %I::text=any($1)%s',rel->>'schema',rel->>'table',rel->>'key',case when has_company then ' and company_id=$2' else '' end)
   using array(select jsonb_array_elements_text(rel->'ids')),job.company_id;
 end loop;
 -- Remove strings and JSON references in shared notes, settings and company-wide snapshots.
 for column_info in select c.table_schema,c.table_name,c.column_name,c.data_type,c.is_nullable from information_schema.columns c
  where c.table_schema in('public','private') and c.data_type in('text','jsonb','uuid')
   and c.table_name not in('employees','audit_events','employee_erasure_jobs','employee_erasure_context','employee_roster_generation')
   and c.column_name not in('id','company_id','user_id')
   and exists(select 1 from information_schema.columns co where co.table_schema=c.table_schema and co.table_name=c.table_name and co.column_name='company_id') loop
  if column_info.data_type='uuid' then
   if column_info.is_nullable<>'YES' then continue; end if;
   expression:='null::uuid';
  elsif column_info.data_type='jsonb' then expression:=format('coalesce(private.sf_erasure_scrub(%I,$2,$3),''{}''::jsonb)',column_info.column_name);
  else expression:=format('coalesce(private.sf_erasure_scrub(to_jsonb(%I),$2,$3)#>>''{}'','''')',column_info.column_name); end if;
  execute format('update %I.%I set %I=%s where company_id=$1 and private.sf_erasure_scrub(to_jsonb(%I),$2,$3) is distinct from to_jsonb(%I)',column_info.table_schema,column_info.table_name,column_info.column_name,expression,column_info.column_name,column_info.column_name)
   using job.company_id,refs,names;
 end loop;
 if job.plan->>'auth_user_id' is not null then
  delete from public.company_members where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid and role='VIEWER';
 end if;
 if (job.plan->>'delete_auth')::boolean then
  delete from public.push_subscriptions where company_id=job.company_id and user_id=(job.plan->>'auth_user_id')::uuid;
  delete from public.company_member_invites where company_id=job.company_id and (claimed_by=(job.plan->>'auth_user_id')::uuid or lower(email)=any(array(select lower(x) from unnest(names) x)));
 end if;
 -- Audit events owned by the employee are deleted; mixed reports are scrubbed in place.
 for item in select * from public.audit_events a where a.company_id=job.company_id and private.sf_erasure_scrub(to_jsonb(a),refs,names) is distinct from to_jsonb(a) for update loop
  if item.entity_id::text=any(refs) or (private.sf_erasure_scrub(item.old_values,refs,names) is null and private.sf_erasure_scrub(item.new_values,refs,names) is null) then
   delete from public.audit_events where id=item.id;
  else
   update public.audit_events set old_values=private.sf_erasure_scrub(item.old_values,refs,names),new_values=private.sf_erasure_scrub(item.new_values,refs,names),
    metadata=coalesce(private.sf_erasure_scrub(item.metadata,refs,names),'{}'),actor_id=case when item.actor_id::text=any(refs) then null else item.actor_id end where id=item.id;
  end if;
 end loop;
 insert into private.employee_roster_generation(company_id,generation) values(job.company_id,1)
  on conflict(company_id) do update set generation=private.employee_roster_generation.generation+1;
 update private.employee_erasure_jobs set status='DATABASE_DONE' where id=job.id;
 delete from private.employee_erasure_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return jsonb_build_object('database_done',true);
end $$;

create function private.server_finish_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.employee_erasure_jobs%rowtype; rel jsonb; remaining integer; refs text[]; names text[];
begin
 perform private.sf_assert_service_role();
 select * into job from private.employee_erasure_jobs where id=p_job_id and requested_by=p_actor for update;
 if not found or job.status<>'DATABASE_DONE' then raise exception 'Die Datenbanklöschung ist noch nicht abgeschlossen'; end if;
 perform private.sf_erasure_owner(job.company_id,p_actor);
 if (job.plan->>'delete_auth')::boolean and exists(select 1 from auth.users where id=(job.plan->>'auth_user_id')::uuid) then raise exception 'Der Mitarbeiterzugang ist noch nicht vollständig gelöscht'; end if;
 refs:=array(select jsonb_array_elements_text(job.plan->'references')); names:=array(select jsonb_array_elements_text(job.plan->'names'));
 if (job.plan->>'delete_auth')::boolean then
  delete from auth.audit_log_entries where private.sf_erasure_scrub(payload,refs,names) is distinct from payload;
 end if;
 for rel in select value from jsonb_array_elements(job.plan->'relations') loop
  execute format('select count(*) from %I.%I where %I::text=any($1)',rel->>'schema',rel->>'table',rel->>'key')
   into remaining using array(select jsonb_array_elements_text(rel->'ids'));
  if remaining<>0 then raise exception 'Die abschließende Löschprüfung hat verbleibende Datensätze gefunden'; end if;
 end loop;
 if exists(select 1 from public.audit_events a where company_id=job.company_id and private.sf_erasure_scrub(to_jsonb(a),refs,names) is distinct from to_jsonb(a))
  or exists(select 1 from public.time_month_closures where company_id=job.company_id and private.sf_erasure_scrub(report_snapshot,refs,names) is distinct from report_snapshot)
  or exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and exists(select 1 from jsonb_array_elements_text(job.plan->'employee_ids') e where o.name like job.company_id::text||'/'||e||'/%')) then raise exception 'Die abschließende Löschprüfung hat verbleibende Daten gefunden'; end if;
 delete from private.employee_erasure_jobs where id=job.id;
 return jsonb_build_object('complete',true,'verified',true);
end $$;

create function public.server_stage_employee_erasure(p_company_id uuid,p_employee_id uuid,p_actor uuid,p_operation_id uuid,p_confirmation text,p_acknowledged boolean,p_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$select private.server_stage_employee_erasure(p_company_id,p_employee_id,p_actor,p_operation_id,p_confirmation,p_acknowledged,p_fingerprint)$$;
create function public.server_commit_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb language sql security invoker set search_path='' as $$select private.server_commit_employee_erasure(p_job_id,p_actor)$$;
create function public.server_finish_employee_erasure(p_job_id uuid,p_actor uuid) returns jsonb language sql security invoker set search_path='' as $$select private.server_finish_employee_erasure(p_job_id,p_actor)$$;

-- The guard adaptations, roster protection and grants are generated below from the
-- currently installed definitions, preserving all existing business checks.
