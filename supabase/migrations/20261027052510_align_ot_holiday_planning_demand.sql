-- Match the calendar OT holiday policy without changing staffing settings or assignments.
-- Both existing private functions retain their authorization, search_path and ACLs.
CREATE OR REPLACE FUNCTION private.sf_autonomy_snapshot_before_continuity(company_ uuid, first_ date, count_ integer, run_ uuid, history_ integer)
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
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(e.legacy_id,e.id::text),'_dbId',e.id,'personnelNo',e.personnel_no,'role',e.role,'employment',e.employment,'weeklyHours',e.weekly_hours,'shifts',e.shift_permissions,'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q ~ '^__sp:(team|monthlyHours|maxWeekly|maxConsecutive|planningTeam|rhythmMode|rhythmPattern|rhythmStart|rhythmOffset)='),'[]'),'startDate',e.start_date,'contractEnd',e.contract_end) order by e.id),'[]') into people_ from public.employees e where e.company_id=company_ and e.status='active' and e.deleted_at is null;
 if jsonb_array_length(people_)>300 then raise exception 'Die automatische Vorbereitung ist auf 300 aktive Mitarbeiter begrenzt.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.code,'start',to_char(t.default_start,'HH24:MI'),'end',to_char(t.default_end,'HH24:MI'),'active',t.active,'coverageGroup',t.coverage_group,'coverageRequired',t.coverage_required,'optionalWeekdays',t.optional_weekdays) order by t.sort_order,t.code),'[]') into types_ from public.shift_templates t where t.company_id=company_ and t.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(a.legacy_id,a.id::text),'_dbId',a.id,'employeeId',coalesce(e.legacy_id,e.id::text),'date',(a.starts_at at time zone tz_)::date,'type',a.shift_code,'start',to_char(a.starts_at at time zone tz_,'HH24:MI'),'end',to_char(a.ends_at at time zone tz_,'HH24:MI'),'_dbStatus',a.status,'status',a.status,'publishedAt',a.published_at,'resource',((a.starts_at at time zone tz_)::date)::text||'|'||case when a.shift_code in('OT1','OT2','OT3') and jsonb_typeof(policy_->'solid_planning_rules'->'otWeekdayRoster'->'employeeIds')='array' then 'OT-DAY' else coalesce(t.coverage_group,a.shift_code) end,'_moving',a.id=any(replace_)) order by a.id),'[]') into original_ from public.shift_assignments a join public.employees e on e.id=a.employee_id and e.company_id=company_ left join public.shift_templates t on t.company_id=company_ and t.code=a.shift_code where a.company_id=company_ and a.status<>'CANCELLED' and a.starts_at>=least(from_,first_-8)::timestamp at time zone tz_ and a.starts_at<(finish_+8)::timestamp at time zone tz_;
 select coalesce(jsonb_agg(v-'_moving'),'[]') into base_ from jsonb_array_elements(original_) v where not (v->>'_moving')::boolean;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day::date,'type',t.code,'count',case
  when policy_->'solid_planning_rules'->'exactStaffing'->>t.code is not null then (policy_->'solid_planning_rules'->'exactStaffing'->>t.code)::int
  when t.code in('OT1','OT2','OT3') and private.sf_ot_day_holiday(company_,d.day::date) then 0
  when t.code='OT' and (policy_->'solid_planning_rules') ? 'otHolidayStatesBySite' and not private.sf_ot_day(company_,d.day::date,null) then 0
  when t.code='OT' and coalesce((policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int,0)>0 then greatest(coalesce(ov.required_count,g.required_count,0),(policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int)
  when coalesce((policy_->'solid_planning_rules'->>'otDailyMinimumStaffing')::int,0)>0 and exists(select 1 from jsonb_array_elements(coalesce(policy_->'solid_planning_rules'->'criticalShifts','[]')) r where r->>'code'=t.code and r->'weekdays' @> to_jsonb(array[extract(isodow from d.day)::int])) then greatest(coalesce(ov.required_count,g.required_count,0),(select max((r->>'minimum')::int) from jsonb_array_elements(policy_->'solid_planning_rules'->'criticalShifts') r where r->>'code'=t.code and r->'weekdays' @> to_jsonb(array[extract(isodow from d.day)::int])))
  -- Configured normal OT also covers weekday holidays; the model's regular
  -- weekend-only weekday list must not remove this required holiday demand.
  when t.code='OT' and (policy_->'solid_planning_rules') ? 'otHolidayStatesBySite' and private.sf_ot_day(company_,d.day::date,null) then
   greatest(coalesce(ov.required_count,case when t.planning_mode='optional' then 0 else g.required_count end,0),coalesce(private.sf_ot_weekend_minimum(company_,d.day::date),0))
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

-- Invalidate only affected periods so pre-fix proposals cannot pass the apply fingerprint check.
CREATE OR REPLACE FUNCTION private.sf_preview_planning_period(company_ uuid, first_ date, months_ integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE snapshots_ jsonb:='[]';s_ jsonb;i_ int;
BEGIN
 IF months_ IS NULL OR months_<1 OR months_>12 OR first_ IS NULL OR extract(day FROM first_)<>1 THEN RAISE EXCEPTION 'Bitte ein bis zwölf Kalendermonate auswählen.'; END IF;
 FOR i_ IN 0..months_-1 LOOP s_:=private.sf_month_optimization_snapshot(company_,(first_+make_interval(months=>i_))::date);snapshots_:=snapshots_||jsonb_build_array(s_); END LOOP;
 RETURN jsonb_build_object('fingerprint',md5(snapshots_::text || CASE WHEN EXISTS (
   SELECT 1 FROM public.shift_templates t
   JOIN public.company_compliance_policy p ON p.company_id=t.company_id
   CROSS JOIN generate_series(first_,first_+make_interval(months=>months_)-interval '1 day',interval '1 day') d(day)
   WHERE t.company_id=company_ AND t.active AND t.code='OT' AND t.planning_mode='required'
    AND p.solid_planning_rules ? 'otHolidayStatesBySite'
    AND coalesce((p.solid_planning_rules->>'otDailyMinimumStaffing')::int,0)=0
    AND NOT extract(isodow FROM d.day)::int=ANY(t.optional_weekdays)
    AND private.sf_ot_day(company_,d.day::date,null)
  ) THEN '|ot-holiday-demand-v2' ELSE '' END),'months',snapshots_,'protectedIds',(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb) FROM jsonb_array_elements(snapshots_) s CROSS JOIN LATERAL jsonb_array_elements(s->'protectedIds') v));
END $function$;
