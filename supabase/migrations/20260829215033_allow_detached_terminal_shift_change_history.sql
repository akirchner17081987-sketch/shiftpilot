alter table public.shift_change_requests drop constraint if exists shift_change_requests_check;

alter table public.shift_change_requests
add constraint shift_change_requests_check check (
  (action = 'CREATE' and assignment_id is null and proposed_snapshot is not null)
  or
  (action = 'UPDATE' and proposed_snapshot is not null and (
    assignment_id is not null
    or status in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED')
  ))
  or
  (action = 'DELETE' and (
    assignment_id is not null
    or status in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED')
  ))
);;
