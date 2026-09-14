-- Schedule the authenticated privacy worker every 15 minutes.
-- Secrets are created separately in Supabase Vault before this migration is applied.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='privacy_worker_url')
    or not exists(select 1 from vault.decrypted_secrets where name='privacy_worker_token') then
    raise exception 'privacy_worker_url and privacy_worker_token must exist in Vault';
  end if;
  for v_job_id in
    select j.jobid from cron.job j where j.jobname='schichtfunk-privacy-lifecycle-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'schichtfunk-privacy-lifecycle-worker',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='privacy_worker_url'),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-privacy-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='privacy_worker_token')
      ),
      body := jsonb_build_object('batchSize',5,'scheduledAt',now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
