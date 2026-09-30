-- One-off operator template, explicitly authorized company copy. Not a migration.
-- Replace SOURCE_COMPANY_UUID and OWNER_USER_UUID before execution.
-- Default is a complete dry run. Change only the final ROLLBACK to COMMIT after review.
-- Runtime credentials, sessions and push device registrations are never shared.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE clone_config AS SELECT
  'SOURCE_COMPANY_UUID'::uuid AS source_id,
  gen_random_uuid() AS target_id,
  'SchichtFunk – Unternehmen 2'::text AS target_name;
CREATE TEMP TABLE clone_rows (relation text, row_data jsonb);
CREATE TEMP TABLE clone_ids (old_id text PRIMARY KEY, new_id uuid NOT NULL UNIQUE);
CREATE TEMP TABLE clone_result (summary jsonb);

DO $$
DECLARE cfg record; rel record;
BEGIN
  SELECT * INTO cfg FROM clone_config;
  IF EXISTS (SELECT 1 FROM public.companies WHERE name=cfg.target_name) THEN
    RAISE EXCEPTION 'Target already exists; do not run this operation twice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id=cfg.source_id
    AND user_id='OWNER_USER_UUID' AND role='OWNER' AND status='ACTIVE') THEN
    RAISE EXCEPTION 'Expected source owner missing';
  END IF;
  FOR rel IN SELECT table_schema,table_name FROM information_schema.columns
    WHERE column_name='company_id' AND table_schema IN ('public','private')
    AND table_name NOT IN ('push_subscriptions','time_qr_independent_sessions','privacy_lifecycle_requests')
    AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname=table_schema)
  LOOP
    EXECUTE format('INSERT INTO clone_rows SELECT %L,to_jsonb(t) FROM %I.%I t WHERE company_id=$1',
      rel.table_schema||'.'||rel.table_name,rel.table_schema,rel.table_name) USING cfg.source_id;
  END LOOP;
  INSERT INTO clone_rows SELECT 'public.companies',to_jsonb(c) FROM public.companies c WHERE id=cfg.source_id;
  INSERT INTO clone_rows SELECT 'public.time_qr_independent_breaks',to_jsonb(b)
    FROM public.time_qr_independent_breaks b JOIN public.time_qr_independent_shifts s ON s.id=b.shift_id WHERE s.company_id=cfg.source_id;
  INSERT INTO clone_rows SELECT 'public.time_qr_independent_events',to_jsonb(b)
    FROM public.time_qr_independent_events b JOIN public.time_qr_independent_shifts s ON s.id=b.shift_id WHERE s.company_id=cfg.source_id;
  IF EXISTS (SELECT 1 FROM clone_rows WHERE relation IN ('public.employee_personnel_documents','public.time_qr_pilot_employees','private.privacy_legal_holds'))
    OR EXISTS (SELECT 1 FROM private.privacy_lifecycle_requests WHERE company_id=cfg.source_id) THEN
    RAISE EXCEPTION 'Copy requires additional storage/pilot/lifecycle review';
  END IF;
  INSERT INTO clone_ids SELECT DISTINCT row_data->>'id',gen_random_uuid() FROM clone_rows WHERE row_data ? 'id';
  UPDATE clone_ids SET new_id=cfg.target_id WHERE old_id=cfg.source_id::text;
END $$;

CREATE FUNCTION pg_temp.clone_remap(value jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE replacement uuid; result jsonb; item record;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'string' THEN
      SELECT new_id INTO replacement FROM clone_ids WHERE old_id=value#>>'{}';
      RETURN CASE WHEN replacement IS NULL THEN value ELSE to_jsonb(replacement) END;
    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(pg_temp.clone_remap(v) ORDER BY ord),'[]'::jsonb) INTO result
      FROM jsonb_array_elements(value) WITH ORDINALITY a(v,ord); RETURN result;
    WHEN 'object' THEN
      SELECT coalesce(jsonb_object_agg(k,pg_temp.clone_remap(v)),'{}'::jsonb) INTO result
      FROM jsonb_each(value) a(k,v); RETURN result;
    ELSE RETURN value;
  END CASE;
END $$;

DO $$
DECLARE cfg record; rel text; src record; data jsonb; saved jsonb; cols text; inserted bigint;
  token text; secret_id uuid; rows_count bigint; clone_count bigint;
  relation_order text[] := ARRAY[
    'public.companies','public.employees','public.shift_templates',
    'public.time_qr_terminals','public.shift_assignments','public.shift_change_requests',
    'public.shift_change_approvals','public.compliance_check_runs','public.compliance_findings',
    'public.shift_swap_requests','public.shift_assignment_confirmations',
    'public.disruption_incidents','public.disruption_offers','public.absences',
    'public.employee_personnel_details','public.employee_personnel_notes','public.employee_personnel_qualifications',
    'public.employee_time_account_openings','public.time_account_openings',
    'public.time_entries','public.time_qr_independent_shifts','public.time_qr_independent_breaks','public.time_qr_independent_events',
    'public.time_qr_breaks','public.company_compliance_policy','public.daily_staffing_overrides',
    'public.global_staffing_requirements','public.datev_lodas_rules','public.datev_lodas_settings',
    'public.time_account_settings','public.plan_publications','public.legacy_imports',
    'public.employee_access_invites','public.company_member_invites',
    'private.privacy_retention_profiles','private.privacy_redaction_runs','private.personnel_expiry_reminder_log',
    'public.audit_events'
  ];
BEGIN
  SELECT * INTO cfg FROM clone_config;
  -- Existing historical assignments may predate standard-rule checks. This is
  -- the same transaction-local archive import mode supported by the application.
  PERFORM set_config('schichtfunk.legacy_import','on',true);
  FOREACH rel IN ARRAY relation_order LOOP
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols
      FROM pg_attribute WHERE attrelid=rel::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
    FOR src IN SELECT row_data FROM clone_rows WHERE relation=rel LOOP
      data := pg_temp.clone_remap(src.row_data);
      IF rel='public.companies' THEN data:=data||jsonb_build_object('name',cfg.target_name,'created_at',now(),'updated_at',now()); END IF;
      IF rel='public.employees' THEN
        data:=data||jsonb_build_object('auth_user_id',null,'access_status','NONE','access_linked_at',null);
      END IF;
      IF rel='public.shift_assignments' THEN data:=data||jsonb_build_object('last_change_request_id',null); END IF;
      IF rel='public.shift_change_requests' AND data->>'action'='UPDATE'
        AND data->>'status'='APPLIED' AND data->'old_snapshot'=data->'proposed_snapshot' THEN
        -- One historic applied no-op predates the current insert validation.
        -- Retain both exact snapshots in the audit archive, without representing
        -- it as a new actionable change or disabling the current validation.
        data:=data||jsonb_build_object('old_snapshot',null);
      END IF;
      IF rel IN ('public.employee_access_invites','public.company_member_invites') THEN
        data:=data||jsonb_build_object('token_hash',encode(extensions.gen_random_bytes(32),'hex'),
          'expires_at',least((data->>'expires_at')::timestamptz,now()-interval '1 second'));
      END IF;
      IF rel='public.time_qr_terminals' THEN
        token:=encode(extensions.gen_random_bytes(32),'hex');
        SELECT vault.create_secret(token,'schichtfunk-qr-terminal-'||(data->>'id'),
          'Independent terminal credential for explicitly authorized company clone') INTO secret_id;
        data:=data||jsonb_build_object('token_hash','\x'||encode(extensions.digest(token,'sha256'),'hex'),
          'vault_secret_id',secret_id);
      END IF;
      IF rel='public.audit_events' THEN
        data:=data||jsonb_build_object('metadata',coalesce(data->'metadata','{}'::jsonb)||
          jsonb_build_object('clonedFromCompany',cfg.source_id,'clonedFromEvent',src.row_data->>'id'));
      END IF;
      EXECUTE format('INSERT INTO %s AS t (%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) RETURNING to_jsonb(t)',rel,cols,cols,rel)
        INTO saved USING data;
      IF (saved-'updated_at') IS DISTINCT FROM (data-'updated_at') THEN
        RAISE EXCEPTION 'Copied business values differ in %',rel;
      END IF;
    END LOOP;
  END LOOP;
  UPDATE public.shift_assignments a SET last_change_request_id=m.new_id
    FROM clone_rows r JOIN clone_ids ai ON ai.old_id=r.row_data->>'id'
    JOIN clone_ids m ON m.old_id=r.row_data->>'last_change_request_id'
    WHERE r.relation='public.shift_assignments' AND a.id=ai.new_id AND a.company_id=cfg.target_id;
  PERFORM set_config('schichtfunk.legacy_import','off',true);
  -- Preserve notification and QR punch history without issuing notifications,
  -- copying authenticated punch identity, or bypassing QR identity checks.
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    SELECT cfg.target_id,CASE WHEN relation='public.notifications' THEN 'COMPANY_CLONE_NOTIFICATION_HISTORY' ELSE 'COMPANY_CLONE_QR_PUNCH_HISTORY' END,
      CASE WHEN relation='public.notifications' THEN 'notification' ELSE 'time_qr_punch' END,
      (pg_temp.clone_remap(row_data)->>'id')::uuid,null,'SYSTEM',pg_temp.clone_remap(row_data),
      jsonb_build_object('clonedFromCompany',cfg.source_id,'historicalOnly',true)
    FROM clone_rows WHERE relation IN ('public.notifications','public.time_qr_punches');
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
    SELECT cfg.target_id,'COMPANY_CLONE_LEGACY_NOOP_HISTORY','shift_change_request',
      (pg_temp.clone_remap(row_data)->>'id')::uuid,null,'SYSTEM',pg_temp.clone_remap(row_data),
      jsonb_build_object('clonedFromCompany',cfg.source_id,'historicalOnly',true)
    FROM clone_rows WHERE relation='public.shift_change_requests' AND row_data->>'action'='UPDATE'
      AND row_data->>'status'='APPLIED' AND row_data->'old_snapshot'=row_data->'proposed_snapshot';
  -- Month closures and memberships come last: no closed-period write guards
  -- or manager notification recipients exist while business data is imported.
  FOREACH rel IN ARRAY ARRAY['public.time_month_closures','public.company_members'] LOOP
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols
      FROM pg_attribute WHERE attrelid=rel::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
    FOR src IN SELECT row_data FROM clone_rows WHERE relation=rel LOOP
      EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1)',rel,cols,cols,rel)
      USING CASE WHEN rel='public.company_members' THEN pg_temp.clone_remap(src.row_data)||jsonb_build_object('created_at',now()) ELSE pg_temp.clone_remap(src.row_data) END;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM clone_rows WHERE relation <> ALL(relation_order)
    AND relation NOT IN ('public.time_month_closures','public.company_members','public.notifications','public.time_qr_punches')) THEN
    RAISE EXCEPTION 'Unreviewed source data table; clone aborted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE company_id=cfg.target_id)
    OR EXISTS (SELECT 1 FROM public.employees WHERE company_id=cfg.target_id AND auth_user_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.shift_assignments a JOIN public.employees e ON e.id=a.employee_id WHERE a.company_id=cfg.target_id AND e.company_id<>cfg.target_id)
    OR EXISTS (SELECT 1 FROM public.time_qr_terminals t JOIN public.time_qr_terminals s ON s.company_id=cfg.source_id AND (s.token_hash=t.token_hash OR s.vault_secret_id=t.vault_secret_id) WHERE t.company_id=cfg.target_id) THEN
    RAISE EXCEPTION 'Isolation verification failed';
  END IF;
  FOREACH rel IN ARRAY relation_order||ARRAY['public.time_month_closures','public.company_members'] LOOP
    IF rel='public.audit_events' THEN CONTINUE; END IF;
    SELECT count(*) INTO rows_count FROM clone_rows WHERE relation=rel;
    IF rel IN ('public.time_qr_independent_breaks','public.time_qr_independent_events') THEN
      EXECUTE format('SELECT count(*) FROM %s t JOIN public.time_qr_independent_shifts s ON s.id=t.shift_id WHERE s.company_id=$1',rel) INTO clone_count USING cfg.target_id;
    ELSIF rel='public.companies' THEN SELECT count(*) INTO clone_count FROM public.companies WHERE id=cfg.target_id;
    ELSE EXECUTE format('SELECT count(*) FROM %s WHERE company_id=$1',rel) INTO clone_count USING cfg.target_id; END IF;
    IF rows_count<>clone_count THEN RAISE EXCEPTION 'Count mismatch for %: % vs %',rel,rows_count,clone_count; END IF;
  END LOOP;
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
    VALUES(cfg.target_id,'COMPANY_CLONED','company',cfg.target_id,'OWNER_USER_UUID','OWNER',
      jsonb_build_object('sourceCompany',cfg.source_id,'authorizedByOperator',true,'employeeAccessReset',true,'terminalTokensRotated',true,
      'notificationAndPunchHistoryArchived',true,'runtimeSessionsAndPushSubscriptionsExcluded',true));
  INSERT INTO clone_result SELECT jsonb_build_object('company_id',cfg.target_id,'name',cfg.target_name,
    'source_counts',(SELECT jsonb_object_agg(relation,n) FROM (SELECT relation,count(*) n FROM clone_rows GROUP BY relation) t),
    'isolation_verified',true,'notifications_sent',0);
END $$;
SELECT summary FROM clone_result;
ROLLBACK;
