create function private.sf_import_audit_archive_part(company_ uuid,args_ jsonb,apply_ boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rows_ jsonb;row_ jsonb;existing_ jsonb;manifest_ jsonb:=args_->'manifest';part_ integer:=(args_->'part'->>'part')::integer;
 count_ integer:=0;duplicates_ integer:=0;conflicts_ integer:=0;missing_ integer:=0;inserted_ integer:=0;
begin
 rows_:=private.sf_verified_audit_archive_rows(company_,args_);
  perform pg_advisory_xact_lock(hashtextextended('audit-archive:'||company_::text,0));
  for row_ in select value from jsonb_array_elements(rows_) loop
   if row_->>'company_id' is distinct from company_::text then raise exception 'Unternehmen stimmt nicht überein'; end if;
   select to_jsonb(a) into existing_ from public.audit_events a where id=(row_->>'id')::uuid;
   count_:=count_+1;
   if existing_ is not null then
    if existing_=row_ then duplicates_:=duplicates_+1; else conflicts_:=conflicts_+1; end if;
   elsif row_->>'actor_id' is not null and not exists(select 1 from auth.users where id=(row_->>'actor_id')::uuid) then
    missing_:=missing_+1;
   end if;
  end loop;
  if apply_ then
   if conflicts_>0 or missing_>0 then raise exception 'Import abgebrochen: widersprüchliche Audit-IDs oder nicht mehr vorhandene Benutzer. Vorhandene Einträge bleiben unverändert.'; end if;
   insert into private.audit_archive_restore_context(transaction_id,backend_pid,event_id,original)
    select pg_current_xact_id(),pg_backend_pid(),(value->>'id')::uuid,value from jsonb_array_elements(rows_);
   insert into public.audit_events select r.* from jsonb_populate_recordset(null::public.audit_events,rows_) r where true
    on conflict(id) do nothing;
   get diagnostics inserted_=row_count;
   delete from private.audit_archive_restore_context where transaction_id=pg_current_xact_id() and backend_pid=pg_backend_pid();
   if inserted_>0 then
    insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
    values(company_,'AUDIT_ARCHIVE_IMPORTED','audit_archive',(manifest_->>'archive_id')::uuid,auth.uid(),(select role from public.company_members where company_id=company_ and user_id=auth.uid()),jsonb_build_object('part',part_,'inserted',inserted_,'duplicates',duplicates_));
   end if;
  end if;
  return jsonb_build_object('rows',count_,'new',count_-duplicates_-conflicts_-missing_,'duplicates',duplicates_,'conflicts',conflicts_,'missing_actors',missing_,'inserted',inserted_);
end $$;
revoke all on function private.sf_import_audit_archive_part(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
