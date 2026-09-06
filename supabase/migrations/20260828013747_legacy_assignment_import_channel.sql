create or replace function public.enforce_assignment_standard_rules()
returns trigger
language plpgsql
set search_path = 'public','pg_temp'
as $$
begin
  if new.status <> 'CANCELLED'
     and coalesce(current_setting('schichtfunk.legacy_import', true),'off') <> 'on' then
    perform public.assert_standard_shift_rules(
      new.company_id,
      new.employee_id,
      new.starts_at,
      new.ends_at,
      case when tg_op='UPDATE' then old.id else null end
    );
  end if;
  return new;
end
$$;

create or replace function public.import_legacy_shift_assignment(
  p_company_id uuid,
  p_employee_id uuid,
  p_legacy_id text,
  p_shift_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_break_minutes integer default 0,
  p_note text default '',
  p_status text default 'DRAFT',
  p_published_at timestamptz default null,
  p_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_warning text;
  v_status text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = v_user
      and cm.status = 'ACTIVE'
      and cm.role in ('OWNER','ADMIN','PLANNER')
  ) then
    raise exception 'Not authorized for company';
  end if;

  if p_legacy_id is null or btrim(p_legacy_id) = '' then
    raise exception 'Legacy id required';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = p_company_id
  ) then
    raise exception 'Employee does not belong to company';
  end if;

  select s.id into v_existing
  from public.shift_assignments s
  where s.company_id = p_company_id and s.legacy_id = p_legacy_id
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_status := case when p_status in ('PUBLISHED','DRAFT') then p_status else 'DRAFT' end;

  begin
    perform public.assert_standard_shift_rules(
      p_company_id,p_employee_id,p_starts_at,p_ends_at,null
    );
  exception when others then
    v_warning := sqlerrm;
  end;

  perform set_config('schichtfunk.legacy_import','on',true);

  insert into public.shift_assignments(
    company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,
    break_minutes,note,status,published_at,version,created_by
  ) values (
    p_company_id,p_employee_id,p_legacy_id,p_shift_code,p_starts_at,p_ends_at,
    greatest(coalesce(p_break_minutes,0),0),coalesce(p_note,''),v_status,
    case when v_status='PUBLISHED' then coalesce(p_published_at,now()) else null end,
    greatest(coalesce(p_version,1),1),v_user
  ) returning id into v_id;

  if v_warning is not null then
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata
    ) values (
      p_company_id,'LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION','shift_assignment',v_id,
      v_user,'IMPORT',jsonb_build_object(
        'legacy_id',p_legacy_id,
        'warning',v_warning,
        'shift_code',p_shift_code,
        'starts_at',p_starts_at,
        'ends_at',p_ends_at
      )
    );
  end if;

  return v_id;
end
$$;

revoke all on function public.import_legacy_shift_assignment(uuid,uuid,text,text,timestamptz,timestamptz,integer,text,text,timestamptz,integer) from public;
revoke all on function public.import_legacy_shift_assignment(uuid,uuid,text,text,timestamptz,timestamptz,integer,text,text,timestamptz,integer) from anon;
grant execute on function public.import_legacy_shift_assignment(uuid,uuid,text,text,timestamptz,timestamptz,integer,text,text,timestamptz,integer) to authenticated;;
