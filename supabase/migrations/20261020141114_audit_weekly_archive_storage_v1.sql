-- Weekly audit snapshots live outside the interactive audit relation. No source rows are deleted.
create table private.audit_archive_keys (
 id boolean primary key default true check(id), secret bytea not null
);
insert into private.audit_archive_keys values(true,extensions.gen_random_bytes(32));
create table private.audit_archive_epochs (
 company_id uuid primary key references public.companies(id) on delete cascade,
 generation uuid not null default gen_random_uuid()
);
create table private.audit_archives (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 kind text not null check(kind in('MANUAL','WEEKLY')), period_from timestamptz, period_to timestamptz not null,
 created_at timestamptz not null default now(), manifest jsonb not null default '{}', signature text not null default ''
);
create index on private.audit_archives(company_id,created_at desc,id);
create unique index on private.audit_archives(company_id,period_from,period_to) where kind='WEEKLY';
create table private.audit_archive_parts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 archive_id uuid not null references private.audit_archives(id) on delete cascade,
 part integer not null, rows jsonb not null, unique(archive_id,part)
);
create table private.audit_archive_restore_context (
 transaction_id xid8 not null, backend_pid integer not null, event_id uuid not null, original jsonb not null,
 primary key(transaction_id,backend_pid,event_id)
);
alter table private.audit_archive_keys enable row level security;
alter table private.audit_archive_epochs enable row level security;
alter table private.audit_archives enable row level security;
alter table private.audit_archive_parts enable row level security;
alter table private.audit_archive_restore_context enable row level security;
revoke all on private.audit_archive_keys,private.audit_archive_epochs,private.audit_archives,private.audit_archive_parts,private.audit_archive_restore_context from public,anon,authenticated,service_role;

-- A local copy predating a personnel erasure or audit redaction must never resurrect that data.
create function private.sf_audit_archive_privacy_epoch() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.audit_archive_epochs(company_id) values(old.company_id)
 on conflict(company_id) do update set generation=gen_random_uuid();
 return old;
end $$;
revoke all on function private.sf_audit_archive_privacy_epoch() from public,anon,authenticated,service_role;
create trigger sf_audit_archive_employee_erasure after delete on public.employees
 for each row execute function private.sf_audit_archive_privacy_epoch();
create trigger sf_audit_archive_redaction after update on public.audit_events
 for each row execute function private.sf_audit_archive_privacy_epoch();

-- The existing enrichment trigger runs first. Only a verified import can install this context.
create function private.sf_audit_archive_original() returns trigger
language plpgsql security definer set search_path='' as $$
declare original_ jsonb;
begin
 select c.original into original_ from private.audit_archive_restore_context c
 where c.transaction_id=pg_current_xact_id() and c.backend_pid=pg_backend_pid() and c.event_id=new.id;
 if original_ is not null then new:=jsonb_populate_record(null::public.audit_events,original_); end if;
 return new;
end $$;
revoke all on function private.sf_audit_archive_original() from public,anon,authenticated,service_role;
create trigger sf_audit_restore_original before insert on public.audit_events
 for each row execute function private.sf_audit_archive_original();
