-- Shared MFA boundary for sensitive server-side actions.
-- This migration only provides the guard. It does not alter an existing public
-- RPC, enable a product setting or change production access by itself.

create or replace function private.sf_request_aal()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt()->>'aal', ''), 'aal1')
$$;

create or replace function private.sf_assert_aal2(p_action text default 'sensitive_action')
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_aal text := private.sf_request_aal();
begin
  -- Service workers authenticate with the service role and do not carry a user
  -- MFA claim. Their separate authorization remains mandatory at the caller.
  if v_role = 'service_role' then
    return;
  end if;

  if v_role <> 'authenticated' or v_aal <> 'aal2' then
    raise exception using
      errcode = 'P0001',
      message = 'MFA_REQUIRED',
      detail = format('AAL2 is required for action %s', coalesce(nullif(p_action, ''), 'sensitive_action'));
  end if;
end;
$$;

revoke all on function private.sf_request_aal() from public, anon, authenticated;
grant execute on function private.sf_request_aal() to authenticated, service_role;

revoke all on function private.sf_assert_aal2(text) from public, anon, authenticated;
grant execute on function private.sf_assert_aal2(text) to authenticated, service_role;

comment on function private.sf_request_aal() is
  'Returns the request authenticator assurance level; defaults safely to aal1.';
comment on function private.sf_assert_aal2(text) is
  'Reusable server-side MFA guard. Existing RPCs are intentionally not changed by this migration.';
