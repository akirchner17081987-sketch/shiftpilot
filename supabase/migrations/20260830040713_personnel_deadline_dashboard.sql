create or replace function private.manager_personnel_deadline_dashboard_impl(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_role text;
  v_result jsonb;
begin
  v_role := private.personnel_admin_role(p_company_id);
  if v_role is null then
    raise exception 'Nur OWNER/ADMIN dürfen das Fristen-Dashboard öffnen';
  end if;

  with rows as (
    select
      q.id as entity_id,
      'QUALIFICATION'::text as entity_type,
      q.employee_id,
      trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) as employee_name,
      e.personnel_no,
      e.status as employee_status,
      e.role as employee_role,
      q.title,
      q.category,
      q.expires_on,
      case when q.expires_on is null then null else (q.expires_on - current_date)::int end as days_until_expiry
    from public.employee_personnel_qualifications q
    join public.employees e on e.id=q.employee_id and e.company_id=q.company_id
    where q.company_id=p_company_id

    union all

    select
      d.id,
      'DOCUMENT'::text,
      d.employee_id,
      trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')),
      e.personnel_no,
      e.status,
      e.role,
      d.title,
      d.category,
      d.expires_on,
      case when d.expires_on is null then null else (d.expires_on - current_date)::int end
    from public.employee_personnel_documents d
    join public.employees e on e.id=d.employee_id and e.company_id=d.company_id
    where d.company_id=p_company_id
  ), tagged as (
    select *,
      case
        when expires_on is null then 'NONE'
        when days_until_expiry < 0 then 'EXPIRED'
        when days_until_expiry <= 30 then 'D30'
        when days_until_expiry <= 60 then 'D60'
        when days_until_expiry <= 90 then 'D90'
        else 'LATER'
      end as urgency
    from rows
  )
  select jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'total', count(*),
      'expired', count(*) filter (where urgency='EXPIRED'),
      'd30', count(*) filter (where urgency='D30'),
      'd60', count(*) filter (where urgency='D60'),
      'd90', count(*) filter (where urgency='D90'),
      'later', count(*) filter (where urgency='LATER'),
      'no_expiry', count(*) filter (where urgency='NONE'),
      'qualifications', count(*) filter (where entity_type='QUALIFICATION'),
      'documents', count(*) filter (where entity_type='DOCUMENT'),
      'employees', count(distinct employee_id)
    ),
    'rows', coalesce(jsonb_agg(
      jsonb_build_object(
        'entity_id',entity_id,
        'entity_type',entity_type,
        'employee_id',employee_id,
        'employee_name',employee_name,
        'personnel_no',personnel_no,
        'employee_status',employee_status,
        'employee_role',employee_role,
        'title',title,
        'category',category,
        'expires_on',expires_on,
        'days_until_expiry',days_until_expiry,
        'urgency',urgency
      )
      order by (expires_on is null), expires_on, employee_name, title
    ), '[]'::jsonb)
  ) into v_result
  from tagged;

  return coalesce(v_result, jsonb_build_object(
    'generated_at',now(),
    'stats',jsonb_build_object('total',0,'expired',0,'d30',0,'d60',0,'d90',0,'later',0,'no_expiry',0,'qualifications',0,'documents',0,'employees',0),
    'rows','[]'::jsonb
  ));
end
$$;

create or replace function public.manager_personnel_deadline_dashboard(p_company_id uuid)
returns jsonb
language sql
set search_path to 'public','private','pg_temp'
as $$
  select private.manager_personnel_deadline_dashboard_impl(p_company_id)
$$;

revoke all on function public.manager_personnel_deadline_dashboard(uuid) from public;
grant execute on function public.manager_personnel_deadline_dashboard(uuid) to authenticated;;
