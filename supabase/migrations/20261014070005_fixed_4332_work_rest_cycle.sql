CREATE OR REPLACE FUNCTION private.sf_confirmed_rule_errors(rows_ jsonb, tz_ text, rules_ jsonb, affected_ date[] DEFAULT NULL::date[], weekly_ numeric DEFAULT 40)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE out_ text[]:=ARRAY[]::text[];b_ record;prev_ record;next_ record;has_prev_ boolean:=false;touch_ boolean;w_ date;hours_ numeric;cap_ numeric:=least(coalesce((rules_->>'maxCalendarWeekHours')::numeric,40),CASE WHEN weekly_>0 THEN weekly_ ELSE 40 END);free_ int;recovery_ int;
BEGIN
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN out_; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(upper(shift_code) IN('ND','O1','O2','O3','O1S','O2S','TL','TL-LE','TL-RE','TEAMLEITER','QA') OR (starts_at AT TIME ZONE tz_)::time>=time '18:00') only_night FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties,bool_and(only_night) only_night FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveShifts')::int,4)=4 THEN 'Höchstens vier Dienste am Stück.' ELSE format('Höchstens %s Dienste am Stück.',rules_->>'maxConsecutiveShifts') END); END IF;
  IF NOT has_prev_ THEN prev_:=b_; END IF;
  IF has_prev_ AND (touch_ OR affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN prev_.first_day AND prev_.last_day)) THEN
   free_:=b_.first_day-((prev_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   recovery_:=coalesce((rules_->>'minFreeCalendarDays')::int,2);
   IF prev_.duties=3 AND prev_.only_night AND rules_->>'threeNightBlockRecoveryFullCalendarDays' IS NOT NULL THEN recovery_:=least(recovery_,(rules_->>'threeNightBlockRecoveryFullCalendarDays')::int); END IF;
   IF free_<recovery_ OR extract(epoch FROM b_.start_at-prev_.end_at)/3600<coalesce((rules_->>'minBlockRestHours')::numeric,48)-.000001 THEN out_:=array_append(out_,format('Zwischen Arbeitsblöcken mindestens %s vollständig freie Kalendertage und %s Stunden Ruhe.',recovery_,coalesce(rules_->>'minBlockRestHours','48'))); END IF;
  END IF;
  prev_:=b_;has_prev_:=true;
 END LOOP;
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
  WHERE upper(shift_code) IN('ND','O1','O2','O3','O1S','O2S','TL','TL-LE','TL-RE','TEAMLEITER','QA') OR (starts_at AT TIME ZONE tz_)::time>=time '18:00'),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveNightShifts')::int,3) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveNightShifts')::int,3)=3 THEN 'Höchstens drei Nachtdienste am Stück.' ELSE format('Höchstens %s Nachtdienste am Stück.',rules_->>'maxConsecutiveNightShifts') END); END IF;
  SELECT x.starts_at,x.ends_at,(x.starts_at AT TIME ZONE tz_)::date d INTO next_ FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
   WHERE x.starts_at>=b_.end_at AND (x.starts_at AT TIME ZONE tz_)::date>b_.last_day ORDER BY x.starts_at LIMIT 1;
  IF FOUND AND (touch_ OR affected_ IS NULL OR next_.d=ANY(affected_)) THEN
   free_:=next_.d-((b_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   recovery_:=coalesce((rules_->>'minNightRecoveryCalendarDays')::int,3);
   IF b_.duties=3 AND rules_->>'threeNightBlockRecoveryFullCalendarDays' IS NOT NULL THEN recovery_:=least(recovery_,(rules_->>'threeNightBlockRecoveryFullCalendarDays')::int); END IF;
   IF free_<recovery_ THEN out_:=array_append(out_,format('Nach einem Nachtblock mindestens %s vollständig freie Kalendertage.',recovery_)); END IF;
  END IF;
 END LOOP;
 IF EXISTS(WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(ends_at) OVER(ORDER BY starts_at) prior_end,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date) OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text))
  SELECT 1 FROM r WHERE (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)) AND prior_end IS NOT NULL AND extract(epoch FROM starts_at-prior_end)/3600<11-.000001)
 THEN out_:=array_append(out_,'Mindestens 11 Stunden Ruhezeit.'); END IF;
 IF EXISTS(WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date) OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text))
  SELECT 1 FROM r WHERE (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)) AND d=prior_day+1 AND prior_code='O3' AND shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'))
 THEN out_:=array_append(out_,'Nach O3 kein früherer Nachtdienst am Folgetag.'); END IF;
 FOR w_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 candidates AS(SELECT date_trunc('week',starts_at AT TIME ZONE tz_)::date w FROM r WHERE affected_ IS NULL OR d=ANY(affected_)
  UNION SELECT date_trunc('week',(ends_at-interval '1 microsecond') AT TIME ZONE tz_)::date FROM r WHERE affected_ IS NULL OR d=ANY(affected_)
  UNION SELECT date_trunc('week',d::timestamp)::date FROM unnest(affected_) d)
 SELECT DISTINCT w FROM candidates LOOP
  SELECT coalesce(sum(extract(epoch FROM least(x.ends_at,(w_+7)::timestamp AT TIME ZONE tz_)-greatest(x.starts_at,w_::timestamp AT TIME ZONE tz_))/3600),0) INTO hours_
   FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
   WHERE x.starts_at<(w_+7)::timestamp AT TIME ZONE tz_ AND x.ends_at>w_::timestamp AT TIME ZONE tz_;
  IF hours_>cap_+.000001 THEN out_:=array_append(out_,format('Höchstens %s Stunden pro Kalenderwoche; Nachtdienste zählen zeitanteilig.',cap_)); END IF;
 END LOOP;
 RETURN ARRAY(SELECT DISTINCT x FROM unnest(out_) x);
END $function$
;

-- Bind existing active non-OT staff to the work/rest cycle, staggered across twelve phases.
DO $f$
DECLARE company_ uuid;count_ int;pattern_ text:='ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI';
BEGIN
 SELECT count(*) INTO count_ FROM public.companies WHERE name='Secontec Services';
 IF count_<>1 THEN RAISE EXCEPTION 'Das Unternehmen für den festen Rhythmus ist nicht eindeutig.'; END IF;
 SELECT id INTO company_ FROM public.companies WHERE name='Secontec Services';
 UPDATE public.company_compliance_policy
 SET solid_planning_rules=solid_planning_rules||jsonb_build_object(
  'maxConsecutiveNightShifts',4,'minNightRecoveryCalendarDays',2,
  'threeNightBlockRecoveryFullCalendarDays',1,
  'fixedWorkRestCycle',jsonb_build_object('pattern',regexp_split_to_array(pattern_,', '),'anchor','2026-10-12','excludeShifts',ARRAY['OT1','OT2','OT3']))
 WHERE company_id=company_ AND coalesce((solid_planning_rules->>'enabled')::boolean,false) AND coalesce((solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2;
 GET DIAGNOSTICS count_=ROW_COUNT;
 IF count_<>1 THEN RAISE EXCEPTION 'Das bestätigte Regelwerk fehlt.'; END IF;
 WITH crew AS(
  SELECT id,role,(row_number()OVER(PARTITION BY role='Teamleiter' ORDER BY nullif(regexp_replace(personnel_no,'[^0-9]','','g'),'')::numeric NULLS LAST,personnel_no,id)-1)::int position
  FROM public.employees WHERE company_id=company_ AND status='active' AND deleted_at IS NULL
   AND cardinality(shift_permissions)>0 AND NOT shift_permissions <@ ARRAY['OT1','OT2','OT3']::text[]
 ),phased AS(SELECT id,CASE WHEN role='Teamleiter' THEN (position*3)%12 ELSE position%12 END phase FROM crew)
 UPDATE public.employees e SET qualifications=
  ARRAY(SELECT q FROM unnest(coalesce(e.qualifications,ARRAY[]::text[]))WITH ORDINALITY a(q,n)
   WHERE q NOT LIKE '__sp:rhythmMode=%' AND q NOT LIKE '__sp:rhythmStart=%' AND q NOT LIKE '__sp:rhythmPattern=%'
    AND q NOT LIKE '__sp:rhythmKind=%' AND q NOT LIKE '__sp:rhythmExemptOt=%' AND q NOT LIKE '__sp:maxConsecutive=%' ORDER BY n)
  ||ARRAY['__sp:rhythmMode=required','__sp:rhythmStart='||(date '2026-10-12'-p.phase)::text,
   '__sp:rhythmPattern='||pattern_,'__sp:rhythmKind=cycle','__sp:rhythmExemptOt=true','__sp:maxConsecutive=4']
 FROM phased p WHERE e.id=p.id AND e.company_id=company_;
END $f$;

