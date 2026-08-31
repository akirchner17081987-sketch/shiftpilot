-- SchichtFunk: Berechtigungen und privilegierte RPCs nach dem
-- Prinzip der minimal erforderlichen Rechte härten.

begin;

alter function public.employee_respond_to_shift_change(uuid,text,text) set search_path = '';
alter function public.manager_create_company_invite(uuid,text,text,text) set search_path = '';
alter function public.manager_list_company_users(uuid) set search_path = '';
alter function public.manager_revoke_company_invite(uuid) set search_path = '';
alter function public.manager_update_company_member(uuid,uuid,text,text) set search_path = '';

revoke all on function public.employee_respond_to_shift_change(uuid,text,text) from public, anon;
revoke all on function public.manager_create_company_invite(uuid,text,text,text) from public, anon;
revoke all on function public.manager_list_company_users(uuid) from public, anon;
revoke all on function public.manager_revoke_company_invite(uuid) from public, anon;
revoke all on function public.manager_update_company_member(uuid,uuid,text,text) from public, anon;

grant execute on function public.employee_respond_to_shift_change(uuid,text,text) to authenticated;
grant execute on function public.manager_create_company_invite(uuid,text,text,text) to authenticated;
grant execute on function public.manager_list_company_users(uuid) to authenticated;
grant execute on function public.manager_revoke_company_invite(uuid) to authenticated;
grant execute on function public.manager_update_company_member(uuid,uuid,text,text) to authenticated;

revoke all on table public.company_member_invites from anon;
revoke all on table public.employee_access_invites from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated, anon;

revoke execute on function public.enforce_assignment_standard_rules() from public, anon;
revoke execute on function public.prevent_audit_mutation() from public, anon;
revoke execute on function public.prevent_noop_shift_change_request() from public, anon;
revoke execute on function public.protect_published_assignment() from public, anon;
revoke execute on function public.set_updated_at() from public, anon;

revoke execute on function public.manager_personnel_deadline_dashboard(uuid) from public, anon;
revoke execute on function public.manager_set_time_account_opening(uuid,date,integer,text) from public, anon;
revoke execute on function public.manager_update_time_account_settings(uuid,date,text[]) from public, anon;
grant execute on function public.manager_personnel_deadline_dashboard(uuid) to authenticated;
grant execute on function public.manager_set_time_account_opening(uuid,date,integer,text) to authenticated;
grant execute on function public.manager_update_time_account_settings(uuid,date,text[]) to authenticated;

commit;

