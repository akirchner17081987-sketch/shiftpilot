-- Optional company limits leave other companies' established rules unchanged.
ALTER TABLE public.company_compliance_policy
 ADD COLUMN monthly_planning_max_hours numeric CHECK (monthly_planning_max_hours > 0 AND monthly_planning_max_hours <= 400),
 ADD COLUMN monthly_planning_max_shifts integer CHECK (monthly_planning_max_shifts BETWEEN 1 AND 62);

CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits(company_ uuid, employee_ uuid, month_ date,
 exclude_ uuid DEFAULT NULL, start_ timestamptz DEFAULT NULL, end_ timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE policy_ public.company_compliance_policy; e_ public.employees; tz_ text; a_ timestamptz; b_ timestamptz;
 hours_ numeric; calendar_ numeric; count_ integer; target_ numeric; limit_ numeric;
BEGIN
 SELECT * INTO policy_ FROM public.company_compliance_policy WHERE company_id=company_;
 IF policy_.monthly_planning_max_hours IS NULL AND policy_.monthly_planning_max_shifts IS NULL THEN RETURN; END IF;
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;
 b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,e_.weekly_hours*4.348);
 limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
  THEN coalesce(policy_.monthly_planning_max_hours,220) ELSE least(coalesce(policy_.monthly_planning_max_hours,180),target_) END;
 WITH duties AS (
  SELECT starts_at s,ends_at e FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_
   AND status<>'CANCELLED' AND id IS DISTINCT FROM exclude_ AND starts_at<b_ AND ends_at>a_
  UNION ALL SELECT start_,end_ WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
 ) SELECT count(*) FILTER(WHERE s>=a_),coalesce(sum(extract(epoch FROM e-s)/3600) FILTER(WHERE s>=a_),0),
   coalesce(sum(extract(epoch FROM least(e,b_)-greatest(s,a_))/3600),0) INTO count_,hours_,calendar_ FROM duties;
 IF policy_.monthly_planning_max_shifts IS NOT NULL AND count_>policy_.monthly_planning_max_shifts THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Maximal %s Schichten pro Monat (Personalnummer %s).',policy_.monthly_planning_max_shifts,e_.personnel_no);
 END IF;
 IF hours_>limit_+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden überschritten (Personalnummer %s).',limit_,e_.personnel_no);
 END IF;
 IF policy_.monthly_planning_max_hours IS NOT NULL AND calendar_>policy_.monthly_planning_max_hours+.000001 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten (Personalnummer %s).',policy_.monthly_planning_max_hours,e_.personnel_no);
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION private.sf_assert_month_planning_limits(uuid,uuid,date,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_assert_month_planning_limits(uuid,uuid,date,uuid,timestamptz,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_guard_month_planning_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE tz_ text; month_ date; skip_ uuid;
BEGIN
 IF NEW.status='CANCELLED' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.company_id=OLD.company_id AND NEW.employee_id=OLD.employee_id
  AND NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at AND OLD.status<>'CANCELLED' THEN RETURN NEW; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=NEW.company_id;
 -- Normal company write locking already serializes these mutations; acquire the same lock for all entry paths.
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||NEW.company_id::text,0));
 skip_:=NEW.id;
 IF TG_OP='INSERT' AND NEW.legacy_id IS NOT NULL THEN
  SELECT id INTO skip_ FROM public.shift_assignments WHERE company_id=NEW.company_id AND legacy_id=NEW.legacy_id LIMIT 1;
  skip_:=coalesce(skip_,NEW.id);
 END IF;
 FOR month_ IN SELECT generate_series(date_trunc('month',NEW.starts_at AT TIME ZONE tz_),
  date_trunc('month',(NEW.ends_at-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
  PERFORM private.sf_assert_month_planning_limits(NEW.company_id,NEW.employee_id,month_,skip_,NEW.starts_at,NEW.ends_at);
 END LOOP;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.sf_guard_month_planning_limits() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_month_planning_limits() TO authenticated,service_role;
CREATE TRIGGER a1_month_planning_limits BEFORE INSERT OR UPDATE OF company_id,employee_id,starts_at,ends_at,status
 ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION private.sf_guard_month_planning_limits();

CREATE OR REPLACE FUNCTION private.sf_apply_month_optimization(company_ uuid, month_ date, fingerprint_ text, replace_ uuid[], rows_ jsonb, respect_weekly_ boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_ uuid:=auth.uid();role_ text;snapshot_ jsonb;tz_ text;last_ date;ids_ uuid[]:=ARRAY[]::uuid[];protected_ uuid[];
 row_ record;e_ public.employees;model_ public.shift_templates;day_ date;rhythm_ jsonb;expected_ text;
 target_ numeric;limit_ numeric;weekly_ numeric;hours_ numeric;count_ int;maximum_ int;start_ date;end_ date;d_ date;
 pattern_ text[];index_ int;before_ int;after_ int;pattern_n_ int;cancelled_ int;new_id_ uuid;new_count_ int;target_count_ int;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=company_ AND user_id=actor_ AND status='ACTIVE'
  AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF actor_ IS NULL OR role_ IS NULL THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF rows_ IS NULL OR jsonb_typeof(rows_)<>'array' OR jsonb_array_length(rows_)<1 OR jsonb_array_length(rows_)>10000
  OR replace_ IS NULL OR respect_weekly_ IS NULL THEN RAISE EXCEPTION 'Ungültige Monatsvorschläge.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
 snapshot_:=private.sf_month_optimization_snapshot(company_,month_);
 IF fingerprint_ IS NULL OR snapshot_->>'fingerprint'<>fingerprint_ THEN RAISE EXCEPTION 'Die Planungsdaten wurden geändert. Bitte den Monat erneut optimieren.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;last_:=(month_+interval '1 month')::date;
 SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO protected_ FROM jsonb_array_elements_text(snapshot_->'protectedIds') v;
 IF cardinality(replace_)<>(SELECT count(DISTINCT x) FROM unnest(replace_) x) OR EXISTS(
  SELECT 1 FROM unnest(replace_) id_ LEFT JOIN public.shift_assignments s ON s.id=id_
  WHERE s.id IS NULL OR s.company_id<>company_ OR s.status<>'DRAFT' OR s.id=ANY(protected_)
   OR s.starts_at<month_::timestamp AT TIME ZONE tz_ OR s.starts_at>=last_::timestamp AT TIME ZONE tz_)
 THEN RAISE EXCEPTION 'Ein zu ersetzender Dienst ist geschützt oder gehört nicht zu diesem Monatsentwurf.'; END IF;
 PERFORM 1 FROM public.shift_assignments WHERE company_id=company_ AND id=ANY(replace_) ORDER BY id FOR UPDATE;
 UPDATE public.shift_assignments SET status='CANCELLED',version=version+1 WHERE company_id=company_ AND id=ANY(replace_);
 GET DIAGNOSTICS cancelled_=ROW_COUNT;
 FOR row_ IN SELECT * FROM jsonb_to_recordset(rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND deleted_at IS NULL AND status='active';
  IF NOT FOUND OR NOT row_.shift_code=ANY(e_.shift_permissions) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF day_<month_ OR day_>=last_ OR row_.starts_at IS NULL OR row_.ends_at IS NULL OR row_.legacy_id IS NULL
   OR row_.ends_at<=row_.starts_at OR row_.ends_at-row_.starts_at>interval '10 hours'
   OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger Dienst im Monatsvorschlag.'; END IF;
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active;
  IF NOT FOUND OR (row_.starts_at AT TIME ZONE tz_)::time<>model_.default_start OR (row_.ends_at AT TIME ZONE tz_)::time<>model_.default_end
  THEN RAISE EXCEPTION 'Der Dienst entspricht nicht mehr dem aktiven Schichtmodell.'; END IF;
  IF NOT extract(isodow FROM day_)::int=ANY(model_.optional_weekdays) AND NOT EXISTS(
   SELECT 1 FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code=row_.shift_code)
  THEN RAISE EXCEPTION 'Das Schichtmodell ist an diesem Wochentag nicht vorgesehen.'; END IF;
  rhythm_:=private.sf_month_rhythm(e_,day_);expected_:=rhythm_->>'expected';
  IF rhythm_->>'mode'='required' AND NOT (coalesce((rhythm_->>'exemptOt')::boolean,false) AND row_.shift_code IN('OT1','OT2','OT3'))
   AND expected_<>'ALLE' AND NOT upper(row_.shift_code)=ANY(regexp_split_to_array(expected_,'[+|/]'))
  THEN RAISE EXCEPTION 'Eine verbindliche Rhythmusvorgabe wird verletzt.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,'Monatsoptimierung') RETURNING id INTO new_id_;
  ids_:=array_append(ids_,new_id_);
 END LOOP;
 -- Transition rule supplements the existing overlap, absence and eleven-hour server guards.
 IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments b ON a.employee_id=b.employee_id AND a.company_id=b.company_id
  AND (b.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1
  WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND b.status<>'CANCELLED' AND (a.id=ANY(ids_) OR b.id=ANY(ids_))
   AND upper(a.shift_code)='O3' AND upper(b.shift_code) IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'))
 THEN RAISE EXCEPTION 'Nach O3 ist O1, O2 oder TL am Folgetag gesperrt.'; END IF;
 FOR e_ IN SELECT DISTINCT e.* FROM public.employees e JOIN public.shift_assignments a ON a.employee_id=e.id WHERE a.id=ANY(ids_) LOOP
  target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,180);
  limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180 THEN coalesce((SELECT monthly_planning_max_hours FROM public.company_compliance_policy WHERE company_id=company_),220) ELSE least(180,target_) END;
  PERFORM private.sf_assert_month_planning_limits(company_,e_.id,month_);
  SELECT sum(extract(epoch FROM(ends_at-starts_at))/3600) INTO hours_ FROM public.shift_assignments
   WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_;
  IF hours_>limit_+.000001 THEN RAISE EXCEPTION 'Das persönliche Monatsmaximum wird überschritten (Personalnummer %).',e_.personnel_no; END IF;
  weekly_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'maxWeekly'),'')::numeric,e_.weekly_hours);
  IF respect_weekly_ AND weekly_>0 AND EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
   AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_
   AND date_trunc('week',starts_at AT TIME ZONE tz_) IN(SELECT date_trunc('week',starts_at AT TIME ZONE tz_) FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id)
   GROUP BY date_trunc('week',starts_at AT TIME ZONE tz_) HAVING sum(extract(epoch FROM(ends_at-starts_at))/3600)>weekly_+.000001)
  THEN RAISE EXCEPTION 'Das persönliche Wochenmaximum wird überschritten.'; END IF;
  maximum_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'maxConsecutive'),'')::int,0);
  IF maximum_>0 AND EXISTS(WITH days AS (SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
    AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
   SELECT 1 FROM islands GROUP BY k HAVING count(*)>maximum_ AND bool_or(d IN(SELECT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id))) THEN RAISE EXCEPTION 'Das Maximum aufeinanderfolgender Dienste wird überschritten.'; END IF;
  -- Every used ALLE/FREI work block must be complete inside this month (approved absences excluded).
  FOR day_ IN SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
   AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_ AND shift_code NOT IN('OT1','OT2','OT3') LOOP
   rhythm_:=private.sf_month_rhythm(e_,day_);
   SELECT array_agg(value) INTO pattern_ FROM jsonb_array_elements_text(coalesce(rhythm_->'pattern','[]'::jsonb));
   IF rhythm_->>'mode'='required' AND rhythm_->>'expected'='ALLE' AND 'FREI'=ANY(pattern_) AND NOT EXISTS(SELECT 1 FROM unnest(pattern_) x WHERE trim(x) NOT IN('ALLE','FREI')) THEN
    index_:=(rhythm_->>'index')::int;pattern_n_:=cardinality(pattern_);before_:=0;after_:=0;
    WHILE before_<pattern_n_-1 AND trim(pattern_[((index_-before_-1+pattern_n_)%pattern_n_)+1])='ALLE' LOOP before_:=before_+1; END LOOP;
    WHILE after_<pattern_n_-1 AND trim(pattern_[((index_+after_+1)%pattern_n_)+1])='ALLE' LOOP after_:=after_+1; END LOOP;
    FOR d_ IN SELECT g::date FROM generate_series(greatest(month_,day_-before_),least(last_-1,day_+after_),interval '1 day') g LOOP
     IF NOT EXISTS(SELECT 1 FROM public.absences WHERE company_id=company_ AND employee_id=e_.id AND status IN('Genehmigt','Erfasst') AND full_day AND start_date<=d_ AND end_date>=d_)
      AND NOT EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
       AND (starts_at AT TIME ZONE tz_)::date=d_ AND shift_code NOT IN('OT1','OT2','OT3')) THEN RAISE EXCEPTION 'Ein Arbeitsblock ist unvollständig.'; END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 -- No generated duty may invent staffing beyond the real required/optional target.
 FOR row_ IN SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date d,shift_code FROM public.shift_assignments WHERE id=ANY(ids_) LOOP
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code;
  IF model_.coverage_group IS NOT NULL THEN
   SELECT coalesce(max(d.required_count),max(t.coverage_required)) INTO target_count_ FROM public.shift_templates t LEFT JOIN public.daily_staffing_overrides d
    ON d.company_id=t.company_id AND d.shift_code=t.code AND d.work_date=row_.d WHERE t.company_id=company_ AND t.coverage_group=model_.coverage_group AND t.active;
   SELECT count(*) INTO count_ FROM public.shift_assignments a JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code=a.shift_code WHERE a.company_id=company_ AND a.status<>'CANCELLED'
    AND (a.starts_at AT TIME ZONE tz_)::date=row_.d AND t.coverage_group=model_.coverage_group;
  ELSE
   SELECT required_count INTO target_count_ FROM public.daily_staffing_overrides WHERE company_id=company_ AND shift_code=row_.shift_code AND work_date=row_.d;
   IF NOT FOUND THEN
    IF model_.planning_mode='optional' THEN target_count_:=model_.optional_staffing;
    ELSE SELECT coalesce(max(required_count),0) INTO target_count_ FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code=row_.shift_code; END IF;
   END IF;
   IF row_.shift_code='OT2' AND private.sf_morning_ot_switch(company_,row_.d,tz_) THEN
    SELECT required_count INTO new_count_ FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT1';
    IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code='OT1' AND extract(isodow FROM row_.d)::int=ANY(optional_weekdays)) THEN new_count_:=0; END IF;
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code='OT1' AND (starts_at AT TIME ZONE tz_)::date=row_.d;
    target_count_:=coalesce(target_count_,0)+greatest(0,coalesce(new_count_,0)-count_);
   END IF;
   SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=row_.shift_code AND (starts_at AT TIME ZONE tz_)::date=row_.d;
  END IF;
  IF count_>coalesce(target_count_,0) THEN RAISE EXCEPTION 'Der tatsächliche Besetzungsbedarf wird überschritten.'; END IF;
 END LOOP;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(company_,'MONTH_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('month',month_,'replaced',cancelled_,'created',cardinality(ids_),'weeklyLimits',respect_weekly_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',cardinality(ids_),'month',month_);
END $function$;
CREATE OR REPLACE FUNCTION private.sf_month_optimization_snapshot(company_ uuid, month_ date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_ uuid:=auth.uid();tz_ text;last_ date;rows_ jsonb;fingerprint_ text;protected_ jsonb;
BEGIN
 IF actor_ IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=company_ AND user_id=actor_
  AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF month_ IS NULL OR extract(day FROM month_)<>1 THEN RAISE EXCEPTION 'Bitte einen Kalendermonat auswählen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 last_:=(month_+interval '1 month')::date;
 IF EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=company_ AND month_start=month_ AND status='CLOSED')
 THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen.'; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=company_
  AND week_start<=last_-1 AND week_start+6>=month_ AND published_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND status='PUBLISHED'
  AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_)
 THEN RAISE EXCEPTION 'Der Monat enthält veröffentlichte Dienste oder Wochen.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) INTO rows_ FROM public.shift_assignments a
  WHERE company_id=company_ AND status<>'CANCELLED' AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_
  AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_;
 SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb) INTO protected_ FROM public.shift_assignments a
  JOIN public.employees e ON e.id=a.employee_id AND e.company_id=company_
  WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.starts_at>=month_::timestamp AT TIME ZONE tz_
   AND a.starts_at<last_::timestamp AT TIME ZONE tz_ AND (
   a.status<>'DRAFT' OR coalesce(a.note,'')~*'(markt|market|freiwill|tausch)'
   OR ((private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'mode')='required'
    AND (private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'expected') NOT IN('ALLE','FREI'))
   OR EXISTS(SELECT 1 FROM public.time_entries t WHERE t.assignment_id=a.id AND
    (t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.status<>'open' OR t.confirmed_at IS NOT NULL OR t.submitted_at IS NOT NULL
     OR coalesce(t.employee_note,'')<>'' OR coalesce(t.manager_note,'')<>''))
   OR EXISTS(SELECT 1 FROM public.time_qr_punches q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.time_qr_breaks q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.open_shift_market_claims q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_swap_requests q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_change_requests q WHERE q.assignment_id=a.id));
 SELECT md5(jsonb_build_object('assignments',rows_,'protected',protected_,
  'planningPolicy',(SELECT to_jsonb(p) FROM public.company_compliance_policy p WHERE company_id=company_),
  'employees',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.employees e WHERE company_id=company_),
  'absences',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.absences a WHERE company_id=company_),
  'templates',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM public.shift_templates t WHERE company_id=company_),
  'soll',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.shift_code),'[]'::jsonb) FROM public.global_staffing_requirements g WHERE company_id=company_),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.work_date,g.shift_code),'[]'::jsonb) FROM public.daily_staffing_overrides g WHERE company_id=company_),
  'teams',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_code),'[]'::jsonb) FROM public.company_planning_teams t WHERE company_id=company_))::text) INTO fingerprint_;
 RETURN jsonb_build_object('fingerprint',fingerprint_,'protectedIds',protected_,'month',month_);
END $function$;
NOTIFY pgrst,'reload schema';
