-- Long-term redaction for audit events and closed-month report snapshots.
-- Execution requires an approved customer retention profile; preview is read-only.

create table if not exists private.privacy_redaction_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  retention_profile_id uuid references private.privacy_retention_profiles(id) on delete set null,
  as_of date not null,
  status text not null check (status in ('RUNNING','NOOP','COMPLETED','BLOCKED_LEGAL_HOLD')),
  audit_cutoff date not null,
  datev_audit_cutoff date not null,
  month_snapshot_cutoff date not null,
  audit_eligible integer not null default 0 check (audit_eligible >= 0),
  audit_redacted integer not null default 0 check (audit_redacted >= 0),
  month_snapshot_eligible integer not null default 0 check (month_snapshot_eligible >= 0),
  month_snapshot_redacted integer not null default 0 check (month_snapshot_redacted >= 0),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table private.privacy_redaction_runs enable row level security;
revoke all on table private.privacy_redaction_runs from public, anon, authenticated;
grant select, insert, update on table private.privacy_redaction_runs to service_role;

create index if not exists privacy_redaction_runs_company_idx
  on private.privacy_redaction_runs(company_id, created_at desc);

create index if not exists privacy_redaction_runs_success_idx
  on private.privacy_redaction_runs(company_id, retention_profile_id, as_of)
  where status in ('NOOP','COMPLETED');

create or replace function private.sf_privacy_longterm_rule_years(
  p_rules jsonb,
  p_name text
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value integer;
begin
  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'Retention rules must be an object';
  end if;
  if not (p_rules ? p_name)
     or coalesce(p_rules ->> p_name,'') !~ '^\d{1,2}$' then
    raise exception 'Retention profile % must be an integer between 1 and 20', p_name;
  end if;
  v_value := (p_rules ->> p_name)::integer;
  if v_value < 1 or v_value > 20 then
    raise exception 'Retention profile % must be between 1 and 20', p_name;
  end if;
  return v_value;
end;
$$;

revoke all on function private.sf_privacy_longterm_rule_years(jsonb,text) from public, anon, authenticated;
grant execute on function private.sf_privacy_longterm_rule_years(jsonb,text) to service_role;

create or replace function private.sf_privacy_longterm_redaction_plan(
  p_company_id uuid,
  p_rules jsonb,
  p_as_of date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of,current_date);
  v_audit_years integer;
  v_datev_audit_years integer;
  v_month_snapshot_years integer;
  v_audit_cutoff date;
  v_datev_audit_cutoff date;
  v_month_snapshot_cutoff date;
  v_active_holds integer;
  v_audit_eligible integer;
  v_snapshot_eligible integer;
begin
  if not exists (select 1 from public.companies c where c.id=p_company_id) then
    raise exception 'Company not found';
  end if;

  v_audit_years := private.sf_privacy_longterm_rule_years(p_rules,'auditYears');
  v_datev_audit_years := private.sf_privacy_longterm_rule_years(p_rules,'datevAuditYears');
  v_month_snapshot_years := private.sf_privacy_longterm_rule_years(p_rules,'monthSnapshotYears');

  v_audit_cutoff := make_date(extract(year from v_as_of)::integer - v_audit_years,1,1);
  v_datev_audit_cutoff := make_date(extract(year from v_as_of)::integer - v_datev_audit_years,1,1);
  v_month_snapshot_cutoff := make_date(extract(year from v_as_of)::integer - v_month_snapshot_years,1,1);

  select count(*)::integer into v_active_holds
  from private.privacy_legal_holds h
  where h.company_id=p_company_id
    and h.status='ACTIVE'
    and (h.hold_until is null or h.hold_until >= now());

  select count(*)::integer into v_audit_eligible
  from public.audit_events e
  where e.company_id=p_company_id
    and coalesce(e.metadata->>'privacy_redacted','false') <> 'true'
    and e.created_at < (
      case
        when upper(coalesce(e.event_type,'')) like '%DATEV%'
          or upper(coalesce(e.entity_type,'')) like '%DATEV%'
        then v_datev_audit_cutoff::timestamptz
        else v_audit_cutoff::timestamptz
      end
    );

  select count(*)::integer into v_snapshot_eligible
  from public.time_month_closures c
  where c.company_id=p_company_id
    and c.status='CLOSED'
    and c.report_snapshot is not null
    and coalesce(c.report_snapshot->>'privacy_redacted','false') <> 'true'
    and c.month_start < v_month_snapshot_cutoff;

  return jsonb_build_object(
    'company_id',p_company_id,
    'as_of',v_as_of,
    'audit_years',v_audit_years,
    'datev_audit_years',v_datev_audit_years,
    'month_snapshot_years',v_month_snapshot_years,
    'audit_cutoff',v_audit_cutoff,
    'datev_audit_cutoff',v_datev_audit_cutoff,
    'month_snapshot_cutoff',v_month_snapshot_cutoff,
    'active_legal_holds',v_active_holds,
    'blocked_by_legal_hold',(v_active_holds > 0),
    'audit_eligible',v_audit_eligible,
    'month_snapshot_eligible',v_snapshot_eligible
  );
end;
$$;

revoke all on function private.sf_privacy_longterm_redaction_plan(uuid,jsonb,date) from public, anon, authenticated;
grant execute on function private.sf_privacy_longterm_redaction_plan(uuid,jsonb,date) to service_role;

create or replace function private.server_privacy_longterm_redaction_preview(
  p_company_id uuid,
  p_rules jsonb,
  p_as_of date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.sf_assert_service_role();
  return private.sf_privacy_longterm_redaction_plan(p_company_id,p_rules,coalesce(p_as_of,current_date))
    || jsonb_build_object('mode','DRY_RUN','execution_enabled',false);
end;
$$;

revoke all on function private.server_privacy_longterm_redaction_preview(uuid,jsonb,date) from public, anon, authenticated;
grant execute on function private.server_privacy_longterm_redaction_preview(uuid,jsonb,date) to service_role;

create or replace function public.server_privacy_longterm_redaction_preview(
  p_company_id uuid,
  p_rules jsonb,
  p_as_of date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.server_privacy_longterm_redaction_preview(p_company_id,p_rules,p_as_of)
$$;

revoke all on function public.server_privacy_longterm_redaction_preview(uuid,jsonb,date) from public, anon, authenticated;
grant execute on function public.server_privacy_longterm_redaction_preview(uuid,jsonb,date) to service_role;

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op='UPDATE'
     and current_setting('schichtfunk.privacy_redaction',true)='on' then
    perform private.sf_assert_service_role();

    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.event_type is distinct from old.event_type
       or new.entity_type is distinct from old.entity_type
       or new.created_at is distinct from old.created_at then
      raise exception 'Audit redaction may not change immutable event identity';
    end if;

    if new.entity_id is not null
       or new.actor_id is not null
       or new.actor_role is not null
       or new.old_values is not null
       or new.new_values is not null
       or coalesce(new.metadata->>'privacy_redacted','false') <> 'true'
       or (new.metadata - 'privacy_redacted' - 'redacted_at' - 'retention_profile_id' - 'redaction_run_id') <> '{}'::jsonb then
      raise exception 'Audit redaction shape rejected';
    end if;

    return new;
  end if;

  raise exception 'Audit-Protokolle sind unveraenderbar';
end;
$$;

revoke all on function public.prevent_audit_mutation() from public, anon, authenticated;
grant execute on function public.prevent_audit_mutation() to service_role;

create or replace function private.server_execute_privacy_longterm_redaction(
  p_company_id uuid,
  p_as_of date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile private.privacy_retention_profiles%rowtype;
  v_as_of date := coalesce(p_as_of,current_date);
  v_plan jsonb;
  v_existing jsonb;
  v_run_id uuid;
  v_audit_redacted integer := 0;
  v_snapshot_redacted integer := 0;
  v_result jsonb;
begin
  perform private.sf_assert_service_role();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text, 9132026));

  select * into v_profile
  from private.privacy_retention_profiles p
  where p.company_id=p_company_id
    and p.status='APPROVED'
  order by p.version desc
  limit 1;

  if v_profile.id is null then
    raise exception 'Approved retention profile required';
  end if;
  if v_profile.rules_hash is not null
     and private.sf_privacy_json_hash(v_profile.rules) <> v_profile.rules_hash then
    raise exception 'RETENTION_PROFILE_CHANGED';
  end if;

  select r.result into v_existing
  from private.privacy_redaction_runs r
  where r.company_id=p_company_id
    and r.retention_profile_id=v_profile.id
    and r.as_of=v_as_of
    and r.status in ('NOOP','COMPLETED','BLOCKED_LEGAL_HOLD')
  order by r.created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing || jsonb_build_object('status','ALREADY_CHECKED','executed',false);
  end if;

  v_plan := private.sf_privacy_longterm_redaction_plan(p_company_id,v_profile.rules,v_as_of);

  if coalesce((v_plan->>'blocked_by_legal_hold')::boolean,false) then
    insert into private.privacy_redaction_runs(
      company_id,retention_profile_id,as_of,status,
      audit_cutoff,datev_audit_cutoff,month_snapshot_cutoff,
      audit_eligible,month_snapshot_eligible,result,completed_at
    ) values (
      p_company_id,v_profile.id,v_as_of,'BLOCKED_LEGAL_HOLD',
      (v_plan->>'audit_cutoff')::date,(v_plan->>'datev_audit_cutoff')::date,(v_plan->>'month_snapshot_cutoff')::date,
      (v_plan->>'audit_eligible')::integer,(v_plan->>'month_snapshot_eligible')::integer,
      v_plan || jsonb_build_object('status','BLOCKED_LEGAL_HOLD','executed',false,'retention_profile_id',v_profile.id),
      now()
    );
    return v_plan || jsonb_build_object('status','BLOCKED_LEGAL_HOLD','executed',false,'retention_profile_id',v_profile.id);
  end if;

  insert into private.privacy_redaction_runs(
    company_id,retention_profile_id,as_of,status,
    audit_cutoff,datev_audit_cutoff,month_snapshot_cutoff,
    audit_eligible,month_snapshot_eligible
  ) values (
    p_company_id,v_profile.id,v_as_of,'RUNNING',
    (v_plan->>'audit_cutoff')::date,(v_plan->>'datev_audit_cutoff')::date,(v_plan->>'month_snapshot_cutoff')::date,
    (v_plan->>'audit_eligible')::integer,(v_plan->>'month_snapshot_eligible')::integer
  ) returning id into v_run_id;

  if (v_plan->>'audit_eligible')::integer = 0
     and (v_plan->>'month_snapshot_eligible')::integer = 0 then
    v_result := v_plan || jsonb_build_object(
      'status','NOOP',
      'executed',true,
      'retention_profile_id',v_profile.id,
      'redaction_run_id',v_run_id,
      'audit_redacted',0,
      'month_snapshot_redacted',0
    );
    update private.privacy_redaction_runs
      set status='NOOP',result=v_result,completed_at=now()
      where id=v_run_id;
    return v_result;
  end if;

  perform pg_catalog.set_config('schichtfunk.privacy_redaction','on',true);

  update public.audit_events e
  set entity_id=null,
      actor_id=null,
      actor_role=null,
      old_values=null,
      new_values=null,
      metadata=jsonb_build_object(
        'privacy_redacted',true,
        'redacted_at',now(),
        'retention_profile_id',v_profile.id,
        'redaction_run_id',v_run_id
      )
  where e.company_id=p_company_id
    and coalesce(e.metadata->>'privacy_redacted','false') <> 'true'
    and e.created_at < (
      case
        when upper(coalesce(e.event_type,'')) like '%DATEV%'
          or upper(coalesce(e.entity_type,'')) like '%DATEV%'
        then (v_plan->>'datev_audit_cutoff')::date::timestamptz
        else (v_plan->>'audit_cutoff')::date::timestamptz
      end
    );
  get diagnostics v_audit_redacted = row_count;

  update public.time_month_closures c
  set closed_by=null,
      reopened_by=null,
      close_note=case when btrim(c.close_note)='' then '' else '[retention-redacted]' end,
      reopen_note=case when btrim(c.reopen_note)='' then '' else '[retention-redacted]' end,
      report_snapshot=jsonb_build_object(
        'privacy_redacted',true,
        'redacted_at',now(),
        'retention_profile_id',v_profile.id,
        'redaction_run_id',v_run_id,
        'employees','[]'::jsonb,
        'details','[]'::jsonb
      ),
      updated_at=now()
  where c.company_id=p_company_id
    and c.status='CLOSED'
    and c.report_snapshot is not null
    and coalesce(c.report_snapshot->>'privacy_redacted','false') <> 'true'
    and c.month_start < (v_plan->>'month_snapshot_cutoff')::date;
  get diagnostics v_snapshot_redacted = row_count;

  v_result := v_plan || jsonb_build_object(
    'status','COMPLETED',
    'executed',true,
    'retention_profile_id',v_profile.id,
    'redaction_run_id',v_run_id,
    'audit_redacted',v_audit_redacted,
    'month_snapshot_redacted',v_snapshot_redacted
  );

  update private.privacy_redaction_runs
    set status='COMPLETED',
        audit_redacted=v_audit_redacted,
        month_snapshot_redacted=v_snapshot_redacted,
        result=v_result,
        completed_at=now()
    where id=v_run_id;

  return v_result;
end;
$$;

revoke all on function private.server_execute_privacy_longterm_redaction(uuid,date) from public, anon, authenticated;
grant execute on function private.server_execute_privacy_longterm_redaction(uuid,date) to service_role;

create or replace function public.server_execute_privacy_longterm_redaction(
  p_company_id uuid,
  p_as_of date
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.server_execute_privacy_longterm_redaction(p_company_id,p_as_of)
$$;

revoke all on function public.server_execute_privacy_longterm_redaction(uuid,date) from public, anon, authenticated;
grant execute on function public.server_execute_privacy_longterm_redaction(uuid,date) to service_role;

create or replace function private.server_run_due_privacy_longterm_redactions(
  p_as_of date,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of,current_date);
  v_limit integer := greatest(1,least(coalesce(p_limit,5),25));
  v_row record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  perform private.sf_assert_service_role();

  for v_row in
    select p.company_id,p.id
    from private.privacy_retention_profiles p
    where p.status='APPROVED'
      and not exists (
        select 1
        from private.privacy_redaction_runs r
        where r.company_id=p.company_id
          and r.retention_profile_id=p.id
          and r.as_of=v_as_of
          and r.status in ('NOOP','COMPLETED','BLOCKED_LEGAL_HOLD')
      )
    order by p.company_id
    limit v_limit
  loop
    v_result := private.server_execute_privacy_longterm_redaction(v_row.company_id,v_as_of);
    v_results := v_results || jsonb_build_array(v_result);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('as_of',v_as_of,'count',v_count,'results',v_results);
end;
$$;

revoke all on function private.server_run_due_privacy_longterm_redactions(date,integer) from public, anon, authenticated;
grant execute on function private.server_run_due_privacy_longterm_redactions(date,integer) to service_role;

create or replace function public.server_run_due_privacy_longterm_redactions(
  p_as_of date,
  p_limit integer
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.server_run_due_privacy_longterm_redactions(p_as_of,p_limit)
$$;

revoke all on function public.server_run_due_privacy_longterm_redactions(date,integer) from public, anon, authenticated;
grant execute on function public.server_run_due_privacy_longterm_redactions(date,integer) to service_role;

comment on function private.server_privacy_longterm_redaction_preview(uuid,jsonb,date) is
  'Read-only service-role dry-run for audit and month-snapshot long-term redaction using candidate rules.';
comment on function private.server_execute_privacy_longterm_redaction(uuid,date) is
  'Service-role long-term redaction. Requires an approved retention profile, blocks on any active company legal hold, and is idempotent per profile/day.';
comment on table private.privacy_redaction_runs is
  'Metadata-only evidence for long-term retention redaction runs. Does not store removed cleartext.';
