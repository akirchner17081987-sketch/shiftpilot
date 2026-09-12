begin;

create or replace function public.manager_bulk_record_time_entries(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text default '',
  p_confirm boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_total integer:=0;
  v_updated integer:=0;
  v_skipped_existing integer:=0;
  v_skipped_future integer:=0;
  v_skipped_invalid integer:=0;
  v_reopened_months integer:=0;
  v_month date;
begin
  if not private.sf_is_manager(p_company_id,false) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  if p_end_date-p_start_date>366 then
    raise exception 'Der Zeitraum darf hoechstens 366 Tage umfassen';
  end if;
  if length(coalesce(p_note,''))>1000 then
    raise exception 'Die Bemerkung darf hoechstens 1.000 Zeichen enthalten';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text||p_start_date::text||p_end_date::text,0
  ));

  select count(*) into v_total
  from public.shift_assignments sa
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_existing
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_future
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at>now();

  select count(*) into v_skipped_invalid
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
    and (
      sa.ends_at<=sa.starts_at or sa.ends_at-sa.starts_at>interval '24 hours'
      or coalesce(sa.break_minutes,0)<0
      or coalesce(sa.break_minutes,0)>=extract(epoch from(sa.ends_at-sa.starts_at))/60
    );

  -- Eine Sammeluebernahme ist die ausdrueckliche Entscheidung, dass Plan = Ist gilt.
  -- Falls der Zeitraum bereits abgeschlossen war, wird nur fuer wirklich uebernehmbare
  -- fehlende Eintraege kontrolliert wieder geoeffnet. Die bestehende RPC protokolliert
  -- jede Wiedereroeffnung und beschraenkt sie auf OWNER/ADMIN.
  for v_month in
    select distinct date_trunc('month',sa.starts_at)::date
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    join public.time_month_closures c
      on c.company_id=sa.company_id
     and c.month_start=date_trunc('month',sa.starts_at)::date
     and c.status='CLOSED'
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
    order by 1
  loop
    if not private.sf_is_manager(p_company_id,true) then
      raise exception 'Der Monat ist abgeschlossen. Nur Inhaber und Administratoren duerfen ihn fuer die Sammeluebernahme oeffnen.';
    end if;
    perform public.manager_reopen_time_month(
      p_company_id,
      v_month,
      'Automatisch fuer die Sammeluebernahme unveraenderter Planzeiten geoeffnet'
    );
    v_reopened_months:=v_reopened_months+1;
  end loop;

  with candidates as (
    select sa.id,sa.company_id,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0) as break_minutes
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
  ), inserted as (
    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      updated_at,updated_by,version
    )
    select id,company_id,starts_at,ends_at,break_minutes,
      case when p_confirm then 'confirmed' else 'recorded' end,
      left(coalesce(p_note,''),1000),'MANAGER','',
      case when p_confirm then now() else null end,
      case when p_confirm then auth.uid() else null end,
      case when p_confirm then now() else null end,
      now(),auth.uid(),1
    from candidates
    on conflict(assignment_id) do nothing
    returning assignment_id,company_id,actual_start,actual_end,break_minutes,status,version
  ), audited as (
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    )
    select company_id,
      case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
      'time_entry',assignment_id,auth.uid(),'MANAGER',
      jsonb_build_object(
        'actualStart',actual_start,'actualEnd',actual_end,'breakMinutes',break_minutes,
        'status',status,'version',version
      ),
      jsonb_build_object('bulk',true,'planEqualsActual',true,'comment',left(coalesce(p_note,''),1000))
    from inserted
    returning 1
  )
  select count(*) into v_updated from audited;

  return jsonb_build_object(
    'total',v_total,
    'updated',v_updated,
    'status',case when p_confirm then 'confirmed' else 'recorded' end,
    'reopenedMonths',v_reopened_months,
    'skippedExisting',v_skipped_existing,
    'skippedFuture',v_skipped_future,
    'skippedClosed',0,
    'skippedUnpublished',0,
    'skippedInvalid',v_skipped_invalid
  );
end;
$$;

comment on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean)
is 'Atomically accepts plan as actual time for missing completed shifts; audited admin bulk actions reopen closed months when required.';

revoke all on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean) from public,anon;
grant execute on function public.manager_bulk_record_time_entries(uuid,date,date,text,boolean) to authenticated;

notify pgrst,'reload schema';

commit;

;
