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
