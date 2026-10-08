-- Company-scoped personal monthly targets with an effective date; historical periods retain weekdays.
ALTER TABLE public.time_account_settings ADD COLUMN target_method_from date;
ALTER TABLE public.time_account_settings DROP CONSTRAINT IF EXISTS time_account_settings_target_method_check;
ALTER TABLE public.time_account_settings DROP CONSTRAINT IF EXISTS time_account_target_method_chk;
ALTER TABLE public.time_account_settings ADD CONSTRAINT time_account_settings_target_method_check
 CHECK (target_method IN ('WEEKDAYS_5','PERSONAL_MONTHLY'));
ALTER TABLE public.time_account_settings ADD CONSTRAINT time_account_target_method_from_check
 CHECK ((target_method='WEEKDAYS_5' AND target_method_from IS NULL) OR
  (target_method='PERSONAL_MONTHLY' AND target_method_from IS NOT NULL AND extract(day FROM target_method_from)=1));

CREATE OR REPLACE FUNCTION private.sf_employee_target_minutes(company_ uuid,weekly_ numeric,qualifications_ text[],from_ date,to_ date,state_ text)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE method_ text;effective_ date;raw_ text;target_ numeric;total_ numeric:=0;month_ date;last_ date;a_ date;b_ date;
BEGIN
 IF from_ IS NULL OR to_ IS NULL OR to_<from_ THEN RETURN 0; END IF;
 SELECT target_method,target_method_from INTO method_,effective_ FROM public.time_account_settings WHERE company_id=company_;
 IF method_ IS DISTINCT FROM 'PERSONAL_MONTHLY' OR effective_ IS NULL OR to_<effective_
 THEN RETURN private.sf_target_minutes(weekly_,from_,to_,state_); END IF;
 raw_:=private.sf_month_meta(qualifications_,'monthlyHours');
 target_:=CASE WHEN raw_ ~ '^\d+(\.\d+)?$' THEN raw_::numeric ELSE round(greatest(coalesce(weekly_,0),0)*4.348,2) END;
 IF from_<effective_ THEN total_:=private.sf_target_minutes(weekly_,from_,least(to_,effective_-1),state_); END IF;
 FOR month_ IN SELECT g::date FROM generate_series(date_trunc('month',greatest(from_,effective_)),date_trunc('month',to_),interval '1 month') g LOOP
  last_:=(month_+interval '1 month'-interval '1 day')::date;a_:=greatest(from_,effective_,month_);b_:=least(to_,last_);
  IF b_>=a_ THEN total_:=total_+round(target_*60*(b_-a_+1)::numeric/(last_-month_+1)); END IF;
 END LOOP;
 RETURN round(total_)::integer;
END $$;
REVOKE ALL ON FUNCTION private.sf_employee_target_minutes(uuid,numeric,text[],date,date,text) FROM PUBLIC,anon,authenticated;

-- Future-only method changes may coexist with older closed months; other settings remain locked.
CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_account_settings()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company_ uuid:=coalesce(NEW.company_id,OLD.company_id);affected_ date;
BEGIN
 IF TG_OP='UPDATE' AND
  (to_jsonb(NEW)-ARRAY['target_method','target_method_from','updated_at','updated_by'])=
  (to_jsonb(OLD)-ARRAY['target_method','target_method_from','updated_at','updated_by']) THEN
  affected_:=least(CASE WHEN OLD.target_method='PERSONAL_MONTHLY' THEN OLD.target_method_from END,
   CASE WHEN NEW.target_method='PERSONAL_MONTHLY' THEN NEW.target_method_from END);
  IF affected_ IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.time_month_closures c WHERE c.company_id=company_ AND c.status='CLOSED' AND c.month_start>=affected_)
  THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.time_month_closures c WHERE c.company_id=company_ AND c.status='CLOSED')
 THEN RAISE EXCEPTION 'Stundenkonto-Einstellungen betreffen abgeschlossene Monate. Bitte den betroffenen Monat zuerst öffnen.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.manager_set_time_account_target_method_impl(company_ uuid,method_ text,from_ date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_ text;old_ jsonb;result_ jsonb;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=company_ AND user_id=auth.uid() AND status='ACTIVE';
 IF auth.uid() IS NULL OR coalesce(role_,'') NOT IN('OWNER','ADMIN') THEN RAISE EXCEPTION 'Nur OWNER/ADMIN dürfen die SOLL-Methode ändern.'; END IF;
 IF method_ NOT IN('WEEKDAYS_5','PERSONAL_MONTHLY') OR method_ IS NULL OR
  (method_='PERSONAL_MONTHLY' AND (from_ IS NULL OR extract(day FROM from_)<>1)) OR (method_='WEEKDAYS_5' AND from_ IS NOT NULL)
 THEN RAISE EXCEPTION 'Ungültige SOLL-Methode oder Wirksamkeitsdatum.'; END IF;
 SELECT to_jsonb(s) INTO old_ FROM public.time_account_settings s WHERE company_id=company_ FOR UPDATE;
 IF old_ IS NULL THEN RAISE EXCEPTION 'Stundenkonto zuerst einrichten.'; END IF;
 UPDATE public.time_account_settings s SET target_method=method_,target_method_from=from_,updated_at=now(),updated_by=auth.uid()
  WHERE company_id=company_ RETURNING to_jsonb(s) INTO result_;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 VALUES(company_,'TIME_ACCOUNT_TARGET_METHOD_UPDATED','company',company_,auth.uid(),role_,old_,result_,jsonb_build_object('effectiveMonth',from_));
 RETURN result_;
END $$;
REVOKE ALL ON FUNCTION private.manager_set_time_account_target_method_impl(uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.manager_set_time_account_target_method_impl(uuid,text,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.manager_set_time_account_target_method(p_company_id uuid,p_target_method text,p_effective_month date)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.manager_set_time_account_target_method_impl(p_company_id,p_target_method,p_effective_month)
$$;
REVOKE ALL ON FUNCTION public.manager_set_time_account_target_method(uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_set_time_account_target_method(uuid,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION private.sf_time_account_rows(p_company_id uuid, p_month date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, employee_name text, personnel_no text, employment text, weekly_hours numeric, target_minutes integer, confirmed_work_minutes integer, absence_credit_minutes integer, credited_total_minutes integer, month_balance_minutes integer, account_balance_minutes integer, account_started boolean, effective_account_start date, pending_entries bigint, opening_balance_minutes integer, opening_effective_date date, opening_note text, holiday_minutes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select date_trunc('month',coalesce(p_month,current_date))::date m0,
      (date_trunc('month',coalesce(p_month,current_date))+interval '1 month'-interval '1 day')::date m1
  ), cfg as (
    select coalesce(s.account_start_date,b.m0) account_start_date,
      coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) credited_types,
      coalesce(s.federal_state,'DE') federal_state,s.target_method,s.target_method_from,b.m0,b.m1
    from bounds b left join public.time_account_settings s on s.company_id=p_company_id
  ), base as (
    select e.*,c.*,coalesce(o.effective_date,c.account_start_date) effective_start,
      coalesce(o.opening_balance_minutes,0) opening_minutes,o.effective_date opening_date,coalesce(o.note,'') opening_note,
      round(greatest(coalesce(e.weekly_hours,0),0)*60/5.0)::integer daily_minutes
    from public.employees e cross join cfg c
    left join public.time_account_openings o on o.employee_id=e.id and o.company_id=e.company_id
    where e.company_id=p_company_id and e.status='active' and (p_employee_id is null or e.id=p_employee_id)
  )
  select b.id,trim(concat_ws(' ',b.first_name,b.last_name)),coalesce(b.personnel_no,''),
    coalesce(b.employment,''),coalesce(b.weekly_hours,0),
    case when greatest(b.m0,coalesce(b.start_date,b.m0))<=least(b.m1,coalesce(b.contract_end,b.m1))
      then private.sf_employee_target_minutes(b.company_id,b.weekly_hours,b.qualifications,greatest(b.m0,coalesce(b.start_date,b.m0)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end,
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1),
    private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state),
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1)+private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state),
    private.sf_confirmed_work_minutes(b.id,b.m0,b.m1)+private.sf_absence_credit_minutes(b.id,b.m0,b.m1,b.credited_types,b.daily_minutes,b.federal_state)-
      case when greatest(b.m0,coalesce(b.start_date,b.m0))<=least(b.m1,coalesce(b.contract_end,b.m1))
        then private.sf_employee_target_minutes(b.company_id,b.weekly_hours,b.qualifications,greatest(b.m0,coalesce(b.start_date,b.m0)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end,
    case when b.effective_start>b.m1 then b.opening_minutes else b.opening_minutes+
      private.sf_confirmed_work_minutes(b.id,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),b.m1)+
      private.sf_absence_credit_minutes(b.id,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),b.m1,b.credited_types,b.daily_minutes,b.federal_state)-
      case when greatest(b.effective_start,coalesce(b.start_date,b.effective_start))<=least(b.m1,coalesce(b.contract_end,b.m1))
        then private.sf_employee_target_minutes(b.company_id,b.weekly_hours,b.qualifications,greatest(b.effective_start,coalesce(b.start_date,b.effective_start)),least(b.m1,coalesce(b.contract_end,b.m1)),b.federal_state) else 0 end end,
    b.effective_start<=b.m1,b.effective_start,
    (select count(*) from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id
      where sa.employee_id=b.id and te.company_id=p_company_id and te.status in ('recorded','correction_requested')
        and te.actual_start::date between b.m0 and b.m1),
    b.opening_minutes,b.opening_date,b.opening_note,
    CASE WHEN b.target_method='PERSONAL_MONTHLY' AND b.m0>=b.target_method_from THEN 0 ELSE coalesce((select count(*)::integer*b.daily_minutes from private.sf_public_holidays(extract(year from b.m0)::integer,b.federal_state) h
      where h.holiday_date between b.m0 and b.m1 and extract(isodow from h.holiday_date) between 1 and 5),0) END
  from base b
  order by b.last_name,b.first_name;
$function$
;
CREATE OR REPLACE FUNCTION private.time_account_row_v1(p_employee_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
with emp as (
  select e.* from public.employees e where e.id=p_employee_id
), cfg as (
  select e.*,
    coalesce(s.account_start_date,date_trunc('month',current_date+interval '1 month')::date) as company_account_start,
    coalesce(s.credited_absence_types,array['Urlaub','Krank','Fortbildung','Sonderurlaub']::text[]) as credited_types,
    coalesce(s.federal_state,'DE') as federal_state,s.target_method,s.target_method_from,
    o.effective_date as opening_effective_date,
    coalesce(o.opening_balance_minutes,0) as opening_balance_minutes,
    coalesce(o.note,'') as opening_note
  from emp e
  left join public.time_account_settings s on s.company_id=e.company_id
  left join public.employee_time_account_openings o on o.employee_id=e.id and o.company_id=e.company_id
), b as (
  select c.*,
    date_trunc('month',coalesce(p_month,current_date))::date as month_start,
    (date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date as month_end,
    round(c.weekly_hours*60/5.0)::int as daily_target_minutes,
    coalesce(c.opening_effective_date,c.company_account_start) as account_start
  from cfg c
), month_days as (
  select b.id,d::date as work_date,b.daily_target_minutes,
    private.german_holiday_name(d::date,b.federal_state) as holiday_name
  from b cross join lateral generate_series(b.month_start,b.month_end,interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=coalesce(b.start_date,b.month_start) and d::date<=coalesce(b.contract_end,b.month_end)
), month_target as (
  select b.id,private.sf_employee_target_minutes(b.company_id,b.weekly_hours,b.qualifications,greatest(b.month_start,coalesce(b.start_date,b.month_start)),least(b.month_end,coalesce(b.contract_end,b.month_end)),b.federal_state) as minutes from b
), month_holidays as (
  select b.id,
    count(md.work_date) filter(where md.holiday_name is not null)::int as holiday_count,
    coalesce(sum(md.daily_target_minutes) filter(where md.holiday_name is not null),0)::int as holiday_minutes,
    coalesce(jsonb_agg(jsonb_build_object('date',md.work_date,'name',md.holiday_name) order by md.work_date) filter(where md.holiday_name is not null),'[]'::jsonb) as holidays
  from b left join month_days md on md.id=b.id group by b.id
), month_work as (
  select b.id,private.sf_confirmed_work_minutes(b.id,b.month_start,b.month_end) minutes,
    ((select count(*) from public.time_entries te join public.shift_assignments sa on sa.id=te.assignment_id and sa.company_id=te.company_id where sa.employee_id=b.id and te.status='confirmed' and te.actual_start::date between b.month_start and b.month_end)+
     (select count(*) from public.time_qr_independent_shifts q where q.company_id=b.company_id and q.employee_id=b.id and q.ended_at is not null and q.ended_at<=statement_timestamp() and (q.started_at at time zone 'Europe/Berlin')::date between b.month_start and b.month_end))::integer confirmed_entries
  from b
), month_pending as (
  select b.id,count(te.assignment_id)::int as pending_entries
  from b
  left join public.shift_assignments sa on sa.employee_id=b.id and (timezone('Europe/Berlin',sa.starts_at))::date between b.month_start and b.month_end
  left join public.time_entries te on te.assignment_id=sa.id and te.status in ('recorded','correction_requested')
  group by b.id
), month_absence_raw as (
  select b.id,d::date as absence_date,b.daily_target_minutes,
    case when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
      then least(b.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int)) else 0 end as credit_minutes
  from b join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(b.credited_types)
    and a.end_date>=b.month_start and a.start_date<=b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.month_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=coalesce(b.start_date,b.month_start) and d::date<=coalesce(b.contract_end,b.month_end)
    and private.german_holiday_name(d::date,b.federal_state) is null
), month_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes,coalesce(count(x.absence_date),0)::int as credited_days
  from b left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from month_absence_raw group by id,absence_date
  ) x on x.id=b.id group by b.id
), account_days as (
  select b.id,d::date as work_date,b.daily_target_minutes,
    private.german_holiday_name(d::date,b.federal_state) as holiday_name
  from b left join lateral generate_series(b.account_start,b.month_end,interval '1 day') d on b.month_end>=b.account_start
  where extract(isodow from d)::int between 1 and 5
    and d::date>=greatest(b.account_start,coalesce(b.start_date,b.account_start))
    and d::date<=coalesce(b.contract_end,b.month_end)
), account_target as (
  select b.id,private.sf_employee_target_minutes(b.company_id,b.weekly_hours,b.qualifications,greatest(b.account_start,coalesce(b.start_date,b.account_start)),least(b.month_end,coalesce(b.contract_end,b.month_end)),b.federal_state) as minutes from b
), account_work as (
  select b.id,case when b.month_end<b.account_start then 0 else private.sf_confirmed_work_minutes(b.id,b.account_start,b.month_end) end minutes from b
), account_absence_raw as (
  select b.id,d::date as absence_date,b.daily_target_minutes,
    case when a.full_day then b.daily_target_minutes
      when a.start_time is not null and a.end_time is not null and a.end_time>a.start_time
      then least(b.daily_target_minutes,greatest(0,round(extract(epoch from (a.end_time-a.start_time))/60.0)::int)) else 0 end as credit_minutes
  from b join public.absences a on a.employee_id=b.id and a.company_id=b.company_id
    and a.status in ('Genehmigt','Erfasst') and a.absence_type=any(b.credited_types)
    and b.month_end>=b.account_start and a.end_date>=b.account_start and a.start_date<=b.month_end
  cross join lateral generate_series(greatest(a.start_date,b.account_start),least(a.end_date,b.month_end),interval '1 day') d
  where extract(isodow from d)::int between 1 and 5
    and d::date>=greatest(b.account_start,coalesce(b.start_date,b.account_start)) and d::date<=coalesce(b.contract_end,b.month_end)
    and private.german_holiday_name(d::date,b.federal_state) is null
), account_absence as (
  select b.id,coalesce(sum(x.credit_minutes),0)::int as minutes
  from b left join (
    select id,absence_date,least(max(daily_target_minutes),sum(credit_minutes))::int as credit_minutes
    from account_absence_raw group by id,absence_date
  ) x on x.id=b.id group by b.id
)
select jsonb_build_object(
  'employee_id',b.id,'employee_name',trim(b.first_name||' '||b.last_name),'personnel_no',b.personnel_no,
  'employment',b.employment,'weekly_hours',b.weekly_hours,'month_start',b.month_start,'month_end',b.month_end,
  'daily_target_minutes',b.daily_target_minutes,'target_minutes',mt.minutes,'confirmed_work_minutes',mw.minutes,
  'absence_credit_minutes',ma.minutes,'credited_total_minutes',(mw.minutes+ma.minutes),'month_balance_minutes',(mw.minutes+ma.minutes-mt.minutes),
  'confirmed_entries',mw.confirmed_entries,'pending_entries',mp.pending_entries,'credited_absence_days',ma.credited_days,
  'federal_state',b.federal_state,'holiday_count',mh.holiday_count,'holiday_minutes',CASE WHEN b.target_method='PERSONAL_MONTHLY' AND b.month_start>=b.target_method_from THEN 0 ELSE mh.holiday_minutes END,'target_method',CASE WHEN b.target_method='PERSONAL_MONTHLY' AND b.month_start>=b.target_method_from THEN 'PERSONAL_MONTHLY' ELSE 'WEEKDAYS_5' END,'target_method_from',b.target_method_from,'holidays',mh.holidays,
  'company_account_start',b.company_account_start,'opening_effective_date',b.opening_effective_date,
  'effective_account_start',b.account_start,'opening_balance_minutes',b.opening_balance_minutes,'opening_note',b.opening_note,
  'account_started',(b.month_end>=b.account_start),'account_balance_minutes',(b.opening_balance_minutes+aw.minutes+aa.minutes-at.minutes)
)
from b join month_target mt on mt.id=b.id join month_holidays mh on mh.id=b.id join month_work mw on mw.id=b.id join month_pending mp on mp.id=b.id
join month_absence ma on ma.id=b.id join account_target at on at.id=b.id join account_work aw on aw.id=b.id join account_absence aa on aa.id=b.id;
$function$
;
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
  -- A new night block needs one free start day before it and three after it, including month boundaries.
  IF EXISTS(WITH duties AS (SELECT DISTINCT (starts_at AT TIME ZONE tz_)::date d,
      (starts_at AT TIME ZONE tz_)::time>='20:00'::time night
    FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
      AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_ AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_),
   starts AS (SELECT a.d FROM duties a WHERE a.night AND NOT EXISTS(SELECT 1 FROM duties b WHERE b.night AND b.d=a.d-1)),
   ends AS (SELECT a.d FROM duties a WHERE a.night AND NOT EXISTS(SELECT 1 FROM duties b WHERE b.night AND b.d=a.d+1))
   SELECT 1 FROM starts n JOIN duties a ON a.d=n.d-1 WHERE n.d BETWEEN month_ AND last_
   UNION ALL
   SELECT 1 FROM ends n JOIN duties a ON a.d BETWEEN n.d+1 AND n.d+3 WHERE n.d>=month_-3 AND n.d<last_)
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
END $function$
;
CREATE OR REPLACE FUNCTION public.manager_monthly_holidays(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_state text; v_holidays jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Nicht berechtigt'; end if;
  select coalesce(s.federal_state,'DE') into v_state from public.time_account_settings s where s.company_id=p_company_id;
  v_state:=coalesce(v_state,'DE');
  select coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name,
    'target_relevant',extract(isodow from h.holiday_date) between 1 and 5) order by h.holiday_date),'[]'::jsonb)
  into v_holidays from private.sf_public_holidays(extract(year from v_month)::integer,v_state) h
  where h.holiday_date>=v_month and h.holiday_date<(v_month+interval '1 month')::date;
  return jsonb_build_object('month_start',v_month,'federal_state',v_state,'holidays',v_holidays);
end;
$function$
;
NOTIFY pgrst,'reload schema';
