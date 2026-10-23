-- Explicit manual five-day blocks use the existing per-duty confirmation and audit.
-- No company settings or existing assignments are changed.
CREATE OR REPLACE FUNCTION private.sf_manual_five_day_block(rows_ jsonb,tz_ text,first_ date,last_ date,duties_ int)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(duties_ BETWEEN 1 AND 5 AND last_-first_ BETWEEN 0 AND 4 AND EXISTS(
  SELECT 1 FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text,rhythm_override jsonb)
  WHERE x.rhythm_override->'workBlockDays'='5'::jsonb
   AND (x.rhythm_override->>'blockEnd')::date-(x.rhythm_override->>'blockStart')::date=4 AND (x.rhythm_override->>'blockStart')::date<=first_ AND (x.rhythm_override->>'blockEnd')::date>=last_
   AND nullif(x.rhythm_override->>'actor_id','') IS NOT NULL AND nullif(x.rhythm_override->>'reason','') IS NOT NULL
   AND (x.rhythm_override->>'starts_at')::timestamptz=x.starts_at AND (x.rhythm_override->>'ends_at')::timestamptz=x.ends_at
   AND x.rhythm_override->>'shift_code'=x.shift_code AND (x.starts_at AT TIME ZONE tz_)::date BETWEEN first_ AND last_
 ),false);
$$;
REVOKE ALL ON FUNCTION private.sf_manual_five_day_block(jsonb,text,date,date,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_manual_five_day_block(jsonb,text,date,date,int) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION private.sf_normalize_manual_rhythm_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare role_ text; reason_ text; e_ public.employees; rhythm_ jsonb; tz_ text; expected_ text; block_ boolean; first_ date; last_ date;
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
 block_:=new.rhythm_override->'workBlockDays'='5'::jsonb;
 if coalesce(block_,false) then
  first_:=(new.rhythm_override->>'blockStart')::date;last_:=(new.rhythm_override->>'blockEnd')::date;
  if first_ is null or last_ is null or last_-first_<>4 or (new.starts_at at time zone tz_)::date not between first_ and last_ then
   raise exception 'Die manuelle Ausnahme gilt nur für den bestätigten Fünf-Tage-Block.';
  end if;
 end if;
 if not coalesce(block_,false) and (rhythm_->>'mode' is distinct from 'required' or expected_ is null or expected_='ALLE'
  or (coalesce((rhythm_->>'exemptOt')::boolean,false) and new.shift_code in('OT1','OT2','OT3'))
  or upper(new.shift_code)=any(regexp_split_to_array(expected_,'[+|/]'))) then raise exception 'Für diesen Dienst ist keine Rhythmusausnahme erforderlich. Bitte neu prüfen.'; end if;
 new.rhythm_override:=jsonb_build_object('reason',reason_,'expected',expected_,'actor_id',auth.uid(),'actor_role',role_,'confirmed_at',clock_timestamp(),'employee_id',new.employee_id,'shift_code',new.shift_code,'starts_at',new.starts_at,'ends_at',new.ends_at);
 if coalesce(block_,false) then new.rhythm_override:=new.rhythm_override||jsonb_build_object('workBlockDays',5,'blockStart',first_,'blockEnd',last_); end if;
 return new;
end $function$;

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
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) AND NOT private.sf_manual_five_day_block(rows_,tz_,b_.first_day,b_.last_day,b_.duties::int) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveShifts')::int,4)=4 THEN 'Höchstens vier Dienste am Stück.' ELSE format('Höchstens %s Dienste am Stück.',rules_->>'maxConsecutiveShifts') END); END IF;
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
  IF touch_ AND b_.duties>coalesce((rules_->>'maxConsecutiveNightShifts')::int,3) AND NOT private.sf_manual_five_day_block(rows_,tz_,b_.first_day,b_.last_day,b_.duties::int) THEN out_:=array_append(out_,CASE WHEN coalesce((rules_->>'maxConsecutiveNightShifts')::int,3)=3 THEN 'Höchstens drei Nachtdienste am Stück.' ELSE format('Höchstens %s Nachtdienste am Stück.',rules_->>'maxConsecutiveNightShifts') END); END IF;
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
   WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(anchor_-14)::timestamp AT TIME ZONE tz_;
  rules_:=private.sf_employee_planning_rules(company_,employee_,rules_);
  weekly_:=coalesce((rules_->>'_otDayWeeklyLimit')::numeric,weekly_);
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[anchor_],weekly_);
  IF cardinality(errors_)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=errors_[1]; END IF;
  RETURN;
 END IF;

  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments c ON c.company_id=a.company_id AND c.employee_id=a.employee_id AND (c.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1 WHERE a.starts_at>=(anchor_-1)::timestamp AT TIME ZONE tz_ AND a.starts_at<(anchor_+1)::timestamp AT TIME ZONE tz_ AND c.starts_at>=anchor_::timestamp AT TIME ZONE tz_ AND c.starts_at<(anchor_+2)::timestamp AT TIME ZONE tz_ AND a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND c.status<>'CANCELLED' AND a.shift_code='O3' AND c.shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER') AND anchor_ IN((a.starts_at AT TIME ZONE tz_)::date,(c.starts_at AT TIME ZONE tz_)::date)) THEN RAISE EXCEPTION 'Nach O3 kein früherer Nachtdienst am Folgetag.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code,'rhythm_override',rhythm_override)),'[]') INTO rows_ FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND starts_at>=(anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_;
 FOR b_ IN WITH dates AS(
  SELECT (starts_at AT TIME ZONE tz_)::date d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(shift_code IN('OT1','OT2','OT3')) ot
  FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
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

CREATE OR REPLACE FUNCTION private.sf_confirmed_candidate_error(company_ uuid, employee_ uuid, start_ timestamp with time zone, end_ timestamp with time zone, code_ text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;d_ date;rows_ jsonb;errors_ text[];weekly_ numeric;m_ date;err_ text;
BEGIN
 SELECT p.solid_planning_rules,coalesce(c.timezone,'Europe/Berlin') INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN NULL; END IF;
 d_:=(start_ AT TIME ZONE tz_)::date;
 SELECT coalesce(nullif(private.sf_month_meta(e.qualifications,'maxWeekly'),'')::numeric,e.weekly_hours,40) INTO weekly_ FROM public.employees e WHERE e.id=employee_ AND e.company_id=company_;
 WITH r AS(SELECT starts_at,ends_at,shift_code,rhythm_override FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
  AND starts_at<(d_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(d_-14)::timestamp AT TIME ZONE tz_ UNION ALL SELECT start_,end_,code_,NULL::jsonb)
 SELECT jsonb_agg(to_jsonb(r)) INTO rows_ FROM r;
 rules_:=private.sf_employee_planning_rules(company_,employee_,rules_);
  weekly_:=coalesce((rules_->>'_otDayWeeklyLimit')::numeric,weekly_);
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[d_],weekly_);
 IF cardinality(errors_)>0 THEN RETURN errors_[1]; END IF;
 BEGIN
  FOR m_ IN SELECT generate_series(date_trunc('month',start_ AT TIME ZONE tz_),date_trunc('month',(end_-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
   PERFORM private.sf_assert_month_planning_limits(company_,employee_,m_,NULL,start_,end_);
  END LOOP;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err_=MESSAGE_TEXT;RETURN err_; END;
 RETURN NULL;
END $function$;

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
 PERFORM private.sf_assert_solid_critical_coverage(company_,month_);
 INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
  VALUES(company_,'MONTH_OPTIMIZED','schedule',actor_,role_,jsonb_build_object('month',month_,'replaced',cancelled_,'created',cardinality(ids_),'weeklyLimits',respect_weekly_));
 RETURN jsonb_build_object('replaced',cancelled_,'created',cardinality(ids_),'month',month_);
END $function$;

NOTIFY pgrst,'reload schema';
