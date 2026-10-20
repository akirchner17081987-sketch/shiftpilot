-- Explicitly confirmed soft preferences. No notes, absence reasons or unconfirmed edits.
CREATE TABLE public.planning_assistant_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 config jsonb NOT NULL CHECK(coalesce(
  jsonb_typeof(config)='object' AND config ?& ARRAY['kind','employeeId','shift','weekday']
  AND config->>'kind' IN('prefer_shift','avoid_shift','avoid_transition','prefer_pair')
  AND jsonb_typeof(config->'employeeId')='string' AND config->>'employeeId' ~ '^[-a-zA-Z0-9_]{1,100}$'
  AND jsonb_typeof(config->'shift')='string' AND char_length(config->>'shift') BETWEEN 1 AND 50
  AND jsonb_typeof(config->'weekday')='number' AND config->>'weekday' IN('0','1','2','3','4','5','6')
  AND CASE config->>'kind'
   WHEN 'prefer_pair' THEN (config-ARRAY['kind','employeeId','shift','weekday','partnerId'])='{}'::jsonb AND jsonb_typeof(config->'partnerId')='string' AND config->>'partnerId' ~ '^[-a-zA-Z0-9_]{1,100}$' AND config->>'partnerId'<>config->>'employeeId'
   WHEN 'avoid_transition' THEN (config-ARRAY['kind','employeeId','shift','weekday','previousShift'])='{}'::jsonb AND jsonb_typeof(config->'previousShift')='string' AND char_length(config->>'previousShift') BETWEEN 1 AND 50
   ELSE (config-ARRAY['kind','employeeId','shift','weekday'])='{}'::jsonb END,false)),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX planning_assistant_preferences_company_config ON public.planning_assistant_preferences(company_id,config);
ALTER TABLE public.planning_assistant_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY planning_assistant_preferences_planners ON public.planning_assistant_preferences FOR ALL TO authenticated
 USING ((SELECT NOT private.sf_has_time_only_login()) AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=planning_assistant_preferences.company_id AND m.user_id=(SELECT auth.uid()) AND m.status='ACTIVE' AND m.role IN('OWNER','ADMIN','PLANNER','DISPATCHER')))
 WITH CHECK ((SELECT NOT private.sf_has_time_only_login()) AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=planning_assistant_preferences.company_id AND m.user_id=(SELECT auth.uid()) AND m.status='ACTIVE' AND m.role IN('OWNER','ADMIN','PLANNER','DISPATCHER')));
REVOKE ALL ON public.planning_assistant_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.planning_assistant_preferences TO authenticated;
GRANT UPDATE(enabled) ON public.planning_assistant_preferences TO authenticated;
CREATE FUNCTION private.sf_touch_planning_assistant_preference() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.config IS DISTINCT FROM OLD.config) THEN RAISE EXCEPTION 'Die bestätigte Präferenz kann nur aktiviert, pausiert oder gelöscht werden.'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('planning-learning:'||NEW.company_id::text,0));
  IF (SELECT count(*) FROM public.planning_assistant_preferences WHERE company_id=NEW.company_id)>=100 THEN RAISE EXCEPTION 'Höchstens 100 Lernpräferenzen je Unternehmen.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.company_id=NEW.company_id AND e.deleted_at IS NULL AND (e.legacy_id=NEW.config->>'employeeId' OR e.id::text=NEW.config->>'employeeId')) OR (NEW.config->>'kind'='prefer_pair' AND NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.company_id=NEW.company_id AND e.deleted_at IS NULL AND (e.legacy_id=NEW.config->>'partnerId' OR e.id::text=NEW.config->>'partnerId'))) THEN RAISE EXCEPTION 'Mitarbeiter gehört nicht zum Unternehmen.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shift_templates t WHERE t.company_id=NEW.company_id AND t.code=NEW.config->>'shift') OR (NEW.config->>'kind'='avoid_transition' AND NOT EXISTS(SELECT 1 FROM public.shift_templates t WHERE t.company_id=NEW.company_id AND t.code=NEW.config->>'previousShift')) THEN RAISE EXCEPTION 'Schichtvorlage gehört nicht zum Unternehmen.'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sf_touch_planning_assistant_preference() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_touch_planning_assistant_preference() TO authenticated;
CREATE TRIGGER planning_assistant_preference_touch BEFORE INSERT OR UPDATE ON public.planning_assistant_preferences FOR EACH ROW EXECUTE FUNCTION private.sf_touch_planning_assistant_preference();
NOTIFY pgrst, 'reload schema';
