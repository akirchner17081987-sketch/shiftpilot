-- Normal OT is the day-duty stage. OT1/OT2/OT3 retain their separate roster rules.
CREATE OR REPLACE FUNCTION private.sf_descending_shift_error(from_ text,to_ text,rules_ jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH codes AS(SELECT upper(from_) a,upper(to_) b), ranks AS(
 SELECT a,b,CASE a WHEN 'OT' THEN 0 WHEN 'O1' THEN 1 WHEN 'O2' THEN 2 WHEN 'TL' THEN 2 WHEN 'TL-LE' THEN 2 WHEN 'TL-RE' THEN 2 WHEN 'TEAMLEITER' THEN 2 WHEN 'O3' THEN 3 END x,
 CASE b WHEN 'OT' THEN 0 WHEN 'O1' THEN 1 WHEN 'O2' THEN 2 WHEN 'TL' THEN 2 WHEN 'TL-LE' THEN 2 WHEN 'TL-RE' THEN 2 WHEN 'TEAMLEITER' THEN 2 WHEN 'O3' THEN 3 END y FROM codes)
 SELECT CASE WHEN coalesce((rules_->>'enabled')::boolean,false) AND coalesce((rules_->>'preventDescendingShifts')::boolean,false) AND x>y
 THEN format('Absteigender Schichtwechsel %s → %s am Folgetag ist nicht zulässig.',a,b) END FROM ranks;
$$;
REVOKE ALL ON FUNCTION private.sf_descending_shift_error(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_descending_shift_error(text,text,jsonb) TO authenticated,service_role;

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
 IF coalesce((rules_->>'preventLeaderToO1')::boolean,false) AND EXISTS(WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date) OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text))
  SELECT 1 FROM r WHERE (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)) AND d=prior_day+1 AND upper(prior_code) IN('TL-LE','TL-RE') AND upper(shift_code)='O1')
 THEN out_:=array_append(out_,'Nach TL-LE oder TL-RE ist O1 am Folgetag nicht zulässig.'); END IF;
 out_:=out_||ARRAY(WITH r AS(
  SELECT x.*,(starts_at AT TIME ZONE tz_)::date d,lag(shift_code)OVER(ORDER BY starts_at) prior_code,lag((starts_at AT TIME ZONE tz_)::date)OVER(ORDER BY starts_at) prior_day
  FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 messages AS(SELECT private.sf_descending_shift_error(prior_code,shift_code,rules_) message FROM r
  WHERE d=prior_day+1 AND (affected_ IS NULL OR d=ANY(affected_) OR prior_day=ANY(affected_)))
 SELECT DISTINCT message FROM messages WHERE message IS NOT NULL);
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
END $function$;


-- This tenant's O/TL model only. No rules or assignments in the 8-hour company change.
UPDATE public.company_compliance_policy p
SET solid_planning_rules=jsonb_set(p.solid_planning_rules,'{preventDescendingShifts}','true'::jsonb),updated_at=now()
FROM public.companies c WHERE c.id=p.company_id AND c.name='Secontec Services'
AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['O1','O2','O3']) code WHERE NOT EXISTS(
 SELECT 1 FROM public.shift_templates t WHERE t.company_id=c.id AND t.active AND t.code=code));
NOTIFY pgrst,'reload schema';
