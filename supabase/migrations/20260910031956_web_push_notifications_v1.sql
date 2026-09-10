create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_endpoint_len check (char_length(endpoint) between 20 and 4096),
  constraint push_subscriptions_p256dh_len check (char_length(p256dh) between 40 and 512),
  constraint push_subscriptions_auth_len check (char_length(auth_key) between 8 and 256)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id, enabled);
create index if not exists push_subscriptions_company_idx on public.push_subscriptions(company_id, enabled);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
for select to authenticated
using (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own on public.push_subscriptions
for delete to authenticated
using (user_id = (select auth.uid()));

create table if not exists private.push_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  function_url text not null,
  webhook_secret text not null,
  vapid_public_key text not null,
  vapid_private_key text not null,
  vapid_subject text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.push_dispatches (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','PARTIAL','SKIPPED','FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_push_public_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.company_members cm
    where cm.user_id = v_user and cm.status = 'ACTIVE'
  ) then raise exception 'ACTIVE_MEMBERSHIP_REQUIRED'; end if;
  select pc.vapid_public_key into v_key
  from private.push_config pc where pc.id = true and pc.enabled = true;
  return v_key;
end;
$$;

create or replace function public.register_push_subscription(
  p_company_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_company_id is null then raise exception 'COMPANY_REQUIRED'; end if;
  if not exists (
    select 1 from public.company_members cm
    where cm.user_id = v_user and cm.company_id = p_company_id and cm.status = 'ACTIVE'
  ) then raise exception 'ACTIVE_MEMBERSHIP_REQUIRED'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 4096 then raise exception 'INVALID_ENDPOINT'; end if;
  if p_p256dh is null or char_length(p_p256dh) < 40 or char_length(p_p256dh) > 512 then raise exception 'INVALID_P256DH'; end if;
  if p_auth is null or char_length(p_auth) < 8 or char_length(p_auth) > 256 then raise exception 'INVALID_AUTH_KEY'; end if;

  insert into public.push_subscriptions(company_id,user_id,endpoint,p256dh,auth_key,user_agent,enabled,last_seen_at,updated_at)
  values (p_company_id,v_user,p_endpoint,p_p256dh,p_auth,left(p_user_agent,1000),true,now(),now())
  on conflict (endpoint) do update
    set company_id=excluded.company_id,
        user_id=excluded.user_id,
        p256dh=excluded.p256dh,
        auth_key=excluded.auth_key,
        user_agent=excluded.user_agent,
        enabled=true,
        last_seen_at=now(),
        updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.push_subscriptions ps
  where ps.user_id = v_user and ps.endpoint = p_endpoint;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.get_push_public_key() from public, anon;
revoke all on function public.register_push_subscription(uuid,text,text,text,text) from public, anon;
revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.get_push_public_key() to authenticated;
grant execute on function public.register_push_subscription(uuid,text,text,text,text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

create or replace function public.server_get_push_config()
returns table(webhook_secret text, vapid_public_key text, vapid_private_key text, vapid_subject text)
language sql
security definer
set search_path = ''
as $$
  select pc.webhook_secret, pc.vapid_public_key, pc.vapid_private_key, pc.vapid_subject
  from private.push_config pc
  where pc.id = true and pc.enabled = true
$$;

create or replace function public.server_mark_push_dispatch(
  p_notification_id uuid,
  p_status text,
  p_delivered integer default 0,
  p_failed integer default 0,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('SENT','PARTIAL','SKIPPED','FAILED') then raise exception 'INVALID_PUSH_STATUS'; end if;
  update private.push_dispatches
  set status=p_status,
      delivered_count=greatest(coalesce(p_delivered,0),0),
      failed_count=greatest(coalesce(p_failed,0),0),
      last_error=left(p_error,2000),
      sent_at=case when p_status in ('SENT','PARTIAL','SKIPPED') then now() else sent_at end,
      updated_at=now()
  where notification_id=p_notification_id;
end;
$$;

revoke all on function public.server_get_push_config() from public, anon, authenticated;
revoke all on function public.server_mark_push_dispatch(uuid,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.server_get_push_config() to service_role;
grant execute on function public.server_mark_push_dispatch(uuid,text,integer,integer,text) to service_role;

grant select, delete on table public.push_subscriptions to service_role;
grant select on table public.notifications to service_role;

create or replace function private.sf_request_push_dispatch(p_notification_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg record;
  v_request_id bigint;
begin
  select pc.function_url, pc.webhook_secret into v_cfg
  from private.push_config pc where pc.id=true and pc.enabled=true;
  if v_cfg.function_url is null or v_cfg.webhook_secret is null then return null; end if;

  select net.http_post(
    url := v_cfg.function_url,
    headers := jsonb_build_object('Content-Type','application/json','X-SchichtFunk-Push-Secret',v_cfg.webhook_secret),
    body := jsonb_build_object('notification_id',p_notification_id),
    timeout_milliseconds := 7000
  ) into v_request_id;

  update private.push_dispatches
  set attempts=attempts+1,last_attempt_at=now(),status='PENDING',updated_at=now()
  where notification_id=p_notification_id;
  return v_request_id;
exception when others then
  update private.push_dispatches
  set attempts=attempts+1,last_attempt_at=now(),status='FAILED',last_error=left(sqlerrm,2000),updated_at=now()
  where notification_id=p_notification_id;
  return null;
end;
$$;

create or replace function private.sf_enqueue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.push_dispatches(notification_id) values(new.id) on conflict do nothing;
  perform private.sf_request_push_dispatch(new.id);
  return new;
end;
$$;

drop trigger if exists trg_notifications_web_push on public.notifications;
create trigger trg_notifications_web_push
after insert on public.notifications
for each row execute function private.sf_enqueue_push_notification();

create or replace function private.sf_retry_push_dispatches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select d.notification_id
    from private.push_dispatches d
    where d.status in ('PENDING','FAILED')
      and d.attempts < 4
      and (d.last_attempt_at is null or d.last_attempt_at < now() - interval '2 minutes')
    order by d.created_at
    limit 50
  loop
    perform private.sf_request_push_dispatch(r.notification_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='schichtfunk-push-retry' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('schichtfunk-push-retry','* * * * *','select private.sf_retry_push_dispatches()');
end $$;
