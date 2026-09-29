-- Expose only an invoker wrapper; the tenant-checked implementation stays private.
create or replace function private.time_access_context(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_can_manage_time(p_company_id) then raise exception 'Nicht berechtigt'; end if;
 return (select jsonb_build_object('name',c.name,'timezone',coalesce(c.timezone,'Europe/Berlin'))
 from public.companies c where c.id=p_company_id);
end $$;
revoke all on function private.time_access_context(uuid) from public,anon;
grant execute on function private.time_access_context(uuid) to authenticated;
create or replace function public.time_access_context(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.time_access_context(p_company_id);
$$;
revoke all on function public.time_access_context(uuid) from public,anon;
grant execute on function public.time_access_context(uuid) to authenticated;
notify pgrst,'reload schema';
