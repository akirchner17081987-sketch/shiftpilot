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
