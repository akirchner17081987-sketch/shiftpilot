-- Give only the audited multi-month RPC sufficient time; keep normal role limits.
ALTER FUNCTION public.apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean) SET statement_timeout TO '60s';
NOTIFY pgrst,'reload schema';
