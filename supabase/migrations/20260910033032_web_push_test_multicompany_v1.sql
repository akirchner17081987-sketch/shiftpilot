create or replace function public.send_push_test(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_link text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_user and cm.status='ACTIVE'
  limit 1;
  if v_role is null then raise exception 'ACTIVE_MEMBERSHIP_REQUIRED'; end if;
  if not exists(select 1 from public.push_subscriptions ps where ps.user_id=v_user and ps.enabled=true) then raise exception 'PUSH_NOT_ACTIVE'; end if;
  if exists(
    select 1 from public.notifications n
    where n.company_id=p_company_id and n.user_id=v_user and n.kind='SYSTEM_ENABLED'
      and n.metadata->>'push_test'='true' and n.created_at > now()-interval '30 seconds'
  ) then raise exception 'PUSH_TEST_RATE_LIMIT'; end if;
  v_link := case when v_role='EMPLOYEE' then 'employee-shifts' else 'overview' end;
  insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  values(p_company_id,v_user,null,'SYSTEM_ENABLED','SchichtFunk Push-Test','Push-Mitteilungen funktionieren auf diesem Gerät.',v_link,'PUSH_TEST',gen_random_uuid(),jsonb_build_object('push_test',true))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.send_push_test(uuid) from public, anon;
grant execute on function public.send_push_test(uuid) to authenticated;
