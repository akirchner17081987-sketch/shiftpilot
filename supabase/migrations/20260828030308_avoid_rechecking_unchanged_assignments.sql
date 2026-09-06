create or replace function public.enforce_assignment_standard_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'CANCELLED'
     and coalesce(current_setting('schichtfunk.legacy_import', true),'off') <> 'on'
     and (
       tg_op = 'INSERT'
       or new.employee_id is distinct from old.employee_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.status is distinct from old.status
     )
  then
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
$$;;
