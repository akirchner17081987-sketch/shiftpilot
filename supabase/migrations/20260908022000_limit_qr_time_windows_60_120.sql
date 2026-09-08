update public.time_qr_terminals
set start_window_minutes = least(start_window_minutes, 60),
    end_window_minutes = least(end_window_minutes, 120),
    updated_at = clock_timestamp()
where start_window_minutes > 60 or end_window_minutes > 120;

alter table public.time_qr_terminals
  alter column start_window_minutes set default 60,
  alter column end_window_minutes set default 120;

alter table public.time_qr_terminals
  drop constraint if exists time_qr_terminals_start_window_minutes_check,
  drop constraint if exists time_qr_terminals_end_window_minutes_check;

alter table public.time_qr_terminals
  add constraint time_qr_terminals_start_window_minutes_check
    check (start_window_minutes >= 0 and start_window_minutes <= 60),
  add constraint time_qr_terminals_end_window_minutes_check
    check (end_window_minutes >= 0 and end_window_minutes <= 120);
