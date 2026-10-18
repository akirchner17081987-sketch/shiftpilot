-- A disabled company account must override an older active employee link.
-- Keep read-only/time-only active members eligible for their own notifications.
create or replace function private.sf_push_recipient_active(p_company_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and p_company_id is not null
 and not exists(select 1 from public.company_members m
   where m.company_id=p_company_id and m.user_id=p_user_id and m.status<>'ACTIVE')
 and (exists(select 1 from public.company_members m
   where m.company_id=p_company_id and m.user_id=p_user_id and m.status='ACTIVE')
 or exists(select 1 from public.employees e
   where e.company_id=p_company_id and e.auth_user_id=p_user_id
   and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null))
$$;
revoke all on function private.sf_push_recipient_active(uuid,uuid) from public,anon,authenticated;

create or replace function public.server_push_recipient_active(p_company_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.sf_push_recipient_active(p_company_id,p_user_id)
$$;
revoke all on function public.server_push_recipient_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_push_recipient_active(uuid,uuid) to service_role;

create or replace function public.get_push_public_key()
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_key text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from (
   select company_id from public.company_members where user_id=v_user
   union select company_id from public.employees where auth_user_id=v_user
 ) c where private.sf_push_recipient_active(c.company_id,v_user)) then
   raise exception 'ACTIVE_MEMBERSHIP_REQUIRED';
 end if;
 select vapid_public_key into v_key from private.push_config where id=true and enabled=true;
 return v_key;
end $$;
revoke all on function public.get_push_public_key() from public,anon;
grant execute on function public.get_push_public_key() to authenticated;

-- Preserve validation, rate limiting, notification payload and existing grants.
do $$ declare r record;definition text;guard text:=E'\n  if not private.sf_push_recipient_active(p_company_id,auth.uid()) then raise exception ''ACTIVE_MEMBERSHIP_REQUIRED'';end if;';n integer:=0;
begin
 for r in select p.oid from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
 where ns.nspname='public' and p.proname in ('register_push_subscription','send_push_test') loop
  definition:=pg_get_functiondef(r.oid);
  if position(E'\nbegin\n' in definition)=0 then raise exception 'PUSH_GUARD_BODY_CHANGED';end if;
  if position('private.sf_push_recipient_active(' in definition)=0 then
   execute replace(definition,E'\nbegin\n',E'\nbegin\n'||guard||E'\n');
  end if;
  n:=n+1;
 end loop;
 if n<>2 then raise exception 'PUSH_GUARD_FUNCTION_COUNT_%',n;end if;
end $$;
notify pgrst,'reload schema';
