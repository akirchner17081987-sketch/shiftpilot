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
