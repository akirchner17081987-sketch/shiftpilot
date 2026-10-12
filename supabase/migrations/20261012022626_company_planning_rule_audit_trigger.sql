-- Capture actual stored changes without granting clients INSERT on the protected audit table.
CREATE OR REPLACE FUNCTION private.sf_audit_planning_rule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_ text;
BEGIN
 IF NEW.solid_planning_rules IS NOT DISTINCT FROM OLD.solid_planning_rules THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT cm.role INTO role_ FROM public.company_members cm WHERE cm.company_id=NEW.company_id AND cm.user_id=auth.uid() AND cm.status='ACTIVE' AND cm.role IN('OWNER','ADMIN');
 IF role_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln dürfen nur Inhaber und Administratoren dieses Unternehmens ändern.'; END IF;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 VALUES(NEW.company_id,'PLANNING_RULES_UPDATED','company_compliance_policy',NEW.company_id,auth.uid(),role_,OLD.solid_planning_rules,NEW.solid_planning_rules,jsonb_build_object('backendCaptured',true,'reason',left(coalesce(current_setting('sf.planning_rule_change_reason',true),''),500)));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sf_audit_planning_rule_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sf_audit_planning_rule_change AFTER UPDATE OF solid_planning_rules ON public.company_compliance_policy FOR EACH ROW EXECUTE FUNCTION private.sf_audit_planning_rule_change();

-- Atomic, company-authorized settings update. No company defaults are copied or seeded.
CREATE OR REPLACE FUNCTION public.manager_save_planning_rules(p_company_id uuid,p_patch jsonb,p_expected jsonb,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE before_ public.company_compliance_policy; after_ public.company_compliance_policy; key_ text; value_ jsonb; n_ numeric; min_ numeric; max_ numeric; rule_ jsonb; role_ text;
BEGIN
 SELECT role INTO role_ FROM public.company_members WHERE company_id=p_company_id AND user_id=auth.uid() AND status='ACTIVE' AND role IN('OWNER','ADMIN');
 IF auth.uid() IS NULL OR role_ IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Nur Inhaber und Administratoren dieses Unternehmens dürfen Planungsregeln ändern.'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ungültige Planungsregeln.'; END IF;
 SELECT * INTO before_ FROM public.company_compliance_policy WHERE company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Keine zugänglichen Planungseinstellungen für dieses Unternehmen.'; END IF;
 IF before_.solid_planning_rules IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Die Planungsregeln wurden zwischenzeitlich geändert. Bitte neu laden und erneut bearbeiten.'; END IF;
 IF NOT coalesce((before_.solid_planning_rules->>'enabled')::boolean,false) OR coalesce((before_.solid_planning_rules->>'confirmedRulesVersion')::int,0)<2 THEN RAISE EXCEPTION 'Dieses Unternehmen verwendet noch kein bestätigtes Regelwerk. Schichtmodelle und Teamregeln können unter Planung bearbeitet werden.'; END IF;
 FOR key_,value_ IN SELECT * FROM jsonb_each(p_patch) LOOP
  IF key_='conditionalStaffing' THEN
   IF jsonb_typeof(value_) IS DISTINCT FROM 'array' OR jsonb_array_length(value_)>20 THEN RAISE EXCEPTION 'Ungültige bedingte Besetzung.'; END IF;
   FOR rule_ IN SELECT * FROM jsonb_array_elements(value_) LOOP
    IF jsonb_typeof(rule_) IS DISTINCT FROM 'object' OR NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=p_company_id AND code=rule_->>'shift' AND active) OR NOT EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=p_company_id AND code=rule_->>'sourceShift' AND active) OR rule_->>'shift'=rule_->>'sourceShift' THEN RAISE EXCEPTION 'Bedingte Besetzung muss aktive unterschiedliche Schichtmodelle dieses Unternehmens verwenden.'; END IF;
    IF NOT coalesce((rule_->>'coverageStart')~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false) OR NOT coalesce((rule_->>'coverageEnd')~'^([01][0-9]|2[0-3]):[0-5][0-9]$',false) OR (rule_->>'coverageEnd')::time<=(rule_->>'coverageStart')::time THEN RAISE EXCEPTION 'Bitte ein gültiges Abdeckungszeitfenster am selben Tag angeben.'; END IF;
    IF jsonb_typeof(rule_->'minimum') IS DISTINCT FROM 'number' OR (rule_->>'minimum')::numeric NOT BETWEEN 1 AND 99 OR (rule_->>'minimum')::numeric<>trunc((rule_->>'minimum')::numeric) OR jsonb_typeof(rule_->'fallbackCount') IS DISTINCT FROM 'number' OR (rule_->>'fallbackCount')::numeric NOT BETWEEN 0 AND 99 OR (rule_->>'fallbackCount')::numeric<>trunc((rule_->>'fallbackCount')::numeric) OR jsonb_typeof(rule_->'sourceDayOffset') IS DISTINCT FROM 'number' OR (rule_->>'sourceDayOffset')::numeric NOT IN(-1,0) THEN RAISE EXCEPTION 'Ungültige Besetzungsanzahl oder Bezugstag.'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(value_) r GROUP BY r->>'shift' HAVING count(*)>1) THEN RAISE EXCEPTION 'Pro Schicht ist nur eine bedingte Besetzungsregel erlaubt.'; END IF;
   CONTINUE;
  END IF;
  SELECT lo,hi INTO min_,max_ FROM (VALUES
   ('monthlyMaxHours',1,190),('eightHourAutoMaxHours',1,190),('eightHourMaxShifts',1,31),('tenHourMaxShifts',1,31),('otOnlyMonthlyMaxHours',1,220),
   ('maxConsecutiveShifts',1,7),('maxConsecutiveNightShifts',1,7),('minFreeCalendarDays',0,14),('minNightRecoveryCalendarDays',0,14),('minBlockRestHours',11,336),('maxCalendarWeekHours',1,40),
   ('preferredNightBlockLength',1,7),('minFreeWeekendsPerMonth',0,5),('rollingWeekTargetHours',1,40)
  ) bounds(k,lo,hi) WHERE k=key_;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Planungsregel ist nicht direkt bearbeitbar: %',key_; END IF;
  IF jsonb_typeof(value_) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Planungswerte müssen Zahlen sein.'; END IF;
  n_:=(value_#>>'{}')::numeric;
  IF n_<min_ OR n_>max_ OR n_<>trunc(n_) THEN RAISE EXCEPTION 'Der Wert für % muss ganzzahlig zwischen % und % liegen.',key_,min_,max_; END IF;
 END LOOP;
 after_.solid_planning_rules:=before_.solid_planning_rules||p_patch;
 IF coalesce((after_.solid_planning_rules->>'maxConsecutiveNightShifts')::int,3)>coalesce((after_.solid_planning_rules->>'maxConsecutiveShifts')::int,4) THEN RAISE EXCEPTION 'Die maximale Nachtblocklänge darf die Arbeitsblocklänge nicht überschreiten.'; END IF;
 IF coalesce((after_.solid_planning_rules->>'eightHourAutoMaxHours')::numeric,184)>coalesce((after_.solid_planning_rules->>'monthlyMaxHours')::numeric,190) AND p_patch ? 'eightHourAutoMaxHours' THEN RAISE EXCEPTION 'Die automatischen Monatsstunden dürfen die allgemeine Monatsobergrenze nicht überschreiten.'; END IF;
 PERFORM set_config('sf.planning_rule_change_reason',left(coalesce(p_reason,''),500),true);
 UPDATE public.company_compliance_policy SET solid_planning_rules=solid_planning_rules||p_patch,
  monthly_planning_max_hours=coalesce((p_patch->>'monthlyMaxHours')::numeric,monthly_planning_max_hours),updated_at=now()
 WHERE company_id=p_company_id RETURNING * INTO after_;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Planungsregeln konnten für dieses Unternehmen nicht gespeichert werden.'; END IF;
 RETURN jsonb_build_object('company_id',p_company_id,'solid_planning_rules',after_.solid_planning_rules,'monthly_planning_max_hours',after_.monthly_planning_max_hours,'monthly_planning_max_shifts',after_.monthly_planning_max_shifts,'updated_at',after_.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.manager_save_planning_rules(uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_save_planning_rules(uuid,jsonb,jsonb,text) TO authenticated;
