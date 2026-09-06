-- Align DATEV LODAS configuration limits with the interface manual,
-- 94th edition (June 2026). Existing production rows were checked before
-- creating these validated constraints.

alter table public.datev_lodas_settings
  drop constraint if exists datev_lodas_berater_nr_chk,
  drop constraint if exists datev_lodas_mandanten_nr_chk;

alter table public.datev_lodas_settings
  add constraint datev_lodas_berater_nr_chk
    check (berater_nr = '' or berater_nr ~ '^[0-9]{4,7}$'),
  add constraint datev_lodas_mandanten_nr_chk
    check (mandanten_nr = '' or mandanten_nr ~ '^[0-9]{1,5}$');

alter table public.datev_lodas_rules
  drop constraint if exists datev_lodas_rule_wage_type_chk,
  drop constraint if exists datev_lodas_rule_cost_center_chk;

alter table public.datev_lodas_rules
  add constraint datev_lodas_rule_wage_type_chk
    check (wage_type ~ '^[0-9]{1,4}$'),
  add constraint datev_lodas_rule_cost_center_chk
    check (
      cost_center is null
      or (
        length(trim(cost_center)) between 1 and 13
        and cost_center ~ '^[A-Za-z0-9 ._/-]+$'
      )
    );

comment on constraint datev_lodas_berater_nr_chk on public.datev_lodas_settings
  is 'DATEV LODAS: Beraternummer, 4 to 7 digits.';
comment on constraint datev_lodas_mandanten_nr_chk on public.datev_lodas_settings
  is 'DATEV LODAS: Mandantennummer, 1 to 5 digits.';
comment on constraint datev_lodas_rule_wage_type_chk on public.datev_lodas_rules
  is 'DATEV LODAS la_eigene: 1 to 4 digits.';
comment on constraint datev_lodas_rule_cost_center_chk on public.datev_lodas_rules
  is 'DATEV LODAS kostenstelle: max 13 ASCII-safe characters.';

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
    jsonb_build_object('format','LODAS','versionSst','1.0','manualEdition','94/2026-06','sha256',left(coalesce(p_content_sha256,''),64))
  );
end;
$$;

revoke all on function public.manager_log_datev_lodas_export(uuid,date,integer,text) from public;
revoke execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) from anon;
grant execute on function public.manager_log_datev_lodas_export(uuid,date,integer,text) to authenticated;
