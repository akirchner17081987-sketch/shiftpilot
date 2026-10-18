-- Inspect all work intersecting the local month, including overnight and fully covered QR duties.
CREATE OR REPLACE FUNCTION public.manager_time_month_status(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_status text:='OPEN'; v_closed_at timestamptz; v_revision integer:=0;
  v_missing bigint; v_absences bigint; v_entries bigint; v_open_qr bigint; v_past boolean; v_tz text; v_from timestamptz; v_to timestamptz;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=p_company_id;
  v_from:=v_month::timestamp at time zone v_tz;v_to:=(v_end+1)::timestamp at time zone v_tz;
  select c.status,c.closed_at,c.revision into v_status,v_closed_at,v_revision
    from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month;
  v_status:=coalesce(v_status,'OPEN'); v_revision:=coalesce(v_revision,0);
  select count(*) into v_missing from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
    where sa.company_id=p_company_id and sa.status='PUBLISHED' and sa.starts_at<v_to and sa.ends_at>v_from
      and sa.starts_at<statement_timestamp() and te.assignment_id is null
      and not exists(select 1 from private.sf_paid_time_ranges(p_company_id,sa.employee_id,sa.starts_at,sa.ends_at) r
        where r.paid_range @> tstzrange(sa.starts_at,sa.ends_at,'[)'));
  select count(*) into v_absences from public.absences a where a.company_id=p_company_id
    and a.start_date<=v_end and a.end_date>=v_month and a.status in ('Beantragt','PENDING','REQUESTED');
  select count(*) into v_entries from public.time_entries te where te.company_id=p_company_id
    and te.actual_start<v_to and coalesce(te.actual_end,statement_timestamp())>v_from
      and te.status in ('open','recorded','correction_requested');
  select count(*) into v_open_qr from public.time_qr_independent_shifts q join public.companies c on c.id=q.company_id where q.company_id=p_company_id and q.ended_at is null and q.started_at<(v_end+1)::timestamp at time zone coalesce(c.timezone,'Europe/Berlin');
  v_past:=v_end<(statement_timestamp() at time zone v_tz)::date;
  return jsonb_build_object('month_start',v_month,'status',v_status,'closed_at',v_closed_at,'revision',v_revision,
    'missing_confirmed_assignments',v_missing,'pending_absence_requests',v_absences,'pending_time_entries',v_entries,
    'open_qr_shifts',v_open_qr,'is_past_month',v_past,'can_close',v_past and v_status<>'CLOSED' and v_missing=0 and v_absences=0 and v_entries=0 and v_open_qr=0,
    'can_reopen',v_status='CLOSED');
end;
$function$;

