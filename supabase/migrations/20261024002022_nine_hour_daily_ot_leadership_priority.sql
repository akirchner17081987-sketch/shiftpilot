CREATE OR REPLACE FUNCTION private.sf_ot_weekend_minimum(company_ uuid, day_ date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT greatest(coalesce((SELECT CASE WHEN coalesce((solid_planning_rules->>'enabled')::boolean,false) THEN coalesce((solid_planning_rules->>'otDailyMinimumStaffing')::int,0) ELSE 0 END FROM public.company_compliance_policy WHERE company_id=company_),0),CASE WHEN extract(isodow FROM day_) IN (6,7) THEN coalesce((
  SELECT max((r->>'minimum')::int)
  FROM public.company_compliance_policy p
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.solid_planning_rules->'criticalShifts','[]')) r
  WHERE p.company_id=company_ AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
   AND r->>'code'='OT' AND coalesce(r->'weekdays','[1,2,3,4,5,6,7]') @> '[6,7]'::jsonb
 ),0) ELSE 0 END);
$function$;

CREATE OR REPLACE FUNCTION private.sf_assert_solid_critical_coverage(company_ uuid, month_ date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;tz_ text;d_ date;r_ jsonb;group_ text;need_ int;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN; END IF;
 FOR d_ IN SELECT generate_series(month_,month_+interval '1 month'-interval '1 day',interval '1 day')::date LOOP
  IF jsonb_typeof(rules_->'otWeekdayRoster'->'employeeIds')='array' AND jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')>0
   AND NOT private.sf_ot_day_holiday(company_,d_)
   AND coalesce(rules_->'otWeekdayRoster'->'weekdays','[1,2,3,4,5]'::jsonb) @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN
   need_:=CASE WHEN coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) THEN greatest(1,least(jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds'),coalesce((rules_->'otWeekdayRoster'->>'minimumDailyStaff')::int,jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')))) ELSE jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds') END;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED'
    AND shift_code IN('OT1','OT2','OT3') AND (starts_at AT TIME ZONE tz_)::date=d_
    AND rules_->'otWeekdayRoster'->'employeeIds' @> jsonb_build_array(employee_id::text);
   IF count_<need_ THEN RAISE EXCEPTION 'Feste OT-Tagdienstgruppe am % unvollständig: % von % Mitarbeitern. Abwesenheiten und persönliche Sperren im Vorschlag prüfen.',d_,count_,need_; END IF;
   FOR group_ IN SELECT unnest(ARRAY['OT1','OT2','OT3']) LOOP
    SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=group_ AND (starts_at AT TIME ZONE tz_)::date=d_;
    need_:=private.sf_solid_conditional_required(company_,d_,group_);
    IF (count_<>need_ AND NOT (group_='OT2' AND coalesce((rules_->'otWeekdayRoster'->>'allowDaysOff')::boolean,false) AND count_<need_ AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT1'),0)=0 AND coalesce(private.sf_solid_conditional_required(company_,d_,'OT3'),0)=0)) THEN RAISE EXCEPTION 'OT-Verteilung am % entspricht nicht der Nachtabdeckung: % ist % statt %.',d_,group_,count_,need_; END IF;
   END LOOP;
  END IF;
  FOR group_ IN SELECT jsonb_array_elements_text(coalesce(rules_->'criticalCoverageGroups','[]')) LOOP
   SELECT max(coverage_required) INTO need_ FROM public.shift_templates WHERE company_id=company_ AND active AND coverage_group=group_;
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code=a.shift_code AND t.active
    WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND (a.starts_at AT TIME ZONE tz_)::date=d_ AND t.coverage_group=group_
     AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_ AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF coalesce(count_,0)<coalesce(need_,1) THEN RAISE EXCEPTION 'Pflichtleitung % fehlt am %. Der bestehende Plan bleibt erhalten.',group_,d_; END IF;
  END LOOP;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) LOOP
   need_:=private.sf_solid_conditional_required(company_,d_,r_->>'shift');
   SELECT count(*) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'shift' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_>need_ THEN RAISE EXCEPTION 'Der bedingte OT-Bedarf wird überschritten (% am %).',r_->>'shift',d_; END IF;
  END LOOP;
  need_:=private.sf_ot_weekend_minimum(company_,d_);
  IF need_>0 THEN
   SELECT count(DISTINCT a.employee_id) INTO count_ FROM public.shift_assignments a
   JOIN public.shift_templates t ON t.company_id=a.company_id AND t.code='OT' AND t.active
   WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.shift_code='OT' AND (a.starts_at AT TIME ZONE tz_)::date=d_
    AND a.starts_at<=(d_+t.default_start) AT TIME ZONE tz_
    AND a.ends_at>=(d_+t.default_end+CASE WHEN t.default_end<=t.default_start THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE tz_;
   IF count_<need_ THEN RAISE EXCEPTION 'OT-Pflichtbesetzung am % unvollständig: % von mindestens % Mitarbeitern. Der bestehende Plan bleibt erhalten.',d_,count_,need_; END IF;
  END IF;
  FOR r_ IN SELECT jsonb_array_elements(coalesce(rules_->'criticalShifts','[]')) LOOP
   IF r_->>'code' IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,d_) THEN CONTINUE; END IF;
   IF NOT (r_->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d_)::int]) THEN CONTINUE; END IF;
   SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'code' AND (starts_at AT TIME ZONE tz_)::date=d_;
   IF count_<(r_->>'minimum')::int THEN RAISE EXCEPTION 'Mindestens % × % fehlen am %. Der bestehende Plan bleibt erhalten.',r_->>'minimum',r_->>'code',d_; END IF;
  END LOOP;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_solid_conditional_required(company_ uuid, day_ date, code_ text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE rules_ jsonb;r_ jsonb;tz_ text;count_ int;
BEGIN
 SELECT p.solid_planning_rules,c.timezone INTO rules_,tz_ FROM public.company_compliance_policy p JOIN public.companies c ON c.id=p.company_id WHERE p.company_id=company_;
 IF code_='OT' AND coalesce((rules_->>'enabled')::boolean,false) AND coalesce((rules_->>'otDailyMinimumStaffing')::int,0)>0 THEN
  SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code='OT'),(SELECT required_count FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT'),0) INTO count_;
  RETURN greatest(count_,(rules_->>'otDailyMinimumStaffing')::int);
 END IF;
 IF code_='OT' AND private.sf_ot_weekend_minimum(company_,day_)>0 THEN
  SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=company_ AND work_date=day_ AND shift_code='OT'),
   (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=company_ AND shift_code='OT'),0) INTO count_;
  RETURN greatest(count_,private.sf_ot_weekend_minimum(company_,day_));
 END IF;
 IF code_ IN('OT1','OT2','OT3') AND private.sf_ot_day_holiday(company_,day_) THEN RETURN 0; END IF;
 IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RETURN NULL; END IF;
 IF code_='OT2' AND jsonb_typeof(rules_->'otWeekdayRoster'->'employeeIds')='array' AND jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')>0 THEN
  IF NOT coalesce(rules_->'otWeekdayRoster'->'weekdays','[1,2,3,4,5]'::jsonb) @> to_jsonb(ARRAY[extract(isodow FROM day_)::int]) THEN RETURN 0; END IF;
  RETURN greatest(0,jsonb_array_length(rules_->'otWeekdayRoster'->'employeeIds')
    -coalesce(private.sf_solid_conditional_required(company_,day_,'OT1'),0)
    -coalesce(private.sf_solid_conditional_required(company_,day_,'OT3'),0));
 END IF;
 SELECT v INTO r_ FROM jsonb_array_elements(coalesce(rules_->'conditionalStaffing','[]')) v WHERE v->>'shift'=code_ LIMIT 1;
 IF r_ IS NULL THEN RETURN NULL; END IF;
 IF extract(isodow FROM day_)>5 THEN RETURN 0; END IF;
 SELECT count(DISTINCT employee_id) INTO count_ FROM public.shift_assignments WHERE company_id=company_ AND status<>'CANCELLED' AND shift_code=r_->>'sourceShift'
  AND (starts_at AT TIME ZONE tz_)::date=day_+(r_->>'sourceDayOffset')::int
  AND starts_at <= (day_+(r_->>'coverageStart')::time) AT TIME ZONE tz_ AND ends_at >= (day_+(r_->>'coverageEnd')::time) AT TIME ZONE tz_;
 RETURN CASE WHEN count_ >= (r_->>'minimum')::int THEN 0 ELSE (r_->>'fallbackCount')::int END;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_autonomy_snapshot(company_ uuid, first_ date, count_ integer, run_ uuid, history_ integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '60s'
AS $function$
declare snap_ jsonb;tz_ text;finish_ date;from_ date;policy_ jsonb;people_ jsonb;original_ jsonb;base_ jsonb;moving_ jsonb;replace_ uuid[];types_ jsonb;demand_ jsonb;candidates_ jsonb;rhythms_ jsonb;days_ jsonb;wishes_ jsonb;learned_ jsonb;
begin
 perform private.sf_background_plan_authorize(company_);
 snap_:=private.sf_preview_planning_period(company_,first_,count_);
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=company_;
 select jsonb_build_object('standard_max_shift_hours',standard_max_shift_hours,'standard_min_rest_hours',standard_min_rest_hours,'monthly_planning_max_hours',monthly_planning_max_hours,'monthly_planning_max_shifts',monthly_planning_max_shifts,'solid_planning_rules',solid_planning_rules) into policy_ from public.company_compliance_policy where company_id=company_;
 if policy_ is null then raise exception 'Die Unternehmensregeln sind nicht vollständig geladen.';end if;
 finish_:=(first_+make_interval(months=>count_))::date;from_:=(first_-make_interval(months=>greatest(0,least(6,history_))))::date;
 select coalesce(array_agg(a.id),array[]::uuid[]),coalesce(jsonb_agg(jsonb_build_object('id',coalesce(a.legacy_id,a.id::text),'_dbId',a.id)),'[]') into replace_,moving_ from public.shift_assignments a where a.company_id=company_ and a.status='DRAFT' and a.starts_at>=first_::timestamp at time zone tz_ and a.starts_at<finish_::timestamp at time zone tz_ and not (snap_->'protectedIds' @> to_jsonb(array[a.id]));
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(e.legacy_id,e.id::text),'_dbId',e.id,'personnelNo',e.personnel_no,'role',e.role,'employment',e.employment,'weeklyHours',e.weekly_hours,'shifts',e.shift_permissions,'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q ~ '^__sp:(monthlyHours|maxWeekly|maxConsecutive|planningTeam|rhythmMode|rhythmPattern|rhythmStart|rhythmOffset)='),'[]'),'startDate',e.start_date,'contractEnd',e.contract_end) order by e.id),'[]') into people_ from public.employees e where e.company_id=company_ and e.status='active' and e.deleted_at is null;
 if jsonb_array_length(people_)>300 then raise exception 'Die automatische Vorbereitung ist auf 300 aktive Mitarbeiter begrenzt.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.code,'start',to_char(t.default_start,'HH24:MI'),'end',to_char(t.default_end,'HH24:MI'),'active',t.active,'coverageGroup',t.coverage_group,'coverageRequired',t.coverage_required,'optionalWeekdays',t.optional_weekdays) order by t.sort_order,t.code),'[]') into types_ from public.shift_templates t where t.company_id=company_ and t.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(a.legacy_id,a.id::text),'_dbId',a.id,'employeeId',coalesce(e.legacy_id,e.id::text),'date',(a.starts_at at time zone tz_)::date,'type',a.shift_code,'start',to_char(a.starts_at at time zone tz_,'HH24:MI'),'end',to_char(a.ends_at at time zone tz_,'HH24:MI'),'_dbStatus',a.status,'status',a.status,'publishedAt',a.published_at,'resource',((a.starts_at at time zone tz_)::date)::text||'|'||case when a.shift_code in('OT1','OT2','OT3') and jsonb_typeof(policy_->'solid_planning_rules'->'otWeekdayRoster'->'employeeIds')='array' then 'OT-DAY' else coalesce(t.coverage_group,a.shift_code) end,'_moving',a.id=any(replace_)) order by a.id),'[]') into original_ from public.shift_assignments a join public.employees e on e.id=a.employee_id and e.company_id=company_ left join public.shift_templates t on t.company_id=company_ and t.code=a.shift_code where a.company_id=company_ and a.status<>'CANCELLED' and a.starts_at>=least(from_,first_-8)::timestamp at time zone tz_ and a.starts_at<(finish_+8)::timestamp at time zone tz_;
 select coalesce(jsonb_agg(v-'_moving'),'[]') into base_ from jsonb_array_elements(original_) v where not (v->>'_moving')::boolean;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day::date,'type',t.code,'count',case
  when t.code in('OT1','OT2','OT3') and private.sf_ot_day_holiday(company_,d.day::date) then 0
  when t.code='OT' and (policy_->'solid_planning_rules') ? 'otHolidayStatesBySite' and not private.sf_ot_day(company_,d.day::date,null) then 0
  when t.code='OT' and coalesce((policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int,0)>0 then greatest(coalesce(ov.required_count,g.required_count,0),(policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int)
  when coalesce((policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int,0)>0 and exists(select 1 from jsonb_array_elements(coalesce(policy_->'solid_planning_rules'->'criticalShifts','[]')) r where r->>'code'=t.code and r->'weekdays' @> to_jsonb(array[extract(isodow from d.day)::int])) then greatest(coalesce(ov.required_count,g.required_count,0),(select max((r->>'minimum')::int) from jsonb_array_elements(policy_->'solid_planning_rules'->'criticalShifts') r where r->>'code'=t.code and r->'weekdays' @> to_jsonb(array[extract(isodow from d.day)::int])))
  when ov.required_count is not null then ov.required_count
  when not extract(isodow from d.day)::int=any(t.optional_weekdays) then 0
  when t.coverage_group is not null then coalesce(gov.required_count,t.coverage_required,0)
  when t.planning_mode='optional' then 0 else greatest(coalesce(g.required_count,0),coalesce(private.sf_ot_weekend_minimum(company_,d.day::date),0)*case when t.code='OT' then 1 else 0 end,
   coalesce((select max((v->>'fallbackCount')::int) from jsonb_array_elements(coalesce(policy_->'solid_planning_rules'->'conditionalStaffing','[]')) v where v->>'shift'=t.code and extract(isodow from d.day)<=5),0)) end) order by d.day,t.sort_order,t.code),'[]') into demand_ from generate_series(first_,finish_-1,interval '1 day') d(day) cross join public.shift_templates t left join public.global_staffing_requirements g on g.company_id=company_ and g.shift_code=t.code left join public.daily_staffing_overrides ov on ov.company_id=company_ and ov.shift_code=t.code and ov.work_date=d.day::date left join lateral(select max(x.required_count) required_count from public.daily_staffing_overrides x join public.shift_templates st on st.company_id=company_ and st.code=x.shift_code where x.company_id=company_ and x.work_date=d.day::date and st.coverage_group=t.coverage_group) gov on true where t.company_id=company_ and t.active;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date)||private.sf_month_rhythm(e,d.day::date)),'[]') into rhythms_ from public.employees e cross join generate_series(first_,finish_-1,interval '1 day') d(day) where e.company_id=company_ and e.status='active' and e.deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date,'type',t.code) order by d.day,t.sort_order,e.id),'[]') into candidates_ from public.employees e cross join generate_series(first_,finish_-1,interval '1 day') d(day) cross join public.shift_templates t cross join lateral(select (d.day::date+t.default_start) at time zone tz_ starts_at,((d.day::date+case when t.default_end<=t.default_start then 1 else 0 end)+t.default_end) at time zone tz_ ends_at,private.sf_month_rhythm(e,d.day::date) rhythm) x where e.company_id=company_ and e.status='active' and e.deleted_at is null and t.company_id=company_ and t.active and t.code=any(e.shift_permissions) and (e.start_date is null or e.start_date<=d.day::date) and (e.contract_end is null or e.contract_end>=d.day::date) and (not t.responsible_only or t.responsible_employee_id=e.id) and (t.code !~* '^(TL-LE|TL-RE|TEAMLEITER)$' or e.role in('Teamleiter','Schichtleiter')) and extract(epoch from x.ends_at-x.starts_at)/3600<=coalesce((policy_->>'standard_max_shift_hours')::numeric,10)+.000001 and (extract(isodow from d.day)::int=any(t.optional_weekdays) or exists(select 1 from public.daily_staffing_overrides ov where ov.company_id=company_ and ov.work_date=d.day::date and ov.shift_code=t.code) or t.code='OT' and private.sf_ot_day(company_,d.day::date,e.id)) and private.sf_shift_scope_error(company_,e.id,t.code,x.starts_at,x.ends_at) is null and not private.sf_approved_absence_overlaps(company_,e.id,x.starts_at,x.ends_at,tz_) and (x.rhythm->>'mode'<>'required' or x.rhythm->>'expected'='ALLE' or coalesce((x.rhythm->>'exemptOt')::boolean,false) and t.code in('OT1','OT2','OT3') or t.code=any(regexp_split_to_array(x.rhythm->>'expected','[+|/]'))) and not exists(select 1 from public.planning_wishes w where w.company_id=company_ and w.employee_id=e.id and w.kind='OFF' and w.status in('PROMISED','RELEASE_REQUESTED') and w.starts_at<x.ends_at and w.ends_at>x.starts_at);
 select coalesce(jsonb_agg(distinct jsonb_build_object('employeeId',coalesce(e.legacy_id,e.id::text),'date',d.day::date)),'[]') into days_ from public.absences a join public.employees e on e.id=a.employee_id and e.company_id=company_ cross join lateral generate_series(greatest(first_,a.start_date),least(finish_-1,a.end_date),interval '1 day') d(day) where a.company_id=company_ and a.status in('Genehmigt','Erfasst') and a.full_day;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'employee_id',coalesce(e.legacy_id,e.id::text),'kind',w.kind,'status',w.status,'start_date',w.start_date,'end_date',w.end_date,'starts_at',w.starts_at,'ends_at',w.ends_at,'shift_code',w.shift_code,'priority',w.priority)),'[]') into wishes_ from public.planning_wishes w join public.employees e on e.id=w.employee_id and e.company_id=company_ where w.company_id=company_ and w.start_date<=finish_+1 and w.end_date>=first_-1;
 select coalesce(jsonb_agg(config),'[]') into learned_ from (select config from public.planning_assistant_preferences where company_id=company_ and enabled order by created_at limit 100) p;
 return jsonb_build_object('version',1,'company',company_,'runId',run_,'timezone',tz_,'fingerprint',snap_->>'fingerprint','historyMonths',history_,'months',(select jsonb_agg(to_char(m,'YYYY-MM')) from generate_series(first_,finish_-interval '1 month',interval '1 month') m),'policy',policy_,'employees',people_,'types',types_,'base',base_,'original',original_,'movable',moving_,'demand',demand_,'candidates',candidates_,'rhythms',rhythms_,'unavailableDays',days_,'wishes',wishes_,'learned',learned_);
end $function$;

-- Daily staffing and monthly priority apply only to the 9-hour tenant.
DO $config$
DECLARE company_ uuid; employee_ uuid; rules_ jsonb;
BEGIN
 SELECT id INTO STRICT company_ FROM public.companies WHERE name='Secontec Services - 9h';
 SELECT id INTO STRICT employee_ FROM public.employees WHERE company_id=company_ AND personnel_no='115' AND status='active' AND deleted_at IS NULL;
 IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code='OT' AND active)
  OR NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code='TL' AND active)
  OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=employee_ AND shift_permissions @> ARRAY['O3']::text[]) THEN
  RAISE EXCEPTION 'Aktive OT-/TL-Modelle und die O3-Freigabe für Mitarbeiter 115 fehlen.';
 END IF;
 SELECT solid_planning_rules INTO STRICT rules_ FROM public.company_compliance_policy WHERE company_id=company_;
 rules_:=rules_||jsonb_build_object('otDailyMinimumStaffing',3,
  'criticalShifts',coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(coalesce(rules_->'criticalShifts','[]')) r WHERE r->>'code' NOT IN('OT','TL')),'[]'::jsonb)||
   '[{"code":"OT","minimum":3,"weekdays":[1,2,3,4,5,6,7]},{"code":"TL","minimum":1,"weekdays":[1,2,3,4,5,6,7]}]'::jsonb,
  'priorityMonthlyEmployees',coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(coalesce(rules_->'priorityMonthlyEmployees','[]')) r WHERE r->>'employeeId'<>employee_::text),'[]'::jsonb)||
   jsonb_build_array(jsonb_build_object('employeeId',employee_,'personnelNo','115','code','O3','preferredWeekdays',jsonb_build_array(1,2,3,4),'target','monthlySoll')));
 UPDATE public.company_compliance_policy SET solid_planning_rules=rules_,updated_at=now() WHERE company_id=company_;
 UPDATE public.shift_templates SET optional_weekdays=ARRAY[1,2,3,4,5,6,7],planning_mode='required',updated_at=now() WHERE company_id=company_ AND active AND code IN('OT','TL');
 INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
 VALUES(company_,'OT',3),(company_,'TL',1)
 ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count,updated_at=now();
END $config$;

NOTIFY pgrst,'reload schema';
