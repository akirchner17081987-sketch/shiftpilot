-- Apply the confirmed regional day-service rule to the three named companies.
-- Existing dated planner decisions and all assignments are retained.
DO $configure$
DECLARE item_ record; company_ uuid; rules_ jsonb; configured_ jsonb; code_ text; filtered_ jsonb; tl_group_ text; tl_required_ integer;
BEGIN
 FOR item_ IN SELECT * FROM (VALUES
   ('Secontec Services',ARRAY['OT1','OT2','OT3']::text[],ARRAY['OT']::text[]),
   ('Secontec Services - 8h',ARRAY['FD']::text[],ARRAY['FD-WE']::text[]),
   ('Secontec Services - 9h',ARRAY['OT']::text[],ARRAY['OT-WE']::text[])
 ) AS x(name,weekday_codes,special_codes) LOOP
  SELECT id INTO STRICT company_ FROM public.companies WHERE name=item_.name;
  SELECT solid_planning_rules INTO STRICT rules_ FROM public.company_compliance_policy WHERE company_id=company_ FOR UPDATE;
  IF NOT coalesce((rules_->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'Planungsregeln fehlen: %',item_.name; END IF;
  FOREACH code_ IN ARRAY item_.weekday_codes||item_.special_codes LOOP
   IF NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=company_ AND code=code_ AND active)
   THEN RAISE EXCEPTION 'Aktives Schichtmodell % fehlt bei %',code_,item_.name; END IF;
  END LOOP;
  configured_:=(rules_-'otDailyMinimumStaffing') #- '{exactStaffing,OT}';
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO filtered_
    FROM jsonb_array_elements(coalesce(configured_->'criticalShifts','[]'::jsonb)) x
    WHERE x->>'code'<>ALL(item_.weekday_codes||item_.special_codes);
  configured_:=jsonb_set(configured_,'{criticalShifts}',filtered_,true);
  configured_:=jsonb_set(configured_,'{regionalDayStaffing}',jsonb_build_object(
   'target',3,'statesBySite',jsonb_build_object('Leipzig','SN','Recklinghausen','NW'),
   'weekdayCodes',to_jsonb(item_.weekday_codes),'specialCodes',to_jsonb(item_.special_codes)),true);
  UPDATE public.company_compliance_policy SET solid_planning_rules=configured_,updated_at=now() WHERE company_id=company_;
 END LOOP;
 -- The existing 10-hour weekend code is OT internally; display its actual use.
 UPDATE public.shift_templates SET display_code='OT-WE',updated_at=now()
   WHERE company_id=(SELECT id FROM public.companies WHERE name='Secontec Services') AND code='OT';
 -- The requested TL shift is 22:00–06:00 for all three companies. Existing
 -- assignments keep their original times; only future uses of the templates change.
 IF (SELECT count(*) FROM public.shift_templates t JOIN public.companies c ON c.id=t.company_id
     WHERE t.active AND ((c.name='Secontec Services' AND t.code IN('TL-LE','TL-RE'))
       OR (c.name IN('Secontec Services - 8h','Secontec Services - 9h') AND t.code='TL')))<>4
 THEN RAISE EXCEPTION 'Die vier aktiven Teamleitungsmodelle sind nicht vollständig vorhanden.'; END IF;
 SELECT min(t.coverage_group),min(t.coverage_required) INTO tl_group_,tl_required_ FROM public.shift_templates t JOIN public.companies c ON c.id=t.company_id
   WHERE c.name='Secontec Services' AND t.active AND t.code IN('TL-LE','TL-RE');
 IF tl_group_ IS NULL OR tl_required_ IS NULL OR (SELECT count(*) FROM public.shift_templates t JOIN public.companies c ON c.id=t.company_id
   WHERE c.name='Secontec Services' AND t.active AND t.code IN('TL-LE','TL-RE') AND t.coverage_group=tl_group_ AND t.coverage_required=tl_required_)<>2
 THEN RAISE EXCEPTION 'Gemeinsame Teamleitungsgruppe ist nicht eindeutig.'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates t JOIN public.companies c ON c.id=t.company_id WHERE c.name='Secontec Services' AND t.coverage_group=tl_group_ AND t.code NOT IN('TL-LE','TL-RE','Teamleiter')) THEN RAISE EXCEPTION 'Unerwartetes Modell in der Teamleitungsgruppe.'; END IF;
 UPDATE public.shift_templates t SET coverage_group=NULL,coverage_required=0 FROM public.companies c
   WHERE c.id=t.company_id AND c.name='Secontec Services' AND t.coverage_group=tl_group_;
 UPDATE public.shift_templates t SET default_start='22:00'::time,default_end='06:00'::time,updated_at=now()
   FROM public.companies c WHERE c.id=t.company_id
    AND ((c.name='Secontec Services' AND t.code IN('TL-LE','TL-RE','Teamleiter'))
      OR (c.name IN('Secontec Services - 8h','Secontec Services - 9h') AND t.active AND t.code='TL'));
 UPDATE public.shift_templates t SET coverage_group=tl_group_,coverage_required=tl_required_ FROM public.companies c
   WHERE c.id=t.company_id AND c.name='Secontec Services' AND t.code IN('TL-LE','TL-RE','Teamleiter');
END; $configure$;
