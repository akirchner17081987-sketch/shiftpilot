create or replace function public.manager_audit_workspace(
  p_company_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor text default null,
  p_action text default null,
  p_category text default null,
  p_query text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_as_of timestamptz default null,
  p_limit integer default 50
)
returns jsonb language plpgsql security invoker set search_path = '' set plan_cache_mode = 'force_custom_plan' as $$
declare
  v_as_of timestamptz := least(coalesce(p_as_of,statement_timestamp()),statement_timestamp());
  v_result jsonb;
  v_exact_id uuid;
  v_terms text[] := regexp_split_to_array(lower(trim(p_query)), '[[:space:],]+');
  v_employee_names jsonb := '{}'::jsonb;
  v_assignment_employees jsonb := '{}'::jsonb;
  v_total bigint;
  v_actions jsonb;
  v_actors jsonb;
  v_unfiltered boolean := p_from is null and p_to is null and nullif(p_actor,'') is null and nullif(p_action,'') is null and nullif(p_category,'') is null and nullif(trim(p_query),'') is null;
begin
  if not private.can_manage_company_users(p_company_id) then
    raise exception 'Audit-Logs sind nur f�r Inhaber und Administratoren verf�gbar.' using errcode='42501';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'Unvollst�ndige Seitenmarkierung.' using errcode='22023';
  end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception 'Das Enddatum muss nach dem Startdatum liegen.' using errcode='22023';
  end if;
  if length(coalesce(p_query,''))>200 then raise exception 'Suchtext ist zu lang.'; end if;
  if trim(p_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select a.id into v_exact_id from public.audit_events a where a.company_id=p_company_id and a.id=trim(p_query)::uuid;
  end if;
  -- Resolve the small current roster once; the count query can then omit row-by-row RLS joins.
  if nullif(trim(p_query),'') is not null and v_exact_id is null then
    select coalesce(jsonb_object_agg(e.id::text,concat_ws(' ',e.last_name,e.first_name,e.personnel_no)),'{}'::jsonb)
      into v_employee_names from public.employees e where e.company_id=p_company_id;
    select coalesce(jsonb_object_agg(s.id::text,s.employee_id::text),'{}'::jsonb)
      into v_assignment_employees from public.shift_assignments s where s.company_id=p_company_id;
  end if;
  if p_as_of is null then
    select count(*),coalesce(jsonb_agg(distinct a.event_type),'[]'::jsonb),coalesce(jsonb_agg(distinct coalesce(a.actor_id::text,'SYSTEM')),'[]'::jsonb)
    into v_total,v_actions,v_actors
    from public.audit_events a where a.company_id=p_company_id and a.created_at<=v_as_of;
  end if;
  with filtered as materialized (
    select a.id,a.created_at
    from public.audit_events a
    where a.company_id=p_company_id and a.created_at<=v_as_of
      and (p_from is null or a.created_at>=p_from)
      and (p_to is null or a.created_at<p_to)
      and (nullif(p_actor,'') is null or (p_actor='SYSTEM' and a.actor_id is null) or a.actor_id::text=p_actor)
      and (nullif(p_action,'') is null or a.event_type=p_action)
      and (nullif(p_category,'') is null or private.sf_audit_category(a.event_type,a.entity_type)=p_category)
      and (v_exact_id is null or a.id=v_exact_id)
      and (v_exact_id is not null or nullif(trim(p_query),'') is null or not exists (select 1 from unnest(v_terms) as terms(term) where terms.term <> '' and strpos(lower(concat_ws(' ',a.id::text,a.entity_id::text,a.event_type,a.entity_type,
        a.old_values::text,a.new_values::text,a.metadata::text,
        v_employee_names->>coalesce(
          case when a.entity_type in ('employee','employees') then a.entity_id::text end,
          a.new_values->>'employee_id',a.old_values->>'employee_id',
          v_assignment_employees->>coalesce(a.new_values->>'assignment_id',a.old_values->>'assignment_id',a.metadata->>'assignment_id')))),terms.term)=0))
      and (p_as_of is null or p_before_at is null or (a.created_at,a.id)<(p_before_at,p_before_id))
    order by a.created_at desc,a.id desc
    limit case when p_as_of is not null or v_unfiltered then least(greatest(coalesce(p_limit,50),1),1000) else null end
  ), page as (
    select * from filtered where p_before_at is null or (created_at,id)<(p_before_at,p_before_id)
    order by created_at desc,id desc limit least(greatest(coalesce(p_limit,50),1),1000)
  ), enriched as (
    select a.*,
      private.sf_audit_category(a.event_type,a.entity_type) as category,
      e.id as subject_id,
      sa.id as target_assignment_id,
      sa.starts_at as subject_starts_at,
      nullif(concat_ws(', ',nullif(e.last_name,''),nullif(e.first_name,'')),'') as subject_name,
      e.personnel_no as subject_personnel_no
    from page pg join public.audit_events a on a.id=pg.id and a.company_id=p_company_id
    left join public.shift_assignments sa on sa.company_id=a.company_id and sa.id=coalesce(
      case when a.entity_type in ('shift_assignment','shift_assignments') then a.entity_id end,
      case when coalesce(a.new_values->>'assignment_id',a.old_values->>'assignment_id',a.metadata->>'assignment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(a.new_values->>'assignment_id',a.old_values->>'assignment_id',a.metadata->>'assignment_id')::uuid end)
    left join public.employees e on e.company_id=a.company_id and e.id=coalesce(
      case when a.entity_type in ('employee','employees') then a.entity_id end,
      case when coalesce(a.new_values->>'employee_id',a.old_values->>'employee_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(a.new_values->>'employee_id',a.old_values->>'employee_id')::uuid end,
      sa.employee_id)

  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from enriched p),'[]'::jsonb),
    'total',case when p_as_of is not null then null when v_unfiltered then v_total else (select count(*) from filtered) end,
    'as_of',v_as_of,
    'actions',coalesce(v_actions,'[]'::jsonb),
    'actors',coalesce(v_actors,'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
notify pgrst, 'reload schema';
