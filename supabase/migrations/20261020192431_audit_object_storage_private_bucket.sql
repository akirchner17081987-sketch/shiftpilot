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
