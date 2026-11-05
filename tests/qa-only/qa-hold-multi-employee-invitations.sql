-- Keep multi-profile invitations unavailable to app users until portal isolation is complete.
revoke execute on function public.qa_create_multi_employee_invite(uuid,uuid[],text,text) from authenticated;
revoke execute on function private.qa_create_multi_employee_invite(uuid,uuid[],text,text) from authenticated;
