-- Disabled until an independent S3 target, Edge secrets, Vault token and monitor exist.
create table private.storage_backup_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false, allow_empty boolean not null default false,
 project_ref text check(project_ref ~ '^[a-z]{20}$'),
 bucket text not null default 'personnel-documents' check(bucket='personnel-documents')
);
insert into private.storage_backup_config(singleton) values(true);
create table private.storage_backup_runs (
 id uuid primary key default gen_random_uuid(),
 phase text not null check(phase in('COPY','VERIFY','PUBLISH','FINALIZE','COMPLETE','FAILED')),
 inventory jsonb not null, files jsonb not null default '[]', fingerprint text not null,
 project text not null, bucket text not null, captured_at timestamptz not null default now(),
 cursor integer not null default 0, verify_cursor integer not null default 0,
 attempts integer not null default 0, lease uuid, lease_until timestamptz, dispatched_at timestamptz,
 updated_at timestamptz not null default now(), completed_at timestamptz, last_error text
);
create unique index storage_backup_single_active on private.storage_backup_runs((true)) where phase not in('COMPLETE','FAILED');
create index storage_backup_recent on private.storage_backup_runs(captured_at desc);
alter table private.storage_backup_config enable row level security;
alter table private.storage_backup_config force row level security;
alter table private.storage_backup_runs enable row level security;
alter table private.storage_backup_runs force row level security;
revoke all on private.storage_backup_config,private.storage_backup_runs from public,anon,authenticated,service_role;

create function private.storage_backup_inventory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',name,'size',metadata->'size','id',id,'updated_at',updated_at,'version',version) order by name),'[]'::jsonb)
 from storage.objects where bucket_id='personnel-documents'
$$;
create function private.storage_backup_fingerprint(value_ jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(value_::text,'UTF8')),'hex')
$$;
create function private.storage_backup_start() returns uuid language plpgsql security definer set search_path='' as $$
declare c_ private.storage_backup_config; inv_ jsonb; id_ uuid; bytes_ bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('storage-backup',0));
 select * into c_ from private.storage_backup_config where singleton;
 if not c_.enabled or c_.project_ref is null then return null;end if;
 select id into id_ from private.storage_backup_runs where phase not in('COMPLETE','FAILED');
 if found then return id_;end if;
 inv_:=private.storage_backup_inventory();
 if jsonb_array_length(inv_)>2000 then raise exception 'BACKUP_FILE_LIMIT';end if;
 if exists(select 1 from jsonb_array_elements(inv_) f where jsonb_typeof(f->'size') is distinct from 'number' or (f->>'size') !~ '^[0-9]+$' or length(f->>'size')>8) then raise exception 'BACKUP_INVALID_SIZE';end if;
 if exists(select 1 from jsonb_array_elements(inv_) f where (f->>'size')::bigint>10485760) then raise exception 'BACKUP_OBJECT_LIMIT';end if;
 select coalesce(sum((f->>'size')::bigint),0) into bytes_ from jsonb_array_elements(inv_) f;
 if bytes_>1073741824 then raise exception 'BACKUP_TOTAL_LIMIT';end if;
 if jsonb_array_length(inv_)=0 and (not c_.allow_empty or exists(select 1 from private.storage_backup_runs where phase='COMPLETE' and jsonb_array_length(files)>0)) then raise exception 'BACKUP_UNEXPECTED_EMPTY';end if;
 insert into private.storage_backup_runs(phase,inventory,fingerprint,project,bucket)
 values(case when jsonb_array_length(inv_)=0 then 'PUBLISH' else 'COPY' end,inv_,private.storage_backup_fingerprint(inv_),c_.project_ref,c_.bucket) returning id into id_;
 return id_;
end $$;

create function private.storage_backup_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare j_ private.storage_backup_runs;
begin
 if not exists(select 1 from private.storage_backup_config where enabled) then return null;end if;
 select * into j_ from private.storage_backup_runs where phase not in('COMPLETE','FAILED') and (lease_until is null or lease_until<now()) for update skip locked limit 1;
 if not found then return null;end if;
 if j_.attempts>=3 or j_.captured_at<now()-interval '20 hours' then
  update private.storage_backup_runs set phase='FAILED',last_error='BACKUP_RETRY_LIMIT',completed_at=now(),lease=null,lease_until=null where id=j_.id;return null;
 end if;
 -- Catch additions, replacements and deletions, even if byte lengths stay equal.
 if j_.phase in('PUBLISH','FINALIZE') and private.storage_backup_fingerprint(private.storage_backup_inventory())<>j_.fingerprint then
  update private.storage_backup_runs set phase='FAILED',last_error='SOURCE_INVENTORY_CHANGED',completed_at=now(),lease=null,lease_until=null where id=j_.id;return null;
 end if;
 update private.storage_backup_runs set attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '180 seconds',updated_at=now() where id=j_.id returning * into j_;
 return jsonb_build_object('id',j_.id,'lease',j_.lease,'project',j_.project,'bucket',j_.bucket,'phase',j_.phase,'captured_at',j_.captured_at,
 'item',case when j_.phase='COPY' then j_.inventory->j_.cursor when j_.phase='VERIFY' then j_.files->j_.verify_cursor else null end,
 'files',case when j_.phase in('PUBLISH','FINALIZE') then j_.files else null end);
end $$;
create function private.storage_backup_commit(p_id uuid,p_lease uuid,p_result jsonb,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
declare j_ private.storage_backup_runs; expected_ jsonb; next_ text;
begin
 select * into j_ from private.storage_backup_runs where id=p_id for update;
 if not found or j_.phase in('COMPLETE','FAILED') or j_.lease is distinct from p_lease or p_lease is null or j_.lease_until<now() then raise exception 'STALE_BACKUP_LEASE';end if;
 if p_error is not null then
  update private.storage_backup_runs set phase=case when attempts>=3 then 'FAILED' else phase end,last_error=case when p_error ~ '^[A-Z0-9_]{1,64}$' then p_error else 'BACKUP_STEP_FAILED' end,
  completed_at=case when attempts>=3 then now() else null end,lease=null,lease_until=null,dispatched_at=now(),updated_at=now() where id=p_id;return false;
 end if;
 if j_.phase='COPY' then
  expected_:=j_.inventory->j_.cursor;
  if p_result->'path' is distinct from expected_->'path' or p_result->'size' is distinct from expected_->'size'
   or coalesce(p_result->>'sha','') !~ '^[a-f0-9]{64}$' or coalesce(p_result->>'cipherSha','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_result->>'blob','') !~ '^blobs/[a-f0-9]{16}/[a-f0-9]{64}$' then raise exception 'INVALID_BACKUP_RESULT';end if;
  update private.storage_backup_runs set files=files||jsonb_build_array(p_result),cursor=cursor+1,
   phase=case when cursor+1=jsonb_array_length(inventory) then 'VERIFY' else 'COPY' end where id=p_id;
 elsif j_.phase='VERIFY' then
  if p_result->'verified' is distinct from 'true'::jsonb then raise exception 'INVALID_BACKUP_RESULT';end if;
  update private.storage_backup_runs set verify_cursor=verify_cursor+1,phase=case when verify_cursor+1=jsonb_array_length(files) then 'PUBLISH' else 'VERIFY' end where id=p_id;
 elsif j_.phase='PUBLISH' then
  if coalesce(p_result->>'manifest','') !~ ('^snapshots/[a-f0-9]{16}/'||p_id::text||'\.bin$') then raise exception 'INVALID_BACKUP_RESULT';end if;
  update private.storage_backup_runs set phase='FINALIZE' where id=p_id;
 elsif j_.phase='FINALIZE' then
  if p_result->'verified' is distinct from 'true'::jsonb then raise exception 'INVALID_BACKUP_RESULT';end if;
  update private.storage_backup_runs set phase='COMPLETE',completed_at=now() where id=p_id;
 end if;
 update private.storage_backup_runs set attempts=0,lease=null,lease_until=null,dispatched_at=null,last_error=null,updated_at=now() where id=p_id;
 return true;
end $$;
create function public.storage_backup_worker_claim() returns jsonb language sql security invoker set search_path='' as $$select private.storage_backup_claim()$$;
create function public.storage_backup_worker_commit(p_id uuid,p_lease uuid,p_result jsonb default null,p_error text default null) returns boolean language sql security invoker set search_path='' as $$select private.storage_backup_commit(p_id,p_lease,p_result,p_error)$$;

create function private.storage_backup_dispatch() returns integer language plpgsql security definer set search_path='' as $$
declare c_ private.storage_backup_config; token_ text; j_ private.storage_backup_runs;
begin
 select * into c_ from private.storage_backup_config where singleton;
 if not c_.enabled or c_.project_ref is null then return 0;end if;
 update private.storage_backup_runs set phase='FAILED',last_error='BACKUP_TIME_LIMIT',completed_at=now(),lease=null,lease_until=null
 where phase not in('COMPLETE','FAILED') and captured_at<now()-interval '20 hours';
 select * into j_ from private.storage_backup_runs where phase not in('COMPLETE','FAILED') and (lease_until is null or lease_until<now()) and (dispatched_at is null or dispatched_at<now()-interval '90 seconds') for update skip locked limit 1;
 if not found then return 0;end if;
 select decrypted_secret into token_ from vault.decrypted_secrets where name='storage_backup_dispatch_token';
 if token_ is null or length(token_)<32 then return 0;end if;
 perform net.http_post(url:='https://'||c_.project_ref||'.supabase.co/functions/v1/storage-backup',headers:=jsonb_build_object('Content-Type','application/json','x-storage-backup-token',token_,'x-region','eu-central-1'),body:='{}'::jsonb,timeout_milliseconds:=60000);
 update private.storage_backup_runs set dispatched_at=now() where id=j_.id;return 1;
end $$;
create function private.storage_backup_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',c.enabled,'healthy',c.enabled and coalesce((select max(completed_at)>now()-interval '26 hours' from private.storage_backup_runs where phase='COMPLETE'),false)
 and coalesce((select phase<>'FAILED' from private.storage_backup_runs order by captured_at desc limit 1),false),
 'last_verified_at',(select max(completed_at) from private.storage_backup_runs where phase='COMPLETE'),
 'last_error',(select last_error from private.storage_backup_runs order by captured_at desc limit 1)) from private.storage_backup_config c where singleton
$$;
-- Every function is private to the operator unless explicitly granted below.
revoke all on function private.storage_backup_inventory(),private.storage_backup_fingerprint(jsonb),private.storage_backup_start(),private.storage_backup_claim(),private.storage_backup_commit(uuid,uuid,jsonb,text),private.storage_backup_dispatch(),private.storage_backup_health(),public.storage_backup_worker_claim(),public.storage_backup_worker_commit(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.storage_backup_claim(),private.storage_backup_commit(uuid,uuid,jsonb,text),public.storage_backup_worker_claim(),public.storage_backup_worker_commit(uuid,uuid,jsonb,text) to service_role;
-- Uses already installed pg_cron, pg_net and Vault; missing prerequisites fail installation.
select cron.schedule('schichtfunk-storage-backup-daily','40 2 * * *','select private.storage_backup_start()');
select cron.schedule('schichtfunk-storage-backup-dispatch','10 seconds','select private.storage_backup_dispatch()');
