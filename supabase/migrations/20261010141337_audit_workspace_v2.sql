-- Complete, tenant-scoped audit search. Existing records and erasure guards stay intact.
create or replace function private.sf_audit_category(p_event text, p_entity text)
returns text language sql immutable set search_path = '' as $$
  select case
    when lower(coalesce(p_entity,'') || ' ' || coalesce(p_event,'')) ~ '(time|qr|arbeitszeit)' then 'time'
    when lower(coalesce(p_entity,'') || ' ' || coalesce(p_event,'')) ~ '(member|invite|access|permission|login|auth|security)' then 'access'
    when lower(coalesce(p_entity,'') || ' ' || coalesce(p_event,'')) ~ '(employee|personnel|absence|qualification)' then 'personnel'
    when lower(coalesce(p_entity,'') || ' ' || coalesce(p_event,'')) ~ '(schedule|shift_assignment|shift_change|shift_swap|shift_market|plan_publish|publication|month_optim)' then 'planning'
    when lower(coalesce(p_entity,'') || ' ' || coalesce(p_event,'')) ~ '(company|staffing|template|setting|compliance|location)' then 'settings'
    else 'other' end;
$$;
revoke all on function private.sf_audit_category(text,text) from public,anon;
grant execute on function private.sf_audit_category(text,text) to authenticated;

-- A database transaction is a reliable grouping boundary, including explicit RPC events.
-- Only role/context identifiers are added; no additional personal snapshots are captured.
create or replace function private.sf_enrich_audit_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_access_role text;
begin
  select cm.access_role into v_access_role from public.company_members cm
    where cm.company_id=new.company_id and cm.user_id=new.actor_id;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'transaction_id',pg_current_xact_id()::text,
    'actor_access_role',coalesce(v_access_role,new.actor_role,'SYSTEM'));
  return new;
end;
$$;
revoke all on function private.sf_enrich_audit_context() from public,anon,authenticated;
create trigger sf_audit_context before insert on public.audit_events
  for each row execute function private.sf_enrich_audit_context();

create index if not exists sf_audit_company_cursor_idx on public.audit_events(company_id,created_at desc,id desc);

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
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_as_of timestamptz := least(coalesce(p_as_of,statement_timestamp()),statement_timestamp());
  v_result jsonb;
begin
  if not private.can_manage_company_users(p_company_id) then
    raise exception 'Audit-Logs sind nur für Inhaber und Administratoren verfügbar.' using errcode='42501';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'Unvollständige Seitenmarkierung.' using errcode='22023';
  end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception 'Das Enddatum muss nach dem Startdatum liegen.' using errcode='22023';
  end if;
  if length(coalesce(p_query,''))>200 then raise exception 'Suchtext ist zu lang.'; end if;
  with filtered as materialized (
    select a.*,
      private.sf_audit_category(a.event_type,a.entity_type) as category,
      e.id as subject_id,
      sa.id as target_assignment_id,
      sa.starts_at as subject_starts_at,
      nullif(concat_ws(', ',nullif(e.last_name,''),nullif(e.first_name,'')),'') as subject_name,
      e.personnel_no as subject_personnel_no
    from public.audit_events a
    left join public.shift_assignments sa on sa.company_id=a.company_id and sa.id=coalesce(
      case when a.entity_type in ('shift_assignment','shift_assignments') then a.entity_id end,
      case when coalesce(a.new_values->>'assignment_id',a.old_values->>'assignment_id',a.metadata->>'assignment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(a.new_values->>'assignment_id',a.old_values->>'assignment_id',a.metadata->>'assignment_id')::uuid end)
    left join public.employees e on e.company_id=a.company_id and e.id=coalesce(
      case when a.entity_type in ('employee','employees') then a.entity_id end,
      case when coalesce(a.new_values->>'employee_id',a.old_values->>'employee_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(a.new_values->>'employee_id',a.old_values->>'employee_id')::uuid end,
      sa.employee_id)
    where a.company_id=p_company_id and a.created_at<=v_as_of
      and (p_from is null or a.created_at>=p_from)
      and (p_to is null or a.created_at<p_to)
      and (nullif(p_actor,'') is null or (p_actor='SYSTEM' and a.actor_id is null) or a.actor_id::text=p_actor)
      and (nullif(p_action,'') is null or a.event_type=p_action)
      and (nullif(p_category,'') is null or private.sf_audit_category(a.event_type,a.entity_type)=p_category)
      and (nullif(trim(p_query),'') is null or strpos(lower(concat_ws(' ',a.id::text,a.entity_id::text,a.event_type,a.entity_type,
        a.old_values::text,a.new_values::text,a.metadata::text,e.last_name,e.first_name,e.personnel_no)),lower(trim(p_query)))>0)
  ), page as (
    select * from filtered where p_before_at is null or (created_at,id)<(p_before_at,p_before_id)
    order by created_at desc,id desc limit least(greatest(coalesce(p_limit,50),1),1000)
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'as_of',v_as_of,
    'actions',coalesce((select jsonb_agg(s.event_type order by s.event_type) from (select distinct event_type from public.audit_events where company_id=p_company_id)s),'[]'::jsonb),
    'actors',coalesce((select jsonb_agg(s.actor order by s.actor) from (select distinct coalesce(actor_id::text,'SYSTEM') as actor from public.audit_events where company_id=p_company_id)s),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.manager_audit_workspace(uuid,timestamptz,timestamptz,text,text,text,text,timestamptz,uuid,timestamptz,integer) from public,anon;
grant execute on function public.manager_audit_workspace(uuid,timestamptz,timestamptz,text,text,text,text,timestamptz,uuid,timestamptz,integer) to authenticated;

-- Keep the same staged MFA protection as the existing audit reader.
insert into private.sf_mfa_protected_rpcs(function_name,rollout_stage,control_area,enabled)
select 'manager_audit_workspace',rollout_stage,control_area,enabled
from private.sf_mfa_protected_rpcs where function_name='manager_list_audit_events'
on conflict(function_name) do nothing;
notify pgrst, 'reload schema';
