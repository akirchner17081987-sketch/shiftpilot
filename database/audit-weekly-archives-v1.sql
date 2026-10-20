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

create function private.sf_build_audit_archive(company_ uuid,from_ timestamptz,to_ timestamptz,kind_ text)
returns uuid language plpgsql security definer set search_path='' as $$
declare id_ uuid; generation_ uuid; key_ bytea; rows_ jsonb; parts_ jsonb:='[]'; manifest_ jsonb;
 cursor_at_ timestamptz; cursor_id_ uuid; part_ integer:=0; count_ bigint:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('audit-archive:'||company_::text,0));
 if kind_='WEEKLY' then
  select id into id_ from private.audit_archives where company_id=company_ and kind='WEEKLY' and period_from=from_ and period_to=to_;
  if id_ is not null then return id_; end if;
 end if;
 insert into private.audit_archive_epochs(company_id) values(company_) on conflict do nothing;
 select generation into generation_ from private.audit_archive_epochs where company_id=company_ for share;
 select secret into key_ from private.audit_archive_keys where id;
 insert into private.audit_archives(company_id,kind,period_from,period_to) values(company_,kind_,from_,to_) returning id into id_;
 loop
  select jsonb_agg(to_jsonb(q) order by q.created_at,q.id) into rows_ from (
   select a.* from public.audit_events a where a.company_id=company_ and a.created_at<to_
   and (from_ is null or a.created_at>=from_)
   and (cursor_at_ is null or (a.created_at,a.id)>(cursor_at_,cursor_id_))
   order by a.created_at,a.id limit 250
  ) q;
  exit when rows_ is null;
  insert into private.audit_archive_parts(company_id,archive_id,part,rows) values(company_,id_,part_,rows_);
  parts_:=parts_||jsonb_build_array(jsonb_build_object('part',part_,'count',jsonb_array_length(rows_),
    'sha256',encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex')));
  count_:=count_+jsonb_array_length(rows_);part_:=part_+1;
  cursor_at_:=(rows_->-1->>'created_at')::timestamptz;cursor_id_:=(rows_->-1->>'id')::uuid;
 end loop;
 manifest_:=jsonb_build_object('format','schichtfunk.audit.v1','archive_id',id_,'company_id',company_,
  'company_name',(select name from public.companies where id=company_),'kind',kind_,
  'period_from',from_,'period_to',to_,'created_at',now(),'generation',generation_,'row_count',count_,'parts',parts_);
 update private.audit_archives set manifest=manifest_,signature=encode(extensions.hmac(convert_to(manifest_::text,'UTF8'),key_,'sha256'),'hex') where id=id_;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 values(company_,'AUDIT_ARCHIVE_CREATED','audit_archive',id_,auth.uid(),coalesce((select role from public.company_members where company_id=company_ and user_id=auth.uid()),'SYSTEM'),
  jsonb_build_object('kind',kind_,'row_count',count_,'period_from',from_,'period_to',to_));
 return id_;
end $$;
revoke all on function private.sf_build_audit_archive(uuid,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;

create function private.sf_verified_audit_archive_rows(company_ uuid,args_ jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare manifest_ jsonb;signature_ text;part_ integer;rows_ jsonb;key_ bytea;generation_ uuid;descriptor_ jsonb;
begin
  manifest_:=args_->'manifest';signature_:=args_->>'signature';part_:=(args_->'part'->>'part')::integer;rows_:=(args_->'part'->>'data')::jsonb;
  select secret into key_ from private.audit_archive_keys where id;
  if manifest_->>'format' is distinct from 'schichtfunk.audit.v1' or manifest_->>'company_id' is distinct from company_::text
   or signature_ is distinct from encode(extensions.hmac(convert_to(manifest_::text,'UTF8'),key_,'sha256'),'hex') then
   raise exception 'Die Sicherung gehört nicht zu diesem Unternehmen oder wurde verändert.';
  end if;
  select generation into generation_ from private.audit_archive_epochs where company_id=company_ for share;
  if generation_ is distinct from (manifest_->>'generation')::uuid then raise exception 'Nach dieser Sicherung wurden Personaldaten gelöscht oder anonymisiert. Der Wiederimport ist zum Schutz der Löschung gesperrt.'; end if;
  descriptor_:=manifest_->'parts'->part_;
  if part_ is null or part_<0 or descriptor_ is null or jsonb_typeof(rows_) is distinct from 'array'
   or jsonb_array_length(rows_)>250 or octet_length(rows_::text)>10000000
   or jsonb_array_length(rows_) is distinct from (descriptor_->>'count')::integer
   or encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex') is distinct from descriptor_->>'sha256' then
   raise exception 'Die Sicherungsdatei ist unvollständig oder beschädigt.';
  end if;
 return rows_;
end $$;
revoke all on function private.sf_verified_audit_archive_rows(uuid,jsonb) from public,anon,authenticated,service_role;

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

create function private.sf_audit_archive_api(action_ text,company_ uuid,args_ jsonb default '{}')
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
    (a.manifest->>'row_count')::bigint row_count,(a.manifest->>'generation')::uuid=e.generation restorable
   from private.audit_archives a join private.audit_archive_epochs e on e.company_id=a.company_id
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
  if action_='open' then return jsonb_build_object('manifest',archive_.manifest,'signature',archive_.signature); end if;
  -- Erasure processing can scrub stored payloads. Never export a stale or altered signature as valid.
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
create function public.manager_audit_archive(p_action text,p_company_id uuid,p_args jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.sf_audit_archive_api(p_action,p_company_id,p_args)
$$;
revoke all on function public.manager_audit_archive(text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.manager_audit_archive(text,uuid,jsonb) to authenticated;

create function private.sf_weekly_audit_archives(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare company_ record; to_ timestamptz; from_ timestamptz; count_ integer:=0;
begin
 -- Two UTC candidates cover DST, but only the Berlin 03:00 candidate performs work.
 if extract(isodow from p_now at time zone 'Europe/Berlin')<>1 or extract(hour from p_now at time zone 'Europe/Berlin')<>3 then return 0; end if;
 to_:=date_trunc('week',p_now at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
 from_:=(date_trunc('week',p_now at time zone 'Europe/Berlin')-interval '7 days') at time zone 'Europe/Berlin';
 for company_ in select id from public.companies loop
  perform private.sf_build_audit_archive(company_.id,from_,to_,'WEEKLY');count_:=count_+1;
 end loop;
 return count_;
end $$;
revoke all on function private.sf_weekly_audit_archives(timestamptz) from public,anon,authenticated,service_role;
select cron.schedule('schichtfunk-weekly-audit-archives','0 1,2 * * 1','select private.sf_weekly_audit_archives();');
notify pgrst,'reload schema';
