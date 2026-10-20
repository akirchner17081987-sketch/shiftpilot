-- Private object storage; application roles cannot read or overwrite archive objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('audit-archives','audit-archives',false,15000000,array['application/json'])
on conflict(id) do nothing;
create policy audit_archive_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'audit-archives') with check(bucket_id<>'audit-archives');
-- Deliberately no foreign key: a deletion tombstone must survive company/archive cascades.
create table private.audit_archive_transfers(
 archive_id uuid primary key,company_id uuid not null,generation uuid not null,part_count integer not null check(part_count>=0),
 state text not null default 'PENDING' check(state in('PENDING','READY','DELETE','DELETED','ERROR')),
 token uuid not null default gen_random_uuid(),lease uuid,lease_until timestamptz,dispatched_at timestamptz,
 attempts integer not null default 0,last_error text,verified_at timestamptz,stored_bytes bigint not null default 0,
 manifest_sha256 text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table private.audit_archive_transfers enable row level security;
revoke all on private.audit_archive_transfers from public,anon,authenticated,service_role;
create index on private.audit_archive_transfers(state,dispatched_at) where state in('PENDING','DELETE');
create function private.sf_dispatch_audit_archive_transfers() returns integer
language plpgsql security definer set search_path='' as $$
declare r_ record; count_ integer:=0;
begin
 for r_ in select * from private.audit_archive_transfers
 where state in('PENDING','DELETE') and attempts<10
 and (lease_until is null or lease_until<now())
 and (dispatched_at is null or dispatched_at<now()-interval '2 minutes')
 order by created_at limit 8 for update skip locked loop
  perform net.http_post(
   url:='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/audit-archive-storage',
   headers:=jsonb_build_object('Content-Type','application/json','x-audit-archive-token',r_.token::text),
   body:=jsonb_build_object('archive_id',r_.archive_id),timeout_milliseconds:=120000);
  update private.audit_archive_transfers set dispatched_at=now(),attempts=attempts+1,updated_at=now() where archive_id=r_.archive_id;
  count_:=count_+1;
 end loop;
 return count_;
end $$;
revoke all on function private.sf_dispatch_audit_archive_transfers() from public,anon,authenticated,service_role;

-- Enqueue finalized snapshots once; retries and downloads never create another snapshot.
create function private.sf_queue_audit_archive_storage() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update private.audit_archive_transfers set state='DELETE',attempts=0,dispatched_at=null,updated_at=now()
   where archive_id=old.id and state<>'DELETED';
 else
  if new.signature<>'' and new.manifest->>'format'='schichtfunk.audit.v1' then
   insert into private.audit_archive_transfers(archive_id,company_id,generation,part_count)
   values(new.id,new.company_id,(new.manifest->>'generation')::uuid,jsonb_array_length(new.manifest->'parts'))
   on conflict do nothing;
  end if;
 end if;
 perform private.sf_dispatch_audit_archive_transfers();
 return null;
end $$;
revoke all on function private.sf_queue_audit_archive_storage() from public,anon,authenticated,service_role;
create trigger sf_audit_archive_storage_queue after insert or update of signature,manifest or delete on private.audit_archives
for each row execute function private.sf_queue_audit_archive_storage();
create function private.sf_invalidate_audit_archive_storage() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.audit_archive_transfers set state='DELETE',attempts=0,dispatched_at=null,updated_at=now()
 where company_id=new.company_id and generation<>new.generation and state not in('DELETE','DELETED');
 perform private.sf_dispatch_audit_archive_transfers();
 return null;
end $$;
revoke all on function private.sf_invalidate_audit_archive_storage() from public,anon,authenticated,service_role;
create trigger sf_audit_archive_storage_privacy after insert or update of generation on private.audit_archive_epochs
for each row execute function private.sf_invalidate_audit_archive_storage();

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

create or replace function private.sf_audit_archive_api(action_ text,company_ uuid,args_ jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare archive_ private.audit_archives%rowtype; archive_id_ uuid; manifest_ jsonb; signature_ text; key_ bytea;
 descriptor_ jsonb; part_ integer; rows_ jsonb; row_ jsonb; existing_ jsonb; count_ integer:=0;
 duplicates_ integer:=0; conflicts_ integer:=0; missing_ integer:=0; inserted_ integer:=0; generation_ uuid; result_ jsonb;
begin
 if auth.uid() is null or not private.can_manage_company_users(company_) then
  raise exception 'Audit-Archive sind nur für Inhaber und Administratoren mit MFA verfügbar.' using errcode='42501';
 end if;
 if action_='list' then
  return jsonb_build_object('archives',coalesce((select jsonb_agg(to_jsonb(q)) from (
   select a.id,a.kind,a.created_at,a.manifest->>'period_from' period_from,a.manifest->>'period_to' period_to,
    (a.manifest->>'row_count')::bigint row_count,(a.manifest->>'generation')::uuid=e.generation restorable,
    coalesce(t.state,'PENDING') storage_status,t.verified_at,t.stored_bytes
   from private.audit_archives a join private.audit_archive_epochs e on e.company_id=a.company_id
   left join private.audit_archive_transfers t on t.archive_id=a.id
   where a.company_id=company_ order by a.created_at desc,a.id desc limit 100
  ) q),'[]'::jsonb),'schedule','Montags 03:00 Uhr · Europe/Berlin · abgeschlossene Vorwoche');
 elsif action_='create' then
  if (args_->>'from')::timestamptz is not null and (args_->>'from')::timestamptz>=coalesce((args_->>'to')::timestamptz,statement_timestamp()) then raise exception 'Ungültiger Zeitraum'; end if;
  -- Manual exports only select time ranges; search/category filters do not silently exclude evidence.
  archive_id_:=private.sf_build_audit_archive(company_,(args_->>'from')::timestamptz,least(coalesce((args_->>'to')::timestamptz,statement_timestamp()),statement_timestamp()),'MANUAL');
  select * into archive_ from private.audit_archives where id=archive_id_;
  return jsonb_build_object('manifest',archive_.manifest,'signature',archive_.signature);
 elsif action_ in('open','part') then
  select * into archive_ from private.audit_archives where id=(args_->>'archive_id')::uuid and company_id=company_;
  if not found then raise exception 'Archiv nicht verfügbar'; end if;
  if not exists(select 1 from private.audit_archive_epochs e where e.company_id=company_ and e.generation=(archive_.manifest->>'generation')::uuid) then raise exception 'Archiv nach Datenschutzbereinigung gesperrt'; end if;
  if action_='open' then return jsonb_build_object('manifest',archive_.manifest,'signature',archive_.signature); end if;
  -- Erasure processing can scrub stored payloads. Never export a stale or altered signature as valid.
  if exists(select 1 from private.audit_archive_transfers t where t.archive_id=archive_.id and t.state='READY') then
   if coalesce((args_->>'storage_v')::integer,0)<>1 then raise exception 'Bitte SchichtFunk neu laden, um das ausgelagerte Archiv herunterzuladen.'; end if;
   part_:=(args_->>'part')::integer;
   if part_ is null or part_<0 or archive_.manifest->'parts'->part_ is null then raise exception 'Ungültiges Archivpaket'; end if;
   return jsonb_build_object('part',part_,'storage',true,'archive_id',archive_.id);
  end if;
  select rows into rows_ from private.audit_archive_parts where archive_id=archive_.id and part=(args_->>'part')::integer;
  descriptor_:=archive_.manifest->'parts'->(args_->>'part')::integer;
  if rows_ is null or encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex') is distinct from descriptor_->>'sha256' then raise exception 'Archiv wurde durch eine Datenschutzbereinigung ungültig. Bitte eine neue Sicherung erstellen.'; end if;
  return jsonb_build_object('part',(args_->>'part')::integer,'data',rows_::text);
 elsif action_ in('preview','import') then
  return private.sf_import_audit_archive_part(company_,args_,action_='import');
 end if;
 raise exception 'Unbekannte Archivaktion';
end $$;
revoke all on function private.sf_audit_archive_api(text,uuid,jsonb) from public,anon,service_role;
grant execute on function private.sf_audit_archive_api(text,uuid,jsonb) to authenticated;

-- Reuse the push retry timer for pending transfer retries and privacy tombstones.
-- The weekly snapshot timer and its DST protection remain unchanged.
select cron.schedule('schichtfunk-push-retry','* * * * *',
 'select private.sf_retry_push_dispatches(); select private.sf_dispatch_audit_archive_transfers();');
-- Move existing snapshots using the same object names; do not build duplicate snapshots.
insert into private.audit_archive_transfers(archive_id,company_id,generation,part_count)
select id,company_id,(manifest->>'generation')::uuid,jsonb_array_length(manifest->'parts')
from private.audit_archives where signature<>'' on conflict do nothing;
select private.sf_dispatch_audit_archive_transfers();
notify pgrst,'reload schema';
