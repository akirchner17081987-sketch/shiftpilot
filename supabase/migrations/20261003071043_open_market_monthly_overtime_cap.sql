-- Automatic planning stops at 180 hours; the marketplace warns instead of blocking voluntary overtime.
CREATE OR REPLACE FUNCTION private.sf_open_market_extra_warning(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; tz text; wh numeric; mh numeric; dur numeric; mt numeric; v text; warnings text[]:=ARRAY[]::text[]; rhythm text;
BEGIN
 SELECT * INTO o FROM public.open_shift_market_offers WHERE id=p_offer;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=o.company_id;
 IF o.id IS NULL OR e.id IS NULL THEN RETURN ''; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=o.company_id;
 rhythm:=private.sf_open_market_rhythm(e.id,o.work_date,coalesce(private.sf_shared_coverage_shift(o.company_id,o.shift_code,e.id,o.work_date),o.shift_code));
 IF coalesce(rhythm,'')<>'' THEN warnings:=array_append(warnings,rhythm); END IF;
 dur:=extract(epoch FROM(o.ends_at-o.starts_at))/3600;
 SELECT coalesce(sum(greatest(0,extract(epoch FROM(a.ends_at-a.starts_at))/3600-a.break_minutes/60.0)),0)
 INTO wh FROM public.shift_assignments a WHERE a.company_id=o.company_id AND a.employee_id=e.id AND a.status<>'CANCELLED'
 AND date_trunc('week',a.starts_at AT TIME ZONE tz)=date_trunc('week',o.starts_at AT TIME ZONE tz);
 IF e.weekly_hours>0 AND wh+dur>e.weekly_hours+0.01 THEN
  warnings:=array_append(warnings,'Wochen-Soll überschritten: '||round(wh+dur,2)||' / '||e.weekly_hours||' Stunden');
 END IF;
 SELECT substr(x,19) INTO v FROM unnest(e.qualifications) x WHERE x LIKE '__sp:monthlyHours=%' LIMIT 1;
 mt:=CASE WHEN v ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(v,',','.')::numeric ELSE round(e.weekly_hours*4.348,2) END;
 -- Exceeding the automatic planning budget remains voluntary and requires explicit planner approval.
 mt:=least(180,CASE WHEN mt>0 THEN mt ELSE 180 END);
 SELECT coalesce(sum(greatest(0,extract(epoch FROM(a.ends_at-a.starts_at))/3600-a.break_minutes/60.0)),0)
 INTO mh FROM public.shift_assignments a WHERE a.company_id=o.company_id AND a.employee_id=e.id AND a.status<>'CANCELLED'
 AND date_trunc('month',a.starts_at AT TIME ZONE tz)=date_trunc('month',o.starts_at AT TIME ZONE tz);
 IF mt>0 AND mh+dur>mt+0.01 THEN
  warnings:=array_append(warnings,'Monats-Soll überschritten: '||round(mh+dur,2)||' / '||mt||' Stunden');
 END IF;
 RETURN array_to_string(warnings,' · ');
END $function$;
