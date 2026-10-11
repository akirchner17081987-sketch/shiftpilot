-- Personnel MFA and absence privacy. Apply before deploying the matching frontend.
-- Existing roles OWNER/ADMIN are the personnel-authorized roles. No client claim grants this role.
begin;

create or replace function private.sf_can_read_personnel(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and private.sf_request_aal()='aal2'
 and exists (select 1 from public.company_members cm where cm.company_id=p_company_id
   and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN'));
$$;
revoke all on function private.sf_can_read_personnel(uuid) from public, anon;
grant execute on function private.sf_can_read_personnel(uuid) to authenticated;

create or replace function private.personnel_admin_role(p_company_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare result_ text;
begin
 select cm.role into result_ from public.company_members cm
 where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE'
 and cm.role in ('OWNER','ADMIN') limit 1;
 if result_ is not null then perform private.sf_assert_aal2('personnel_access'); end if;
 return result_;
end;
$$;
revoke all on function private.personnel_admin_role(uuid) from public, anon;
grant execute on function private.personnel_admin_role(uuid) to authenticated;

-- Also protects direct Storage requests, not only the personnel RPCs.
CREATE OR REPLACE FUNCTION private.can_access_personnel_storage(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_parts text[]; v_company uuid; v_employee uuid; begin
  v_parts:=string_to_array(coalesce(p_name,''),'/');
  if array_length(v_parts,1)<3 then return false; end if;
  if v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  v_company:=v_parts[1]::uuid; v_employee:=v_parts[2]::uuid;
  return private.sf_can_read_personnel(v_company)
     and exists(select 1 from public.employees e where e.id=v_employee and e.company_id=v_company);
exception when others then return false;
end $function$
;

-- Restrictive policies intersect with every existing permissive policy.
create policy absence_personnel_read on public.absences as restrictive for select to authenticated
using (private.sf_can_read_personnel(company_id) or exists (
 select 1 from public.employees e where e.id=employee_id and e.company_id=absences.company_id
 and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
));
create policy absence_personnel_insert on public.absences as restrictive for insert to authenticated
with check (private.sf_can_read_personnel(company_id));
create policy absence_personnel_update on public.absences as restrictive for update to authenticated
using (private.sf_can_read_personnel(company_id)) with check (private.sf_can_read_personnel(company_id));
create policy absence_personnel_delete on public.absences as restrictive for delete to authenticated
using (private.sf_can_read_personnel(company_id));
create policy audit_personnel_mfa on public.audit_events as restrictive for select to authenticated
using (private.sf_can_read_personnel(company_id));
create policy closure_personnel_mfa on public.time_month_closures as restrictive for select to authenticated
using (private.sf_can_read_personnel(company_id));

-- Planning data never exposes type, medical/free-text notes, request authors or review history.
create or replace function private.manager_absence_overview(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare role_ text; rows_ jsonb;
begin
 if auth.uid() is null then raise exception 'Nicht angemeldet' using errcode='42501'; end if;
 select cm.role into role_ from public.company_members cm where cm.company_id=p_company_id
 and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER') limit 1;
 if role_ is null then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 if role_ in ('OWNER','ADMIN') then
  perform private.sf_assert_aal2('absence_details');
  select coalesce(jsonb_agg(to_jsonb(a) order by a.start_date,a.id),'[]'::jsonb) into rows_
  from public.absences a where a.company_id=p_company_id;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'company_id',a.company_id,
   'employee_id',a.employee_id,'legacy_id',a.legacy_id,'start_date',a.start_date,'end_date',a.end_date,
   'absence_type','Abwesend','status','Genehmigt','full_day',a.full_day,
   'start_time',a.start_time,'end_time',a.end_time,'note','','time_note','','review_note','')
   order by a.start_date,a.id),'[]'::jsonb) into rows_
  from public.absences a where a.company_id=p_company_id and a.status in ('Genehmigt','Erfasst');
 end if;
 return rows_;
end;
$$;
revoke all on function private.manager_absence_overview(uuid) from public, anon;
grant execute on function private.manager_absence_overview(uuid) to authenticated;
create or replace function public.manager_absence_overview(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.manager_absence_overview(p_company_id);
$$;
revoke all on function public.manager_absence_overview(uuid) from public, anon;
grant execute on function public.manager_absence_overview(uuid) to authenticated;

-- Reports may include saved JSON snapshots. Sanitize those as well as live results.
-- This function only transforms supplied JSON; it never reads data or grants access.
create or replace function private.sf_redact_absence_payload(value_ jsonb, absence_context_ boolean default false)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare result_ jsonb; item_ record; child_ jsonb; context_ boolean;
begin
 if jsonb_typeof(value_)='array' then
  select coalesce(jsonb_agg(private.sf_redact_absence_payload(v,absence_context_) order by n),'[]'::jsonb)
  into result_ from jsonb_array_elements(value_) with ordinality as items(v,n);
  return result_;
 elsif jsonb_typeof(value_)='object' then
  context_:=absence_context_ or value_ ? 'absence_type'; result_:='{}'::jsonb;
  for item_ in select key,value from jsonb_each(value_) loop
   child_:=item_.value;
   if item_.key in ('absence_type','absence_types') or (context_ and item_.key='type') then
    child_:=case when child_ is null or child_='null'::jsonb or child_='""'::jsonb then child_ else '"Abwesend"'::jsonb end;
   elsif context_ and item_.key in ('note','time_note','review_note','requested_by','reviewed_by','request_source','requested_at','reviewed_at') then
    continue;
   elsif context_ and item_.key='status' and child_='"Erfasst"'::jsonb then child_:='"Genehmigt"'::jsonb;
   else child_:=private.sf_redact_absence_payload(child_,context_ or item_.key='absences'); end if;
   result_:=result_||jsonb_build_object(item_.key,child_);
  end loop;
  return result_;
 end if;
 return value_;
end;
$$;
revoke all on function private.sf_redact_absence_payload(jsonb,boolean) from public, anon;
grant execute on function private.sf_redact_absence_payload(jsonb,boolean) to authenticated;

create or replace function private.sf_absence_payload_for_role(p_company_id uuid, value_ jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select case when private.sf_can_read_personnel(p_company_id) then value_
 else private.sf_redact_absence_payload(value_) end;
$$;
revoke all on function private.sf_absence_payload_for_role(uuid,jsonb) from public, anon;
grant execute on function private.sf_absence_payload_for_role(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.manager_review_absence_request_impl(p_absence_id uuid, p_decision text, p_review_note text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_abs public.absences%rowtype;
  v_role text;
  v_new_status text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Ungültige Entscheidung'; end if;

  select * into v_abs from public.absences where id=p_absence_id for update;
  if v_abs.id is null then raise exception 'Abwesenheitsantrag nicht gefunden'; end if;

  v_role := private.personnel_admin_role(v_abs.company_id);
  if v_role is null then raise exception 'Keine Berechtigung für diese Entscheidung'; end if;
  if v_abs.status <> 'Beantragt' then raise exception 'Dieser Antrag ist nicht mehr offen'; end if;

  if v_decision='APPROVE' then
    v_new_status := case when v_abs.absence_type='Krank' then 'Erfasst' else 'Genehmigt' end;
  else
    v_new_status := 'Abgelehnt';
  end if;

  update public.absences
  set status=v_new_status,
      reviewed_by=v_uid,
      reviewed_at=now(),
      review_note=left(coalesce(p_review_note,''),2000),
      legacy_id=case when v_decision='APPROVE' then coalesce(legacy_id,'absence-request:'||id::text) else legacy_id end,
      updated_at=now()
  where id=v_abs.id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_abs.company_id,
    case when v_decision='APPROVE' then 'ABSENCE_REQUEST_APPROVED' else 'ABSENCE_REQUEST_REJECTED' end,
    'absence',v_abs.id,v_uid,v_role,
    jsonb_build_object('status',v_abs.status),jsonb_build_object('status',v_new_status),
    jsonb_build_object('reviewNote',left(coalesce(p_review_note,''),2000),'source',v_abs.request_source));

  return v_new_status;
end $function$
;

CREATE OR REPLACE FUNCTION public.manager_import_month_matrix(p_company_id uuid, p_rows jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform private.personnel_admin_role(p_company_id);
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
      select st.default_start, st.default_end
        into v_start,v_end
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
          if v_existing.shift_code=v_code
             and v_existing.starts_at=v_starts_at
             and v_existing.ends_at=v_ends_at then
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
              set shift_code=v_code,
                  starts_at=v_starts_at,
                  ends_at=v_ends_at,
                  break_minutes=0,
                  note=case when v_note<>'' then v_note else note end,
                  updated_at=clock_timestamp(),
                  version=greatest(coalesce(version,1)+1,2)
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
              p_company_id,v_employee,
              'month-import:'||v_date::text||':'||v_employee::text||':'||lower(v_code),
              v_code,v_starts_at,v_ends_at,0,
              case when v_note<>'' then v_note else 'Monatsplan-Import' end,
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
        where a.company_id=p_company_id
          and a.employee_id=v_employee
          and a.status<>'Abgelehnt'
          and v_date between a.start_date and a.end_date
        order by a.created_at
        limit 1;

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
      'employee_id',v_employee,'date',v_date,'kind',v_kind,'code',v_code,
      'action',v_action,'reason',v_reason
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
$function$
;

CREATE OR REPLACE FUNCTION private.manager_today_workspace(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare zone_ text; day_ date; start_ timestamptz; end_ timestamptz; can_time_ boolean;
 times_ jsonb:='[]'; qr_ jsonb:='[]';
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) then
  raise exception 'Für dieses Unternehmen fehlen Planungsrechte.' using errcode='42501';
 end if;
 select timezone into strict zone_ from public.companies where id=p_company_id;
 day_:=(now() at time zone zone_)::date;
 start_:=day_::timestamp at time zone zone_;
 end_:=(day_+2)::timestamp at time zone zone_;
 can_time_:=private.sf_can_manage_time(p_company_id);
 if can_time_ then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,
   'start',t.actual_start,'end',t.actual_end,'status',t.status,'shift',a.shift_code,'site_id',m.site_id,
   'break_minutes',t.break_minutes,'breaks',coalesce((select jsonb_agg(jsonb_build_object('start',b.started_at,'end',b.ended_at) order by b.started_at)
    from public.time_qr_breaks b where b.company_id=p_company_id and b.assignment_id=a.id),'[]'))),'[]') into times_
  from public.time_entries t join public.shift_assignments a on a.id=t.assignment_id and a.company_id=p_company_id
   join public.employees e on e.id=a.employee_id and e.company_id=p_company_id and e.deleted_at is null
   left join public.shift_templates m on m.company_id=p_company_id and m.code=a.shift_code
  where t.company_id=p_company_id and a.status<>'CANCELLED' and t.actual_start is not null
   and t.actual_start<end_ and (t.actual_end>start_ or t.actual_end is null);
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'employee_id',q.employee_id,
   'start',q.started_at,'end',q.ended_at,'site_id',t.site_id,'terminal',t.name,'shift',null,
   'breaks',coalesce((select jsonb_agg(jsonb_build_object('start',b.started_at,'end',b.ended_at) order by b.ordinal)
    from public.time_qr_independent_breaks b where b.shift_id=q.id),'[]'))),'[]') into qr_
  from public.time_qr_independent_shifts q
   join public.employees e on e.id=q.employee_id and e.company_id=p_company_id and e.deleted_at is null
   left join public.time_qr_terminals t on t.id=q.terminal_id and t.company_id=p_company_id
  where q.company_id=p_company_id and q.started_at<end_ and (q.ended_at>start_ or q.ended_at is null);
 end if;
 return private.sf_absence_payload_for_role(p_company_id, jsonb_build_object('company_id',p_company_id,'timezone',zone_,'today',day_,'as_of',now(),'can_time',can_time_,
  'company_name',(select name from public.companies where id=p_company_id),'times',times_,'qr',qr_,
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'legacy_id',e.legacy_id,'first',e.first_name,'last',e.last_name,'personnel_no',e.personnel_no,'status',e.status)
   order by e.last_name,e.first_name,e.id) from public.employees e where e.company_id=p_company_id and e.deleted_at is null),'[]'),
  'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'is_active',s.is_active) order by s.name) from public.company_locations s where s.company_id=p_company_id),'[]'),
  'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date between day_-1 and day_+1),'[]'),
  'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'legacy_id',a.legacy_id,'employee_id',a.employee_id,'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,
   'date',(a.starts_at at time zone zone_)::date,'status',a.status,'site_id',t.site_id,'break_minutes',a.break_minutes))
   from public.shift_assignments a join public.employees e on e.id=a.employee_id and e.company_id=p_company_id and e.deleted_at is null
    left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where a.company_id=p_company_id and a.status<>'CANCELLED' and a.starts_at<end_
    and (a.ends_at>start_-interval '1 day' or (can_time_ and exists(select 1 from public.time_entries te where te.company_id=p_company_id and te.assignment_id=a.id and te.actual_start is not null and te.actual_end is null)))),'[]'),
  'absences',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'from',a.start_date,'to',a.end_date,'type',a.absence_type,'status',a.status,'full_day',a.full_day,'start_time',a.start_time,'end_time',a.end_time))
   from public.absences a where a.company_id=p_company_id and a.start_date<=day_+1 and a.end_date>=day_-1 and a.status in ('Genehmigt','Erfasst','APPROVED')),'[]'),
  'incidents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'assignment_id',a.id,'employee_id',d.original_employee_id,'status',d.status,'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,'site_id',t.site_id,
   'pending_count',(select count(*) from public.disruption_offers o where o.company_id=p_company_id and o.incident_id=d.id and o.status='OFFERED' and o.expires_at>now())))
   from public.disruption_incidents d join public.shift_assignments a on a.id=d.assignment_id and a.company_id=p_company_id
    left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where d.company_id=p_company_id and d.status='OPEN'),'[]')));
end $function$
;

CREATE OR REPLACE FUNCTION private.manager_reports_workspace(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tz text; today_ date; can_time boolean; settings_ public.time_account_settings%rowtype;
 result_ jsonb; people_ jsonb; snapshot_ jsonb; times_ jsonb:='[]'; qr_ jsonb:='[]';
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) then
  raise exception 'Für dieses Unternehmen fehlen Auswertungsrechte.' using errcode='42501';
 end if;
 if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>30
    or date_trunc('month',p_start_date)<>date_trunc('month',p_end_date) then
  raise exception 'Bitte einen gültigen Monatsabschnitt mit höchstens 31 Tagen angeben.' using errcode='22023';
 end if;
 select timezone into strict tz from public.companies where id=p_company_id;
 today_:=(now() at time zone tz)::date;
 can_time:=private.sf_can_manage_time(p_company_id);
 select * into settings_ from public.time_account_settings where company_id=p_company_id;
 select report_snapshot into snapshot_ from public.time_month_closures where company_id=p_company_id and month_start=date_trunc('month',p_start_date)::date and status='CLOSED';
 with roster as (
  select e.*,greatest(p_start_date,coalesce(e.start_date,p_start_date)) a,
   least(p_end_date,coalesce(e.contract_end,p_end_date)) b
  from public.employees e where e.company_id=p_company_id and e.deleted_at is null
   and coalesce(e.start_date,p_start_date)<=p_end_date and coalesce(e.contract_end,p_end_date)>=p_start_date
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'legacy_id',e.legacy_id,'first',e.first_name,'last',e.last_name,'personnel_no',e.personnel_no,
  'status',e.status,'employment',e.employment,'weekly_hours',e.weekly_hours,
  'start_date',e.start_date,'contract_end',e.contract_end,'shifts',e.shift_permissions,
  'team',private.sf_month_meta(e.qualifications,'planningTeam'),'site_name',private.sf_month_meta(e.qualifications,'team'),
  'monthly_hours',private.sf_month_meta(e.qualifications,'monthlyHours'),
  'target_minutes',coalesce((saved.row_->>'target_minutes')::integer,private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,e.b,coalesce(settings_.federal_state,'DE'))),
  'elapsed_target_minutes',case when today_>=p_end_date then coalesce((saved.row_->>'target_minutes')::integer,private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,least(e.b,today_),coalesce(settings_.federal_state,'DE'))) else private.sf_employee_target_minutes(p_company_id,e.weekly_hours,e.qualifications,e.a,least(e.b,today_),coalesce(settings_.federal_state,'DE')) end,
  'credit_minutes',coalesce((saved.row_->>'absence_credit_minutes')::integer,private.sf_absence_credit_minutes(e.id,e.a,e.b,coalesce(settings_.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']),round(coalesce(e.weekly_hours,0)*60/5)::integer,coalesce(settings_.federal_state,'DE'))),
  'elapsed_credit_minutes',case when today_<e.a then 0 when today_>=p_end_date and saved.row_ is not null then coalesce((saved.row_->>'absence_credit_minutes')::integer,0) else private.sf_absence_credit_minutes(e.id,e.a,least(e.b,today_),coalesce(settings_.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']),round(coalesce(e.weekly_hours,0)*60/5)::integer,coalesce(settings_.federal_state,'DE')) end,
  'confirmed_minutes',case when can_time then private.sf_confirmed_work_minutes(e.id,p_start_date,p_end_date) else null end
 ) order by e.last_name,e.first_name,e.id),'[]') into people_ from roster e left join lateral (
  select x row_ from jsonb_array_elements(coalesce(snapshot_#>'{accounts,rows}',snapshot_->'employees','[]'::jsonb)) x
  where x->>'employee_id'=e.id::text limit 1
 ) saved on p_start_date=date_trunc('month',p_start_date)::date and p_end_date=(date_trunc('month',p_start_date)+interval '1 month - 1 day')::date;
 if can_time then
  select coalesce(jsonb_agg(jsonb_build_object('id',t.assignment_id,'employee_id',a.employee_id,
   'start',t.actual_start,'end',t.actual_end,'break_minutes',t.break_minutes,'status',t.status,
   'shift',a.shift_code,'date',(a.starts_at at time zone tz)::date,'site_id',s.site_id)),'[]') into times_
  from public.time_entries t join public.shift_assignments a on a.id=t.assignment_id and a.company_id=p_company_id
   left join public.shift_templates s on s.company_id=p_company_id and s.code=a.shift_code
  where t.company_id=p_company_id and a.status<>'CANCELLED'
   and ((a.starts_at>=p_start_date::timestamp at time zone tz and a.starts_at<(p_end_date+1)::timestamp at time zone tz)
    or (t.actual_start<(p_end_date+1)::timestamp at time zone tz and t.actual_end>p_start_date::timestamp at time zone tz));
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'employee_id',q.employee_id,'start',q.started_at,
   'end',q.ended_at,'site_id',t.site_id,'terminal',t.name,'status',case when q.ended_at is null then 'qr_running' else 'qr_booked' end,
   'break_minutes',0,'shift',null)),'[]') into qr_
  from public.time_qr_independent_shifts q left join public.time_qr_terminals t on t.id=q.terminal_id and t.company_id=p_company_id
  where q.company_id=p_company_id and q.started_at<(p_end_date+1)::timestamp at time zone tz
   and coalesce(q.ended_at,now())>p_start_date::timestamp at time zone tz;
 end if;
 select jsonb_build_object('company_id',p_company_id,'timezone',tz,'today',today_,'as_of',now(),
  'from',p_start_date,'to',p_end_date,'can_time',can_time,'employees',people_,'times',times_,'qr',qr_,
  'company_name',(select name from public.companies where id=p_company_id),
  'settings',jsonb_build_object('target_method',coalesce(settings_.target_method,'WEEKDAYS_5'),
    'target_method_from',settings_.target_method_from,'federal_state',coalesce(settings_.federal_state,'DE')),
  'closed_month',exists(select 1 from public.time_month_closures where company_id=p_company_id and month_start=date_trunc('month',p_start_date)::date and status='CLOSED'),
  'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'is_active',s.is_active) order by s.name) from public.company_locations s where s.company_id=p_company_id),'[]'),
  'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date between p_start_date and p_end_date),'[]'),
  'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'legacy_id',a.legacy_id,'employee_id',a.employee_id,
    'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,'date',(a.starts_at at time zone tz)::date,
    'break_minutes',a.break_minutes,'status',a.status,'site_id',t.site_id,
    'extra',exists(select 1 from public.open_shift_market_claims m where m.company_id=p_company_id and m.assignment_id=a.id and m.status='APPLIED')))
   from public.shift_assignments a left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where a.company_id=p_company_id and a.status<>'CANCELLED' and a.starts_at>=(p_start_date-1)::timestamp at time zone tz
    and a.starts_at<(p_end_date+2)::timestamp at time zone tz),'[]'),
  'absences',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'from',a.start_date,'to',a.end_date,
    'type',a.absence_type,'status',a.status,'full_day',a.full_day,'start_time',a.start_time,'end_time',a.end_time))
   from public.absences a where a.company_id=p_company_id and a.start_date<=p_end_date+1 and a.end_date>=p_start_date-1
    and a.status not in ('Abgelehnt','REJECTED','CANCELLED')),'[]')) into result_;
 return private.sf_absence_payload_for_role(p_company_id, result_);
end $function$
;

CREATE OR REPLACE FUNCTION public.manager_time_report_bundle(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date;
  v_snapshot jsonb; v_tz text; v_state text; v_employees jsonb; v_details jsonb; v_holidays jsonb; v_company jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  if p_employee_id is not null and not exists(select 1 from public.employees where id=p_employee_id and company_id=p_company_id) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED';
  if v_snapshot is not null then
    v_snapshot:=coalesce(v_snapshot->'report',v_snapshot);
    if p_employee_id is not null then
      v_snapshot:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
      v_snapshot:=jsonb_set(v_snapshot,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
    end if;
    return private.sf_absence_payload_for_role(p_company_id, v_snapshot);
  end if;
  select coalesce(timezone,'Europe/Berlin') into v_tz from public.companies where id=p_company_id;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_employees
    from private.sf_time_account_rows(p_company_id,v_month,p_employee_id) r;
  select coalesce(to_jsonb(c),'{}'::jsonb) into v_company from public.companies c where c.id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.employee_name,x.work_date),'[]'::jsonb) into v_details
  from (
    select e.id employee_id,trim(concat_ws(' ',e.first_name,e.last_name)) employee_name,
      coalesce(e.personnel_no,'') personnel_no,g.day::date work_date,
      coalesce(s.shift_codes,'') shift_codes,coalesce(s.planned_times,'') planned_times,
      case when extract(isodow from g.day) between 1 and 5 and h.name is null
        then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end target_minutes,
      coalesce((select string_agg(to_char(lower(x.paid_range) at time zone v_tz,'HH24:MI')||'–'||to_char(upper(x.paid_range) at time zone v_tz,'HH24:MI'),', ' order by lower(x.paid_range)) from private.sf_paid_time_ranges(p_company_id,e.id,g.day::date::timestamp at time zone v_tz,(g.day::date+1)::timestamp at time zone v_tz) x),s.actual_times,'') actual_times,private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date) confirmed_actual_minutes,
      coalesce(a.absence_types,'') absence_types,
      private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state) absence_credit_minutes,
      coalesce(h.name,'') holiday_name,concat_ws(', ',nullif(s.time_statuses,''),case when exists(select 1 from public.time_qr_independent_shifts q where q.company_id=p_company_id and q.employee_id=e.id and q.started_at<(g.day::date+1)::timestamp at time zone v_tz and coalesce(q.ended_at,statement_timestamp())>g.day::date::timestamp at time zone v_tz) then 'QR' end) time_statuses,
      private.sf_confirmed_work_minutes(e.id,g.day::date,g.day::date)+private.sf_absence_credit_minutes(e.id,g.day::date,g.day::date,
        coalesce(cfg.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]),
        round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer,v_state)-
        case when extract(isodow from g.day) between 1 and 5 and h.name is null
          then round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer else 0 end day_balance_minutes
    from public.employees e
    cross join generate_series(v_month,v_end,interval '1 day') g(day)
    left join public.time_account_settings cfg on cfg.company_id=e.company_id
    left join private.sf_public_holidays(extract(year from v_month)::integer,v_state) h on h.holiday_date=g.day::date
    left join lateral (
      select string_agg(distinct sa.shift_code,', ' order by sa.shift_code) shift_codes,
        string_agg(to_char(sa.starts_at,'HH24:MI')||'-'||to_char(sa.ends_at,'HH24:MI'),', ' order by to_char(sa.starts_at,'HH24:MI')) planned_times,
        string_agg(case when te.actual_start is not null then to_char(te.actual_start,'HH24:MI')||'-'||to_char(te.actual_end,'HH24:MI') end,', ' order by to_char(te.actual_start,'HH24:MI')) actual_times,
        string_agg(distinct coalesce(te.status,'open'),', ' order by coalesce(te.status,'open')) time_statuses,
        coalesce(sum(case when te.status='confirmed' then greatest(0,
          round(extract(epoch from (te.actual_end-te.actual_start))/60)::integer-te.break_minutes) else 0 end),0)::integer confirmed_minutes
      from public.shift_assignments sa left join public.time_entries te on te.assignment_id=sa.id
      where sa.employee_id=e.id and sa.company_id=e.company_id and sa.status<>'CANCELLED' and sa.starts_at::date=g.day::date
    ) s on true
    left join lateral (
      select string_agg(distinct ab.absence_type,', ' order by ab.absence_type) absence_types
      from public.absences ab where ab.employee_id=e.id and ab.company_id=e.company_id
        and ab.status in ('Genehmigt','Erfasst','APPROVED') and g.day::date between ab.start_date and ab.end_date
    ) a on true
    where e.company_id=p_company_id and e.status='active'
      and (p_employee_id is null or e.id=p_employee_id)
      and g.day::date>=coalesce(e.start_date,g.day::date)
      and g.day::date<=coalesce(e.contract_end,g.day::date)
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) order by h.holiday_date),'[]'::jsonb)
    into v_holidays from private.sf_public_holidays(extract(year from v_month)::integer,v_state) h
    where h.holiday_date between v_month and v_end;
  return private.sf_absence_payload_for_role(p_company_id, jsonb_build_object('company',v_company,'month_start',v_month,'federal_state',v_state,
    'employees',v_employees,'details',v_details,'holidays',v_holidays));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_monthly_time_accounts(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_rows jsonb; v_settings jsonb; v_snapshot jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select report_snapshot into v_snapshot from public.time_month_closures where company_id=p_company_id and month_start=v_month and status='CLOSED';
  if v_snapshot is not null and v_snapshot ? 'accounts' then return private.sf_absence_payload_for_role(p_company_id, v_snapshot->'accounts'); end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from private.sf_time_account_rows(p_company_id,v_month,null) r;
  select coalesce(
    (select to_jsonb(s) from public.time_account_settings s where s.company_id=p_company_id),
    jsonb_build_object('company_id',p_company_id,'account_start_date',v_month,
      'credited_absence_types',array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[],'federal_state','DE')
  ) into v_settings;
  return private.sf_absence_payload_for_role(p_company_id, jsonb_build_object('month_start',v_month,'settings',v_settings,'rows',v_rows));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sf_notify_absence_inserted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_name text; v_range text;
begin
  if new.request_source='EMPLOYEE' and new.status='Beantragt' then
    select trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_name from public.employees e where e.id=new.employee_id;
    v_range := to_char(new.start_date,'DD.MM.YYYY') || case when new.end_date<>new.start_date then '–'||to_char(new.end_date,'DD.MM.YYYY') else '' end;
    perform private.sf_notify_managers(new.company_id,'ABSENCE_REQUESTED','Neuer Abwesenheitsantrag',coalesce(nullif(v_name,''),'Mitarbeiter')||' hat eine Abwesenheit für '||v_range||' beantragt.','absence','absence',new.id,jsonb_build_object('employeeId',new.employee_id,'startDate',new.start_date,'endDate',new.end_date));
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.sf_notify_absence_decided()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_user uuid; v_name text; v_range text; v_title text; v_msg text; v_conflicts integer;
begin
  if old.status='Beantragt' and new.status in ('Genehmigt','Erfasst','Abgelehnt') then
    select e.auth_user_id, trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) into v_user,v_name from public.employees e where e.id=new.employee_id;
    v_range := to_char(new.start_date,'DD.MM.YYYY') || case when new.end_date<>new.start_date then '–'||to_char(new.end_date,'DD.MM.YYYY') else '' end;
    v_title := 'Abwesenheitsantrag bearbeitet';
    v_msg := 'Dein Abwesenheitsantrag wurde bearbeitet. Details findest du im Mitarbeiterportal.';
    perform private.sf_put_notification(new.company_id,v_user,new.employee_id,'ABSENCE_DECISION',v_title,v_msg,'employee-absences','absence',new.id,jsonb_build_object('startDate',new.start_date,'endDate',new.end_date));

    if new.status in ('Genehmigt','Erfasst') then
      select count(*) into v_conflicts
      from public.shift_assignments s
      where s.company_id=new.company_id and s.employee_id=new.employee_id and s.status<>'CANCELLED'
        and (s.starts_at at time zone coalesce((select c.timezone from public.companies c where c.id=new.company_id),'Europe/Berlin'))::date <= new.end_date
        and (s.ends_at at time zone coalesce((select c.timezone from public.companies c where c.id=new.company_id),'Europe/Berlin'))::date >= new.start_date;
      if v_conflicts>0 then
        perform private.sf_notify_managers(new.company_id,'ABSENCE_CONFLICT','Planungskonflikt durch Abwesenheit',coalesce(nullif(v_name,''),'Mitarbeiter')||' hat jetzt eine wirksame Abwesenheit. '||v_conflicts||' bereits geplante Schicht'||case when v_conflicts=1 then ' ist' else 'en sind' end||' betroffen.','schedule','absence',new.id,jsonb_build_object('employeeId',new.employee_id,'conflictCount',v_conflicts));
      end if;
    end if;
  end if;
  return new;
end
$function$
;


-- Keep availability enforcement effective even though planners cannot select medical records.
create or replace function private.sf_approved_absence_overlaps(p_company_id uuid,p_employee_id uuid,
 p_starts_at timestamptz,p_ends_at timestamptz,v_timezone text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare result_ boolean;
begin
 if not private.sf_is_manager(p_company_id,false) and not exists (
 select 1 from public.employees e where e.company_id=p_company_id and e.id=p_employee_id
 and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
 ) then raise exception 'Nicht berechtigt' using errcode='42501'; end if;
 select exists(
    select 1
    from public.absences a
    where a.company_id=p_company_id
      and a.employee_id=p_employee_id
      and a.status in ('Genehmigt','Erfasst')
      and (
        (
          a.full_day
          and tstzrange(
            (a.start_date::timestamp at time zone v_timezone),
            ((a.end_date + 1)::timestamp at time zone v_timezone),
            '[)'
          ) && tstzrange(p_starts_at,p_ends_at,'[)')
        )
        or
        (
          not a.full_day
          and a.start_time is not null
          and a.end_time is not null
          and exists(
            select 1
            from generate_series(a.start_date,a.end_date,interval '1 day') g(day)
            where tstzrange(
              ((g.day::date + a.start_time)::timestamp at time zone v_timezone),
              (
                case
                  when a.end_time <= a.start_time
                    then ((g.day::date + 1 + a.end_time)::timestamp at time zone v_timezone)
                  else ((g.day::date + a.end_time)::timestamp at time zone v_timezone)
                end
              ),
              '[)'
            ) && tstzrange(p_starts_at,p_ends_at,'[)')
          )
        )
      )
  ) into result_;
 return result_;
end;
$$;
revoke all on function private.sf_approved_absence_overlaps(uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function private.sf_approved_absence_overlaps(uuid,uuid,timestamptz,timestamptz,text) to authenticated;
CREATE OR REPLACE FUNCTION public.assert_standard_shift_rules(p_company_id uuid, p_employee_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_ignore_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_min_rest numeric(5,2):=11;
  v_max_shift numeric(5,2):=10;
  v_prev_end timestamptz;
  v_next_start timestamptz;
  v_duration numeric;
  v_timezone text := 'Europe/Berlin';
begin
  if p_ends_at<=p_starts_at then raise exception 'Invalid shift interval'; end if;

  select c.timezone into v_timezone
  from public.companies c
  where c.id=p_company_id;
  v_timezone:=coalesce(v_timezone,'Europe/Berlin');

  select standard_min_rest_hours,standard_max_shift_hours
    into v_min_rest,v_max_shift
  from public.company_compliance_policy
  where company_id=p_company_id;
  v_min_rest:=coalesce(v_min_rest,11);
  v_max_shift:=coalesce(v_max_shift,10);
  v_duration:=extract(epoch from(p_ends_at-p_starts_at))/3600.0;

  if v_duration>v_max_shift then raise exception 'Standard maximum shift duration exceeded'; end if;

  if exists(
    select 1
    from public.shift_assignments s
    where s.company_id=p_company_id
      and s.employee_id=p_employee_id
      and s.status<>'CANCELLED'
      and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
      and tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(p_starts_at,p_ends_at,'[)')
  ) then
    raise exception 'Shift overlaps another assignment';
  end if;

  -- Nur tatsächlich wirksame Abwesenheiten blockieren die Planung.
  -- Beantragte oder abgelehnte Abwesenheiten sind bewusst nicht enthalten.
  if private.sf_approved_absence_overlaps(p_company_id,p_employee_id,p_starts_at,p_ends_at,v_timezone) then
    raise exception 'Shift overlaps an approved absence';
  end if;

  select max(s.ends_at) into v_prev_end
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.ends_at<=p_starts_at;
  if v_prev_end is not null and extract(epoch from(p_starts_at-v_prev_end))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met before shift';
  end if;

  select min(s.starts_at) into v_next_start
  from public.shift_assignments s
  where s.company_id=p_company_id
    and s.employee_id=p_employee_id
    and s.status<>'CANCELLED'
    and (p_ignore_assignment_id is null or s.id<>p_ignore_assignment_id)
    and s.starts_at>=p_ends_at;
  if v_next_start is not null and extract(epoch from(v_next_start-p_ends_at))/3600.0<v_min_rest then
    raise exception 'Standard minimum rest period not met after shift';
  end if;
end
$function$
;
CREATE OR REPLACE FUNCTION public.manager_time_report_bundle_live(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_month_start date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_month_end date := (date_trunc('month',coalesce(p_month,current_date)) + interval '1 month - 1 day')::date;
  v_state text;
  v_types text[];
  v_company_name text;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
      and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Nicht berechtigt'; end if;

  if p_employee_id is not null and not exists (
    select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id
  ) then raise exception 'Mitarbeiter gehört nicht zum Unternehmen'; end if;

  select c.name into v_company_name from public.companies c where c.id=p_company_id;
  select coalesce(s.federal_state,'DE'),coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[])
    into v_state,v_types
  from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  v_types:=coalesce(v_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]);

  with selected_employees as (
    select e.*
    from public.employees e
    where e.company_id=p_company_id
      and (p_employee_id is null or e.id=p_employee_id)
      and (e.start_date is null or e.start_date<=v_month_end)
      and (e.contract_end is null or e.contract_end>=v_month_start)
  ), summaries as (
    select e.id,e.last_name,e.first_name,private.time_account_row_v1(e.id,v_month_start) as summary
    from selected_employees e
  ), all_days as (
    select e.id as employee_id,e.company_id,e.first_name,e.last_name,e.personnel_no,e.employment,e.weekly_hours,
      e.start_date,e.contract_end,
      round(e.weekly_hours*60/5.0)::int as daily_target_minutes,
      d::date as work_date,
      private.german_holiday_name(d::date,v_state) as holiday_name
    from selected_employees e
    cross join lateral generate_series(v_month_start,v_month_end,interval '1 day') d
    where d::date>=coalesce(e.start_date,v_month_start)
      and d::date<=coalesce(e.contract_end,v_month_end)
  ), planned as (
    select ad.employee_id,ad.work_date,
      string_agg(sa.shift_code,', ' order by sa.starts_at) as shift_codes,
      string_agg(to_char(timezone('Europe/Berlin',sa.starts_at),'HH24:MI')||'–'||to_char(timezone('Europe/Berlin',sa.ends_at),'HH24:MI'),', ' order by sa.starts_at) as planned_times,
      coalesce(sum(sa.break_minutes),0)::int as planned_break_minutes,
      coalesce(sum(greatest(0,round(extract(epoch from (sa.ends_at-sa.starts_at))/60.0)::int-sa.break_minutes)),0)::int as planned_net_minutes
    from all_days ad
    join public.shift_assignments sa on sa.employee_id=ad.employee_id and sa.company_id=ad.company_id
      and (timezone('Europe/Berlin',sa.starts_at))::date=ad.work_date
      and sa.status='PUBLISHED'
    group by ad.employee_id,ad.work_date
  ), actuals as (
    select ad.employee_id,ad.work_date,
      string_agg(case when te.actual_start is not null and te.actual_end is not null
        then to_char(timezone('Europe/Berlin',te.actual_start),'HH24:MI')||'–'||to_char(timezone('Europe/Berlin',te.actual_end),'HH24:MI') else null end,
        ', ' order by sa.starts_at) as actual_times,
      string_agg(coalesce(te.status,'open'),', ' order by sa.starts_at) as time_statuses,
      coalesce(sum(case when te.status='confirmed' then te.break_minutes else 0 end),0)::int as actual_break_minutes,
      coalesce(sum(case when te.status='confirmed' and te.actual_start is not null and te.actual_end is not null
        then greatest(0,round(extract(epoch from (te.actual_end-te.actual_start))/60.0)::int-te.break_minutes) else 0 end),0)::int as confirmed_actual_minutes,
      count(te.assignment_id) filter (where te.status in ('recorded','correction_requested'))::int as pending_entries
    from all_days ad
    join public.shift_assignments sa on sa.employee_id=ad.employee_id and sa.company_id=ad.company_id
      and (timezone('Europe/Berlin',sa.starts_at))::date=ad.work_date
      and sa.status='PUBLISHED'
    left join public.time_entries te on te.assignment_id=sa.id
    group by ad.employee_id,ad.work_date
  ), absence_raw as (
    select ad.employee_id,ad.work_date,ad.daily_target_minutes,a.absence_type,
      case
        when ad.holiday_name is not null or extract(isodow from ad.work_date)::int not between 1 and 5 then 0
        when a.full_day then ad.daily_target_minutes
        when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
          then least(ad.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int))
        else 0 end as credit_minutes
    from all_days ad
    join public.absences a on a.employee_id=ad.employee_id and a.company_id=ad.company_id
      and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(v_types)
      and ad.work_date between a.start_date and a.end_date
  ), absence_day as (
    select employee_id,work_date,
      string_agg(distinct absence_type,', ' order by absence_type) as absence_types,
      least(max(daily_target_minutes),sum(credit_minutes))::int as absence_credit_minutes
    from absence_raw group by employee_id,work_date
  ), details as (
    select ad.employee_id,trim(ad.first_name||' '||ad.last_name) as employee_name,ad.personnel_no,
      ad.work_date,to_char(ad.work_date,'Dy') as weekday,
      case when extract(isodow from ad.work_date)::int between 1 and 5 and ad.holiday_name is null then ad.daily_target_minutes else 0 end::int as target_minutes,
      coalesce(p.shift_codes,'') as shift_codes,coalesce(p.planned_times,'') as planned_times,
      coalesce(p.planned_break_minutes,0) as planned_break_minutes,coalesce(p.planned_net_minutes,0) as planned_net_minutes,
      coalesce(ac.actual_times,'') as actual_times,coalesce(ac.actual_break_minutes,0) as actual_break_minutes,
      coalesce(ac.confirmed_actual_minutes,0) as confirmed_actual_minutes,coalesce(ac.time_statuses,'') as time_statuses,
      coalesce(ac.pending_entries,0) as pending_entries,
      coalesce(ab.absence_types,'') as absence_types,coalesce(ab.absence_credit_minutes,0) as absence_credit_minutes,
      coalesce(ad.holiday_name,'') as holiday_name,
      (coalesce(ac.confirmed_actual_minutes,0)+coalesce(ab.absence_credit_minutes,0)-
       case when extract(isodow from ad.work_date)::int between 1 and 5 and ad.holiday_name is null then ad.daily_target_minutes else 0 end)::int as day_balance_minutes
    from all_days ad
    left join planned p on p.employee_id=ad.employee_id and p.work_date=ad.work_date
    left join actuals ac on ac.employee_id=ad.employee_id and ac.work_date=ad.work_date
    left join absence_day ab on ab.employee_id=ad.employee_id and ab.work_date=ad.work_date
  )
  select jsonb_build_object(
    'company',jsonb_build_object('id',p_company_id,'name',coalesce(v_company_name,'SchichtFunk')),
    'month_start',v_month_start,'month_end',v_month_end,
    'federal_state',v_state,
    'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.holiday_name) order by h.holiday_date)
      from private.german_public_holidays(extract(year from v_month_start)::int,v_state) h
      where h.holiday_date between v_month_start and v_month_end),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(s.summary order by s.last_name,s.first_name) from summaries s),'[]'::jsonb),
    'details',coalesce((select jsonb_agg(to_jsonb(d) order by d.employee_name,d.work_date) from details d),'[]'::jsonb)
  ) into v_result;

  return private.sf_absence_payload_for_role(p_company_id, v_result);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.manager_time_report_bundle_snapshot_impl(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_result jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_employee_id is not null and not exists(select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id) then
    raise exception 'Mitarbeiter gehört nicht zum Unternehmen';
  end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is null then
    return private.sf_absence_payload_for_role(p_company_id, public.manager_time_report_bundle_live(p_company_id,v_month,p_employee_id));
  end if;
  if p_employee_id is null then
    return private.sf_absence_payload_for_role(p_company_id, v_snapshot || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED')));
  end if;
  v_result:=jsonb_set(v_snapshot,'{employees}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'employees') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  v_result:=jsonb_set(v_result,'{details}',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_snapshot->'details') x where x->>'employee_id'=p_employee_id::text),'[]'::jsonb));
  return private.sf_absence_payload_for_role(p_company_id, v_result || jsonb_build_object('month_closure',jsonb_build_object('status','CLOSED')));
end;
$function$
;
CREATE OR REPLACE FUNCTION private.manager_monthly_time_accounts_impl(p_company_id uuid, p_month date)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  r record;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Nicht berechtigt'; end if;
  select c.report_snapshot into v_snapshot from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED';
  if v_snapshot is not null then
    for r in select value as row from jsonb_array_elements(v_snapshot->'employees') loop return next private.sf_absence_payload_for_role(p_company_id,r.row); end loop;
    return;
  end if;
  for r in select e.id from public.employees e where e.company_id=p_company_id
    and (e.start_date is null or e.start_date <= (v_month+interval '1 month - 1 day')::date)
    and (e.contract_end is null or e.contract_end >= v_month)
    order by e.last_name,e.first_name
  loop return next private.sf_absence_payload_for_role(p_company_id,private.time_account_row_v1(r.id,v_month)); end loop;
  return;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.manager_close_time_month(p_company_id uuid, p_month date, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_check jsonb; v_snapshot jsonb; v_result jsonb;
begin
  perform private.personnel_admin_role(p_company_id);
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren duerfen Monate abschliessen'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||v_month::text,0));
  v_check:=public.manager_time_month_status(p_company_id,v_month);
  if not coalesce((v_check->>'can_close')::boolean,false) then raise exception 'Monat kann wegen offener Pruefpunkte nicht abgeschlossen werden'; end if;
  v_snapshot:=jsonb_build_object('accounts',public.manager_monthly_time_accounts(p_company_id,v_month),
    'report',public.manager_time_report_bundle(p_company_id,v_month,null),'closed_at',now());
  insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,close_note,report_snapshot,updated_at)
  values(p_company_id,v_month,'CLOSED',1,now(),auth.uid(),left(coalesce(p_note,''),1000),v_snapshot,now())
  on conflict(company_id,month_start) do update set status='CLOSED',revision=public.time_month_closures.revision+1,
    closed_at=now(),closed_by=auth.uid(),close_note=excluded.close_note,report_snapshot=excluded.report_snapshot,
    reopened_at=null,reopened_by=null,reopen_note='',updated_at=now()
  returning to_jsonb(time_month_closures.*) into v_result;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_MONTH_CLOSED','time_month',p_company_id,auth.uid(),'ADMIN',v_result,jsonb_build_object('monthStart',v_month));
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.manager_reopen_time_month(p_company_id uuid, p_month date, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_result jsonb;
begin
  perform private.personnel_admin_role(p_company_id);
  if not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren duerfen Monate oeffnen'; end if;
  if length(trim(coalesce(p_note,'')))<3 then raise exception 'Bitte einen Grund fuer die Wiedereroeffnung angeben'; end if;
  update public.time_month_closures set status='OPEN',revision=revision+1,reopen_note=left(p_note,1000),
    reopened_at=now(),reopened_by=auth.uid(),updated_at=now()
    where company_id=p_company_id and month_start=v_month and status='CLOSED'
  returning to_jsonb(time_month_closures.*) into v_result;
  if v_result is null then raise exception 'Kein abgeschlossener Monat gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(p_company_id,'TIME_MONTH_REOPENED','time_month',p_company_id,auth.uid(),'ADMIN',v_result,jsonb_build_object('monthStart',v_month,'reason',p_note));
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.manager_close_time_month_impl(p_company_id uuid, p_month date, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_missing int;
  v_pending_abs int;
  v_snapshot jsonb;
  v_revision int;
begin
  perform private.personnel_admin_role(p_company_id);
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN') limit 1;
  if v_role is null then raise exception 'Nur OWNER/ADMIN dürfen Monate abschließen'; end if;
  if v_end>=current_date then raise exception 'Der Monat kann erst nach Monatsende abgeschlossen werden'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||v_month::text,0));
  if exists(select 1 from public.time_month_closures c where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED') then
    raise exception 'Dieser Monat ist bereits abgeschlossen';
  end if;

  select count(*)::int into v_missing
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.status='confirmed'
  where sa.company_id=p_company_id and sa.status='PUBLISHED'
    and (timezone('Europe/Berlin',sa.starts_at))::date between v_month and v_end
    and te.assignment_id is null;
  if v_missing>0 then raise exception 'Monatsabschluss nicht möglich: % veröffentlichte Schicht(en) ohne bestätigte Ist-Zeit',v_missing; end if;

  select count(*)::int into v_pending_abs from public.absences a
  where a.company_id=p_company_id and a.status='Beantragt'
    and a.start_date<=v_end and a.end_date>=v_month;
  if v_pending_abs>0 then raise exception 'Monatsabschluss nicht möglich: % offene Abwesenheitsanträge',v_pending_abs; end if;

  v_snapshot:=public.manager_time_report_bundle(p_company_id,v_month,null);

  insert into public.time_month_closures(company_id,month_start,status,revision,closed_at,closed_by,close_note,reopened_at,reopened_by,reopen_note,report_snapshot,created_at,updated_at)
  values(p_company_id,v_month,'CLOSED',1,now(),v_uid,left(coalesce(p_note,''),2000),null,null,'',v_snapshot,now(),now())
  on conflict(company_id,month_start) do update set
    status='CLOSED',revision=public.time_month_closures.revision+1,closed_at=now(),closed_by=v_uid,
    close_note=left(coalesce(p_note,''),2000),report_snapshot=v_snapshot,updated_at=now()
  returning revision into v_revision;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(p_company_id,'TIME_MONTH_CLOSED','TIME_MONTH',p_company_id,v_uid,v_role,
    jsonb_build_object('status','OPEN'),jsonb_build_object('status','CLOSED','revision',v_revision),
    jsonb_build_object('monthStart',v_month,'monthEnd',v_end,'note',left(coalesce(p_note,''),2000)));

  return jsonb_build_object('status','CLOSED','month_start',v_month,'month_end',v_end,'revision',v_revision,'closed_at',now());
end;
$function$
;
CREATE OR REPLACE FUNCTION private.employee_submit_absence_request_impl(p_absence_type text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_full_day boolean DEFAULT true, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_time_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_id uuid;
  v_type text := btrim(coalesce(p_absence_type,''));
begin
  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if v_type not in ('Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office','Frei','Fortbildung','Sperrzeit','Sonstiges') then
    raise exception 'Ungültige Abwesenheitsart';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Bitte einen gültigen Zeitraum wählen';
  end if;
  if (p_end_date - p_start_date) > 366 then raise exception 'Der Zeitraum ist zu lang'; end if;
  if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then
    raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.auth_user_id=v_uid and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null
  limit 1;
  if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;

  -- Serialize absence submissions for the same employee. Without this lock,
  -- concurrent requests can both pass the overlap check before either inserts.
  perform pg_advisory_xact_lock(
    hashtextextended('absence-request:' || v_employee.id::text, 0)
  );

  if exists (
    select 1 from public.absences a
    where a.employee_id=v_employee.id
      and a.status in ('Beantragt','Genehmigt','Erfasst')
      and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag';
  end if;

  insert into public.absences(
    company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,
    start_time,end_time,time_note,note,request_source,requested_by,requested_at
  ) values (
    v_employee.company_id,v_employee.id,null,p_start_date,p_end_date,v_type,'Beantragt',coalesce(p_full_day,true),
    case when coalesce(p_full_day,true) then null else p_start_time end,
    case when coalesce(p_full_day,true) then null else p_end_time end,
    coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',v_uid,now()
  ) returning id into v_id;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_employee.company_id,'ABSENCE_REQUEST_CREATED','absence',v_id,v_uid,'EMPLOYEE',
    jsonb_build_object('status','Beantragt','type',v_type,'startDate',p_start_date,'endDate',p_end_date),
    jsonb_build_object('source','EMPLOYEE_PORTAL'));

  return v_id;
end
$function$
;

-- Remove sensitive previews already persisted in notification histories.
-- Keep the records and their read state; detailed decisions remain in the protected absence record.
update public.notifications set title='Neuer Abwesenheitsantrag',
 message='Ein neuer Abwesenheitsantrag liegt vor. Details sind für die Personalverwaltung verfügbar.',
 metadata=coalesce(metadata,'{}'::jsonb)-'type'-'note'-'reviewNote'-'review_note'
where kind='ABSENCE_REQUESTED';
update public.notifications set title='Abwesenheitsantrag bearbeitet',
 message='Dein Abwesenheitsantrag wurde bearbeitet. Details findest du im Mitarbeiterportal.',
 metadata=coalesce(metadata,'{}'::jsonb)-'type'-'note'-'reviewNote'-'review_note'-'status'
where kind='ABSENCE_DECISION';

-- Enable exactly the eight audited stage-3 RPCs; their shared guard also protects direct calls.
update private.sf_mfa_protected_rpcs set enabled=true,updated_at=now() where function_name in (
 'manager_personnel_file_bundle','manager_update_personnel_details',
 'manager_save_personnel_qualification','manager_delete_personnel_qualification',
 'manager_register_personnel_document','manager_delete_personnel_document',
 'manager_add_personnel_note','manager_personnel_deadline_dashboard');
do $$ begin
 if (select count(*) from private.sf_mfa_protected_rpcs where enabled and function_name in (
 'manager_personnel_file_bundle','manager_update_personnel_details',
 'manager_save_personnel_qualification','manager_delete_personnel_qualification',
 'manager_register_personnel_document','manager_delete_personnel_document',
 'manager_add_personnel_note','manager_personnel_deadline_dashboard')) <> 8 then
 raise exception 'Expected exactly eight enabled personnel MFA requirements'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
