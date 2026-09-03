create table if not exists public.datev_lodas_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  berater_nr text not null default '',
  mandanten_nr text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint datev_lodas_berater_nr_chk check (berater_nr = '' or berater_nr ~ '^[0-9]{1,10}$'),
  constraint datev_lodas_mandanten_nr_chk check (mandanten_nr = '' or mandanten_nr ~ '^[0-9]{1,10}$')
);

create table if not exists public.datev_lodas_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  source_type text not null,
  source_key text,
  wage_type text not null,
  cost_center text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint datev_lodas_rule_source_chk check (source_type in ('WORK_TOTAL','SHIFT_CODE','ABSENCE_TYPE')),
  constraint datev_lodas_rule_key_chk check (
    (source_type='WORK_TOTAL' and coalesce(source_key,'')='') or
    (source_type in ('SHIFT_CODE','ABSENCE_TYPE') and length(trim(coalesce(source_key,''))) between 1 and 80)
  ),
  constraint datev_lodas_rule_wage_type_chk check (wage_type ~ '^[0-9]{1,6}$'),
  constraint datev_lodas_rule_label_chk check (length(trim(label)) between 1 and 120),
  constraint datev_lodas_rule_cost_center_chk check (cost_center is null or length(trim(cost_center)) between 1 and 36)
);

create index if not exists datev_lodas_rules_company_sort_idx on public.datev_lodas_rules(company_id,active,sort_order,id);

alter table public.datev_lodas_settings enable row level security;
alter table public.datev_lodas_rules enable row level security;

drop policy if exists datev_lodas_settings_select_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_select_admin on public.datev_lodas_settings
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_settings_insert_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_insert_admin on public.datev_lodas_settings
for insert to authenticated
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_settings_update_admin on public.datev_lodas_settings;
create policy datev_lodas_settings_update_admin on public.datev_lodas_settings
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_settings.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_select_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_select_admin on public.datev_lodas_rules
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_insert_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_insert_admin on public.datev_lodas_rules
for insert to authenticated
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_update_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_update_admin on public.datev_lodas_rules
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

drop policy if exists datev_lodas_rules_delete_admin on public.datev_lodas_rules;
create policy datev_lodas_rules_delete_admin on public.datev_lodas_rules
for delete to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=datev_lodas_rules.company_id
    and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

create or replace function public.manager_log_datev_lodas_export(
  p_company_id uuid,
  p_month date,
  p_row_count integer,
  p_content_sha256 text
) returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_revision integer:=0;
begin
  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE'
    and cm.role in ('OWNER','ADMIN') limit 1;
  if v_role is null then raise exception 'Nicht berechtigt'; end if;

  if not exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.month_start=v_month and c.status='CLOSED'
  ) then raise exception 'DATEV-Export ist nur für abgeschlossene Monate zulässig'; end if;

  select c.revision into v_revision from public.time_month_closures c
  where c.company_id=p_company_id and c.month_start=v_month;

  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(
    p_company_id,'DATEV_LODAS_EXPORTED','TIME_MONTH',p_company_id,auth.uid(),v_role,
    '{}'::jsonb,
    jsonb_build_object('monthStart',v_month,'rowCount',greatest(coalesce(p_row_count,0),0),'closureRevision',coalesce(v_revision,0)),
    jsonb_build_object('format','LODAS','version','15.06','sha256',left(coalesce(p_content_sha256,''),64))
  );
end;
$$;

revoke all on function public.manager_log_datev_lodas_export(uuid,date,integer,text) from public;
grant execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) to authenticated;

grant select,insert,update on public.datev_lodas_settings to authenticated;
grant select,insert,update,delete on public.datev_lodas_rules to authenticated;
