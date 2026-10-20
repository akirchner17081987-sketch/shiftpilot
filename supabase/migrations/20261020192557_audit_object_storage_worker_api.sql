create function private.sf_audit_archive_storage_worker(action_ text,id_ uuid,token_ uuid,args_ jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare t_ private.audit_archive_transfers%rowtype; a_ private.audit_archives%rowtype;
 prefix_ text; head_ text; rows_ jsonb; part_ integer; descriptor_ jsonb; bytes_ bigint:=0; object_size_ bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Serverzugriff erforderlich' using errcode='42501'; end if;
 select * into t_ from private.audit_archive_transfers where archive_id=id_ for update;
 if not found or t_.token is distinct from token_ then raise exception 'Ungültiger Sicherungsauftrag' using errcode='42501'; end if;
 prefix_:=t_.company_id::text||'/'||id_::text||'/';
 select * into a_ from private.audit_archives where id=id_;
 if action_='claim' then
  if t_.state not in('PENDING','DELETE') or t_.lease_until>now() then return null; end if;
  if t_.state='PENDING' and (a_.id is null or not exists(select 1 from private.audit_archive_epochs where company_id=t_.company_id and generation=t_.generation)) then
   update private.audit_archive_transfers set state='DELETE' where archive_id=id_;t_.state:='DELETE';
  end if;
  t_.lease:=gen_random_uuid();
  update private.audit_archive_transfers set lease=t_.lease,lease_until=now()+interval '5 minutes',updated_at=now() where archive_id=id_;
  return jsonb_build_object('archive_id',id_,'company_id',t_.company_id,'state',t_.state,'lease',t_.lease,
   'prefix',prefix_,'part_count',t_.part_count,'manifest',a_.manifest,'signature',a_.signature,
   'head',jsonb_build_object('manifest',a_.manifest,'signature',a_.signature)::text);
 end if;
 if t_.lease is null or t_.lease_until is null or t_.lease is distinct from (args_->>'lease')::uuid or t_.lease_until<now() then raise exception 'Sicherungsauftrag abgelaufen'; end if;
 if action_='fail' then
  update private.audit_archive_transfers set last_error=left(args_->>'error',1000),lease=null,lease_until=null,
   state=case when attempts>=10 and state='PENDING' then 'ERROR' else state end,updated_at=now() where archive_id=id_;
  return jsonb_build_object('ok',true);
 elsif action_='purged' and t_.state='DELETE' then
  if exists(select 1 from storage.objects where bucket_id='audit-archives' and name like prefix_||'%') then raise exception 'Dateilöschung nicht bestätigt'; end if;
  update private.audit_archive_transfers set state='DELETED',stored_bytes=0,lease=null,lease_until=null,last_error=null,updated_at=now() where archive_id=id_;
  return jsonb_build_object('ok',true);
 end if;
 if t_.state<>'PENDING' or a_.id is null then raise exception 'Sicherung nicht zur Auslagerung freigegeben'; end if;
 perform 1 from private.audit_archive_epochs where company_id=t_.company_id and generation=t_.generation for share;
 if not found then raise exception 'Datenschutzbereinigung hat diese Sicherung gesperrt'; end if;
 if action_='part' then
  part_:=(args_->>'part')::integer;
  select rows into rows_ from private.audit_archive_parts where archive_id=id_ and part=part_;
  descriptor_:=a_.manifest->'parts'->part_;
  if rows_ is null or descriptor_ is null or part_<0
   or encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex') is distinct from descriptor_->>'sha256'
   or octet_length(rows_::text)>10000000 then raise exception 'Archivpaket beschädigt oder zu groß'; end if;
  return jsonb_build_object('part',part_,'data',rows_::text);
 elsif action_='complete' then
  head_:=jsonb_build_object('manifest',a_.manifest,'signature',a_.signature)::text;
  if args_->>'head_sha256' is distinct from encode(extensions.digest(convert_to(head_,'UTF8'),'sha256'),'hex') then raise exception 'Archivkopf nicht bestätigt'; end if;
  select (metadata->>'size')::bigint into object_size_ from storage.objects where bucket_id='audit-archives' and name=prefix_||'manifest.json';
  if object_size_ is distinct from octet_length(head_)::bigint then raise exception 'Archivkopf fehlt im Dateispeicher'; end if;
  bytes_:=object_size_;
  if jsonb_array_length(args_->'parts') is distinct from t_.part_count then raise exception 'Archivpakete unvollständig'; end if;
  for part_ in 0..t_.part_count-1 loop
   select rows into rows_ from private.audit_archive_parts where archive_id=id_ and part=part_;
   descriptor_:=a_.manifest->'parts'->part_;
   if rows_ is null or args_->'parts'->part_->>'sha256' is distinct from descriptor_->>'sha256'
    or encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex') is distinct from descriptor_->>'sha256' then raise exception 'Archivpaket nicht bestätigt'; end if;
   select (metadata->>'size')::bigint into object_size_ from storage.objects where bucket_id='audit-archives' and name=prefix_||'part-'||part_||'.json';
   if object_size_ is distinct from octet_length(rows_::text)::bigint then raise exception 'Archivpaket fehlt im Dateispeicher'; end if;
   bytes_:=bytes_+object_size_;
  end loop;
  update private.audit_archive_transfers set state='READY',verified_at=now(),stored_bytes=bytes_,manifest_sha256=args_->>'head_sha256',
   last_error=null,lease=null,lease_until=null,updated_at=now() where archive_id=id_;
  delete from private.audit_archive_parts where archive_id=id_;
  return jsonb_build_object('ok',true,'stored_bytes',bytes_,'verified_at',now());
 end if;
 raise exception 'Unbekannte Speicheraktion';
end $$;
revoke all on function private.sf_audit_archive_storage_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.sf_audit_archive_storage_worker(text,uuid,uuid,jsonb) to service_role;
create function public.server_audit_archive_storage(p_action text,p_archive_id uuid,p_token uuid,p_args jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.sf_audit_archive_storage_worker(p_action,p_archive_id,p_token,p_args)
$$;
revoke all on function public.server_audit_archive_storage(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.server_audit_archive_storage(text,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
