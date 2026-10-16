-- Keep the legacy API compatible while enforcing authorization at the function boundary.
-- This must remain safe even if a caller bypasses the PostgREST pre-request hook.
create or replace function public.manager_update_company_member(
  p_company_id uuid, p_user_id uuid, p_role text, p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_target_role text;
  v_role text := upper(trim(coalesce(p_role, '')));
  v_status text := upper(trim(coalesce(p_status, '')));
begin
  if auth.uid() is null then raise exception 'Nicht berechtigt'; end if;
  -- Use the same company lock as the current access-profile editor.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text, 7041));
  select role into v_actor_role from public.company_members
  where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN') then
    raise exception 'Nicht berechtigt';
  end if;
  perform private.sf_assert_aal2('manager_update_company_member');
  select role into v_target_role from public.company_members
  where company_id=p_company_id and user_id=p_user_id for update;
  if v_target_role is null then raise exception 'Benutzer nicht gefunden'; end if;
  if v_target_role='OWNER' then raise exception 'Die Inhaberrolle ist geschützt'; end if;
  if p_user_id=auth.uid() then raise exception 'Dieser Zugang ist geschützt'; end if;
  if v_actor_role<>'OWNER' and (v_target_role='ADMIN' or v_role='ADMIN') then
    raise exception 'Nur der Inhaber darf Administratoren verwalten';
  end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING')
    or v_status not in ('ACTIVE','DISABLED') then
    raise exception 'Ungültige Rolle oder Status';
  end if;
  update public.company_members set role=v_role,status=v_status
  where company_id=p_company_id and user_id=p_user_id;
end
$function$;

revoke all on function public.manager_update_company_member(uuid,uuid,text,text) from public, anon;
grant execute on function public.manager_update_company_member(uuid,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
