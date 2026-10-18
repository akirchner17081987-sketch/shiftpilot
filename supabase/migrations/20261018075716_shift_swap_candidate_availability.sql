-- A requester must check a colleague's availability without reading that
-- colleague's absence records. The general absence RPC remains self/manager-only.
-- This internal helper is called only by the guarded swap/marketplace RPCs.
CREATE OR REPLACE FUNCTION private.sf_swap_candidate_reason(p_assignment_id uuid,p_target_employee_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.shift_assignments%rowtype; e public.employees%rowtype;
 tz text; min_rest numeric:=11; max_shift numeric:=10; adjacent timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RETURN 'Nicht angemeldet';END IF;
 SELECT * INTO a FROM public.shift_assignments WHERE id=p_assignment_id;
 IF a.id IS NULL THEN RETURN 'Schicht nicht gefunden';END IF;
 IF NOT private.sf_is_manager(a.company_id,false) AND NOT EXISTS(
  SELECT 1 FROM public.employees x WHERE x.company_id=a.company_id
  AND x.id IN (a.employee_id,p_target_employee_id) AND x.auth_user_id=auth.uid()
  AND x.status='active' AND x.access_status='ACTIVE' AND x.deleted_at IS NULL
 ) THEN RETURN 'Nicht berechtigt';END IF;
 IF a.status<>'PUBLISHED' OR a.published_at IS NULL THEN RETURN 'Nur veröffentlichte Schichten können getauscht werden';END IF;
 IF a.starts_at<=now() THEN RETURN 'Bereits begonnene Schichten können nicht getauscht werden';END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_target_employee_id AND company_id=a.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.access_status<>'ACTIVE' OR e.deleted_at IS NOT NULL THEN RETURN 'Mitarbeiter ist nicht aktiv';END IF;
 IF e.id=a.employee_id THEN RETURN 'Die Schicht gehört bereits diesem Mitarbeiter';END IF;
 IF e.auth_user_id IS NULL THEN RETURN 'Der Kollege hat noch keinen aktiven SchichtFunk-Zugang';END IF;
 IF NOT coalesce(a.shift_code=ANY(e.shift_permissions),false) THEN RETURN 'Keine Freigabe für diese Schichtart';END IF;
 SELECT coalesce(c.timezone,'Europe/Berlin') INTO tz FROM public.companies c WHERE c.id=a.company_id;
 SELECT coalesce(p.standard_min_rest_hours,11),coalesce(p.standard_max_shift_hours,10)
 INTO min_rest,max_shift FROM public.company_compliance_policy p WHERE p.company_id=a.company_id;
 min_rest:=coalesce(min_rest,11);max_shift:=coalesce(max_shift,10);
 -- Same interval, duration, absence and rest rules as assert_standard_shift_rules.
 IF a.ends_at<=a.starts_at THEN RETURN 'Ungültiger Schichtzeitraum';END IF;
 IF extract(epoch FROM(a.ends_at-a.starts_at))/3600.0>max_shift THEN RETURN 'Schicht überschreitet die Standard-Höchstdauer';END IF;
 IF EXISTS(SELECT 1 FROM public.shift_assignments s WHERE s.company_id=a.company_id
 AND s.employee_id=e.id AND s.id<>a.id AND s.status<>'CANCELLED'
 AND tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')) THEN RETURN 'Bereits andere Schicht im Zeitraum';END IF;
 IF EXISTS(SELECT 1 FROM public.absences b WHERE b.company_id=a.company_id AND b.employee_id=e.id
 AND b.status IN ('Genehmigt','Erfasst') AND (
 (b.full_day AND tstzrange(b.start_date::timestamp AT TIME ZONE tz,(b.end_date+1)::timestamp AT TIME ZONE tz,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)'))
 OR (NOT b.full_day AND b.start_time IS NOT NULL AND b.end_time IS NOT NULL AND EXISTS(
 SELECT 1 FROM generate_series(b.start_date,b.end_date,interval '1 day') g(day)
 WHERE tstzrange((g.day::date+b.start_time) AT TIME ZONE tz,
 (g.day::date+CASE WHEN b.end_time<=b.start_time THEN 1 ELSE 0 END+b.end_time) AT TIME ZONE tz,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')))
 )) THEN RETURN 'Kollege ist in diesem Zeitraum nicht verfügbar';END IF;
 SELECT max(s.ends_at) INTO adjacent FROM public.shift_assignments s WHERE s.company_id=a.company_id AND s.employee_id=e.id
 AND s.id<>a.id AND s.status<>'CANCELLED' AND s.ends_at<=a.starts_at;
 IF adjacent IS NOT NULL AND extract(epoch FROM(a.starts_at-adjacent))/3600.0<min_rest THEN RETURN 'Ruhezeit vor der Schicht nicht ausreichend';END IF;
 SELECT min(s.starts_at) INTO adjacent FROM public.shift_assignments s WHERE s.company_id=a.company_id AND s.employee_id=e.id
 AND s.id<>a.id AND s.status<>'CANCELLED' AND s.starts_at>=a.ends_at;
 IF adjacent IS NOT NULL AND extract(epoch FROM(adjacent-a.ends_at))/3600.0<min_rest THEN RETURN 'Ruhezeit nach der Schicht nicht ausreichend';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.sf_swap_candidate_reason(uuid,uuid) FROM PUBLIC,anon,authenticated;
