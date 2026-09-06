create or replace function public.prevent_noop_shift_change_request()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.action = 'UPDATE'
     and new.old_snapshot is not null
     and new.proposed_snapshot is not null
     and coalesce(new.old_snapshot->>'employeeId','') = coalesce(new.proposed_snapshot->>'employeeId','')
     and coalesce(new.old_snapshot->>'type','') = coalesce(new.proposed_snapshot->>'type','')
     and coalesce(new.old_snapshot->>'startsAt','') = coalesce(new.proposed_snapshot->>'startsAt','')
     and coalesce(new.old_snapshot->>'endsAt','') = coalesce(new.proposed_snapshot->>'endsAt','')
     and coalesce((new.old_snapshot->>'breakMinutes')::integer,0) = coalesce((new.proposed_snapshot->>'breakMinutes')::integer,0)
     and btrim(coalesce(new.old_snapshot->>'note','')) = btrim(coalesce(new.proposed_snapshot->>'note',''))
  then
    raise exception using
      errcode = '22023',
      message = 'Es wurden keine Änderungen vorgenommen.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_prevent_noop_shift_change_request on public.shift_change_requests;
create trigger trg_prevent_noop_shift_change_request
before insert or update of action, old_snapshot, proposed_snapshot
on public.shift_change_requests
for each row
execute function public.prevent_noop_shift_change_request();;
