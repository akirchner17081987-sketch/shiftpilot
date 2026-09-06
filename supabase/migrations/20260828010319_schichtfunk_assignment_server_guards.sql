create or replace function public.enforce_assignment_standard_rules() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status <> 'CANCELLED' then
    perform public.assert_standard_shift_rules(new.company_id,new.employee_id,new.starts_at,new.ends_at,case when tg_op='UPDATE' then old.id else null end);
  end if;
  return new;
end $$;
create trigger shift_assignments_standard_rules before insert or update of employee_id,starts_at,ends_at,status on public.shift_assignments for each row execute function public.enforce_assignment_standard_rules();

create or replace function public.protect_published_assignment() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and old.status='PUBLISHED' then
    raise exception 'Published assignments are append/change-request controlled and cannot be deleted directly';
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
end $$;
create trigger shift_assignments_published_guard before update or delete on public.shift_assignments for each row execute function public.protect_published_assignment();;
