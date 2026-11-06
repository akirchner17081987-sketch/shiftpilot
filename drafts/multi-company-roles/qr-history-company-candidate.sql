-- Draft: QR history is explicitly scoped to the chosen company.
CREATE OR REPLACE FUNCTION private.sf_qr_bookings_for_company(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_employee public.employees%rowtype;
  v_timezone text;
  v_month date;
  v_next date;
  v_now timestamptz:=statement_timestamp();
  v_rows jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden' using errcode='42501'; end if;
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung' using errcode='42501'; end if;
  select * into v_employee from public.employees
    where id=private.sf_employee_identity_for_company(p_company_id)
      and company_id=p_company_id;
  if not found then raise exception 'Kein aktiver Mitarbeiterzugang' using errcode='42501'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=v_employee.company_id;
  if p_month is not null and (p_month < date '1900-01-01' or p_month >= date '9999-01-01') then
    raise exception 'Ungültiger Monat' using errcode='22023';
  end if;
  v_month:=date_trunc('month',coalesce(p_month,(v_now at time zone v_timezone)::date))::date;
  v_next:=(v_month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc,x.id) filter(where x.position<=500),'[]'::jsonb),count(*)
  into v_rows,v_count from (
    select s.id,s.started_at,s.ended_at,t.name terminal_name,
      row_number() over(order by s.started_at desc,s.id) position,
      round(greatest(0,extract(epoch from (coalesce(s.ended_at,v_now)-s.started_at)))/60)::integer attendance_minutes,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at,
        'minutes',round(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))/60)::integer) order by b.ordinal)
        from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      (select coalesce(round(sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at))))/60),0)::integer
        from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=v_employee.company_id
    where s.employee_id=v_employee.id and s.company_id=v_employee.company_id
      and s.started_at >= (v_month::timestamp at time zone v_timezone)
      and s.started_at < (v_next::timestamp at time zone v_timezone)
    order by s.started_at desc,s.id limit 501
  ) x;
  return jsonb_build_object('employee_id',v_employee.id,'month',v_month,'timezone',v_timezone,'as_of',v_now,
    'rows',v_rows,'truncated',v_count>500);
end;$function$
;
create or replace function private.employee_my_qr_bookings_impl(p_month date default null)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(private.sf_single_active_employee_company(),p_month)
$fn$;
create or replace function public.employee_my_qr_bookings_for_company(p_company_id uuid,p_month date default null)
returns jsonb language sql stable set search_path='' as $fn$
 select private.sf_qr_bookings_for_company(p_company_id,p_month)
$fn$;
revoke all on function private.sf_qr_bookings_for_company(uuid,date) from public,anon;
revoke all on function public.employee_my_qr_bookings_for_company(uuid,date) from public,anon;
grant execute on function private.sf_qr_bookings_for_company(uuid,date) to authenticated;
grant execute on function public.employee_my_qr_bookings_for_company(uuid,date) to authenticated;
