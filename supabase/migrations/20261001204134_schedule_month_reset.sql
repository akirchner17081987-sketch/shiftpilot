-- Month-scoped administrative reset. Real time records and closed months stay protected.
CREATE TRIGGER a_open_market_month_closure_lock BEFORE INSERT OR UPDATE OR DELETE
 ON public.time_month_closures FOR EACH ROW EXECUTE FUNCTION private.sf_lock_market_company_write();

-- Midnight belongs to the planning date in the company's timezone, not the UTC month.
CREATE OR REPLACE FUNCTION private.sf_guard_shift_write() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tz text;
BEGIN
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
END $$;

CREATE FUNCTION private.schedule_month_reset_api(p_company_id uuid,p_month date,p_confirmation text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid(); actor_role text; first_day date; next_day date; tz text;
 ids uuid[]; offer_ids uuid[]; summary jsonb; closed boolean; recorded integer; qr integer;
 total integer; drafts integer; published integer; removed integer; publications integer;
 prev_flag text; first_week date; last_week date;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Bitte zuerst anmelden.'; END IF;
 SELECT role INTO actor_role FROM public.company_members WHERE company_id=p_company_id
  AND user_id=actor AND status='ACTIVE' AND role IN('OWNER','ADMIN') LIMIT 1;
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Nur Inhaber und Administratoren dürfen einen Dienstplanmonat löschen.'; END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 OR extract(year FROM p_month) NOT BETWEEN 100 AND 9999
 THEN RAISE EXCEPTION 'Bitte einen gültigen Monat auswählen.'; END IF;
 first_day:=p_month; next_day:=(p_month+interval '1 month')::date;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company_id;
 IF p_confirmation IS NOT NULL THEN
  IF p_confirmation<>'LÖSCHEN '||to_char(first_day,'YYYY-MM') THEN RAISE EXCEPTION 'Bitte die Bestätigung für genau diesen Monat eingeben.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 END IF;
 SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO ids FROM public.shift_assignments
  WHERE company_id=p_company_id AND starts_at >= first_day::timestamp AT TIME ZONE tz
   AND starts_at < next_day::timestamp AT TIME ZONE tz;
 IF p_confirmation IS NOT NULL THEN
  PERFORM 1 FROM public.shift_assignments WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.time_entries WHERE assignment_id=ANY(ids) ORDER BY assignment_id FOR UPDATE;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=p_company_id AND month_start=first_day AND status='CLOSED') INTO closed;
 SELECT count(*),count(*) FILTER(WHERE status='DRAFT'),count(*) FILTER(WHERE status='PUBLISHED')
  INTO total,drafts,published FROM public.shift_assignments WHERE id=ANY(ids);
 SELECT count(*) INTO recorded FROM public.time_entries WHERE assignment_id=ANY(ids)
  AND (actual_start IS NOT NULL OR actual_end IS NOT NULL OR status<>'open' OR confirmed_at IS NOT NULL OR submitted_at IS NOT NULL
   OR coalesce(employee_note,'')<>'' OR coalesce(manager_note,'')<>'');
 SELECT count(*) INTO qr FROM public.shift_assignments a WHERE a.id=ANY(ids)
  AND (EXISTS(SELECT 1 FROM public.time_qr_punches q WHERE q.assignment_id=a.id)
    OR EXISTS(SELECT 1 FROM public.time_qr_breaks q WHERE q.assignment_id=a.id));
 SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO offer_ids FROM public.open_shift_market_offers
  WHERE company_id=p_company_id AND work_date>=first_day AND work_date<next_day;
 summary:=jsonb_build_object('month',to_char(first_day,'YYYY-MM'),'monthStart',first_day,'monthEnd',next_day-1,
  'total',total,'draft',drafts,'published',published,'closed',closed,'recordedTimeEntries',recorded,'qrAssignments',qr,
  'marketOffers',(SELECT count(*) FROM public.open_shift_market_offers WHERE id=ANY(offer_ids) AND status='MARKET_OPEN'),
  'canDelete',NOT closed AND recorded=0 AND qr=0 AND (total>0 OR cardinality(offer_ids)>0));
 IF p_confirmation IS NULL THEN RETURN summary; END IF;
 IF closed THEN RAISE EXCEPTION 'Der ausgewählte Monat ist abgeschlossen und kann nicht gelöscht werden.'; END IF;
 IF recorded>0 OR qr>0 THEN RAISE EXCEPTION 'Dieser Monat enthält erfasste Arbeitszeiten oder QR-Nachweise. Diese werden durch eine Dienstplanlöschung nicht entfernt.'; END IF;

 -- Preserve request/audit history, while ending requests for the removed duties.
 UPDATE public.shift_change_requests SET assignment_id=NULL,
  status=CASE WHEN status IN('DRAFT','PENDING_EMPLOYEE','PENDING_WORKS_COUNCIL','READY_TO_APPLY','BLOCKED') THEN 'CANCELLED' ELSE status END
  WHERE company_id=p_company_id AND assignment_id=ANY(ids);
 UPDATE public.shift_swap_requests SET assignment_id=NULL,
  status=CASE WHEN status IN('PENDING','PENDING_EMPLOYEE','PENDING_MANAGER','OFFERED','REQUESTED') THEN 'CANCELLED' ELSE status END
  WHERE company_id=p_company_id AND assignment_id=ANY(ids);
 UPDATE public.open_shift_market_claims SET assignment_id=NULL,
  status=CASE WHEN status IN('PENDING_MANAGER','APPLIED') THEN 'SUPERSEDED' ELSE status END,
  manager_comment=CASE WHEN status IN('PENDING_MANAGER','APPLIED') THEN 'Dienstplanmonat nach Bestätigung geleert.' ELSE manager_comment END,
  reviewed_by=CASE WHEN status IN('PENDING_MANAGER','APPLIED') THEN actor ELSE reviewed_by END,
  reviewed_at=CASE WHEN status IN('PENDING_MANAGER','APPLIED') THEN now() ELSE reviewed_at END
  WHERE company_id=p_company_id AND (assignment_id=ANY(ids) OR offer_id=ANY(offer_ids));
 UPDATE public.open_shift_market_offers SET status='CANCELLED',remaining_count=0,updated_at=now()
  WHERE id=ANY(offer_ids) AND status='MARKET_OPEN';
 DELETE FROM public.time_entries WHERE company_id=p_company_id AND assignment_id=ANY(ids);
 prev_flag:=current_setting('app.schichtfunk_full_plan_reset',true);
 PERFORM set_config('app.schichtfunk_full_plan_reset','on',true);
 DELETE FROM public.shift_assignments WHERE company_id=p_company_id AND id=ANY(ids);
 GET DIAGNOSTICS removed=ROW_COUNT;
 PERFORM set_config('app.schichtfunk_full_plan_reset',coalesce(prev_flag,''),true);
 first_week:=date_trunc('week',first_day)::date; last_week:=date_trunc('week',next_day-1)::date;
 -- A boundary week can still contain published duties from an adjacent month.
 DELETE FROM public.plan_publications p WHERE p.company_id=p_company_id AND p.week_start BETWEEN first_week AND last_week
  AND NOT EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.company_id=p_company_id AND a.status='PUBLISHED'
   AND a.starts_at>=p.week_start::timestamp AT TIME ZONE tz AND a.starts_at<(p.week_start+7)::timestamp AT TIME ZONE tz);
 GET DIAGNOSTICS publications=ROW_COUNT;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(p_company_id,'MONTH_SCHEDULE_RESET','schedule',actor,actor_role,
   summary||jsonb_build_object('deletedAssignments',removed,'deletedPublications',publications,'timezone',tz));
 RETURN summary||jsonb_build_object('deletedAssignments',removed,'deletedPublications',publications);
END $$;
REVOKE ALL ON FUNCTION private.schedule_month_reset_api(uuid,date,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.preview_schedule_month_reset(p_company_id uuid,p_month date)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.schedule_month_reset_api(p_company_id,p_month,NULL);
$$;
CREATE FUNCTION public.reset_company_schedule_month(p_company_id uuid,p_month date,p_confirmation text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_confirmation IS NULL THEN RAISE EXCEPTION 'Die Löschung muss ausdrücklich bestätigt werden.'; END IF;
 RETURN private.schedule_month_reset_api(p_company_id,p_month,p_confirmation);
END $$;
REVOKE ALL ON FUNCTION public.preview_schedule_month_reset(uuid,date),public.reset_company_schedule_month(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.schedule_month_reset_api(uuid,date,text),public.preview_schedule_month_reset(uuid,date),public.reset_company_schedule_month(uuid,date,text) TO authenticated;
