-- Company-scoped night blocks: four nights, then sleep day plus two full free days.
-- The existing calendar-day validators and background worker read these values.
DO $f$
DECLARE count_ int;
BEGIN
 SELECT count(*) INTO count_ FROM public.companies WHERE name='Secontec Services';
 IF count_<>1 THEN RAISE EXCEPTION 'Das Unternehmen für die Nachtblockregel ist nicht eindeutig.'; END IF;
 UPDATE public.company_compliance_policy p
 SET solid_planning_rules=p.solid_planning_rules||jsonb_build_object(
  'maxConsecutiveNightShifts',4,
  'preferredNightBlockLength',4,
  'minNightRecoveryCalendarDays',2,
  'teamLeaderMaxConsecutiveNightShifts',4,
  'teamLeaderPreferredNightBlockLength',4,
  'teamLeaderMinNightRecoveryCalendarDays',2)
 FROM public.companies c
 WHERE c.id=p.company_id AND c.name='Secontec Services'
  AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
  AND coalesce((p.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2
  AND coalesce((p.solid_planning_rules->>'maxConsecutiveShifts')::int,4)>=4;
 GET DIAGNOSTICS count_=ROW_COUNT;
 IF count_<>1 THEN RAISE EXCEPTION 'Die Nachtblockregel benötigt das bestätigte Regelwerk mit mindestens vier Diensten pro Block.'; END IF;
END $f$;
