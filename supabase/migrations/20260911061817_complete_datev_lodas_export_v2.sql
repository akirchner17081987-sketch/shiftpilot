-- Punkt 8: produktionsfester DATEV-LODAS-Export.
-- Der Browser darf die Datei erst erzeugen, nachdem der unveraenderbare
-- Monatsstand und der konkrete Datei-Hash serverseitig autorisiert wurden.

revoke all on table public.datev_lodas_settings from public, anon;
revoke all on table public.datev_lodas_rules from public, anon;

grant select, insert, update on table public.datev_lodas_settings to authenticated;
grant select, insert, update, delete on table public.datev_lodas_rules to authenticated;

create or replace function private.authorize_datev_lodas_export(
  p_company_id uuid,
  p_month date,
  p_row_count integer,
  p_content_sha256 text,
  p_expected_closure_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_revision integer;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  if p_company_id is null then
    raise exception 'Mandant fehlt';
  end if;

  if p_month is null or p_month <> v_month then
    raise exception 'Ungueltiger Abrechnungsmonat';
  end if;

  if coalesce(p_row_count, 0) < 1 or p_row_count > 100000 then
    raise exception 'Der DATEV-Export muss zwischen 1 und 100000 Bewegungszeilen enthalten';
  end if;

  if coalesce(p_content_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungueltige DATEV-Dateipruefsumme';
  end if;

  if coalesce(p_expected_closure_revision, 0) < 1 then
    raise exception 'Ungueltige Monatsabschluss-Revision';
  end if;

  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = v_uid
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'ADMIN')
  limit 1;

  if v_role is null then
    raise exception 'Nicht berechtigt';
  end if;

  select c.revision
    into v_revision
  from public.time_month_closures c
  where c.company_id = p_company_id
    and c.month_start = v_month
    and c.status = 'CLOSED';

  if v_revision is null then
    raise exception 'DATEV-Export ist nur fuer abgeschlossene Monate zulaessig';
  end if;

  if v_revision <> p_expected_closure_revision then
    raise exception 'Der Monatsabschluss wurde seit der Vorpruefung geaendert';
  end if;

  insert into public.audit_events(
    company_id,
    event_type,
    entity_type,
    entity_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    metadata
  )
  values (
    p_company_id,
    'DATEV_LODAS_EXPORTED',
    'TIME_MONTH',
    p_company_id,
    v_uid,
    v_role,
    '{}'::jsonb,
    jsonb_build_object(
      'monthStart', v_month,
      'rowCount', p_row_count,
      'closureRevision', v_revision
    ),
    jsonb_build_object(
      'format', 'LODAS',
      'versionSst', '1.0',
      'manualEdition', '94/2026-06',
      'sha256', p_content_sha256,
      'serverAuthorized', true
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function private.authorize_datev_lodas_export(uuid,date,integer,text,integer)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.authorize_datev_lodas_export(uuid,date,integer,text,integer)
  to authenticated;

create or replace function public.manager_authorize_datev_lodas_export(
  p_company_id uuid,
  p_month date,
  p_row_count integer,
  p_content_sha256 text,
  p_expected_closure_revision integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.authorize_datev_lodas_export(
    p_company_id,
    p_month,
    p_row_count,
    p_content_sha256,
    p_expected_closure_revision
  );
$$;

revoke all on function public.manager_authorize_datev_lodas_export(uuid,date,integer,text,integer)
  from public, anon, authenticated;
grant execute on function public.manager_authorize_datev_lodas_export(uuid,date,integer,text,integer)
  to authenticated;

comment on function public.manager_authorize_datev_lodas_export(uuid,date,integer,text,integer)
  is 'Authorisiert und protokolliert genau einen DATEV-LODAS-Download fuer eine unveraenderte Monatsabschluss-Revision.';
