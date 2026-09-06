-- SchichtFunk: DISPATCHER erhält Planungsrechte, Compliance-Administration bleibt Owner/Admin.

drop policy if exists assignments_insert on public.shift_assignments;
create policy assignments_insert on public.shift_assignments for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists assignments_update on public.shift_assignments;
create policy assignments_update on public.shift_assignments for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists assignments_delete on public.shift_assignments;
create policy assignments_delete on public.shift_assignments for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_assignments.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists absences_delete on public.absences;
create policy absences_delete on public.absences for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=absences.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists change_requests_insert on public.shift_change_requests;
create policy change_requests_insert on public.shift_change_requests for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists change_requests_update on public.shift_change_requests;
create policy change_requests_update on public.shift_change_requests for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists change_requests_delete on public.shift_change_requests;
create policy change_requests_delete on public.shift_change_requests for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_change_requests.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists approvals_insert on public.shift_change_approvals;
create policy approvals_insert on public.shift_change_approvals for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists approvals_update on public.shift_change_approvals;
create policy approvals_update on public.shift_change_approvals for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists approvals_delete on public.shift_change_approvals;
create policy approvals_delete on public.shift_change_approvals for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_change_approvals.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists publications_insert on public.plan_publications;
create policy publications_insert on public.plan_publications for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists publications_update on public.plan_publications;
create policy publications_update on public.plan_publications for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists publications_delete on public.plan_publications;
create policy publications_delete on public.plan_publications for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=plan_publications.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists shift_templates_insert on public.shift_templates;
create policy shift_templates_insert on public.shift_templates for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists shift_templates_update on public.shift_templates;
create policy shift_templates_update on public.shift_templates for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists shift_templates_delete on public.shift_templates;
create policy shift_templates_delete on public.shift_templates for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=shift_templates.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=time_entries.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists global_staff_insert on public.global_staffing_requirements;
create policy global_staff_insert on public.global_staffing_requirements for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists global_staff_update on public.global_staffing_requirements;
create policy global_staff_update on public.global_staffing_requirements for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists global_staff_delete on public.global_staffing_requirements;
create policy global_staff_delete on public.global_staffing_requirements for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=global_staffing_requirements.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));

drop policy if exists daily_staff_insert on public.daily_staffing_overrides;
create policy daily_staff_insert on public.daily_staffing_overrides for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists daily_staff_update on public.daily_staffing_overrides;
create policy daily_staff_update on public.daily_staffing_overrides for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'))
with check (exists (select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));
drop policy if exists daily_staff_delete on public.daily_staffing_overrides;
create policy daily_staff_delete on public.daily_staffing_overrides for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=daily_staffing_overrides.company_id and cm.user_id=(select auth.uid()) and cm.role=any(array['OWNER','ADMIN','PLANNER','DISPATCHER']::text[]) and cm.status='ACTIVE'));;
