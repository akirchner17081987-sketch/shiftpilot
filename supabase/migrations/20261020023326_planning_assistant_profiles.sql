-- Shared planning recipes contain goals only; they never change binding company rules.
CREATE TABLE public.planning_assistant_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
 config jsonb NOT NULL CHECK (coalesce((
   jsonb_typeof(config)='object' AND config ?& ARRAY['mode','goal','focus','count','checks']
   AND (config-ARRAY['mode','goal','focus','count','checks'])='{}'::jsonb
   AND config->>'mode' IN ('order','multiBalance','variants')
   AND config->>'goal' IN ('both','coverage')
   AND (config->>'mode'='order' OR config->>'goal'='both')
   AND jsonb_typeof(config->'count')='number' AND config->>'count' IN ('2','3','4','5','6')
   AND jsonb_typeof(config->'focus')='string'
   AND (config->>'focus' ~ '^(all|leaders|team:[A-E])$' OR config->>'focus' ~ '^person:[a-zA-Z0-9_-]{1,100}$')
   AND jsonb_typeof(config->'checks')='array' AND config->'checks' <@ '["rules","hours","reserve"]'::jsonb
 ),false)),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX planning_assistant_profiles_company_name ON public.planning_assistant_profiles(company_id,lower(btrim(name)));
ALTER TABLE public.planning_assistant_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY planning_assistant_profiles_planners ON public.planning_assistant_profiles FOR ALL TO authenticated
 USING ((SELECT NOT private.sf_has_time_only_login()) AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=planning_assistant_profiles.company_id AND m.user_id=(SELECT auth.uid()) AND m.status='ACTIVE' AND m.role IN('OWNER','ADMIN','PLANNER','DISPATCHER')))
 WITH CHECK ((SELECT NOT private.sf_has_time_only_login()) AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=planning_assistant_profiles.company_id AND m.user_id=(SELECT auth.uid()) AND m.status='ACTIVE' AND m.role IN('OWNER','ADMIN','PLANNER','DISPATCHER')));
REVOKE ALL ON public.planning_assistant_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.planning_assistant_profiles TO authenticated;
GRANT UPDATE(name,config) ON public.planning_assistant_profiles TO authenticated;
CREATE FUNCTION private.sf_touch_planning_assistant_profile() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Ein Planungsprofil kann nicht zwischen Unternehmen verschoben werden.'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('planning-profiles:'||NEW.company_id::text,0));
  IF (SELECT count(*) FROM public.planning_assistant_profiles WHERE company_id=NEW.company_id)>=100 THEN RAISE EXCEPTION 'Pro Unternehmen sind höchstens 100 Planungsprofile vorgesehen.'; END IF;
 END IF;
 NEW.name:=btrim(NEW.name);NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sf_touch_planning_assistant_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_touch_planning_assistant_profile() TO authenticated;
CREATE TRIGGER planning_assistant_profile_touch BEFORE INSERT OR UPDATE ON public.planning_assistant_profiles FOR EACH ROW EXECUTE FUNCTION private.sf_touch_planning_assistant_profile();
NOTIFY pgrst, 'reload schema';
