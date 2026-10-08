-- Extend the same individual night recovery rule to full boundary-crossing blocks.
CREATE OR REPLACE FUNCTION private.sf_validate_individual_month(company_ uuid, month_ date, people_ uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE e_ public.employees; tz_ text; last_ date; meta_ jsonb; target_ numeric; limit_ numeric; maximum_ int;
BEGIN
 IF month_ IS NULL OR month_ <> date_trunc('month',month_)::date OR people_ IS NULL
  OR cardinality(people_) = 0 OR cardinality(people_) <> (SELECT count(DISTINCT x) FROM unnest(people_) x)
 THEN RAISE EXCEPTION 'Ungültiger Bereich der individuellen Monatsplanung.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 IF tz_ IS NULL OR (SELECT count(*) FROM public.employees WHERE company_id=company_ AND id=ANY(people_) AND status='active' AND deleted_at IS NULL) <> cardinality(people_)
 THEN RAISE EXCEPTION 'Die Mitarbeiter der individuellen Planung sind nicht mehr verfügbar.'; END IF;
 last_ := (month_ + interval '1 month')::date;
 FOR e_ IN SELECT * FROM public.employees WHERE company_id=company_ AND id=ANY(people_) LOOP
  SELECT coalesce(jsonb_object_agg(split_part(substr(q,6),'=',1),substr(q,strpos(q,'=')+1)),'{}'::jsonb)
   INTO meta_ FROM unnest(e_.qualifications) q WHERE q LIKE '__sp:%=%';
  IF coalesce(meta_->>'planningTeam','') <> '' OR coalesce(meta_->>'rhythmMode','off') <> 'off'
   OR NOT e_.shift_permissions && ARRAY['FD-WE','SD','ND']::text[] OR 'FD'=ANY(e_.shift_permissions)
  THEN RAISE EXCEPTION 'Individuelle Blöcke sind nur für flexible Mitarbeiter ohne Team und festen Rhythmus vorgesehen.'; END IF;
  target_ := coalesce(nullif(meta_->>'monthlyHours','')::numeric,180);
  limit_ := CASE WHEN e_.employment ~* '^Vollzeit(\s+180)?$' AND target_ >= 180 THEN least(220,floor((target_+4)/8)*8) ELSE least(180,floor(target_/8)*8) END;
  maximum_ := least(5,coalesce(nullif(nullif(meta_->>'maxConsecutive','')::int,0),5));
  IF EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
    AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_
    AND (shift_code NOT IN('FD-WE','SD','ND') OR mod(extract(epoch FROM ((ends_at AT TIME ZONE tz_)::time-(starts_at AT TIME ZONE tz_)::time))::numeric+86400,86400)/3600 <> 8))
  THEN RAISE EXCEPTION 'Die individuelle Planung setzt freigegebene 8-Stunden-Dienste voraus.'; END IF;
  IF (SELECT coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600),0) FROM public.shift_assignments
    WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
      AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_) > limit_+.000001
  THEN RAISE EXCEPTION 'Die individuelle Planung überschreitet das persönliche Stundenlimit (Personalnummer %).',e_.personnel_no; END IF;
  IF EXISTS(WITH days AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments
      WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
       AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
    islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
    SELECT 1 FROM islands GROUP BY k HAVING bool_or(d>=month_ AND d<last_)
     AND (count(*)>maximum_ OR (count(*)=1 AND min(d)>=month_ AND min(d)<last_-1)))
  THEN RAISE EXCEPTION 'Arbeitsblöcke müssen zwei bis höchstens fünf Dienste umfassen.'; END IF;
  IF EXISTS(WITH days AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d FROM public.shift_assignments
      WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
       AND (starts_at AT TIME ZONE tz_)::time>='20:00'::time
       AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
    islands AS (SELECT d,d-row_number() OVER(ORDER BY d)::int k FROM days)
    SELECT 1 FROM islands GROUP BY k HAVING bool_or(d>=month_ AND d<last_) AND (count(*)<2 OR count(*)>4))
  THEN RAISE EXCEPTION 'Nachtblöcke müssen zwei bis vier Nachtdienste umfassen; Monatsgrenzen zählen mit.'; END IF;
  -- Follow complete night islands across both boundaries, so a December start and February recovery are also checked.
  IF EXISTS(WITH duties AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d,
      (starts_at AT TIME ZONE tz_)::time>='20:00'::time night
    FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
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
    WHERE a.company_id=company_ AND a.employee_id=e_.id AND a.status<>'CANCELLED' AND b.status<>'CANCELLED'
    AND ((a.starts_at AT TIME ZONE tz_)::date>=month_ AND (a.starts_at AT TIME ZONE tz_)::date<last_
      OR (b.starts_at AT TIME ZONE tz_)::date>=month_ AND (b.starts_at AT TIME ZONE tz_)::date<last_)
    AND (b.starts_at AT TIME ZONE tz_)::time<(a.starts_at AT TIME ZONE tz_)::time)
  THEN RAISE EXCEPTION 'Rückwärtswechsel benötigen einen freien Kalendertag.'; END IF;
 END LOOP;
END $function$;
NOTIFY pgrst,'reload schema';
