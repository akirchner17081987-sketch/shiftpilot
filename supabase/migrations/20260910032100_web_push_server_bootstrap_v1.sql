create or replace function public.server_bootstrap_push_config(
  p_function_url text,
  p_webhook_secret text,
  p_vapid_public_key text,
  p_vapid_private_key text,
  p_vapid_subject text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.push_config pc where pc.id=true) then return false; end if;
  if p_function_url !~ '^https://' then raise exception 'INVALID_FUNCTION_URL'; end if;
  if char_length(p_webhook_secret) < 40 then raise exception 'INVALID_WEBHOOK_SECRET'; end if;
  if char_length(p_vapid_public_key) < 80 or char_length(p_vapid_private_key) < 40 then raise exception 'INVALID_VAPID_KEYS'; end if;
  if p_vapid_subject !~ '^https://' and p_vapid_subject !~ '^mailto:' then raise exception 'INVALID_VAPID_SUBJECT'; end if;
  insert into private.push_config(id,enabled,function_url,webhook_secret,vapid_public_key,vapid_private_key,vapid_subject,updated_at)
  values(true,true,p_function_url,p_webhook_secret,p_vapid_public_key,p_vapid_private_key,p_vapid_subject,now());
  return true;
end;
$$;
revoke all on function public.server_bootstrap_push_config(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.server_bootstrap_push_config(text,text,text,text,text) to service_role;
