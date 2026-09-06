drop policy if exists time_month_closures_no_direct_access on public.time_month_closures;
create policy time_month_closures_no_direct_access
on public.time_month_closures
for all
to authenticated
using (false)
with check (false);;
