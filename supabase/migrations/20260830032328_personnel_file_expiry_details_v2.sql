create or replace function private.manager_personnel_file_bundle_impl(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_company uuid;
  v_role text;
  v_result jsonb;
begin
  select e.company_id into v_company from public.employees e where e.id=p_employee_id;
  if v_company is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  v_role := private.personnel_admin_role(v_company);
  if v_role is null then raise exception 'Personalakte ist nur für OWNER/ADMIN freigegeben'; end if;

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id',e.id,'first_name',e.first_name,'last_name',e.last_name,'personnel_no',e.personnel_no,
      'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,'start_date',e.start_date,
      'contract_end',e.contract_end,'birth_date',e.birth_date,'status',e.status,'email',e.email,'phone',e.phone,
      'address',e.address,'zip',e.zip,'city',e.city,'shift_permissions',e.shift_permissions,
      'base_qualifications',e.qualifications,'access_status',e.access_status,
      'details', coalesce((select to_jsonb(d) - 'company_id' - 'updated_by' from public.employee_personnel_details d where d.employee_id=e.id),'{}'::jsonb)
    ),
    'qualifications', coalesce((select jsonb_agg(
      (to_jsonb(q) - 'company_id' - 'created_by' - 'updated_by') || jsonb_build_object(
        'validity_status', case when q.expires_on is null then 'NO_EXPIRY' when q.expires_on < current_date then 'EXPIRED' when q.expires_on <= current_date + 60 then 'EXPIRING' else 'VALID' end,
        'days_until_expiry', case when q.expires_on is null then null else q.expires_on-current_date end,
        'expiry_level', case when q.expires_on is null then 'NONE' when q.expires_on < current_date then 'EXPIRED' when q.expires_on <= current_date + 30 then 'CRITICAL' when q.expires_on <= current_date + 60 then 'WARNING' when q.expires_on <= current_date + 90 then 'UPCOMING' else 'VALID' end
      )
      order by coalesce(q.expires_on,'9999-12-31'::date),q.title)
      from public.employee_personnel_qualifications q where q.employee_id=e.id),'[]'::jsonb),
    'documents', coalesce((select jsonb_agg(
      (to_jsonb(d) - 'company_id' - 'uploaded_by') || jsonb_build_object(
        'validity_status', case when d.expires_on is null then 'NO_EXPIRY' when d.expires_on < current_date then 'EXPIRED' when d.expires_on <= current_date + 60 then 'EXPIRING' else 'VALID' end,
        'days_until_expiry', case when d.expires_on is null then null else d.expires_on-current_date end,
        'expiry_level', case when d.expires_on is null then 'NONE' when d.expires_on < current_date then 'EXPIRED' when d.expires_on <= current_date + 30 then 'CRITICAL' when d.expires_on <= current_date + 60 then 'WARNING' when d.expires_on <= current_date + 90 then 'UPCOMING' else 'VALID' end
      )
      order by d.created_at desc)
      from public.employee_personnel_documents d where d.employee_id=e.id),'[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) - 'company_id' order by n.created_at desc)
      from public.employee_personnel_notes n where n.employee_id=e.id),'[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'event_type',a.event_type,'entity_type',a.entity_type,'entity_id',a.entity_id,
      'actor_role',a.actor_role,'metadata',a.metadata,'created_at',a.created_at) order by a.created_at desc)
      from (select * from public.audit_events a
            where a.company_id=v_company
              and (a.entity_id=e.id or a.metadata->>'employeeId'=e.id::text)
            order by a.created_at desc limit 80) a),'[]'::jsonb)
  ) into v_result
  from public.employees e where e.id=p_employee_id;
  return v_result;
end;
$function$;;
