-- Reuse the existing retention job. Preserve successful results until they are applied or discarded.
-- This narrows the old seven-day deletion rule; no data is deleted by this migration.
select cron.schedule(
  'schichtfunk-background-planning-retention',
  '35 3 * * *',
  $retention$
    delete from private.background_auto_plan_jobs
    where status in ('FAILED','CANCELLED','APPLIED')
      and greatest(created_at,completed_at,updated_at) < now()-interval '30 days';
  $retention$
);
