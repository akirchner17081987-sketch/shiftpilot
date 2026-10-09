CREATE OR REPLACE FUNCTION private.sf_confirmed_rule_errors(rows_ jsonb,tz_ text,rules_ jsonb,affected_ date[] DEFAULT NULL,weekly_ numeric DEFAULT 40)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE out_ text[]:=ARRAY[]::text[];b_ record;prev_ record;next_ record;has_prev_ boolean:=false;touch_ boolean;w_ date;hours_ numeric;cap_ numeric:=least(40,CASE WHEN weekly_>0 THEN weekly_ ELSE 40 END);free_ int;
BEGIN
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN out_; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>4 THEN out_:=array_append(out_,'Höchstens vier Dienste am Stück.'); END IF;
  IF NOT has_prev_ THEN prev_:=b_; END IF;
  IF has_prev_ AND (touch_ OR affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN prev_.first_day AND prev_.last_day)) THEN
   free_:=b_.first_day-((prev_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   IF free_<2 OR extract(epoch FROM b_.start_at-prev_.end_at)/3600<48-.000001 THEN out_:=array_append(out_,'Zwischen Arbeitsblöcken mindestens zwei vollständig freie Kalendertage und 48 Stunden Ruhe.'); END IF;
  END IF;
  prev_:=b_;has_prev_:=true;
 END LOOP;
 FOR b_ IN WITH r AS(SELECT x.*,(starts_at AT TIME ZONE tz_)::date d FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
  WHERE upper(shift_code) IN('ND','O1','O2','O3','O1S','O2S','TL','TL-LE','TL-RE','TEAMLEITER','QA') OR (starts_at AT TIME ZONE tz_)::time>=time '18:00'),
 days AS(SELECT d,min(starts_at) s,max(ends_at) e,count(*) n FROM r GROUP BY d),islands AS(SELECT *,d-row_number()OVER(ORDER BY d)::int g FROM days)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n) duties FROM islands GROUP BY g ORDER BY min(d) LOOP
  touch_:=affected_ IS NULL OR EXISTS(SELECT 1 FROM unnest(affected_) d WHERE d BETWEEN b_.first_day AND b_.last_day);
  IF touch_ AND b_.duties>3 THEN out_:=array_append(out_,'Höchstens drei Nachtdienste am Stück.'); END IF;
  SELECT x.starts_at,x.ends_at,(x.starts_at AT TIME ZONE tz_)::date d INTO next_ FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,shift_code text)
   WHERE x.starts_at>=b_.end_at AND (x.starts_at AT TIME ZONE tz_)::date>b_.last_day ORDER BY x.starts_at LIMIT 1;
  IF FOUND AND (touch_ OR affected_ IS NULL OR next_.d=ANY(affected_)) THEN
   free_:=next_.d-((b_.end_at-interval '1 microsecond') AT TIME ZONE tz_)::date-1;
   IF free_<3 THEN out_:=array_append(out_,'Nach einem Nachtblock mindestens drei vollständig freie Kalendertage.'); END IF;
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
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_rule_errors(jsonb,text,jsonb,date[],numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_rule_errors(jsonb,text,jsonb,date[],numeric) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_confirmed_month_error(rows_ jsonb,month_ date,tz_ text,full_ boolean,target_ numeric,eight_ boolean,incoming_ boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ timestamptz:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;b_ timestamptz:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 count_ int;hours_ numeric;auto_hours_ numeric;calendar_ numeric;limit_ numeric:=CASE WHEN full_ THEN 190 ELSE least(190,coalesce(target_,180)) END;max_count_ int:=CASE WHEN eight_ THEN 23 ELSE 18 END;
BEGIN
 SELECT count(*) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),
 coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600) FILTER(WHERE starts_at>=a_),0),
 coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),0),
 coalesce(sum(extract(epoch FROM least(ends_at,b_)-greatest(starts_at,a_))/3600),0)
 INTO count_,hours_,auto_hours_,calendar_
 FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,market_approved boolean) WHERE starts_at<b_ AND ends_at>a_;
 IF NOT incoming_ AND count_>max_count_ THEN RETURN format('Maximal %s automatische Schichten pro Monat; Zusatzdienste benötigen eine Marktplatzfreigabe.',max_count_); END IF;
 IF hours_>limit_+.000001 OR calendar_>limit_+.000001 THEN RETURN format('Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten.',limit_); END IF;
 IF NOT incoming_ AND full_ AND eight_ AND auto_hours_>184+.000001 THEN RETURN 'Im 8-Stunden-Modell höchstens 184 automatisch geplante Stunden.'; END IF;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_month_error(jsonb,date,text,boolean,numeric,boolean,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits(company_ uuid, employee_ uuid, month_ date, exclude_ uuid DEFAULT NULL::uuid, start_ timestamp with time zone DEFAULT NULL::timestamp with time zone, end_ timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE policy_ public.company_compliance_policy; e_ public.employees; tz_ text; a_ timestamptz; b_ timestamptz;
 hours_ numeric; calendar_ numeric; count_ integer; target_ numeric; limit_ numeric; rows_ jsonb;eight_ boolean;err_ text;
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
    FROM public.shift_assignments a WHERE a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND a.id IS DISTINCT FROM exclude_ AND a.starts_at<b_ AND a.ends_at>a_
   UNION ALL SELECT start_,end_,false WHERE start_ IS NOT NULL AND start_<b_ AND end_>a_
  ) SELECT coalesce(jsonb_agg(to_jsonb(duties)),'[]') INTO rows_ FROM duties;
  err_:=private.sf_confirmed_month_error(rows_,month_,tz_,e_.employment~*'^Vollzeit(\s+180)?$',target_,eight_,start_ IS NOT NULL);
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'shift_code',shift_code)),'[]') INTO rows_ FROM public.shift_assignments
   WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED' AND starts_at<(anchor_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(anchor_-14)::timestamp AT TIME ZONE tz_;
  errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[anchor_],weekly_);
  IF cardinality(errors_)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=errors_[1]; END IF;
  RETURN;
 END IF;

  IF EXISTS(SELECT 1 FROM public.shift_assignments a JOIN public.shift_assignments c ON c.company_id=a.company_id AND c.employee_id=a.employee_id AND (c.starts_at AT TIME ZONE tz_)::date=(a.starts_at AT TIME ZONE tz_)::date+1 WHERE a.starts_at>=(anchor_-1)::timestamp AT TIME ZONE tz_ AND a.starts_at<(anchor_+1)::timestamp AT TIME ZONE tz_ AND c.starts_at>=anchor_::timestamp AT TIME ZONE tz_ AND c.starts_at<(anchor_+2)::timestamp AT TIME ZONE tz_ AND a.company_id=company_ AND a.employee_id=employee_ AND a.status<>'CANCELLED' AND c.status<>'CANCELLED' AND a.shift_code='O3' AND c.shift_code IN('O1','O2','TL','TL-LE','TL-RE','TEAMLEITER') AND anchor_ IN((a.starts_at AT TIME ZONE tz_)::date,(c.starts_at AT TIME ZONE tz_)::date)) THEN RAISE EXCEPTION 'Nach O3 kein früherer Nachtdienst am Folgetag.'; END IF;
 FOR b_ IN WITH dates AS(
  SELECT (starts_at AT TIME ZONE tz_)::date d,min(starts_at) s,max(ends_at) e,count(*) n,bool_and(shift_code IN('OT1','OT2','OT3')) ot
  FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
   AND starts_at >= (anchor_-14)::timestamp AT TIME ZONE tz_ AND starts_at < (anchor_+15)::timestamp AT TIME ZONE tz_ GROUP BY 1
 ),islands AS(SELECT *,d-(row_number() OVER(ORDER BY d))::int g FROM dates)
 SELECT min(d) first_day,max(d) last_day,min(s) start_at,max(e) end_at,sum(n)::int duties,bool_and(ot) only_ot FROM islands GROUP BY g ORDER BY min(d) LOOP
  related_:=anchor_ BETWEEN b_.first_day-1 AND b_.last_day+1;
  IF related_ AND b_.duties>coalesce((rules_->>'maxConsecutiveShifts')::int,4) THEN RAISE EXCEPTION 'Höchstens vier Dienste am Stück (%).',pn_; END IF;
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

CREATE OR REPLACE FUNCTION private.sf_guard_confirmed_month_count()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ public.shift_assignments;tz_ text;m_ date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.company_compliance_policy WHERE company_id=NEW.company_id AND coalesce((solid_planning_rules->>'enabled')::boolean,false) AND coalesce((solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2) THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.employee_id,OLD.starts_at,OLD.ends_at) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.employee_id,NEW.starts_at,NEW.ends_at) AND OLD.status<>'CANCELLED' THEN RETURN NULL; END IF;
 SELECT * INTO a_ FROM public.shift_assignments WHERE id=NEW.id AND status<>'CANCELLED';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=a_.company_id;
 FOR m_ IN SELECT generate_series(date_trunc('month',a_.starts_at AT TIME ZONE tz_),date_trunc('month',(a_.ends_at-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
  PERFORM private.sf_assert_month_planning_limits(a_.company_id,a_.employee_id,m_);
 END LOOP;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_guard_confirmed_month_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_confirmed_month_count() TO authenticated,service_role;
CREATE CONSTRAINT TRIGGER shift_assignments_confirmed_month_count AFTER INSERT OR UPDATE ON public.shift_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sf_guard_confirmed_month_count();

CREATE OR REPLACE FUNCTION private.sf_confirmed_candidate_error(company_ uuid,employee_ uuid,start_ timestamptz,end_ timestamptz,code_ text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;tz_ text;d_ date;rows_ jsonb;errors_ text[];weekly_ numeric;m_ date;err_ text;
BEGIN
 SELECT p.solid_planning_rules,coalesce(c.timezone,'Europe/Berlin') INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) OR coalesce((rules_->>'confirmedRulesVersion')::int,0)<2 THEN RETURN NULL; END IF;
 d_:=(start_ AT TIME ZONE tz_)::date;
 SELECT coalesce(nullif(private.sf_month_meta(e.qualifications,'maxWeekly'),'')::numeric,e.weekly_hours,40) INTO weekly_ FROM public.employees e WHERE e.id=employee_ AND e.company_id=company_;
 WITH r AS(SELECT starts_at,ends_at,shift_code FROM public.shift_assignments WHERE company_id=company_ AND employee_id=employee_ AND status<>'CANCELLED'
  AND starts_at<(d_+15)::timestamp AT TIME ZONE tz_ AND ends_at>(d_-14)::timestamp AT TIME ZONE tz_ UNION ALL SELECT start_,end_,code_)
 SELECT jsonb_agg(to_jsonb(r)) INTO rows_ FROM r;
 errors_:=private.sf_confirmed_rule_errors(rows_,tz_,rules_,ARRAY[d_],weekly_);
 IF cardinality(errors_)>0 THEN RETURN errors_[1]; END IF;
 BEGIN
  FOR m_ IN SELECT generate_series(date_trunc('month',start_ AT TIME ZONE tz_),date_trunc('month',(end_-interval '1 microsecond') AT TIME ZONE tz_),interval '1 month')::date LOOP
   PERFORM private.sf_assert_month_planning_limits(company_,employee_,m_,NULL,start_,end_);
  END LOOP;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err_=MESSAGE_TEXT;RETURN err_; END;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_confirmed_candidate_error(uuid,uuid,timestamptz,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_confirmed_candidate_error(uuid,uuid,timestamptz,timestamptz,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sf_open_market_candidate(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; ctx jsonb; err text; selected_code text; 
BEGIN
 SELECT * INTO o FROM public.open_shift_market_offers WHERE id=p_offer;
 IF o.id IS NULL OR o.status<>'MARKET_OPEN' OR o.remaining_count=0 OR o.starts_at<=now() THEN RETURN 'Dieses Angebot ist nicht mehr verfügbar'; END IF;
 ctx:=private.sf_open_market_slot(o.company_id,o.work_date,o.shift_code);
 IF (ctx->>'missing')::integer=0 THEN RETURN 'Der Bedarf wurde inzwischen vollständig besetzt'; END IF;
 IF o.starts_at<>(ctx->>'starts_at')::timestamptz OR o.ends_at<>(ctx->>'ends_at')::timestamptz THEN RETURN 'Die Schichtzeiten wurden inzwischen geändert'; END IF;
 IF private.time_month_is_closed(o.company_id,o.work_date) THEN RETURN 'Der Planungsmonat ist abgeschlossen'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=o.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.deleted_at IS NOT NULL OR e.auth_user_id IS NULL THEN RETURN 'Kein aktiver Mitarbeiterzugang'; END IF;
 IF (e.start_date IS NOT NULL AND o.work_date<e.start_date) OR (e.contract_end IS NOT NULL AND o.work_date>e.contract_end) THEN RETURN 'Schicht liegt außerhalb des Beschäftigungszeitraums'; END IF;
 selected_code:=private.sf_shared_coverage_shift(o.company_id,o.shift_code,e.id,o.work_date);
 IF selected_code IS NULL THEN RETURN 'Keine Freigabe für diese Schichtart'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=o.company_id AND code=selected_code AND responsible_only AND responsible_employee_id IS DISTINCT FROM e.id) THEN RETURN 'Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet'; END IF;
 err:=private.sf_shift_scope_error(o.company_id,e.id,selected_code,o.starts_at,o.ends_at);
 IF err IS NOT NULL THEN RETURN err; END IF;
 BEGIN
  PERFORM public.assert_standard_shift_rules(o.company_id,e.id,o.starts_at,o.ends_at,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  RETURN CASE err WHEN 'Shift overlaps another assignment' THEN 'Bereits andere Schicht im Zeitraum' WHEN 'Shift overlaps an approved absence' THEN 'Genehmigte Abwesenheit im Zeitraum' WHEN 'Standard minimum rest period not met before shift' THEN 'Ruhezeit vor der Schicht nicht ausreichend' WHEN 'Standard minimum rest period not met after shift' THEN 'Ruhezeit nach der Schicht nicht ausreichend' WHEN 'Standard maximum shift duration exceeded' THEN 'Schicht überschreitet die zulässige Dauer' ELSE err END;
 END;
 err:=private.sf_confirmed_candidate_error(o.company_id,e.id,o.starts_at,o.ends_at,selected_code);
 IF err IS NOT NULL THEN RETURN err; END IF;
 RETURN NULL;
END $function$;

UPDATE public.company_compliance_policy p SET monthly_planning_max_hours=190,
 monthly_planning_max_shifts=CASE WHEN c.name='Secontec Services - 8h' THEN 23 ELSE 18 END,
 solid_planning_rules=(p.solid_planning_rules-'shortBlockMaximum'-'shortBlockRecoveryPersonnelNos')||jsonb_build_object('enabled',true,'confirmedRulesVersion',2,'timezone',coalesce(c.timezone,'Europe/Berlin'),'maxConsecutiveShifts',4,'maxConsecutiveNightShifts',3,'minFreeCalendarDays',2,'minNightRecoveryCalendarDays',3,'minBlockRestHours',48,'maxCalendarWeekHours',40,'preferredNightBlockLength',3,'minFreeWeekendsPerMonth',1,'rollingWeekTargetHours',40),
 updated_at=now()
FROM public.companies c WHERE c.id=p.company_id AND c.name IN('SchichtFunk','Secontec Services - 8h');
