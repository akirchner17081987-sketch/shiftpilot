alter table public.time_qr_terminals
  drop constraint if exists time_qr_terminals_pilot_activation_check;

alter table public.time_qr_terminals
  add constraint time_qr_terminals_pilot_activation_check
  check (
    not is_active
    or pilot_mode is false
    or pilot_employee_id is not null
  );
