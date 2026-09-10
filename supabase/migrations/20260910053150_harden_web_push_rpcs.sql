-- Keep the browser-facing RPCs callable only by signed-in users while preventing
-- direct execution of the internal dispatch helpers.
revoke all on function private.sf_enqueue_push_notification() from public, anon, authenticated;
revoke all on function private.sf_request_push_dispatch(uuid) from public, anon, authenticated;
revoke all on function private.sf_retry_push_dispatches() from public, anon, authenticated;

-- An endpoint is an opaque browser credential. A caller must never be able to
-- transfer a subscription already owned by a different authenticated user.
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

  insert into public.push_subscriptions as existing(
    company_id,user_id,endpoint,p256dh,auth_key,user_agent,enabled,last_seen_at,updated_at
  ) values (
    p_company_id,v_user,p_endpoint,p_p256dh,p_auth,left(p_user_agent,1000),true,now(),now()
  )
  on conflict (endpoint) do update
    set company_id=excluded.company_id,
        p256dh=excluded.p256dh,
        auth_key=excluded.auth_key,
        user_agent=excluded.user_agent,
        enabled=true,
        last_seen_at=now(),
        updated_at=now()
    where existing.user_id = v_user
  returning id into v_id;

  if v_id is null then raise exception 'PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER'; end if;
  return v_id;
end;
$$;

revoke all on function public.register_push_subscription(uuid,text,text,text,text) from public, anon;
grant execute on function public.register_push_subscription(uuid,text,text,text,text) to authenticated;
