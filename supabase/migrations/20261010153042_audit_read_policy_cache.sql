-- Cache the current user's eligible companies once per query, preserving all three audit read guards.
alter policy audit_events_admin_read on public.audit_events
using (company_id in (
  select cm.company_id from public.company_members cm
  where cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));
alter policy sf_read_only_data_guard on public.audit_events
using (company_id not in (
  select cm.company_id from public.company_members cm
  where cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role='VIEWER'
));
alter policy time_only_no_direct_access on public.audit_events
using (company_id not in (
  select cm.company_id from public.company_members cm
  where cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING'
));
notify pgrst, 'reload schema';
