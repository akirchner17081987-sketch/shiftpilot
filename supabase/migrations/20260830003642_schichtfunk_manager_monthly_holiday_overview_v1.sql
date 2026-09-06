create or replace function public.manager_monthly_holidays(p_company_id uuid,p_month date)
returns jsonb
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_state text;
  v_start date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date := (date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
      and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Nicht berechtigt'; end if;

  select coalesce(s.federal_state,'DE') into v_state
  from public.time_account_settings s where s.company_id=p_company_id;
  v_state := coalesce(v_state,'DE');

  select jsonb_build_object(
    'federal_state',v_state,
    'month_start',v_start,
    'month_end',v_end,
    'holidays',coalesce(jsonb_agg(jsonb_build_object(
      'date',h.holiday_date,
      'name',h.holiday_name,
      'scope',h.holiday_scope,
      'target_relevant',(extract(isodow from h.holiday_date)::int between 1 and 5)
    ) order by h.holiday_date) filter(where h.holiday_date is not null),'[]'::jsonb),
    'target_relevant_count',count(*) filter(where extract(isodow from h.holiday_date)::int between 1 and 5)
  ) into v_result
  from private.german_public_holidays(extract(year from v_start)::int,v_state) h
  where h.holiday_date between v_start and v_end;
  return v_result;
end;
$$;

revoke all on function public.manager_monthly_holidays(uuid,date) from public,anon;
grant execute on function public.manager_monthly_holidays(uuid,date) to authenticated;;
