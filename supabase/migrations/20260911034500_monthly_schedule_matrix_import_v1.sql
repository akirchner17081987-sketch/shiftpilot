create or replace function public.manager_import_month_matrix(
  p_company_id uuid,
  p_rows jsonb,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row jsonb;
  v_employee uuid;
  v_date date;
  v_kind text;
  v_code text;
  v_note text;
  v_start time;
  v_end time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_existing public.shift_assignments%rowtype;
  v_abs public.absences%rowtype;
  v_action text;
  v_reason text;
  v_results jsonb := '[]'::jsonb;
  v_insert int := 0;
  v_update int := 0;
  v_noop int := 0;
  v_blocked int := 0;
  v_absence int := 0;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.sf_is_manager(p_company_id,true) then
    raise exception 'Keine Berechtigung';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Importdaten müssen als Array übergeben werden';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_employee := nullif(v_row->>'employee_id','')::uuid;
    v_date := nullif(v_row->>'date','')::date;
    v_kind := upper(coalesce(v_row->>'kind',''));
    v_code := upper(btrim(coalesce(v_row->>'code','')));
    v_note := btrim(coalesce(v_row->>'note',''));
    v_action := null;
    v_reason := null;

    if v_employee is null or v_date is null or not exists (
      select 1 from public.employees e
      where e.id=v_employee and e.company_id=p_company_id and e.status='active'
    ) then
      v_action := 'BLOCKED';
      v_reason := 'Mitarbeiter oder Datum ungültig';
    elsif v_kind='SHIFT' then
      select st.default_start, st.default_end into v_start,v_end
      from public.shift_templates st
      where st.company_id=p_company_id and upper(st.code)=v_code and st.active=true
      limit 1;

      if v_start is null or v_end is null then
        v_action := 'BLOCKED';
        v_reason := 'Unbekannte oder inaktive Schichtart: '||coalesce(v_code,'');
      else
        v_starts_at := ((v_date::text||' '||v_start::text)::timestamp at time zone 'Europe/Berlin');
        v_ends_at := (((case when v_end<=v_start then v_date+1 else v_date end)::text||' '||v_end::text)::timestamp at time zone 'Europe/Berlin');

        select s.* into v_existing
        from public.shift_assignments s
        where s.company_id=p_company_id
          and s.employee_id=v_employee
          and (s.starts_at at time zone 'Europe/Berlin')::date=v_date
          and s.status<>'CANCELLED'
        order by case when s.status='PUBLISHED' then 0 else 1 end, s.created_at
        limit 1;

        if found then
          if v_existing.shift_code=v_code and v_existing.starts_at=v_starts_at and v_existing.ends_at=v_ends_at then
            v_action := 'NOOP';
            v_reason := 'Bereits identisch vorhanden';
          elsif v_existing.status='PUBLISHED'
             or exists(select 1 from public.time_entries te where te.assignment_id=v_existing.id)
             or exists(select 1 from public.time_qr_punches qp where qp.assignment_id=v_existing.id)
             or exists(select 1 from public.shift_change_requests cr where cr.assignment_id=v_existing.id and cr.status not in ('REJECTED','CANCELLED')) then
            v_action := 'BLOCKED';
            v_reason := 'Bestehende Schicht ist veröffentlicht oder besitzt Folge-/Zeitdaten';
          else
            v_action := 'UPDATE';
            v_reason := 'Entwurf wird auf Importvorlage angepasst';
            if p_apply then
              perform set_config('schichtfunk.legacy_import','on',true);
              update public.shift_assignments
              set shift_code=v_code,starts_at=v_starts_at,ends_at=v_ends_at,break_minutes=0,
                  note=case when v_note<>'' then v_note else note end,
                  updated_at=clock_timestamp(),version=greatest(coalesce(version,1)+1,2)
              where id=v_existing.id;
            end if;
          end if;
        else
          v_action := 'INSERT';
          v_reason := 'Neue Schicht aus Monatsimport';
          if p_apply then
            perform set_config('schichtfunk.legacy_import','on',true);
            insert into public.shift_assignments(
              company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,break_minutes,note,status,version,created_by
            ) values (
              p_company_id,v_employee,'month-import:'||v_date::text||':'||v_employee::text||':'||lower(v_code),
              v_code,v_starts_at,v_ends_at,0,case when v_note<>'' then v_note else 'Monatsplan-Import' end,
              'DRAFT',1,v_actor
            );
          end if;
        end if;
      end if;

    elsif v_kind='ABSENCE' then
      if v_code='U' then v_code:='Urlaub';
      elsif v_code='K' then v_code:='Krank';
      elsif v_code='P' then v_code:='Frei'; if v_note='' then v_note:='Pflichtfrei'; end if;
      end if;

      if v_code not in ('Urlaub','Krank','Frei') then
        v_action := 'BLOCKED';
        v_reason := 'Unbekannte Abwesenheit';
      else
        select a.* into v_abs
        from public.absences a
        where a.company_id=p_company_id and a.employee_id=v_employee and a.status<>'Abgelehnt'
          and v_date between a.start_date and a.end_date
        order by a.created_at limit 1;

        if found then
          if v_abs.absence_type=v_code then
            v_action := 'NOOP';
            v_reason := 'Abwesenheit bereits vorhanden';
          else
            v_action := 'BLOCKED';
            v_reason := 'Andere Abwesenheit ist an diesem Tag bereits vorhanden';
          end if;
        else
          v_action := 'ABSENCE_INSERT';
          v_reason := 'Neue Abwesenheit aus Monatsimport';
          if p_apply then
            insert into public.absences(
              company_id,employee_id,start_date,end_date,absence_type,status,full_day,note,
              request_source,requested_by,requested_at,reviewed_by,reviewed_at
            ) values (
              p_company_id,v_employee,v_date,v_date,v_code,'Genehmigt',true,
              case when v_note<>'' then v_note else 'Monatsplan-Import' end,
              'MANAGER',v_actor,clock_timestamp(),v_actor,clock_timestamp()
            );
          end if;
        end if;
      end if;
    else
      v_action := 'BLOCKED';
      v_reason := 'Unbekannter Importtyp';
    end if;

    if v_action='INSERT' then v_insert:=v_insert+1;
    elsif v_action='UPDATE' then v_update:=v_update+1;
    elsif v_action='NOOP' then v_noop:=v_noop+1;
    elsif v_action='ABSENCE_INSERT' then v_absence:=v_absence+1;
    else v_blocked:=v_blocked+1;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee,'date',v_date,'kind',v_kind,'code',v_code,'action',v_action,'reason',v_reason
    ));
  end loop;

  if p_apply then
    insert into public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,new_values,metadata)
    values(
      p_company_id,'MONTH_MATRIX_IMPORT_APPLIED','schedule_import',v_actor,'MANAGER',
      jsonb_build_object('inserted',v_insert,'updated',v_update,'unchanged',v_noop,'absences',v_absence,'blocked',v_blocked),
      jsonb_build_object('row_count',jsonb_array_length(p_rows),'format','MONTH_MATRIX_V1')
    );
  end if;

  return jsonb_build_object(
    'mode',case when p_apply then 'APPLY' else 'PREVIEW' end,
    'summary',jsonb_build_object('inserted',v_insert,'updated',v_update,'unchanged',v_noop,'absences',v_absence,'blocked',v_blocked),
    'results',v_results
  );
end;
$function$;

grant execute on function public.manager_import_month_matrix(uuid,jsonb,boolean) to authenticated;
