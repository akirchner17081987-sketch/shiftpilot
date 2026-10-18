-- Preserve the existing restrictive personnel/MFA gate, but resolve its company
-- set once per statement instead of running the security-definer check per row.
-- The permissive admin-only policy and read-only/time-only restrictions remain.
alter policy audit_personnel_mfa on public.audit_events
using(company_id in(
 select cm.company_id from public.company_members cm
 where cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
 and cm.role in('OWNER','ADMIN')
 and private.sf_can_read_personnel(cm.company_id)
));
