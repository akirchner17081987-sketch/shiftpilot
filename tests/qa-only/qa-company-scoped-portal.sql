-- QA ONLY: company-scoped employee profile and time-account APIs.
-- These endpoints must not be taken as a completed multi-company portal.
create function private.qa_employee_time_account_scoped(p_company uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company); state text; row_data jsonb; holidays jsonb;
begin
 select coalesce(s.federal_state,'DE') into state from public.time_account_settings s where s.company_id=p_company;
 state:=coalesce(state,'DE');
 select to_jsonb(r) into row_data from private.sf_time_account_rows(p_company,p_month,emp) r;
 select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
 into holidays from private.sf_public_holidays(extract(year from coalesce(p_month,current_date))::integer,state) h
 where h.holiday_date>=date_trunc('month',coalesce(p_month,current_date))::date
 and h.holiday_date<(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
 return coalesce(row_data,'{}'::jsonb)||jsonb_build_object('month',date_trunc('month',coalesce(p_month,current_date))::date,'federal_state',state,'holidays',holidays);
end $$;
revoke all on function private.qa_employee_time_account_scoped(uuid,date) from public,anon;
grant execute on function private.qa_employee_time_account_scoped(uuid,date) to authenticated;

create function public.qa_employee_profile_scoped(p_company uuid)
returns jsonb language sql stable set search_path='' as $$
 select private.qa_employee_my_profile_impl(p_company)
$$;
create function public.qa_employee_time_account_scoped(p_company uuid,p_month date)
returns jsonb language sql stable set search_path='' as $$
 select private.qa_employee_time_account_scoped(p_company,p_month)
$$;
create function public.qa_employee_qr_bookings_scoped(p_company uuid,p_month date)
returns jsonb language sql stable set search_path='' as $$
 select private.qa_employee_my_qr_bookings_impl(p_company,p_month)
$$;
revoke all on function public.qa_employee_profile_scoped(uuid) from public,anon;
revoke all on function public.qa_employee_time_account_scoped(uuid,date) from public,anon;
revoke all on function public.qa_employee_qr_bookings_scoped(uuid,date) from public,anon;
grant execute on function public.qa_employee_profile_scoped(uuid) to authenticated;
grant execute on function public.qa_employee_time_account_scoped(uuid,date) to authenticated;
grant execute on function public.qa_employee_qr_bookings_scoped(uuid,date) to authenticated;

