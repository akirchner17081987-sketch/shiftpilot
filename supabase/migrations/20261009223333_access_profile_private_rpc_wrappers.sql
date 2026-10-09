-- Privileged access logic stays outside the exposed API schema.
alter function public.access_profile_context(uuid) set schema private;
create function public.access_profile_context(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.access_profile_context(p_company_id); $$;
revoke all on function private.access_profile_context(uuid),public.access_profile_context(uuid) from public,anon,authenticated;
grant execute on function private.access_profile_context(uuid),public.access_profile_context(uuid) to authenticated;

alter function public.manager_list_access_users(uuid) set schema private;
create function public.manager_list_access_users(p_company_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.manager_list_access_users(p_company_id); $$;
revoke all on function private.manager_list_access_users(uuid),public.manager_list_access_users(uuid) from public,anon,authenticated;
grant execute on function private.manager_list_access_users(uuid),public.manager_list_access_users(uuid) to authenticated;

alter function public.manager_set_access_profile(uuid,uuid,text,text[],text) set schema private;
create function public.manager_set_access_profile(p_company_id uuid,p_user_id uuid,p_role text,p_permissions text[],p_status text) returns void language sql security invoker set search_path='' as $$ select private.manager_set_access_profile(p_company_id,p_user_id,p_role,p_permissions,p_status); $$;
revoke all on function private.manager_set_access_profile(uuid,uuid,text,text[],text),public.manager_set_access_profile(uuid,uuid,text,text[],text) from public,anon,authenticated;
grant execute on function private.manager_set_access_profile(uuid,uuid,text,text[],text),public.manager_set_access_profile(uuid,uuid,text,text[],text) to authenticated;

alter function public.manager_create_access_invite(uuid,text,text,text[],text,uuid) set schema private;
create function public.manager_create_access_invite(p_company_id uuid,p_email text,p_role text,p_permissions text[],p_token_hash text,p_employee_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.manager_create_access_invite(p_company_id,p_email,p_role,p_permissions,p_token_hash,p_employee_id); $$;
revoke all on function private.manager_create_access_invite(uuid,text,text,text[],text,uuid),public.manager_create_access_invite(uuid,text,text,text[],text,uuid) from public,anon,authenticated;
grant execute on function private.manager_create_access_invite(uuid,text,text,text[],text,uuid),public.manager_create_access_invite(uuid,text,text,text[],text,uuid) to authenticated;

alter function public.manager_revoke_access_invite(uuid,uuid) set schema private;
create function public.manager_revoke_access_invite(p_company_id uuid,p_invite_id uuid) returns void language sql security invoker set search_path='' as $$ select private.manager_revoke_access_invite(p_company_id,p_invite_id); $$;
revoke all on function private.manager_revoke_access_invite(uuid,uuid),public.manager_revoke_access_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function private.manager_revoke_access_invite(uuid,uuid),public.manager_revoke_access_invite(uuid,uuid) to authenticated;

alter function public.read_only_schedule_snapshot(uuid) set schema private;
create function public.read_only_schedule_snapshot(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_only_schedule_snapshot(p_company_id); $$;
revoke all on function private.read_only_schedule_snapshot(uuid),public.read_only_schedule_snapshot(uuid) from public,anon,authenticated;
grant execute on function private.read_only_schedule_snapshot(uuid),public.read_only_schedule_snapshot(uuid) to authenticated;

