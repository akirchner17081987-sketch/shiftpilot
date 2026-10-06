create or replace function private.sf_employee_erasure_plan(p_company uuid,p_employee uuid) returns jsonb
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
  'audit_hash',(select md5(coalesce(jsonb_agg(id order by id)::text,'[]')) from public.audit_events a where company_id=p_company and private.sf_erasure_contains(to_jsonb(a),refs,names)));
 return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;
