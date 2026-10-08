-- Bound and hoist transition checks; preserve invoker privileges and all recovery guards.
CREATE OR REPLACE FUNCTION private.sf_assert_solid_recovery(company_ uuid,employee_ uuid,anchor_ date)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE rules_ jsonb;tz_ text;pn_ text;b_ record;prev_ record;has_prev_ boolean:=false;short_ boolean;related_ boolean;
BEGIN
 SELECT p.solid_planning_rules,c.timezone,e.personnel_no INTO rules_,tz_,pn_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id JOIN public.employees e ON e.company_id=c.id AND e.id=employee_ WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 tz_:=coalesce(tz_,'Europe/Berlin');
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
END $f$;
