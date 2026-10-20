-- Targeted credential requests. Files stay private; approval is the only import into the personnel file.
begin;
create table private.personnel_evidence_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 qualification_id uuid references public.employee_personnel_qualifications(id) on delete set null,
 qualification_updated_at timestamptz,
 title text not null check(length(btrim(title)) between 2 and 180),
 instructions text not null default '' check(length(instructions)<=2000),
 due_on date,
 status text not null default 'requested' check(status in ('requested','in_review','changes_requested','approved','cancelled')),
 revision integer not null default 1,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_note text not null default '' check(length(closed_note)<=2000)
);
create index evidence_company_queue on private.personnel_evidence_requests(company_id,status,created_at desc,id);
create index evidence_employee_history on private.personnel_evidence_requests(employee_id,created_at desc,id);
create index evidence_qualification on private.personnel_evidence_requests(qualification_id);
create table private.personnel_evidence_submissions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references private.personnel_evidence_requests(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 storage_path text not null unique,
 file_name text not null check(length(file_name) between 1 and 180),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 10485760),
 status text not null default 'uploading' check(status in ('uploading','submitted','changes_requested','approved')),
 submitted_at timestamptz,
 created_at timestamptz not null default now(),
 review_note text not null default '' check(length(review_note)<=2000),
 reviewed_by uuid,
 reviewed_at timestamptz,
 document_id uuid references public.employee_personnel_documents(id) on delete set null
);
create index evidence_submission_request on private.personnel_evidence_submissions(request_id,created_at desc,id);
create index evidence_submission_employee on private.personnel_evidence_submissions(employee_id);
create index evidence_submission_company on private.personnel_evidence_submissions(company_id);
create index evidence_submission_document on private.personnel_evidence_submissions(document_id);
create unique index evidence_one_upload on private.personnel_evidence_submissions(request_id) where status='uploading';
alter table private.personnel_evidence_requests enable row level security;
alter table private.personnel_evidence_submissions enable row level security;
revoke all on private.personnel_evidence_requests,private.personnel_evidence_submissions from public,anon,authenticated;
create policy evidence_requests_rpc_only on private.personnel_evidence_requests to authenticated using(false) with check(false);
create policy evidence_submissions_rpc_only on private.personnel_evidence_submissions to authenticated using(false) with check(false);
create trigger a00_employee_erasure_freeze before insert or update or delete on private.personnel_evidence_requests for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on private.personnel_evidence_submissions for each row execute function private.sf_guard_employee_erasure_pending();

create function private.sf_evidence_employee(p_company uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not private.sf_has_time_only_login()
 and exists(select 1 from public.employees e where e.id=p_employee and e.company_id=p_company
  and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null)
 and not exists(select 1 from public.company_members cm where cm.company_id=p_company and cm.user_id=(select auth.uid()) and cm.status<>'ACTIVE');
$$;
revoke all on function private.sf_evidence_employee(uuid,uuid) from public,anon;
grant execute on function private.sf_evidence_employee(uuid,uuid) to authenticated;

-- Exact server-reserved paths only. Employees cannot overwrite or delete an uploaded version.
create function private.sf_evidence_storage(p_path text,p_upload boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.personnel_evidence_submissions s
 join private.personnel_evidence_requests r on r.id=s.request_id and r.company_id=s.company_id and r.employee_id=s.employee_id
 where s.storage_path=p_path and private.sf_evidence_employee(s.company_id,s.employee_id)
 and (not p_upload or (s.status='uploading' and r.status in ('requested','changes_requested'))));
$$;
revoke all on function private.sf_evidence_storage(text,boolean) from public,anon;
grant execute on function private.sf_evidence_storage(text,boolean) to authenticated;
create policy evidence_employee_upload on storage.objects for insert to authenticated
 with check(bucket_id='personnel-documents' and private.sf_evidence_storage(name,true));
create policy evidence_employee_read on storage.objects for select to authenticated
 using(bucket_id='personnel-documents' and private.sf_evidence_storage(name,false));
create function private.sf_evidence_registered_path(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.personnel_evidence_submissions where storage_path=p_path);
$$;
revoke all on function private.sf_evidence_registered_path(text) from public,anon;
grant execute on function private.sf_evidence_registered_path(text) to authenticated;
-- Also prevent administrative overwrites of submitted versions; explicit document deletion remains available.
create policy evidence_immutable_file on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'personnel-documents' or not private.sf_evidence_registered_path(name))
 with check(bucket_id<>'personnel-documents' or not private.sf_evidence_registered_path(name));

create function private.personnel_evidence_impl(p_company_id uuid,p_mode text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 manager_ boolean:=p_mode='manager'; employee_ uuid; e public.employees%rowtype;
 r private.personnel_evidence_requests%rowtype; s private.personnel_evidence_submissions%rowtype;
 row_ record; role_ text; result_ jsonb; offset_ integer; total_ bigint; path_ text;
 note_ text:=btrim(coalesce(p_payload->>'note','')); doc_ uuid; qual_ uuid;
 issued_ date; expires_ date; title_ text; revision_ integer; qualification_stamp_ timestamptz;
begin
 if auth.uid() is null or p_mode is null or p_mode not in ('employee','manager') or private.sf_has_time_only_login() then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 if manager_ then
  role_:=private.personnel_admin_role(p_company_id);
  if role_ is null then raise exception 'Nur die Personalverwaltung darf Nachweise bearbeiten' using errcode='42501'; end if;
 else
  employee_:=(p_payload->>'employee_id')::uuid;
  if not private.sf_evidence_employee(p_company_id,employee_) then raise exception 'Kein aktiver eigener Mitarbeiterzugang' using errcode='42501'; end if;
 end if;
 if p_action='list' then
  if manager_ then employee_:=(p_payload->>'employee_id')::uuid; end if;
  offset_:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),1000000));
  select count(*) into total_ from private.personnel_evidence_requests q where q.company_id=p_company_id and (employee_ is null or q.employee_id=employee_);
  select coalesce(jsonb_agg(to_jsonb(z) order by z.sort_open desc,z.created_at desc,z.id),'[]'::jsonb) into result_ from (
   select q.id,q.employee_id,q.qualification_id,q.title,q.instructions,q.due_on,q.status,q.revision,q.created_at,q.closed_note,
    emp.first_name,emp.last_name,emp.personnel_no,(q.status not in ('approved','cancelled')) sort_open,
    coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'file_size',a.file_size,'status',a.status,
     'submitted_at',a.submitted_at,'review_note',a.review_note,'reviewed_at',a.reviewed_at,'document_id',a.document_id,
     'uploaded',exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and o.name=a.storage_path)) order by a.created_at desc,a.id)
     from private.personnel_evidence_submissions a where a.request_id=q.id),'[]'::jsonb) submissions
   from private.personnel_evidence_requests q join public.employees emp on emp.id=q.employee_id and emp.company_id=q.company_id
   where q.company_id=p_company_id and (employee_ is null or q.employee_id=employee_)
   order by (q.status not in ('approved','cancelled')) desc,q.created_at desc,q.id limit 50 offset offset_
  ) z;
  return jsonb_build_object('company_id',p_company_id,'requests',result_,'total',total_,'offset',offset_);
 end if;
 if manager_ and p_action='create' then
  select * into e from public.employees where id=(p_payload->>'employee_id')::uuid and company_id=p_company_id for update;
  if not found or e.deleted_at is not null or e.status<>'active' or e.auth_user_id is null or e.access_status<>'ACTIVE' then raise exception 'Ein aktiver persönlicher Mitarbeiterzugang ist erforderlich'; end if;
  if p_payload->>'operation_id' is not null then
   select * into r from private.personnel_evidence_requests where id=(p_payload->>'operation_id')::uuid;
   if found then
    if r.company_id<>p_company_id or r.employee_id<>e.id or r.created_by<>auth.uid() or r.title<>btrim(p_payload->>'title') then raise exception 'Anforderung bereits anders gespeichert. Bitte aktualisieren.'; end if;
    return jsonb_build_object('id',r.id,'saved',true);
   end if;
  end if;
  if (select count(*) from private.personnel_evidence_requests where employee_id=e.id and status not in ('approved','cancelled'))>=20 then raise exception 'Höchstens 20 offene Nachweisanforderungen je Mitarbeiter'; end if;
  qual_:=(p_payload->>'qualification_id')::uuid;
  if qual_ is not null and not exists(select 1 from public.employee_personnel_qualifications where id=qual_ and employee_id=e.id and company_id=p_company_id) then raise exception 'Nachweis gehört nicht zu diesem Mitarbeiter'; end if;
  select updated_at into qualification_stamp_ from public.employee_personnel_qualifications where id=qual_;
  insert into private.personnel_evidence_requests(id,company_id,employee_id,qualification_id,qualification_updated_at,title,instructions,due_on,created_by)
   values(coalesce((p_payload->>'operation_id')::uuid,gen_random_uuid()),p_company_id,e.id,qual_,qualification_stamp_,btrim(p_payload->>'title'),coalesce(p_payload->>'instructions',''),(p_payload->>'due_on')::date,auth.uid()) returning * into r;
  perform private.sf_put_notification(p_company_id,e.auth_user_id,e.id,'EVIDENCE_REQUESTED','Nachweis angefordert','Bitte öffne Meine Nachweise und reiche den angeforderten Nachweis ein.','employee-evidence','personnel_evidence',r.id,'{}');
 elsif p_action in ('reserve','submit','review','cancel','file') then
  select * into r from private.personnel_evidence_requests where id=(p_payload->>'request_id')::uuid and company_id=p_company_id for update;
  if not found or (not manager_ and r.employee_id<>employee_) then raise exception 'Anforderung nicht verfügbar' using errcode='42501'; end if;
  select * into e from public.employees where id=r.employee_id and company_id=p_company_id;
  if p_action='file' then
   select * into s from private.personnel_evidence_submissions where id=(p_payload->>'submission_id')::uuid and request_id=r.id;
   if not found then raise exception 'Datei nicht verfügbar'; end if;
   return jsonb_build_object('path',s.storage_path,'file_name',s.file_name);
  end if;
  revision_:=(p_payload->>'revision')::integer;
  if revision_ is null or revision_<>r.revision then raise exception 'Die Anforderung wurde inzwischen geändert. Bitte aktualisieren.' using errcode='40001'; end if;
  if p_action='reserve' and not manager_ then
   if r.status not in ('requested','changes_requested') then raise exception 'Diese Anforderung kann nicht eingereicht werden'; end if;
   select * into s from private.personnel_evidence_submissions where request_id=r.id and status='uploading';
   if found then
    if s.file_name<>p_payload->>'file_name' or s.file_size<>(p_payload->>'file_size')::bigint or s.mime_type<>p_payload->>'mime_type' then
     if exists(select 1 from storage.objects where bucket_id='personnel-documents' and name=s.storage_path) then raise exception 'Eine Datei ist bereits hochgeladen. Bitte die vorbereitete Datei einreichen.'; end if;
     update private.personnel_evidence_submissions set file_name=p_payload->>'file_name',file_size=(p_payload->>'file_size')::bigint,mime_type=p_payload->>'mime_type' where id=s.id returning * into s;
    end if;
   else
    if (select count(*) from private.personnel_evidence_submissions where request_id=r.id)>=10 then raise exception 'Höchstens zehn Dateiversionen. Bitte die Personalverwaltung kontaktieren.'; end if;
    path_:=p_company_id::text||'/'||r.employee_id::text||'/evidence/'||gen_random_uuid()::text;
    insert into private.personnel_evidence_submissions(request_id,company_id,employee_id,storage_path,file_name,mime_type,file_size)
     values(r.id,p_company_id,r.employee_id,path_,p_payload->>'file_name',p_payload->>'mime_type',(p_payload->>'file_size')::bigint) returning * into s;
   end if;
   return jsonb_build_object('id',s.id,'path',s.storage_path,'uploaded',exists(select 1 from storage.objects where bucket_id='personnel-documents' and name=s.storage_path));
  elsif p_action='submit' and not manager_ then
   if r.status='in_review' and exists(select 1 from private.personnel_evidence_submissions where id=(p_payload->>'submission_id')::uuid and request_id=r.id and status='submitted') then return jsonb_build_object('status',r.status); end if;
   select * into s from private.personnel_evidence_submissions where id=(p_payload->>'submission_id')::uuid and request_id=r.id and status='uploading' for update;
   if not found or r.status not in ('requested','changes_requested') then raise exception 'Keine vorbereitete Einreichung vorhanden'; end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='personnel-documents' and o.name=s.storage_path
    and (o.metadata->>'size')::bigint=s.file_size and o.metadata->>'mimetype'=s.mime_type) then raise exception 'Datei fehlt oder Dateiangaben stimmen nicht. Bitte Upload prüfen.'; end if;
   update private.personnel_evidence_submissions set status='submitted',submitted_at=now() where id=s.id;
   update private.personnel_evidence_requests set status='in_review',revision=revision+1,updated_at=now() where id=r.id;
   for row_ in select user_id from public.company_members where company_id=p_company_id and status='ACTIVE' and role in ('OWNER','ADMIN') loop
    perform private.sf_put_notification(p_company_id,row_.user_id,null,'EVIDENCE_SUBMITTED','Nachweis zur Prüfung','Eine Einreichung wartet im Bereich Nachweise auf Prüfung.','employees','personnel_evidence',r.id,'{}');
   end loop;
  elsif p_action='review' and manager_ then
   if r.status<>'in_review' or e.deleted_at is not null then raise exception 'Diese Einreichung kann nicht geprüft werden'; end if;
   select * into s from private.personnel_evidence_submissions where id=(p_payload->>'submission_id')::uuid and request_id=r.id and status='submitted' for update;
   if not found or length(note_) not between 5 and 2000 then raise exception 'Bitte Einreichung wählen und Rückmeldung mit 5–2000 Zeichen eintragen'; end if;
   if p_payload->>'decision'='changes_requested' then
    update private.personnel_evidence_submissions set status='changes_requested',review_note=note_,reviewed_at=now(),reviewed_by=auth.uid() where id=s.id;
    update private.personnel_evidence_requests set status='changes_requested',revision=revision+1,updated_at=now() where id=r.id;
   elsif p_payload->>'decision'='approved' then
    if not coalesce((p_payload->>'confirmed')::boolean,false) then raise exception 'Prüfung der Datei bitte ausdrücklich bestätigen'; end if;
    if not exists(select 1 from storage.objects where bucket_id='personnel-documents' and name=s.storage_path) then raise exception 'Die eingereichte Datei fehlt'; end if;
    title_:=btrim(p_payload->>'title'); issued_:=(p_payload->>'issued_on')::date; expires_:=(p_payload->>'expires_on')::date;
    if title_ is null or length(title_) not between 2 and 180 or (issued_ is not null and expires_<issued_) then raise exception 'Bitte Titel und Gültigkeitsdaten prüfen'; end if;
    insert into public.employee_personnel_documents(company_id,employee_id,category,title,file_name,storage_path,mime_type,file_size,document_date,expires_on,note,uploaded_by)
     values(p_company_id,r.employee_id,'Qualifikation',title_,s.file_name,s.storage_path,s.mime_type,s.file_size,issued_,expires_,'Geprüfte Einreichung',auth.uid()) returning id into doc_;
    if coalesce((p_payload->>'save_qualification')::boolean,false) then
     if r.qualification_id is not null then
      update public.employee_personnel_qualifications set title=title_,issuer=left(coalesce(p_payload->>'issuer',''),180),issued_on=issued_,expires_on=expires_,updated_by=auth.uid(),updated_at=now(),conversation_visible=false
       where id=r.qualification_id and employee_id=r.employee_id and company_id=p_company_id and updated_at is not distinct from r.qualification_updated_at;
      if not found then raise exception 'Zugehörige Qualifikation wurde geändert. Bitte neu anfordern.'; end if;
     else
      insert into public.employee_personnel_qualifications(company_id,employee_id,title,issuer,issued_on,expires_on,created_by,updated_by)
       values(p_company_id,r.employee_id,title_,left(coalesce(p_payload->>'issuer',''),180),issued_,expires_,auth.uid(),auth.uid());
     end if;
    end if;
    update private.personnel_evidence_submissions set status='approved',review_note=note_,reviewed_at=now(),reviewed_by=auth.uid(),document_id=doc_ where id=s.id;
    update private.personnel_evidence_requests set status='approved',revision=revision+1,updated_at=now() where id=r.id;
   else raise exception 'Ungültige Prüfentscheidung'; end if;
   perform private.sf_put_notification(p_company_id,e.auth_user_id,e.id,'EVIDENCE_REVIEWED','Rückmeldung zu deinem Nachweis','Die Personalverwaltung hat deine Einreichung geprüft. Öffne Meine Nachweise für die Rückmeldung.','employee-evidence','personnel_evidence',r.id,'{}');
  elsif p_action='cancel' and manager_ then
   if r.status in ('approved','cancelled') or length(note_) not between 5 and 2000 then raise exception 'Offene Anforderung und Begründung mit 5–2000 Zeichen erforderlich'; end if;
   update private.personnel_evidence_requests set status='cancelled',closed_note=note_,revision=revision+1,updated_at=now() where id=r.id;
   perform private.sf_put_notification(p_company_id,e.auth_user_id,e.id,'EVIDENCE_CANCELLED','Nachweisanforderung zurückgezogen','Eine Anforderung wurde zurückgezogen. Die Rückmeldung findest du unter Meine Nachweise.','employee-evidence','personnel_evidence',r.id,'{}');
  else raise exception 'Aktion nicht berechtigt' using errcode='42501'; end if;
 else raise exception 'Unbekannte Nachweisaktion' using errcode='22023'; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  values(p_company_id,'EVIDENCE_'||upper(p_action),'personnel_evidence',r.id,auth.uid(),coalesce(role_,'EMPLOYEE'),jsonb_build_object('employeeId',r.employee_id));
 return jsonb_build_object('id',r.id,'saved',true);
end;
$$;
revoke all on function private.personnel_evidence_impl(uuid,text,text,jsonb) from public,anon;
grant execute on function private.personnel_evidence_impl(uuid,text,text,jsonb) to authenticated;
create function public.personnel_evidence(p_company_id uuid,p_mode text,p_action text,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.personnel_evidence_impl(p_company_id,p_mode,p_action,p_payload)$$;
revoke all on function public.personnel_evidence(uuid,text,text,jsonb) from public,anon;
grant execute on function public.personnel_evidence(uuid,text,text,jsonb) to authenticated;
commit;
