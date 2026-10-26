-- Only exact, manager-confirmed preview duties bypass automatic planning limits.
-- Saved manual duties remain constraints for subsequent automatic planning transactions.
CREATE OR REPLACE FUNCTION private.sf_manual_preview_current(value_ jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(value_->'manualPlanning'='true'::jsonb AND value_->>'actor_id'=auth.uid()::text
  AND (value_->>'confirmed_at')::timestamptz>=transaction_timestamp(),false)
$$;
REVOKE ALL ON FUNCTION private.sf_manual_preview_current(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_manual_preview_current(jsonb) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION private.sf_normalize_manual_rhythm_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare role_ text; reason_ text; e_ public.employees; rhythm_ jsonb; tz_ text; expected_ text; block_ boolean; manual_ boolean; first_ date; last_ date;
begin
 if new.rhythm_override='null'::jsonb then new.rhythm_override:=null; end if;
 if new.status='CANCELLED' then return new; end if;
 if tg_op='UPDATE' and row(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.rhythm_override)
  is not distinct from row(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.rhythm_override) then return new; end if;
 if new.rhythm_override is null then return new; end if;
 if new.rhythm_override ? 'actor_id' and (
  (new.rhythm_override->>'employee_id')::uuid is distinct from new.employee_id
  or new.rhythm_override->>'shift_code' is distinct from new.shift_code
  or (new.rhythm_override->>'starts_at')::timestamptz is distinct from new.starts_at
  or (new.rhythm_override->>'ends_at')::timestamptz is distinct from new.ends_at) then
  raise exception 'Die bestätigte Rhythmusausnahme gilt nur für den ursprünglichen Dienst. Bitte die Änderung neu bestätigen.';
 end if;
 select role into role_ from public.company_members where company_id=new.company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER');
 if auth.uid() is null or role_ is null then raise exception using errcode='42501',message='Nur Planungsberechtigte dürfen eine Rhythmusausnahme bestätigen.'; end if;
 reason_:=trim(new.rhythm_override->>'reason');
 if jsonb_typeof(new.rhythm_override)<>'object' or reason_ is null or length(reason_) not between 1 and 500 then raise exception 'Bitte eine Begründung mit 1 bis 500 Zeichen angeben.'; end if;
 select * into e_ from public.employees where company_id=new.company_id and id=new.employee_id and status='active' and deleted_at is null;
 if not found or not coalesce(new.shift_code=any(e_.shift_permissions),false) then raise exception 'Mitarbeiter oder Schichtfreigabe ist nicht gültig.'; end if;
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=new.company_id;
 if e_.start_date>(new.starts_at at time zone tz_)::date or e_.contract_end<(new.starts_at at time zone tz_)::date then raise exception 'Der Dienst liegt außerhalb der Vertragslaufzeit.'; end if;
 rhythm_:=private.sf_month_rhythm(e_,(new.starts_at at time zone tz_)::date);expected_:=rhythm_->>'expected';
 manual_:=new.rhythm_override->'manualPlanning'='true'::jsonb;
 block_:=new.rhythm_override->'workBlockDays'='5'::jsonb;
 if coalesce(block_,false) then
  first_:=(new.rhythm_override->>'blockStart')::date;last_:=(new.rhythm_override->>'blockEnd')::date;
  if first_ is null or last_ is null or last_-first_<>4 or (new.starts_at at time zone tz_)::date not between first_ and last_ then
   raise exception 'Die manuelle Ausnahme gilt nur für den bestätigten Fünf-Tage-Block.';
  end if;
 end if;
 if not coalesce(manual_,false) and not coalesce(block_,false) and (rhythm_->>'mode' is distinct from 'required' or expected_ is null or expected_='ALLE'
  or (coalesce((rhythm_->>'exemptOt')::boolean,false) and new.shift_code in('OT1','OT2','OT3'))
  or upper(new.shift_code)=any(regexp_split_to_array(expected_,'[+|/]'))) then raise exception 'Für diesen Dienst ist keine Rhythmusausnahme erforderlich. Bitte neu prüfen.'; end if;
 new.rhythm_override:=jsonb_build_object('reason',reason_,'expected',expected_,'actor_id',auth.uid(),'actor_role',role_,'confirmed_at',clock_timestamp(),'employee_id',new.employee_id,'shift_code',new.shift_code,'starts_at',new.starts_at,'ends_at',new.ends_at);
 if coalesce(block_,false) then new.rhythm_override:=new.rhythm_override||jsonb_build_object('workBlockDays',5,'blockStart',first_,'blockEnd',last_); end if;
 if coalesce(manual_,false) then new.rhythm_override:=new.rhythm_override||jsonb_build_object('manualPlanning',true,'company_id',new.company_id); end if;
 return new;
end $function$;


CREATE OR REPLACE FUNCTION public.enforce_assignment_standard_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_existing_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN v_existing_id:=old.id;
  ELSE
    SELECT a.id INTO v_existing_id FROM public.shift_assignments a
      WHERE a.company_id=new.company_id AND (a.id=new.id OR (new.legacy_id IS NOT NULL AND a.legacy_id=new.legacy_id))
      LIMIT 1 FOR KEY SHARE;
  END IF;
  IF new.status<>'CANCELLED' AND private.sf_manual_preview_current(new.rhythm_override) THEN
    IF new.ends_at IS NULL OR new.starts_at IS NULL OR new.ends_at<=new.starts_at THEN RAISE EXCEPTION 'Invalid shift interval'; END IF;
    IF EXISTS(SELECT 1 FROM public.shift_assignments a WHERE a.company_id=new.company_id AND a.employee_id=new.employee_id
      AND a.status<>'CANCELLED' AND a.id IS DISTINCT FROM v_existing_id
      AND tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)')) THEN RAISE EXCEPTION 'Shift overlaps another assignment'; END IF;
    IF private.sf_approved_absence_overlaps(new.company_id,new.employee_id,new.starts_at,new.ends_at,
      coalesce((SELECT timezone FROM public.companies WHERE id=new.company_id),'Europe/Berlin')) THEN RAISE EXCEPTION 'Shift overlaps an approved absence'; END IF;
    RETURN new;
  END IF;
  IF new.status<>'CANCELLED'
    AND coalesce(current_setting('schichtfunk.legacy_import',true),'off')<>'on'
    AND (TG_OP='INSERT' OR new.company_id IS DISTINCT FROM old.company_id
      OR new.employee_id IS DISTINCT FROM old.employee_id OR new.starts_at IS DISTINCT FROM old.starts_at
      OR new.ends_at IS DISTINCT FROM old.ends_at OR (old.status='CANCELLED' AND new.status<>'CANCELLED')) THEN
    PERFORM public.assert_standard_shift_rules(new.company_id,new.employee_id,new.starts_at,new.ends_at,v_existing_id);
  END IF;
  RETURN new;
END $function$;


CREATE OR REPLACE FUNCTION private.sf_guard_month_planning_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE tz_ text; month_ date; skip_ uuid;
BEGIN
 IF private.sf_manual_preview_current(NEW.rhythm_override) THEN RETURN NEW; END IF;
 IF NEW.status='CANCELLED' THEN RETURN NEW; END IF;
 -- Only active planners may exceed full-time monthly hours through manual writes.
 -- Solver candidates and final automatic month validation still call the strict assertion.
 IF private.sf_planner_month_override(NEW.company_id,NEW.employee_id) THEN RETURN NEW; END IF;
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
END $function$;


CREATE OR REPLACE FUNCTION private.sf_apply_month_optimization(company_ uuid, month_ date, fingerprint_ text, replace_ uuid[], rows_ jsonb, respect_weekly_ boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE manual_rows_ jsonb; manual_ids_ uuid[]:=ARRAY[]::uuid[]; actor_ uuid:=auth.uid();role_ text;snapshot_ jsonb;tz_ text;last_ date;ids_ uuid[]:=ARRAY[]::uuid[];protected_ uuid[];
 row_ record;e_ public.employees;model_ public.shift_templates;day_ date;rhythm_ jsonb;expected_ text;
 target_ numeric;limit_ numeric;weekly_ numeric;hours_ numeric;count_ int;maximum_ int;start_ date;end_ date;d_ date;
 pattern_ text[];index_ int;before_ int;after_ int;pattern_n_ int;cancelled_ int;new_id_ uuid;new_count_ int;target_count_ int;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=company_ AND user_id=actor_ AND status='ACTIVE'
  AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER');
 IF actor_ IS NULL OR role_ IS NULL THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF coalesce((SELECT (solid_planning_rules->>'enabled')::boolean FROM public.company_compliance_policy WHERE company_id=company_),false) THEN respect_weekly_:=true; END IF;
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
 SELECT coalesce(jsonb_agg(v) FILTER(WHERE v->'rhythm_override'->'manualPlanning'='true'::jsonb),'[]'),
  coalesce(jsonb_agg(v) FILTER(WHERE v->'rhythm_override'->'manualPlanning' IS DISTINCT FROM 'true'::jsonb),'[]') INTO manual_rows_,rows_ FROM jsonb_array_elements(rows_) v;
 FOR row_ IN SELECT * FROM jsonb_to_recordset(rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text,note text,break_minutes int,rhythm_override jsonb) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND deleted_at IS NULL AND status='active';
  IF NOT FOUND OR NOT row_.shift_code=ANY(e_.shift_permissions) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF day_<month_ OR day_>=last_ OR row_.starts_at IS NULL OR row_.ends_at IS NULL OR row_.legacy_id IS NULL
   OR row_.ends_at<=row_.starts_at OR row_.ends_at-row_.starts_at>make_interval(secs => (3600*coalesce((select standard_max_shift_hours from public.company_compliance_policy where company_id=company_),10))::double precision)
   OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger Dienst im Monatsvorschlag.'; END IF;
  SELECT * INTO model_ FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active;
  IF NOT FOUND OR (row_.starts_at AT TIME ZONE tz_)::time<>model_.default_start OR (row_.ends_at AT TIME ZONE tz_)::time<>model_.default_end
  THEN RAISE EXCEPTION 'Der Dienst entspricht nicht mehr dem aktiven Schichtmodell.'; END IF;
  IF NOT extract(isodow FROM day_)::int=ANY(model_.optional_weekdays) AND NOT (row_.shift_code='OT' AND private.sf_ot_day(company_,day_,row_.employee_id)) AND NOT EXISTS(
   SELECT 1 FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code=row_.shift_code)
  THEN RAISE EXCEPTION 'Das Schichtmodell ist an diesem Wochentag nicht vorgesehen.'; END IF;
  rhythm_:=private.sf_month_rhythm(e_,day_);expected_:=rhythm_->>'expected';
  IF nullif(row_.rhythm_override,'null'::jsonb) IS NULL AND rhythm_->>'mode'='required' AND NOT (coalesce((rhythm_->>'exemptOt')::boolean,false) AND row_.shift_code IN('OT1','OT2','OT3'))
   AND expected_<>'ALLE' AND NOT upper(row_.shift_code)=ANY(regexp_split_to_array(expected_,'[+|/]'))
  THEN RAISE EXCEPTION 'Eine verbindliche Rhythmusvorgabe wird verletzt.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note,break_minutes,rhythm_override)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,coalesce(row_.note,'Monatsoptimierung'),coalesce(row_.break_minutes,0),nullif(row_.rhythm_override,'null'::jsonb)) RETURNING id INTO new_id_;
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
  -- The confirmed OT-only limit also applies to this legacy final guard.
  IF e_.employment ~* '^Vollzeit([[:space:]]+180)?$' AND target_>=180
   AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[] THEN
   SELECT coalesce(nullif(solid_planning_rules->>'otOnlyMonthlyMaxHours','')::numeric,limit_) INTO limit_
    FROM public.company_compliance_policy WHERE company_id=company_;
  END IF;
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
   SELECT 1 FROM islands GROUP BY k HAVING count(*)>maximum_ AND NOT private.sf_manual_five_day_block((SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'shift_code',a.shift_code,'rhythm_override',a.rhythm_override)),'[]') FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=e_.id AND a.status<>'CANCELLED' AND a.starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND a.starts_at<(last_+7)::timestamp AT TIME ZONE tz_),tz_,min(d),max(d),count(*)::int) AND bool_or(d IN(SELECT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND employee_id=e_.id))) THEN RAISE EXCEPTION 'Das Maximum aufeinanderfolgender Dienste wird überschritten.'; END IF;
  -- Block length is a planning preference; a shorter block is valid.
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
  target_count_:=coalesce(private.sf_solid_conditional_required(company_,row_.d,row_.shift_code),target_count_);
  IF count_>coalesce(target_count_,0) THEN RAISE EXCEPTION 'Der tatsächliche Besetzungsbedarf wird überschritten.'; END IF;
 END LOOP;
 -- Insert conscious manual duties after all automatic limits and staffing caps were checked.
 FOR row_ IN SELECT * FROM jsonb_to_recordset(manual_rows_) AS x(employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,legacy_id text,note text,break_minutes int,rhythm_override jsonb) LOOP
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=row_.employee_id AND status='active' AND deleted_at IS NULL;
  IF NOT FOUND OR NOT coalesce(row_.shift_code=ANY(e_.shift_permissions),false) THEN RAISE EXCEPTION 'Mitarbeiter oder Schichtfreigabe ist nicht mehr gültig.'; END IF;
  day_:=(row_.starts_at AT TIME ZONE tz_)::date;
  IF day_ IS NULL OR day_<month_ OR day_>=last_ OR row_.ends_at IS NULL OR row_.ends_at<=row_.starts_at
    OR row_.legacy_id IS NULL OR e_.start_date>day_ OR e_.contract_end<day_ THEN RAISE EXCEPTION 'Ungültiger manueller Dienst im Monatsvorschlag.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code=row_.shift_code AND active) THEN RAISE EXCEPTION 'Das Schichtmodell ist nicht mehr aktiv.'; END IF;
  INSERT INTO public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,status,created_by,note,break_minutes,rhythm_override)
   VALUES(company_,e_.id,row_.legacy_id,row_.shift_code,row_.starts_at,row_.ends_at,'DRAFT',actor_,coalesce(row_.note,'Manuell in der Vorplanung eingeplant'),coalesce(row_.break_minutes,0),row_.rhythm_override) RETURNING id INTO new_id_;
  manual_ids_:=array_append(manual_ids_,new_id_);
 END LOOP;
 ids_:=ids_||manual_ids_;
 PERFORM private.sf_assert_solid_critical_coverage(company_,month_);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(company_,'MONTH_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('month',month_,'replaced',cancelled_,'created',cardinality(ids_),'weeklyLimits',respect_weekly_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',cardinality(ids_),'month',month_);
END $function$;


CREATE OR REPLACE FUNCTION private.sf_assert_solid_recovery(company_ uuid, employee_ uuid, anchor_ date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;pn_ text;b_ record;prev_ record;has_prev_ boolean:=false;short_ boolean;related_ boolean; rows_ jsonb;errors_ text[];weekly_ numeric;
BEGIN
 SELECT p.solid_planning_rules,c.timezone,e.personnel_no INTO rules_,tz_,pn_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id JOIN public.employees e ON e.company_id=c.id AND e.id=employee_ WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 IF coalesce((rules_->>'confirmedRulesVersion')::int,0)>=2 THEN
  SELECT coalesce(nullif(private.sf_month_meta(e.qualifications,'maxWeekly'),'')::numeric,e.weekly_hours,40) INTO weekly_ FROM public.employees e WHERE e.id=employee_ AND e.company_id=company_;
  SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code,'rhythm_override',rhythm_override)),'[]') INTO rows_ FROM public.shift_assignments
   WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override) AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(anchor_-14)::timestamp AT TIME ZONE tz_;
  rules_:=private.sf_employee_planning_rules(company_,employee_,rules_);
  weekly_:=coalesce((rules_->>'_otDayWeeklyLimit')::numeric,weekly_);
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[anchor_],weekly_);
  IF cardinality(errors_)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=errors_[1]; END IF;
  RETURN;
 END IF;

  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments c ON c.company_id=a.company_id AND c.employee_id=a.employee_id AND (c.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1 WHERE a.starts_at>=(anchor_-1)::timestamp AT TIME ZONE tz_ AND a.starts_at<(anchor_+1)::timestamp AT TIME ZONE tz_ AND c.starts_at>=anchor_::timestamp AT TIME ZONE tz_ AND c.starts_at<(anchor_+2)::timestamp AT TIME ZONE tz_ AND a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND NOT private.sf_manual_preview_current(a.rhythm_override) AND c.status<>'CANCELLED' AND NOT private.sf_manual_preview_current(c.rhythm_override) AND a.shift_code='O3' AND c.shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER') AND anchor_ IN((a.starts_at AT TIME ZONE tz_)::date,(c.starts_at AT TIME ZONE tz_)::date)) THEN RAISE EXCEPTION 'Nach O3 kein früherer Nachtdienst am Folgetag.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code,'rhythm_override',rhythm_override)),'[]') INTO rows_ FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override) AND starts_at>=(anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_;
 FOR b_ IN WITH dates AS(
  SELECT (starts_at AT TIME ZONE tz_)::date d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(shift_code IN('OT1','OT2','OT3')) ot
  FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
   AND starts_at >= (anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at < (anchor_+15)::timestamp AT TIME ZONE tz_ GROUP BY 1
 ),islands AS(SELECT *,d-(row_number() OVER(ORDER BY d))::int g FROM dates)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n)::int duties,bool_and(ot) only_ot FROM islands GROUP BY g ORDER BY min(d) LOOP
  related_:=anchor_ BETWEEN b_.first_day-1 AND b_.last_day+1;
  IF related_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) AND NOT private.sf_manual_five_day_block(rows_,tz_,b_.first_day,b_.last_day,b_.duties::int) THEN RAISE EXCEPTION 'Höchstens vier Dienste am Stück (%).',pn_; END IF;
  IF NOT has_prev_ THEN prev_:=b_; END IF;
  IF has_prev_ AND (related_ OR anchor_ BETWEEN prev_.first_day-1 AND prev_.last_day+1) THEN
   short_:=coalesce(rules_->'shortBlockRecoveryPersonnelNos','[]') ? coalesce(pn_,'') AND prev_.duties<=coalesce((rules_->>'shortBlockMaximum')::int,2) AND prev_.only_ot;
   IF b_.first_day-prev_.last_day-1 < (CASE WHEN short_ THEN 1 ELSE coalesce((rules_->>'minFreeStartDays')::int,2) END)
    OR extract(epoch FROM b_.start_at-prev_.end_at)/3600 < (CASE WHEN short_ THEN 11 ELSE coalesce((rules_->>'minBlockRestHours')::numeric,48) END) THEN
    RAISE EXCEPTION 'Erholung für %: zwischen Arbeitsblöcken mindestens % freie Starttage und % Stunden Ruhe.',pn_,CASE WHEN short_ THEN 1 ELSE 2 END,CASE WHEN short_ THEN 11 ELSE 48 END;
   END IF;
  END IF;
  prev_:=b_;has_prev_:=true;
 END LOOP;
END $function$;


CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits(company_ uuid, employee_ uuid, month_ date, exclude_ uuid DEFAULT NULL::uuid, start_ timestamp with time zone DEFAULT NULL::timestamp with time zone, end_ timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE policy_ public.company_compliance_policy; e_ public.employees; tz_ text; a_ timestamptz; b_ timestamptz;
 hours_ numeric; calendar_ numeric; count_ integer; target_ numeric; limit_ numeric; rows_ jsonb;eight_ boolean;err_ text;ot_max_ numeric;
BEGIN
 SELECT * INTO policy_ FROM public.company_compliance_policy WHERE company_id=company_;

 IF coalesce((policy_.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2 AND coalesce((policy_.solid_planning_rules->>'enabled')::boolean,false) THEN
  SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
  SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
  a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
  target_:=coalesce(nullif(private.sf_month_meta(e_.qualifications,'monthlyHours'),'')::numeric,CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' THEN 180 ELSE e_.weekly_hours*4.348 END);
  SELECT count(*)>0 AND bool_and(extract(epoch FROM(t.default_end-t.default_start+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END))/3600<=8) INTO eight_
   FROM public.shift_templates t WHERE t.company_id=company_ AND t.active AND t.code=ANY(e_.shift_permissions);
  WITH duties AS (
   SELECT a.starts_at,a.ends_at,EXISTS(SELECT 1 FROM public.open_shift_market_claims c WHERE c.assignment_id=a.id AND c.employee_id=employee_ AND c.company_id=company_ AND c.status='APPLIED') market_approved
    FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND NOT private.sf_manual_preview_current(a.rhythm_override) AND a.id IS DISTINCT FROM exclude_ AND a.starts_at<b_ AND a.ends_at>a_
   UNION ALL SELECT start_,end_,false WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
  ) SELECT coalesce(jsonb_agg(to_jsonb(duties)),'[]') INTO rows_ FROM duties;
  ot_max_:=nullif(policy_.solid_planning_rules->>'otOnlyMonthlyMaxHours','')::numeric;
  IF ot_max_>0 AND ot_max_<=220 AND e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
   AND cardinality(e_.shift_permissions)>0 AND e_.shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[] THEN
   err_:=private.sf_ot_only_month_error(rows_,month_,tz_,ot_max_,start_ IS NOT NULL);
  ELSE
  err_:=private.sf_confirmed_month_error(rows_,month_,tz_,(e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180),target_,eight_,start_ IS NOT NULL,private.sf_employee_planning_rules(company_,employee_,policy_.solid_planning_rules));
  END IF;
  IF err_ IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=err_;END IF;
  RETURN;
 END IF;
 IF policy_.monthly_planning_max_hours IS NULL AND policy_.monthly_planning_max_shifts IS NULL THEN RETURN; END IF;
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 a_:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;
 b_:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 SELECT coalesce((SELECT nullif(substr(q,19),'')::numeric FROM unnest(e_.qualifications) q WHERE q LIKE '__sp:monthlyHours=%' LIMIT 1),e_.weekly_hours*4.348) INTO target_;
 limit_:=CASE WHEN e_.employment~*'^Vollzeit(\s+180)?$' AND target_>=180
  THEN coalesce(policy_.monthly_planning_max_hours,220) ELSE least(coalesce(policy_.monthly_planning_max_hours,180),target_) END;
 WITH duties AS (
  SELECT starts_at s,ends_at e FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_
   AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override) AND id IS DISTINCT FROM exclude_ AND starts_at<b_ AND ends_at>a_
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
END $function$;


CREATE OR REPLACE FUNCTION private.sf_validate_individual_month(company_ uuid, month_ date, people_ uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees; tz_ text; last_ date; meta_ jsonb; target_ numeric; limit_ numeric; maximum_ int; rows_ jsonb;
BEGIN
 IF month_ IS NULL OR month_ <> date_trunc('month',month_)::date OR people_ IS NULL
  OR cardinality(people_) = 0 OR cardinality(people_) <> (SELECT count(DISTINCT x) FROM unnest(people_) x)
 THEN RAISE EXCEPTION 'Ungültiger Bereich der individuellen Monatsplanung.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 IF tz_ IS NULL OR (SELECT count(*) FROM public.employees WHERE company_id=company_ AND id=ANY(people_) AND status='active' AND deleted_at IS NULL) <> cardinality(people_)
 THEN RAISE EXCEPTION 'Die Mitarbeiter der individuellen Planung sind nicht mehr verfügbar.'; END IF;
 last_ := (month_ + interval '1 month')::date;
 FOR e_ IN SELECT * FROM public.employees WHERE company_id=company_ AND id=ANY(people_) LOOP
  SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code,'rhythm_override',rhythm_override)),'[]') INTO rows_ FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override) AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_;
  SELECT coalesce(jsonb_object_agg(split_part(substr(q,6),'=',1),substr(q,strpos(q,'=')+1)),'{}'::jsonb)
   INTO meta_ FROM unnest(e_.qualifications) q WHERE q LIKE '__sp:%=%';
  IF coalesce(meta_->>'planningTeam','') <> '' OR coalesce(meta_->>'rhythmMode','off') <> 'off'
   OR NOT e_.shift_permissions && ARRAY['FD-WE','SD','ND']::text[] OR 'FD'=ANY(e_.shift_permissions)
  THEN RAISE EXCEPTION 'Individuelle Blöcke sind nur für flexible Mitarbeiter ohne Team und festen Rhythmus vorgesehen.'; END IF;
  target_ := coalesce(nullif(meta_->>'monthlyHours','')::numeric,180);
  limit_ := CASE WHEN e_.employment ~* '^Vollzeit(\s+180)?$' AND target_ >= 180 THEN least(220,floor((target_+4)/8)*8) ELSE least(180,floor(target_/8)*8) END;
  maximum_ := least(5,coalesce(nullif(nullif(meta_->>'maxConsecutive','')::int,0),5));
  IF EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
    AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_
    AND (shift_code NOT IN('FD-WE','SD','ND') OR mod(extract(epoch FROM ((ends_at AT TIME ZONE tz_)::time-(starts_at AT TIME ZONE tz_)::time))::numeric+86400,86400)/3600 <> 8))
  THEN RAISE EXCEPTION 'Die individuelle Planung setzt freigegebene 8-Stunden-Dienste voraus.'; END IF;
  IF (SELECT coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600),0) FROM public.shift_assignments
    WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
      AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_) > limit_+.000001
  THEN RAISE EXCEPTION 'Die individuelle Planung überschreitet das persönliche Stundenlimit (Personalnummer %).',e_.personnel_no; END IF;
  IF EXISTS(WITH days AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments
      WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
       AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
    islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
    SELECT 1 FROM islands GROUP BY k HAVING bool_or(d>=month_ AND d<last_)
     AND ((count(*)>maximum_ AND NOT private.sf_manual_five_day_block(rows_,tz_,min(d),max(d),count(*)::int)) OR (count(*)=1 AND min(d)>=month_ AND min(d)<last_-1)))
  THEN RAISE EXCEPTION 'Arbeitsblöcke müssen zwei bis höchstens fünf Dienste umfassen.'; END IF;
  IF EXISTS(WITH days AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments
      WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
       AND (starts_at AT TIME ZONE tz_)::time>='20:00'::time
       AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
    islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
    SELECT 1 FROM islands GROUP BY k HAVING bool_or(d>=month_ AND d<last_) AND (count(*)<2 OR (count(*)>4 AND NOT private.sf_manual_five_day_block(rows_,tz_,min(d),max(d),count(*)::int))))
  THEN RAISE EXCEPTION 'Nachtblöcke müssen zwei bis vier Nachtdienste umfassen; Monatsgrenzen zählen mit.'; END IF;
  -- Follow complete night islands across both boundaries, so a December start and February recovery are also checked.
  IF EXISTS(WITH duties AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d,
      (starts_at AT TIME ZONE tz_)::time>='20:00'::time night
    FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED' AND NOT private.sf_manual_preview_current(rhythm_override)
      AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
   islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM duties WHERE night),
   blocks AS (SELECT min(d) first_day,max(d) last_day FROM islands GROUP BY k),
   relevant AS (SELECT * FROM blocks WHERE first_day<=last_ AND last_day>=month_-3)
   SELECT 1 FROM relevant n JOIN duties a ON a.d=n.first_day-1
   UNION ALL
   SELECT 1 FROM relevant n JOIN duties a ON a.d BETWEEN n.last_day+1 AND n.last_day+3)
  THEN RAISE EXCEPTION 'Nachtblöcke benötigen einen freien Starttag davor und drei danach (Personalnummer %).',e_.personnel_no; END IF;
  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments b
    ON a.company_id=b.company_id AND a.employee_id=b.employee_id
    AND (b.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1
    WHERE a.company_id=company_ AND a.employee_id=e_.id AND a.status<>'CANCELLED' AND NOT private.sf_manual_preview_current(a.rhythm_override) AND b.status<>'CANCELLED' AND NOT private.sf_manual_preview_current(b.rhythm_override)
    AND ((a.starts_at AT TIME ZONE tz_)::date>=month_ AND (a.starts_at AT TIME ZONE tz_)::date<last_
      OR (b.starts_at AT TIME ZONE tz_)::date>=month_ AND (b.starts_at AT TIME ZONE tz_)::date<last_)
    AND (b.starts_at AT TIME ZONE tz_)::time<(a.starts_at AT TIME ZONE tz_)::time)
  THEN RAISE EXCEPTION 'Rückwärtswechsel benötigen einen freien Kalendertag.'; END IF;
 END LOOP;
END $function$;


CREATE OR REPLACE FUNCTION private.sf_guard_solid_recovery()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a_ public.shift_assignments;tz_ text;
BEGIN
 IF TG_OP<>'DELETE' AND NEW.rhythm_override->'manualPlanning'='true'::jsonb THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' AND OLD.rhythm_override->'manualPlanning'='true'::jsonb THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.employee_id,OLD.starts_at,OLD.ends_at,OLD.shift_code,OLD.status) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.employee_id,NEW.starts_at,NEW.ends_at,NEW.shift_code,NEW.status) THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN
  SELECT timezone INTO tz_ FROM public.companies WHERE id=OLD.company_id;
  PERFORM private.sf_assert_solid_recovery(OLD.company_id,OLD.employee_id,(OLD.starts_at AT TIME ZONE coalesce(tz_,'Europe/Berlin'))::date);
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT * INTO a_ FROM public.shift_assignments WHERE id=NEW.id AND status<>'CANCELLED';
  IF FOUND THEN SELECT timezone INTO tz_ FROM public.companies WHERE id=a_.company_id;
   PERFORM private.sf_assert_solid_recovery(a_.company_id,a_.employee_id,(a_.starts_at AT TIME ZONE coalesce(tz_,'Europe/Berlin'))::date);
  END IF;
 END IF;
 RETURN NULL;
END $function$;


CREATE OR REPLACE FUNCTION private.sf_guard_confirmed_month_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a_ public.shift_assignments;tz_ text;m_ date;
BEGIN
 IF private.sf_manual_preview_current(NEW.rhythm_override) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=NEW.company_id AND coalesce((solid_planning_rules->>'enabled')::boolean,false) AND coalesce((solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2) THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.employee_id,OLD.starts_at,OLD.ends_at) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.employee_id,NEW.starts_at,NEW.ends_at) AND OLD.status<>'CANCELLED' THEN RETURN NULL; END IF;
 SELECT * INTO a_ FROM public.shift_assignments WHERE id=NEW.id AND status<>'CANCELLED';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF private.sf_planner_month_override(a_.company_id,a_.employee_id) THEN RETURN NULL; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=a_.company_id;
 FOR m_ IN SELECT generate_series(date_trunc('month',a_.starts_at AT TIME ZONE tz_),date_trunc('month',(a_.ends_at-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
  PERFORM private.sf_assert_month_planning_limits(a_.company_id,a_.employee_id,m_);
 END LOOP;
 RETURN NULL;
END $function$;


NOTIFY pgrst,'reload schema';
