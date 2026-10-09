-- Allow a continuous annual horizon so cross-month critical staffing can be replaced atomically.
-- Existing snapshot authorization, fingerprints, protected-duty checks and all apply guards remain in force.
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
 RETURN jsonb_build_object('fingerprint',md5(snapshots_::text),'months',snapshots_,'protectedIds',(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb) FROM jsonb_array_elements(snapshots_) s CROSS JOIN LATERAL jsonb_array_elements(s->'protectedIds') v));
END $function$

