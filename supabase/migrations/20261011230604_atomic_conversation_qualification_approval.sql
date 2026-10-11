-- Save the reviewed qualification and its sharing decision in one transaction.
-- The existing save function holds a row lock until this RPC commits; another
-- editor cannot replace the reviewed content between saving and approval.
create function private.manager_save_conversation_qualification(
 p_employee_id uuid,p_id uuid,p_category text,p_title text,p_credential_number text,
 p_issuer text,p_issued_on date,p_expires_on date,p_note text,p_conversation_visible boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 perform private.sf_assert_aal2('personnel_qualification_approval');
 i:=private.manager_save_personnel_qualification_impl(p_employee_id,p_id,p_category,p_title,p_credential_number,p_issuer,p_issued_on,p_expires_on,p_note);
 perform private.manager_set_conversation_qualification_visibility(i,p_conversation_visible);
 return i;
end $$;
create function public.manager_save_conversation_qualification(
 p_employee_id uuid,p_id uuid,p_category text,p_title text,p_credential_number text,
 p_issuer text,p_issued_on date,p_expires_on date,p_note text,p_conversation_visible boolean default false)
returns uuid language sql security invoker set search_path='' as $$
 select private.manager_save_conversation_qualification(p_employee_id,p_id,p_category,p_title,p_credential_number,p_issuer,p_issued_on,p_expires_on,p_note,p_conversation_visible);
$$;
revoke all on function private.manager_save_conversation_qualification(uuid,uuid,text,text,text,text,date,date,text,boolean),public.manager_save_conversation_qualification(uuid,uuid,text,text,text,text,date,date,text,boolean) from public,anon,authenticated;
grant execute on function private.manager_save_conversation_qualification(uuid,uuid,text,text,text,text,date,date,text,boolean),public.manager_save_conversation_qualification(uuid,uuid,text,text,text,text,date,date,text,boolean) to authenticated;
notify pgrst,'reload schema';
