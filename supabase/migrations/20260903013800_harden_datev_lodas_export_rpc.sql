revoke execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) from anon;
revoke execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) from public;
grant execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) to authenticated;
