-- QA ONLY: retain the production behavior for closed month snapshots.
create or replace function private.qa_employee_time_account_scoped(p_company uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company); v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; snapshot jsonb; row_data jsonb;
begin
 select c.report_snapshot into snapshot from public.time_month_closures c where c.company_id=p_company and c.month_start=v_month and c.status='CLOSED';
 if snapshot is not null then
  select x into row_data from jsonb_array_elements(snapshot->'employees') x where x->>'employee_id'=emp::text limit 1;
  return row_data;
 end if;
 return private.time_account_row_v1(emp,v_month);
end $$;
