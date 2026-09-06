create table if not exists public.employee_personnel_details (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  department text not null default '',
  job_title text not null default '',
  work_location text not null default '',
  cost_center text not null default '',
  probation_end date,
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  private_note text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_personnel_qualifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null default 'Qualifikation',
  title text not null,
  credential_number text not null default '',
  issuer text not null default '',
  issued_on date,
  expires_on date,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint employee_personnel_qualification_dates check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index if not exists employee_personnel_qualifications_employee_idx on public.employee_personnel_qualifications(employee_id, expires_on);

create table if not exists public.employee_personnel_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null default 'Sonstiges',
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  document_date date,
  expires_on date,
  note text not null default '',
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  constraint employee_personnel_document_size check (file_size >= 0 and file_size <= 10485760)
);
create index if not exists employee_personnel_documents_employee_idx on public.employee_personnel_documents(employee_id, expires_on);

create table if not exists public.employee_personnel_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  note_type text not null default 'ALLGEMEIN',
  title text not null default '',
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint employee_personnel_note_nonempty check (length(btrim(note)) >= 2)
);
create index if not exists employee_personnel_notes_employee_idx on public.employee_personnel_notes(employee_id, created_at desc);

alter table public.employee_personnel_details enable row level security;
alter table public.employee_personnel_qualifications enable row level security;
alter table public.employee_personnel_documents enable row level security;
alter table public.employee_personnel_notes enable row level security;

drop policy if exists personnel_details_no_direct_access on public.employee_personnel_details;
create policy personnel_details_no_direct_access on public.employee_personnel_details for all to authenticated using (false) with check (false);
drop policy if exists personnel_qualifications_no_direct_access on public.employee_personnel_qualifications;
create policy personnel_qualifications_no_direct_access on public.employee_personnel_qualifications for all to authenticated using (false) with check (false);
drop policy if exists personnel_documents_no_direct_access on public.employee_personnel_documents;
create policy personnel_documents_no_direct_access on public.employee_personnel_documents for all to authenticated using (false) with check (false);
drop policy if exists personnel_notes_no_direct_access on public.employee_personnel_notes;
create policy personnel_notes_no_direct_access on public.employee_personnel_notes for all to authenticated using (false) with check (false);

revoke all on public.employee_personnel_details from anon, authenticated;
revoke all on public.employee_personnel_qualifications from anon, authenticated;
revoke all on public.employee_personnel_documents from anon, authenticated;
revoke all on public.employee_personnel_notes from anon, authenticated;

grant usage on schema private to authenticated;

create or replace function private.personnel_admin_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.role
  from public.company_members cm
  where cm.company_id=p_company_id
    and cm.user_id=auth.uid()
    and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN')
  limit 1
$$;
revoke all on function private.personnel_admin_role(uuid) from public, anon;
grant execute on function private.personnel_admin_role(uuid) to authenticated;

create or replace function private.manager_personnel_file_bundle_impl(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_company uuid;
  v_role text;
  v_result jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role := private.personnel_admin_role(v_company);
  if v_role is null then raise exception 'Personalakte ist nur für OWNER/ADMIN freigegeben'; end if;

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,
      'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,'start_date',e.start_date,
      'contract_end',e.contract_end,'birth_date',e.birth_date,'status',e.status,'email',e.email,'phone',e.phone,
      'address',e.address,'zip',e.zip,'city',e.city,'shift_permissions',e.shift_permissions,
      'base_qualifications',e.qualifications,'access_status',e.access_status,
      'details', coalesce((select to_jsonb(d) - 'company_id' - 'updated_by' from public.employee_personnel_details d where d.employee_id=e.id),'{}'::jsonb)
    ),
    'qualifications', coalesce((select jsonb_agg(
      (to_jsonb(q) - 'company_id' - 'created_by' - 'updated_by') || jsonb_build_object('validity_status',
        case when q.expires_on is null then 'NO_EXPIRY'
             when q.expires_on < current_date then 'EXPIRED'
             when q.expires_on <= current_date + 60 then 'EXPIRING'
             else 'VALID' end)
      order by coalesce(q.expires_on,'9999-12-31'::date),q.title)
      from public.employee_personnel_qualifications q where q.employee_id=e.id),'[]'::jsonb),
    'documents', coalesce((select jsonb_agg(
      (to_jsonb(d) - 'company_id' - 'uploaded_by') || jsonb_build_object('validity_status',
        case when d.expires_on is null then 'NO_EXPIRY'
             when d.expires_on < current_date then 'EXPIRED'
             when d.expires_on <= current_date + 60 then 'EXPIRING'
             else 'VALID' end)
      order by d.created_at desc)
      from public.employee_personnel_documents d where d.employee_id=e.id),'[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) - 'company_id' order by n.created_at desc)
      from public.employee_personnel_notes n where n.employee_id=e.id),'[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'event_type',a.event_type,'entity_type',a.entity_type,'entity_id',a.entity_id,
      'actor_role',a.actor_role,'metadata',a.metadata,'created_at',a.created_at) order by a.created_at desc)
      from (select * from public.audit_events a
            where a.company_id=v_company
              and (a.entity_id=e.id or a.metadata->>'employeeId'=e.id::text)
            order by a.created_at desc limit 80) a),'[]'::jsonb)
  ) into v_result
  from public.employees e where e.id=p_employee_id;
  return v_result;
end;
$$;
revoke all on function private.manager_personnel_file_bundle_impl(uuid) from public, anon;
grant execute on function private.manager_personnel_file_bundle_impl(uuid) to authenticated;

create or replace function public.manager_personnel_file_bundle(p_employee_id uuid)
returns jsonb
language sql
set search_path = public, private, pg_temp
as $$ select private.manager_personnel_file_bundle_impl(p_employee_id) $$;
revoke all on function public.manager_personnel_file_bundle(uuid) from public, anon;
grant execute on function public.manager_personnel_file_bundle(uuid) to authenticated;

create or replace function private.manager_update_personnel_details_impl(
  p_employee_id uuid,p_department text,p_job_title text,p_work_location text,p_cost_center text,
  p_probation_end date,p_emergency_contact_name text,p_emergency_contact_phone text,p_private_note text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_company uuid; v_role text; v_old jsonb; v_new jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_company);
  if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen die Personalakte ändern'; end if;
  select to_jsonb(d) into v_old from public.employee_personnel_details d where d.employee_id=p_employee_id;
  insert into public.employee_personnel_details(employee_id,company_id,department,job_title,work_location,cost_center,probation_end,emergency_contact_name,emergency_contact_phone,private_note,updated_by,updated_at)
  values(p_employee_id,v_company,left(coalesce(p_department,''),200),left(coalesce(p_job_title,''),200),left(coalesce(p_work_location,''),200),left(coalesce(p_cost_center,''),100),p_probation_end,left(coalesce(p_emergency_contact_name,''),200),left(coalesce(p_emergency_contact_phone,''),100),left(coalesce(p_private_note,''),3000),auth.uid(),now())
  on conflict(employee_id) do update set department=excluded.department,job_title=excluded.job_title,work_location=excluded.work_location,cost_center=excluded.cost_center,probation_end=excluded.probation_end,emergency_contact_name=excluded.emergency_contact_name,emergency_contact_phone=excluded.emergency_contact_phone,private_note=excluded.private_note,updated_by=auth.uid(),updated_at=now();
  select to_jsonb(d) into v_new from public.employee_personnel_details d where d.employee_id=p_employee_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_company,'PERSONNEL_DETAILS_UPDATED','EMPLOYEE',p_employee_id,auth.uid(),v_role,v_old,v_new,jsonb_build_object('employeeId',p_employee_id));
end $$;
revoke all on function private.manager_update_personnel_details_impl(uuid,text,text,text,text,date,text,text,text) from public, anon;
grant execute on function private.manager_update_personnel_details_impl(uuid,text,text,text,text,date,text,text,text) to authenticated;

create or replace function public.manager_update_personnel_details(
  p_employee_id uuid,p_department text default '',p_job_title text default '',p_work_location text default '',p_cost_center text default '',
  p_probation_end date default null,p_emergency_contact_name text default '',p_emergency_contact_phone text default '',p_private_note text default '')
returns void language sql set search_path=public,private,pg_temp
as $$ select private.manager_update_personnel_details_impl(p_employee_id,p_department,p_job_title,p_work_location,p_cost_center,p_probation_end,p_emergency_contact_name,p_emergency_contact_phone,p_private_note) $$;
revoke all on function public.manager_update_personnel_details(uuid,text,text,text,text,date,text,text,text) from public, anon;
grant execute on function public.manager_update_personnel_details(uuid,text,text,text,text,date,text,text,text) to authenticated;

create or replace function private.manager_save_personnel_qualification_impl(
  p_employee_id uuid,p_id uuid,p_category text,p_title text,p_credential_number text,p_issuer text,p_issued_on date,p_expires_on date,p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_company uuid; v_role text; v_id uuid; v_old jsonb; v_new jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_company); if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Qualifikationen ändern'; end if;
  if length(btrim(coalesce(p_title,'')))<2 then raise exception 'Bezeichnung der Qualifikation fehlt'; end if;
  if p_issued_on is not null and p_expires_on is not null and p_expires_on<p_issued_on then raise exception 'Ablaufdatum liegt vor dem Ausstellungsdatum'; end if;
  if p_id is not null then
    select to_jsonb(q) into v_old from public.employee_personnel_qualifications q where q.id=p_id and q.employee_id=p_employee_id for update;
    if v_old is null then raise exception 'Qualifikation nicht gefunden'; end if;
    update public.employee_personnel_qualifications q set category=left(coalesce(nullif(btrim(p_category),''),'Qualifikation'),100),title=left(btrim(p_title),250),credential_number=left(coalesce(p_credential_number,''),200),issuer=left(coalesce(p_issuer,''),250),issued_on=p_issued_on,expires_on=p_expires_on,note=left(coalesce(p_note,''),2000),updated_by=auth.uid(),updated_at=now() where q.id=p_id returning q.id into v_id;
  else
    insert into public.employee_personnel_qualifications(company_id,employee_id,category,title,credential_number,issuer,issued_on,expires_on,note,created_by,updated_by)
    values(v_company,p_employee_id,left(coalesce(nullif(btrim(p_category),''),'Qualifikation'),100),left(btrim(p_title),250),left(coalesce(p_credential_number,''),200),left(coalesce(p_issuer,''),250),p_issued_on,p_expires_on,left(coalesce(p_note,''),2000),auth.uid(),auth.uid()) returning id into v_id;
  end if;
  select to_jsonb(q) into v_new from public.employee_personnel_qualifications q where q.id=v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_company,case when p_id is null then 'PERSONNEL_QUALIFICATION_ADDED' else 'PERSONNEL_QUALIFICATION_UPDATED' end,'PERSONNEL_QUALIFICATION',v_id,auth.uid(),v_role,v_old,v_new,jsonb_build_object('employeeId',p_employee_id));
  return v_id;
end $$;
revoke all on function private.manager_save_personnel_qualification_impl(uuid,uuid,text,text,text,text,date,date,text) from public, anon;
grant execute on function private.manager_save_personnel_qualification_impl(uuid,uuid,text,text,text,text,date,date,text) to authenticated;

create or replace function public.manager_save_personnel_qualification(
  p_employee_id uuid,p_id uuid default null,p_category text default 'Qualifikation',p_title text default '',p_credential_number text default '',p_issuer text default '',p_issued_on date default null,p_expires_on date default null,p_note text default '')
returns uuid language sql set search_path=public,private,pg_temp
as $$ select private.manager_save_personnel_qualification_impl(p_employee_id,p_id,p_category,p_title,p_credential_number,p_issuer,p_issued_on,p_expires_on,p_note) $$;
revoke all on function public.manager_save_personnel_qualification(uuid,uuid,text,text,text,text,date,date,text) from public, anon;
grant execute on function public.manager_save_personnel_qualification(uuid,uuid,text,text,text,text,date,date,text) to authenticated;

create or replace function private.manager_delete_personnel_qualification_impl(p_id uuid)
returns void
language plpgsql security definer set search_path=public,private,pg_temp
as $$ declare v_row public.employee_personnel_qualifications%rowtype; v_role text; begin
  select * into v_row from public.employee_personnel_qualifications where id=p_id for update;
  if v_row.id is null then raise exception 'Qualifikation nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_row.company_id); if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Qualifikationen löschen'; end if;
  delete from public.employee_personnel_qualifications where id=p_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_row.company_id,'PERSONNEL_QUALIFICATION_DELETED','PERSONNEL_QUALIFICATION',p_id,auth.uid(),v_role,to_jsonb(v_row),null,jsonb_build_object('employeeId',v_row.employee_id));
end $$;
revoke all on function private.manager_delete_personnel_qualification_impl(uuid) from public, anon;
grant execute on function private.manager_delete_personnel_qualification_impl(uuid) to authenticated;
create or replace function public.manager_delete_personnel_qualification(p_id uuid) returns void language sql set search_path=public,private,pg_temp as $$ select private.manager_delete_personnel_qualification_impl(p_id) $$;
revoke all on function public.manager_delete_personnel_qualification(uuid) from public, anon;
grant execute on function public.manager_delete_personnel_qualification(uuid) to authenticated;

create or replace function private.manager_register_personnel_document_impl(
  p_employee_id uuid,p_category text,p_title text,p_file_name text,p_storage_path text,p_mime_type text,p_file_size bigint,p_document_date date,p_expires_on date,p_note text)
returns uuid
language plpgsql security definer set search_path=public,private,pg_temp
as $$ declare v_company uuid; v_role text; v_id uuid; v_new jsonb; begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_company); if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Dokumente hochladen'; end if;
  if length(btrim(coalesce(p_title,'')))<2 then raise exception 'Dokumenttitel fehlt'; end if;
  if p_file_size<0 or p_file_size>10485760 then raise exception 'Datei darf maximal 10 MB groß sein'; end if;
  if position(v_company::text||'/'||p_employee_id::text||'/' in p_storage_path)<>1 then raise exception 'Ungültiger Speicherpfad'; end if;
  insert into public.employee_personnel_documents(company_id,employee_id,category,title,file_name,storage_path,mime_type,file_size,document_date,expires_on,note,uploaded_by)
  values(v_company,p_employee_id,left(coalesce(nullif(btrim(p_category),''),'Sonstiges'),100),left(btrim(p_title),250),left(p_file_name,300),p_storage_path,left(coalesce(p_mime_type,'application/octet-stream'),150),p_file_size,p_document_date,p_expires_on,left(coalesce(p_note,''),2000),auth.uid()) returning id into v_id;
  select to_jsonb(d) into v_new from public.employee_personnel_documents d where d.id=v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,'PERSONNEL_DOCUMENT_ADDED','PERSONNEL_DOCUMENT',v_id,auth.uid(),v_role,v_new,jsonb_build_object('employeeId',p_employee_id,'fileName',p_file_name));
  return v_id;
end $$;
revoke all on function private.manager_register_personnel_document_impl(uuid,text,text,text,text,text,bigint,date,date,text) from public, anon;
grant execute on function private.manager_register_personnel_document_impl(uuid,text,text,text,text,text,bigint,date,date,text) to authenticated;
create or replace function public.manager_register_personnel_document(
  p_employee_id uuid,p_category text,p_title text,p_file_name text,p_storage_path text,p_mime_type text,p_file_size bigint,p_document_date date default null,p_expires_on date default null,p_note text default '')
returns uuid language sql set search_path=public,private,pg_temp
as $$ select private.manager_register_personnel_document_impl(p_employee_id,p_category,p_title,p_file_name,p_storage_path,p_mime_type,p_file_size,p_document_date,p_expires_on,p_note) $$;
revoke all on function public.manager_register_personnel_document(uuid,text,text,text,text,text,bigint,date,date,text) from public, anon;
grant execute on function public.manager_register_personnel_document(uuid,text,text,text,text,text,bigint,date,date,text) to authenticated;

create or replace function private.manager_delete_personnel_document_impl(p_id uuid)
returns text
language plpgsql security definer set search_path=public,private,pg_temp
as $$ declare v_row public.employee_personnel_documents%rowtype; v_role text; begin
  select * into v_row from public.employee_personnel_documents where id=p_id for update;
  if v_row.id is null then raise exception 'Dokument nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_row.company_id); if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Dokumente löschen'; end if;
  delete from public.employee_personnel_documents where id=p_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,metadata)
  values(v_row.company_id,'PERSONNEL_DOCUMENT_DELETED','PERSONNEL_DOCUMENT',p_id,auth.uid(),v_role,to_jsonb(v_row),jsonb_build_object('employeeId',v_row.employee_id,'fileName',v_row.file_name));
  return v_row.storage_path;
end $$;
revoke all on function private.manager_delete_personnel_document_impl(uuid) from public, anon;
grant execute on function private.manager_delete_personnel_document_impl(uuid) to authenticated;
create or replace function public.manager_delete_personnel_document(p_id uuid) returns text language sql set search_path=public,private,pg_temp as $$ select private.manager_delete_personnel_document_impl(p_id) $$;
revoke all on function public.manager_delete_personnel_document(uuid) from public, anon;
grant execute on function public.manager_delete_personnel_document(uuid) to authenticated;

create or replace function private.manager_add_personnel_note_impl(p_employee_id uuid,p_note_type text,p_title text,p_note text)
returns uuid
language plpgsql security definer set search_path=public,private,pg_temp
as $$ declare v_company uuid; v_role text; v_id uuid; begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role:=private.personnel_admin_role(v_company); if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen interne Personalnotizen erfassen'; end if;
  if length(btrim(coalesce(p_note,'')))<2 then raise exception 'Notiz ist zu kurz'; end if;
  insert into public.employee_personnel_notes(company_id,employee_id,note_type,title,note,created_by)
  values(v_company,p_employee_id,left(coalesce(nullif(upper(btrim(p_note_type)),''),'ALLGEMEIN'),50),left(coalesce(p_title,''),250),left(btrim(p_note),4000),auth.uid()) returning id into v_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,'PERSONNEL_NOTE_ADDED','PERSONNEL_NOTE',v_id,auth.uid(),v_role,jsonb_build_object('noteType',p_note_type,'title',left(coalesce(p_title,''),250)),jsonb_build_object('employeeId',p_employee_id));
  return v_id;
end $$;
revoke all on function private.manager_add_personnel_note_impl(uuid,text,text,text) from public, anon;
grant execute on function private.manager_add_personnel_note_impl(uuid,text,text,text) to authenticated;
create or replace function public.manager_add_personnel_note(p_employee_id uuid,p_note_type text default 'ALLGEMEIN',p_title text default '',p_note text default '') returns uuid language sql set search_path=public,private,pg_temp as $$ select private.manager_add_personnel_note_impl(p_employee_id,p_note_type,p_title,p_note) $$;
revoke all on function public.manager_add_personnel_note(uuid,text,text,text) from public, anon;
grant execute on function public.manager_add_personnel_note(uuid,text,text,text) to authenticated;

-- Bestehende einfache Qualifikationen einmalig in die detaillierte Akte übernehmen.
insert into public.employee_personnel_qualifications(company_id,employee_id,category,title,note)
select e.company_id,e.id,'Bestand',q,''
from public.employees e cross join lateral unnest(e.qualifications) q
where nullif(btrim(q),'') is not null
  and not exists(select 1 from public.employee_personnel_qualifications pq where pq.employee_id=e.id and lower(pq.title)=lower(q));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('personnel-documents','personnel-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_access_personnel_storage(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_parts text[]; v_company uuid; v_employee uuid; begin
  v_parts:=string_to_array(coalesce(p_name,''),'/');
  if array_length(v_parts,1)<3 then return false; end if;
  if v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  v_company:=v_parts[1]::uuid; v_employee:=v_parts[2]::uuid;
  return exists(select 1 from public.company_members cm where cm.company_id=v_company and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN'))
     and exists(select 1 from public.employees e where e.id=v_employee and e.company_id=v_company);
exception when others then return false;
end $$;
revoke all on function private.can_access_personnel_storage(text) from public, anon;
grant execute on function private.can_access_personnel_storage(text) to authenticated;

drop policy if exists personnel_documents_storage_select on storage.objects;
create policy personnel_documents_storage_select on storage.objects for select to authenticated using (bucket_id='personnel-documents' and private.can_access_personnel_storage(name));
drop policy if exists personnel_documents_storage_insert on storage.objects;
create policy personnel_documents_storage_insert on storage.objects for insert to authenticated with check (bucket_id='personnel-documents' and private.can_access_personnel_storage(name));
drop policy if exists personnel_documents_storage_update on storage.objects;
create policy personnel_documents_storage_update on storage.objects for update to authenticated using (bucket_id='personnel-documents' and private.can_access_personnel_storage(name)) with check (bucket_id='personnel-documents' and private.can_access_personnel_storage(name));
drop policy if exists personnel_documents_storage_delete on storage.objects;
create policy personnel_documents_storage_delete on storage.objects for delete to authenticated using (bucket_id='personnel-documents' and private.can_access_personnel_storage(name));;
