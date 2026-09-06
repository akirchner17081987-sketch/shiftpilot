create or replace function public.protect_published_assignment()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  -- Ausschließlich der streng geschützte administrative Komplett-Reset darf
  -- veröffentlichte Schichten physisch entfernen. Normale Browser-/RLS-Pfade
  -- können dieses transaktionslokale Flag nicht setzen.
  if current_setting('app.schichtfunk_full_plan_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then
      raise exception 'Published assignments are append/change-request controlled and cannot be deleted directly';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.status='PUBLISHED' then
    if new.employee_id is not distinct from old.employee_id
       and new.shift_code is not distinct from old.shift_code
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.break_minutes is not distinct from old.break_minutes
       and new.note is not distinct from old.note
       and new.status is not distinct from old.status then
      return new;
    end if;
    if new.last_change_request_id is null or not exists(
      select 1 from public.shift_change_requests r
      where r.id=new.last_change_request_id
        and r.company_id=old.company_id
        and r.assignment_id=old.id
        and r.status='READY_TO_APPLY'
        and ((r.action='UPDATE' and new.status='PUBLISHED') or (r.action='DELETE' and new.status='CANCELLED'))
    ) then
      raise exception 'Published assignment changes require a READY_TO_APPLY change request';
    end if;
  end if;
  return new;
end $function$;

create or replace function private.reset_schedule_impl(
  p_company_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_draft integer := 0;
  v_published integer := 0;
  v_cancelled integer := 0;
  v_time_entries integer := 0;
  v_publications integer := 0;
  v_requests integer := 0;
  v_deleted integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select cm.role into v_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = v_user
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER','ADMIN')
  limit 1;

  if v_role is null then
    raise exception 'Only OWNER or ADMIN may reset the complete schedule';
  end if;

  if coalesce(p_confirmation,'') <> 'LÖSCHEN' then
    raise exception 'Confirmation text must be LÖSCHEN';
  end if;

  select
    count(*) filter (where status='DRAFT')::int,
    count(*) filter (where status='PUBLISHED')::int,
    count(*) filter (where status='CANCELLED')::int
  into v_draft, v_published, v_cancelled
  from public.shift_assignments
  where company_id = p_company_id;

  update public.shift_change_requests
     set assignment_id = null,
         status = case
           when status in ('DRAFT','PENDING_EMPLOYEE','PENDING_WORKS_COUNCIL','READY_TO_APPLY','BLOCKED') then 'CANCELLED'
           else status
         end
   where company_id = p_company_id
     and assignment_id is not null;
  get diagnostics v_requests = row_count;

  delete from public.time_entries where company_id = p_company_id;
  get diagnostics v_time_entries = row_count;

  delete from public.plan_publications where company_id = p_company_id;
  get diagnostics v_publications = row_count;

  perform set_config('app.schichtfunk_full_plan_reset','on',true);
  delete from public.shift_assignments where company_id = p_company_id;
  get diagnostics v_deleted = row_count;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata
  ) values (
    p_company_id,
    'FULL_SCHEDULE_RESET',
    'schedule',
    null,
    v_user,
    v_role,
    jsonb_build_object(
      'deletedAssignments',v_deleted,
      'draftAssignments',v_draft,
      'publishedAssignments',v_published,
      'cancelledAssignments',v_cancelled,
      'deletedTimeEntries',v_time_entries,
      'deletedPublications',v_publications,
      'detachedChangeRequests',v_requests
    )
  );

  return jsonb_build_object(
    'deletedAssignments',v_deleted,
    'draftAssignments',v_draft,
    'publishedAssignments',v_published,
    'cancelledAssignments',v_cancelled,
    'deletedTimeEntries',v_time_entries,
    'deletedPublications',v_publications,
    'detachedChangeRequests',v_requests
  );
end
$function$;

revoke all on function private.reset_schedule_impl(uuid,text) from public;
grant usage on schema private to authenticated;
grant execute on function private.reset_schedule_impl(uuid,text) to authenticated;

create or replace function public.reset_company_schedule(
  p_company_id uuid,
  p_confirmation text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.reset_schedule_impl(p_company_id,p_confirmation);
$function$;

revoke all on function public.reset_company_schedule(uuid,text) from public, anon;
grant execute on function public.reset_company_schedule(uuid,text) to authenticated;;
