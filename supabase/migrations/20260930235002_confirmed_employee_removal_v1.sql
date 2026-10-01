-- Remove a profile from personnel management while retaining payroll/history.
ALTER TABLE public.employees ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.employees ADD COLUMN deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD CONSTRAINT removed_employee_access_disabled CHECK
  (deleted_at IS NULL OR (status='inactive' AND auth_user_id IS NULL AND access_status='DISABLED'));

CREATE FUNCTION public.manager_employee_removal_preview(p_company_id uuid,p_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e public.employees%rowtype; v_timezone text; v_today date; v_cancel uuid[]; v_absences uuid[]; v_hash text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=p_company_id
    AND user_id=auth.uid() AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Verwaltungsrechte.'; END IF;
  SELECT * INTO e FROM public.employees WHERE company_id=p_company_id AND id=p_employee_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Der Mitarbeiter wurde nicht gefunden oder bereits gelöscht.'; END IF;
  SELECT timezone INTO v_timezone FROM public.companies WHERE id=p_company_id;
  v_timezone:=coalesce(v_timezone,'Europe/Berlin'); v_today:=(now() AT TIME ZONE v_timezone)::date;
  SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}'::uuid[]) INTO v_cancel FROM public.shift_assignments a
    WHERE a.company_id=p_company_id AND a.employee_id=p_employee_id AND a.status<>'CANCELLED' AND a.starts_at>=now()
      AND NOT EXISTS(SELECT 1 FROM public.time_entries t WHERE t.company_id=p_company_id AND t.assignment_id=a.id
        AND (t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.status IN('recorded','confirmed')))
      AND NOT EXISTS(SELECT 1 FROM public.time_month_closures c WHERE c.company_id=p_company_id AND c.status='CLOSED'
        AND c.month_start<=greatest((a.ends_at AT TIME ZONE v_timezone)::date,a.ends_at::date)
        AND (c.month_start+interval '1 month')::date>least((a.starts_at AT TIME ZONE v_timezone)::date,a.starts_at::date));
  SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}'::uuid[]) INTO v_absences FROM public.absences a
    WHERE a.company_id=p_company_id AND a.employee_id=p_employee_id AND a.start_date>=v_today
      AND NOT EXISTS(SELECT 1 FROM public.time_month_closures c WHERE c.company_id=p_company_id AND c.status='CLOSED'
        AND c.month_start<=a.end_date AND (c.month_start+interval '1 month')::date>a.start_date);
  SELECT md5(jsonb_build_object('employee',to_jsonb(e),'cancel',v_cancel,'delete_absences',v_absences,
    'shifts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.shift_assignments a WHERE a.company_id=p_company_id AND a.employee_id=p_employee_id),
    'absences',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.absences a WHERE a.company_id=p_company_id AND a.employee_id=p_employee_id),
    'time_entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.assignment_id) FROM public.time_entries t JOIN public.shift_assignments a ON a.id=t.assignment_id WHERE a.company_id=p_company_id AND a.employee_id=p_employee_id),
    'closures',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.month_start) FROM public.time_month_closures c WHERE c.company_id=p_company_id))::text) INTO v_hash;
  RETURN jsonb_build_object('employee_id',e.id,'employee_name',btrim(e.first_name||' '||e.last_name),'personnel_no',e.personnel_no,
    'company_name',(SELECT name FROM public.companies WHERE id=p_company_id),'fingerprint',v_hash,
    'cancel_assignment_ids',v_cancel,'delete_absence_ids',v_absences,'cancel_shifts',cardinality(v_cancel),'delete_absences',cardinality(v_absences),
    'retained_shifts',(SELECT count(*) FROM public.shift_assignments WHERE company_id=p_company_id AND employee_id=p_employee_id)-cardinality(v_cancel),
    'retained_absences',(SELECT count(*) FROM public.absences WHERE company_id=p_company_id AND employee_id=p_employee_id)-cardinality(v_absences));
END $$;
REVOKE ALL ON FUNCTION public.manager_employee_removal_preview(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_employee_removal_preview(uuid,uuid) TO authenticated;

CREATE FUNCTION public.manager_remove_employee(p_company_id uuid,p_employee_id uuid,p_confirmation text,p_acknowledged boolean,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_preview jsonb; v_shifts integer; v_absences integer; v_employee integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=p_company_id
    AND user_id=auth.uid() AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Verwaltungsrechte.'; END IF;
  PERFORM 1 FROM public.employees WHERE id=p_employee_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Der Mitarbeiter wurde nicht gefunden oder bereits gelöscht.'; END IF;
  PERFORM 1 FROM public.shift_assignments WHERE company_id=p_company_id AND employee_id=p_employee_id FOR UPDATE;
  PERFORM 1 FROM public.absences WHERE company_id=p_company_id AND employee_id=p_employee_id FOR UPDATE;
  PERFORM 1 FROM public.time_entries t WHERE t.company_id=p_company_id AND EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.id=t.assignment_id AND a.employee_id=p_employee_id AND a.company_id=p_company_id) FOR UPDATE;
  v_preview:=public.manager_employee_removal_preview(p_company_id,p_employee_id);
  IF p_acknowledged IS DISTINCT FROM true OR btrim(coalesce(p_confirmation,''))<>(v_preview->>'employee_name') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bitte den vollständigen Namen eingeben und die Löschfolgen bestätigen.'; END IF;
  IF p_fingerprint IS DISTINCT FROM (v_preview->>'fingerprint') THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Die betroffenen Daten wurden inzwischen geändert. Bitte die Löschübersicht erneut öffnen.'; END IF;
  PERFORM set_config('app.schichtfunk_employee_removal',p_employee_id::text,true);
  UPDATE public.shift_assignments SET status='CANCELLED',version=version+1 WHERE company_id=p_company_id AND employee_id=p_employee_id
    AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(v_preview->'cancel_assignment_ids'));
  GET DIAGNOSTICS v_shifts=ROW_COUNT;
  DELETE FROM public.absences WHERE company_id=p_company_id AND employee_id=p_employee_id
    AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(v_preview->'delete_absence_ids'));
  GET DIAGNOSTICS v_absences=ROW_COUNT;
  UPDATE public.shift_change_requests SET status='CANCELLED' WHERE company_id=p_company_id AND employee_id=p_employee_id
    AND status NOT IN('APPLIED','REJECTED','CANCELLED','SUPERSEDED');
  UPDATE public.employees SET status='inactive',access_status='DISABLED',auth_user_id=NULL,deleted_at=clock_timestamp(),deleted_by=auth.uid()
    WHERE company_id=p_company_id AND id=p_employee_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_employee=ROW_COUNT;
  IF v_employee<>1 OR v_shifts<>(v_preview->>'cancel_shifts')::integer OR v_absences<>(v_preview->>'delete_absences')::integer THEN
    RAISE EXCEPTION 'Die Löschung konnte nicht vollständig ausgeführt werden.'; END IF;
  PERFORM set_config('app.schichtfunk_employee_removal','',true);
  RETURN jsonb_build_object('removed',true,'employee_id',p_employee_id,'cancelled_shifts',v_shifts,'deleted_absences',v_absences,
    'retained_shifts',v_preview->'retained_shifts','retained_absences',v_preview->'retained_absences');
END $$;
REVOKE ALL ON FUNCTION public.manager_remove_employee(uuid,uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_remove_employee(uuid,uuid,text,boolean,text) TO authenticated;

CREATE FUNCTION public.guard_removed_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user IN('postgres','service_role','supabase_admin') THEN RETURN new; END IF;
  IF old.deleted_at IS NOT NULL AND new.deleted_at IS DISTINCT FROM old.deleted_at THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ein gelöschtes Mitarbeiterprofil kann nicht erneut aktiviert werden.'; END IF;
  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL AND
    current_setting('app.schichtfunk_employee_removal',true) IS DISTINCT FROM old.id::text THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Bitte die gesonderte Löschbestätigung verwenden.'; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.guard_removed_employee() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER employees_confirm_removal BEFORE UPDATE OF deleted_at ON public.employees FOR EACH ROW EXECUTE FUNCTION public.guard_removed_employee();

CREATE FUNCTION public.guard_removed_employee_planning()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_deleted timestamptz;
BEGIN
  SELECT e.deleted_at INTO v_deleted FROM public.employees e WHERE e.id=new.employee_id AND e.company_id=new.company_id FOR SHARE;
  IF v_deleted IS NULL THEN RETURN new; END IF;
  IF TG_TABLE_NAME='shift_assignments' THEN
    IF new.status='CANCELLED' THEN RETURN new; END IF;
    IF TG_OP='UPDATE' AND old.employee_id=new.employee_id AND old.company_id=new.company_id AND old.status<>'CANCELLED' THEN RETURN new; END IF;
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.company_id=new.company_id AND a.employee_id=new.employee_id
      AND a.status<>'CANCELLED' AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))) THEN RETURN new; END IF;
  ELSE
    IF TG_OP='UPDATE' AND old.employee_id=new.employee_id AND old.company_id=new.company_id THEN RETURN new; END IF;
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.absences a WHERE a.company_id=new.company_id AND a.employee_id=new.employee_id
      AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))) THEN RETURN new; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Für gelöschte Mitarbeiter sind keine neuen Einplanungen oder Abwesenheiten möglich.';
END $$;
REVOKE ALL ON FUNCTION public.guard_removed_employee_planning() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assignments_removed_employee BEFORE INSERT OR UPDATE OF employee_id,company_id,status ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_removed_employee_planning();
CREATE TRIGGER absences_removed_employee BEFORE INSERT OR UPDATE OF employee_id,company_id ON public.absences FOR EACH ROW EXECUTE FUNCTION public.guard_removed_employee_planning();

create or replace function public.protect_published_assignment()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
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
