-- Restore the authenticated execution path used by company-management RLS
-- policies and manager RPCs. Anonymous callers remain blocked.
grant usage on schema private to authenticated;
revoke all on function private.can_manage_company_users(uuid) from public, anon;
grant execute on function private.can_manage_company_users(uuid) to authenticated;
