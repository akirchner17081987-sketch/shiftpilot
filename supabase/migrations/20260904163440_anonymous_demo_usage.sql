-- Anonymous, aggregate-only usage metrics for the protected SchichtFunk demo.
-- No visitor, session, network, device, URL, input or free-text data is stored.

create schema if not exists demo_metrics_private;

create table if not exists demo_metrics_private.demo_usage_daily (
  usage_day date not null default (timezone('utc', now()))::date,
  event_name text not null,
  event_value text not null,
  event_count bigint not null default 0 check (event_count > 0),
  primary key (usage_day, event_name, event_value),
  constraint demo_usage_daily_allowed_event check (
    (event_name = 'session_started' and event_value = 'manager')
    or (event_name = 'area_opened' and event_value = any (array[
      'overview','schedule','auto','disruptions','marketplace','employees','absence','time','reports','settings',
      'employee_dashboard','employee_disruptions','employee_marketplace','employee_shifts','employee_changes',
      'employee_swaps','employee_time','employee_absences','employee_account','employee_wage','employee_profile'
    ]))
    or (event_name = 'tour' and event_value = any (array['started','completed','skipped']))
    or (event_name = 'perspective_changed' and event_value = any (array['manager','employee']))
    or (event_name = 'scenario_selected' and event_value = any (array['outage','understaffing','vacation','deviation','swap']))
    or (event_name = 'scenario_reset' and event_value = 'prepared_scenario')
    or (event_name = 'demo_reset' and event_value = 'presentation_state')
    or (event_name = 'session_finished' and event_value = any (array['manual','idle','maximum']))
  )
);

create table if not exists demo_metrics_private.demo_usage_ingest_secret (
  singleton boolean primary key default true check (singleton),
  secret_sha256 bytea not null check (octet_length(secret_sha256) = 32)
);

insert into demo_metrics_private.demo_usage_ingest_secret (singleton, secret_sha256)
values (true, decode('bfc878f619aea1de05ab6269ea5304fbac5efe352b2d6b0f5ca0ad3ce1640322', 'hex'))
on conflict (singleton) do update set secret_sha256 = excluded.secret_sha256;

alter table demo_metrics_private.demo_usage_daily enable row level security;
alter table demo_metrics_private.demo_usage_ingest_secret enable row level security;

revoke all on schema demo_metrics_private from public, anon, authenticated;
revoke all on table demo_metrics_private.demo_usage_daily from public, anon, authenticated;
revoke all on table demo_metrics_private.demo_usage_ingest_secret from public, anon, authenticated;

grant usage on schema demo_metrics_private to anon;
grant select, insert, update on table demo_metrics_private.demo_usage_daily to anon;
grant select on table demo_metrics_private.demo_usage_ingest_secret to anon;

drop policy if exists "demo metrics can read aggregate targets" on demo_metrics_private.demo_usage_daily;
create policy "demo metrics can read aggregate targets"
on demo_metrics_private.demo_usage_daily for select to anon
using (current_setting('app.demo_ingest_authorized', true) = 'true');

drop policy if exists "demo metrics can insert aggregate targets" on demo_metrics_private.demo_usage_daily;
create policy "demo metrics can insert aggregate targets"
on demo_metrics_private.demo_usage_daily for insert to anon
with check (current_setting('app.demo_ingest_authorized', true) = 'true');

drop policy if exists "demo metrics can increment aggregate targets" on demo_metrics_private.demo_usage_daily;
create policy "demo metrics can increment aggregate targets"
on demo_metrics_private.demo_usage_daily for update to anon
using (current_setting('app.demo_ingest_authorized', true) = 'true')
with check (current_setting('app.demo_ingest_authorized', true) = 'true');

drop policy if exists "demo metrics can verify ingestion secret" on demo_metrics_private.demo_usage_ingest_secret;
create policy "demo metrics can verify ingestion secret"
on demo_metrics_private.demo_usage_ingest_secret for select to anon using (true);

create or replace function public.record_demo_usage(
  p_event_name text,
  p_event_value text,
  p_ingest_secret text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ingest_secret is null
    or octet_length(p_ingest_secret) < 32
    or not exists (
      select 1
      from demo_metrics_private.demo_usage_ingest_secret
      where secret_sha256 = extensions.digest(convert_to(p_ingest_secret, 'UTF8'), 'sha256')
    )
  then
    raise insufficient_privilege using message = 'demo metrics ingestion rejected';
  end if;

  perform set_config('app.demo_ingest_authorized', 'true', true);

  insert into demo_metrics_private.demo_usage_daily (usage_day, event_name, event_value, event_count)
  values ((timezone('utc', now()))::date, p_event_name, p_event_value, 1)
  on conflict (usage_day, event_name, event_value)
  do update set event_count = demo_metrics_private.demo_usage_daily.event_count + 1;
end;
$$;

revoke execute on function public.record_demo_usage(text, text, text) from public, authenticated;
grant execute on function public.record_demo_usage(text, text, text) to anon;

comment on table demo_metrics_private.demo_usage_daily is
  'Daily aggregate counters for the protected demo. Contains no visitor or session identifiers.';
comment on function public.record_demo_usage(text, text, text) is
  'Server-authenticated ingestion of allowlisted, anonymous demo usage counters.';
