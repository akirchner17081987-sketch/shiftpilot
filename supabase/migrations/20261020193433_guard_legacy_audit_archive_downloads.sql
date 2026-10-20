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
