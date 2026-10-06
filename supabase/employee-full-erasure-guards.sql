
-- Preserve the installed guards and add the narrowly scoped erasure action.
CREATE OR REPLACE FUNCTION private.sf_guard_absence_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_start date; v_end date;
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op in ('UPDATE','DELETE') and exists (
    select 1 from public.time_month_closures c where c.company_id=old.company_id and c.status='CLOSED'
      and c.month_start<=old.end_date and (c.month_start+interval '1 month')::date>old.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op in ('INSERT','UPDATE') and exists (
    select 1 from public.time_month_closures c where c.company_id=new.company_id and c.status='CLOSED'
      and c.month_start<=new.end_date and (c.month_start+interval '1 month')::date>new.start_date
  ) then raise exception 'Eine betroffene Abwesenheit liegt in einem abgeschlossenen Monat'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_absence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op in ('UPDATE','DELETE') and private.time_month_overlap_closed(old.company_id,old.start_date,old.end_date) then
    raise exception 'Abwesenheit berührt einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.time_month_overlap_closed(new.company_id,new.start_date,new.end_date) then
    raise exception 'Für einen abgeschlossenen Monat können keine Abwesenheiten mehr angelegt oder geändert werden.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_company_id uuid := coalesce((v_new->>'company_id')::uuid, (v_old->>'company_id')::uuid);
  v_entity_id uuid := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_actor_role text;
begin
  if private.sf_erasure_context_plan(v_company_id) is not null then
    if private.sf_erasure_row_allowed(v_company_id,coalesce(v_old,v_new))
      or private.sf_erasure_scrub(v_old,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(v_company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(v_company_id)->'names'))) is distinct from v_old then
      return case when tg_op='DELETE' then old else new end;
    end if;
  end if;

  select cm.role into v_actor_role
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'ACTIVE';

  insert into public.audit_events(
    company_id, event_type, entity_type, entity_id, actor_id, actor_role,
    old_values, new_values, metadata
  ) values (
    v_company_id,
    upper(tg_op || '_' || tg_table_name),
    tg_table_name,
    v_entity_id,
    auth.uid(),
    coalesce(v_actor_role, 'SYSTEM'),
    v_old,
    v_new,
    jsonb_build_object('schema', tg_table_schema, 'backendCaptured', true)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE row_data public.time_entries%rowtype; work_day date; tz text;
BEGIN
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

 IF TG_OP='DELETE' THEN row_data:=old; ELSE row_data:=new; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=row_data.company_id;
 work_day:=coalesce((row_data.actual_start AT TIME ZONE tz)::date,
  (SELECT (a.starts_at AT TIME ZONE tz)::date FROM public.shift_assignments a WHERE a.id=row_data.assignment_id));
 IF private.sf_is_time_month_closed(row_data.company_id,work_day) THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF row_data.actual_end IS NULL THEN
   IF row_data.status<>'open' THEN RAISE EXCEPTION 'Ein fehlendes Ende ist nur fuer eine laufende Zeitbuchung zulaessig'; END IF;
  ELSE
   PERFORM private.sf_validate_time_values(row_data.actual_start,row_data.actual_end,row_data.break_minutes);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_assignment_id uuid := coalesce(new.assignment_id,old.assignment_id);
  v_company_id uuid := coalesce(new.company_id,old.company_id);
  v_work_date date;
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  select (timezone('Europe/Berlin',sa.starts_at))::date into v_work_date
  from public.shift_assignments sa where sa.id=v_assignment_id;
  if v_work_date is not null and private.time_month_is_closed(v_company_id,v_work_date) then
    raise exception 'Monat % ist abgeschlossen. Ist-Zeiten sind gesperrt.',to_char(v_work_date,'MM/YYYY');
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_account_opening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op in ('UPDATE','DELETE') and private.opening_affects_closed_month(old.company_id,old.effective_date) then
    raise exception 'Der Startsaldo beeinflusst einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.opening_affects_closed_month(new.company_id,new.effective_date) then
    raise exception 'Der Startsaldo würde einen abgeschlossenen Monat beeinflussen. Öffne den Monatsabschluss zuerst wieder.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sf_guard_shift_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE tz text;
BEGIN
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

 IF TG_OP IN('UPDATE','DELETE') THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=old.company_id;
  IF private.sf_is_time_month_closed(old.company_id,(old.starts_at AT TIME ZONE tz)::date)
  THEN RAISE EXCEPTION 'Der Monat der bisherigen Schicht ist abgeschlossen'; END IF;
 END IF;
 IF TG_OP IN('INSERT','UPDATE') THEN
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=new.company_id;
  IF private.sf_is_time_month_closed(new.company_id,(new.starts_at AT TIME ZONE tz)::date)
  THEN RAISE EXCEPTION 'Der Monat der Schicht ist abgeschlossen'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.protect_published_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  -- Ausschließlich der streng geschützte administrative Komplett-Reset darf
  -- veröffentlichte Schichten physisch entfernen. Normale Browser-/RLS-Pfade
  -- können dieses transaktionslokale Flag nicht setzen.
  if current_setting('app.schichtfunk_full_plan_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Confirmed profile removal may cancel only this employee's future duties.
  if tg_op='UPDATE' and new.status='CANCELLED' and old.starts_at>=now()
     and current_setting('app.schichtfunk_employee_removal',true)=old.employee_id::text
     and exists(select 1 from public.company_members where company_id=old.company_id and user_id=auth.uid()
       and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER'))
     and new.company_id=old.company_id and new.employee_id=old.employee_id and new.shift_code=old.shift_code
     and new.starts_at=old.starts_at and new.ends_at=old.ends_at and new.break_minutes=old.break_minutes
     and new.note is not distinct from old.note then return new; end if;

  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then
      raise exception 'Published assignments are append/change-request controlled and cannot be deleted directly';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.status='PUBLISHED' then
    if new.employee_id is not distinct from old.employee_id
       and new.shift_code is not distinct from old.shift_code
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.break_minutes is not distinct from old.break_minutes
       and new.note is not distinct from old.note
       and new.status is not distinct from old.status then
      return new;
    end if;
    if new.last_change_request_id is null or not exists(
      select 1 from public.shift_change_requests r
      where r.id=new.last_change_request_id
        and r.company_id=old.company_id
        and r.assignment_id=old.id
        and r.status='READY_TO_APPLY'
        and ((r.action='UPDATE' and new.status='PUBLISHED') or (r.action='DELETE' and new.status='CANCELLED'))
    ) then
      raise exception 'Published assignment changes require a READY_TO_APPLY change request';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.enforce_closed_month_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_old_date date;
  v_new_date date;
begin
  if tg_op in('DELETE','UPDATE') and private.sf_erasure_row_allowed(old.company_id,to_jsonb(old)) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old_date := (timezone('Europe/Berlin',old.starts_at))::date;
    if private.time_month_is_closed(old.company_id,v_old_date) then
      raise exception 'Monat % ist abgeschlossen. Dienstplanänderungen sind gesperrt.',to_char(v_old_date,'MM/YYYY');
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_date := (timezone('Europe/Berlin',new.starts_at))::date;
    if private.time_month_is_closed(new.company_id,v_new_date) then
      raise exception 'Monat % ist abgeschlossen. Dienstplanänderungen sind gesperrt.',to_char(v_new_date,'MM/YYYY');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.sf_erasure_context_plan(old.company_id) is not null
    and private.sf_erasure_scrub(to_jsonb(old),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names'))) is distinct from to_jsonb(old) then
    if tg_op='DELETE' and (old.entity_id::text=any(array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')))
      or (private.sf_erasure_scrub(old.old_values,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names'))) is null
       and private.sf_erasure_scrub(old.new_values,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names'))) is null)) then return old; end if;
    if tg_op='UPDATE'
      and (to_jsonb(new)-'old_values'-'new_values'-'metadata'-'actor_id')=(to_jsonb(old)-'old_values'-'new_values'-'metadata'-'actor_id')
      and new.old_values is not distinct from private.sf_erasure_scrub(old.old_values,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names')))
      and new.new_values is not distinct from private.sf_erasure_scrub(old.new_values,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names')))
      and new.metadata is not distinct from coalesce(private.sf_erasure_scrub(old.metadata,array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references')),array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'names'))),'{}'::jsonb)
      and new.actor_id is not distinct from (case when old.actor_id::text=any(array(select jsonb_array_elements_text(private.sf_erasure_context_plan(old.company_id)->'references'))) then null else old.actor_id end)
      then return new; end if;
    raise exception 'Die Löschfreigabe umfasst diese Protokolländerung nicht';
  end if;
  -- The Auth API can clear only the FK actor attribution of an explicitly staged,
  -- exclusive account after its database data was removed.
  if tg_op='UPDATE' and current_user in('supabase_auth_admin','postgres')
    and old.actor_id is not null and new.actor_id is null
    and (to_jsonb(new)-'actor_id')=(to_jsonb(old)-'actor_id')
    and private.sf_erasure_auth_actor_clear(old.actor_id) then return new; end if;

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
$function$;

create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_access_invites" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_personnel_details" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_personnel_qualifications" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_personnel_documents" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_personnel_notes" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."absences" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."shift_swap_requests" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_entries" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "private"."personnel_expiry_reminder_log" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employee_time_account_openings" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."shift_assignment_confirmations" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."disruption_incidents" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."disruption_offers" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_account_openings" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_independent_shifts" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_independent_events" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_independent_breaks" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_independent_sessions" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."shift_change_requests" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."shift_assignments" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."employees" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_terminals" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_pilot_employees" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_punches" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "private"."privacy_lifecycle_requests" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."time_qr_breaks" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."open_shift_market_claims" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "private"."employee_profile_requests" for each row execute function private.sf_guard_employee_erasure_pending();
create trigger a00_employee_erasure_freeze before insert or update or delete on "public"."shift_templates" for each row execute function private.sf_guard_employee_erasure_pending();

create table private.employee_roster_sync_context(transaction_id bigint,backend_pid integer,company_id uuid,primary key(transaction_id,backend_pid));
alter table private.employee_roster_sync_context enable row level security;
revoke all on private.employee_roster_sync_context from public,anon,authenticated,service_role;
create function private.employee_roster_generation(p_company_id uuid) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if not private.sf_is_manager(p_company_id,false) then raise exception 'Verwaltungsrechte fehlen'; end if;
 return coalesce((select generation from private.employee_roster_generation where company_id=p_company_id),0);
end $$;
create function public.employee_roster_generation(p_company_id uuid) returns bigint language sql security invoker set search_path='' as $$select private.employee_roster_generation(p_company_id)$$;
create function private.sf_guard_employee_roster_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.employees e where e.company_id=new.company_id and (e.id=new.id or (new.legacy_id is not null and e.legacy_id=new.legacy_id))) then return new; end if;
 if coalesce((select generation from private.employee_roster_generation where company_id=new.company_id),0)=0 then return new; end if;
 if exists(select 1 from private.employee_roster_sync_context where transaction_id=txid_current() and backend_pid=pg_backend_pid() and company_id=new.company_id) then return new; end if;
 if auth.uid() is null and session_user in('postgres','supabase_admin') then return new; end if;
 raise exception 'Der Mitarbeiterbestand wurde bereinigt. Bitte die Seite neu laden und den Mitarbeiter bei Bedarf bewusst neu anlegen';
end $$;
create trigger a01_employee_roster_insert before insert on public.employees for each row execute function private.sf_guard_employee_roster_insert();
create function private.manager_upsert_employees_checked(p_company_id uuid,p_generation bigint,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; result jsonb:='[]'; written public.employees%rowtype; actual_generation bigint;
begin
 if not private.sf_is_manager(p_company_id,false) then raise exception 'Verwaltungsrechte fehlen'; end if;
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 actual_generation:=coalesce((select generation from private.employee_roster_generation where company_id=p_company_id),0);
 if p_generation is distinct from actual_generation then raise exception 'Der Mitarbeiterbestand hat sich geändert. Bitte die Seite neu laden'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Ungültige Mitarbeiterdaten'; end if;
 insert into private.employee_roster_sync_context values(txid_current(),pg_backend_pid(),p_company_id);
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'company_id' is distinct from p_company_id::text or coalesce(r->>'legacy_id','')='' or (r-ARRAY['company_id','legacy_id','first_name','last_name','personnel_no','role','employment','weekly_hours','start_date','contract_end','birth_date','status','email','phone','address','zip','city','shift_permissions','qualifications','work_time_model','note'])<>'{}'::jsonb then raise exception 'Ungültige Mitarbeiterdaten'; end if;
  if exists(select 1 from public.employees where company_id=p_company_id and legacy_id=r->>'legacy_id' and deleted_at is not null) then raise exception 'Entfernte Mitarbeiter können nicht durch die Speicherung reaktiviert werden'; end if;
  insert into public.employees(company_id,legacy_id,first_name,last_name,personnel_no,role,employment,weekly_hours,start_date,contract_end,birth_date,status,email,phone,address,zip,city,shift_permissions,qualifications,work_time_model,note)
  select "company_id","legacy_id","first_name","last_name","personnel_no","role","employment","weekly_hours","start_date","contract_end","birth_date","status","email","phone","address","zip","city","shift_permissions","qualifications","work_time_model","note" from jsonb_populate_record(null::public.employees,'{"role":"Sicherheitsmitarbeiter","employment":"Vollzeit","weekly_hours":40,"status":"active","shift_permissions":[],"qualifications":[],"work_time_model":"SHIFT","note":""}'::jsonb||r)
  on conflict(company_id,legacy_id) do update set "first_name"=excluded."first_name","last_name"=excluded."last_name","personnel_no"=excluded."personnel_no","role"=excluded."role","employment"=excluded."employment","weekly_hours"=excluded."weekly_hours","start_date"=excluded."start_date","contract_end"=excluded."contract_end","birth_date"=excluded."birth_date","status"=excluded."status","email"=excluded."email","phone"=excluded."phone","address"=excluded."address","zip"=excluded."zip","city"=excluded."city","shift_permissions"=excluded."shift_permissions","qualifications"=excluded."qualifications","work_time_model"=excluded."work_time_model","note"=excluded."note"
  returning * into written;
  result:=result||jsonb_build_array(jsonb_build_object('id',written.id,'legacy_id',written.legacy_id));
 end loop;
 delete from private.employee_roster_sync_context where transaction_id=txid_current() and backend_pid=pg_backend_pid();
 return result;
end $$;
create function public.manager_upsert_employees_checked(p_company_id uuid,p_generation bigint,p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.manager_upsert_employees_checked(p_company_id,p_generation,p_rows)$$;

do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname=any(ARRAY['sf_erasure_owner','sf_erasure_scrub','sf_erasure_has','sf_erasure_context_plan','sf_erasure_row_allowed','sf_erasure_relations','sf_employee_erasure_plan','sf_erasure_public_preview','owner_employee_erasure_list','owner_employee_erasure_preview','server_stage_employee_erasure','sf_guard_employee_erasure_pending','sf_erasure_storage_write_allowed','server_commit_employee_erasure','server_finish_employee_erasure','employee_roster_generation','sf_guard_employee_roster_insert','manager_upsert_employees_checked','sf_erasure_auth_actor_clear','server_validate_employee_erasure_session']) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in('owner_employee_erasure_list','owner_employee_erasure_preview','employee_roster_generation','manager_upsert_employees_checked','sf_erasure_storage_write_allowed') then execute format('grant execute on function %s to authenticated',f.signature); end if;
  if f.proname in('server_stage_employee_erasure','server_commit_employee_erasure','server_finish_employee_erasure','server_validate_employee_erasure_session') then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $permissions$;


-- These read-only helpers expose only the caller's current transaction context.
grant execute on function private.sf_erasure_context_plan(uuid),private.sf_erasure_row_allowed(uuid,jsonb),private.sf_erasure_scrub(jsonb,text[],text[]) to authenticated,service_role,supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.sf_erasure_auth_actor_clear(uuid) to supabase_auth_admin;
