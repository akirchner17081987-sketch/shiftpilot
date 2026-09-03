create index if not exists datev_lodas_settings_updated_by_idx on public.datev_lodas_settings(updated_by);
create index if not exists datev_lodas_rules_created_by_idx on public.datev_lodas_rules(created_by);
create index if not exists datev_lodas_rules_updated_by_idx on public.datev_lodas_rules(updated_by);

drop policy if exists datev_lodas_settings_select_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_select_admin on public.datev_lodas_settings
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_settings_insert_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_insert_admin on public.datev_lodas_settings
for insert to authenticated
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_settings_update_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_update_admin on public.datev_lodas_settings
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_select_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_select_admin on public.datev_lodas_rules
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_insert_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_insert_admin on public.datev_lodas_rules
for insert to authenticated
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_update_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_update_admin on public.datev_lodas_rules
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_delete_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_delete_admin on public.datev_lodas_rules
for delete to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));
