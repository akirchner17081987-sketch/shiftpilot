-- SchichtFunk – interne QR-Buchungsbasis aus dem exponierten Schema entfernen

alter function public.employee_clock_from_qr_unchecked(text,text)
  set schema private;

revoke all on function private.employee_clock_from_qr_unchecked(text,text)
  from public, anon, authenticated;

create or replace function public.employee_clock_from_qr(p_token text, p_expected_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sf_assert_qr_pilot_access(p_token);
  return private.employee_clock_from_qr_unchecked(p_token, p_expected_action);
end;
$$;

revoke all on function public.employee_clock_from_qr(text,text) from public, anon;
grant execute on function public.employee_clock_from_qr(text,text) to authenticated;
