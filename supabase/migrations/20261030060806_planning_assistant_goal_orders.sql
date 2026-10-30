-- Durable, owner-scoped planning goals. Receipts contain metrics and decision codes, never full plans or free personnel notes.
CREATE FUNCTION private.sf_valid_assistant_order_metrics(value_ jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE key_ text;
BEGIN
 IF jsonb_typeof(value_) IS DISTINCT FROM 'object' OR NOT value_ ?& ARRAY['open','issues','deficit','balance','changes'] OR value_-ARRAY['open','issues','deficit','balance','changes']<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH key_ IN ARRAY ARRAY['open','issues','deficit','balance','changes'] LOOP
  IF jsonb_typeof(value_->key_) IS DISTINCT FROM 'number' OR (value_->>key_)::numeric<0 OR (value_->>key_)::numeric>1000000000 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION private.sf_valid_assistant_order_state(value_ jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE item_ jsonb;
BEGIN
 IF jsonb_typeof(value_) IS DISTINCT FROM 'object' OR octet_length(value_::text)>32768 OR value_-ARRAY['baseline','latest','steps','decisions','stopReason','runMs']<>'{}'::jsonb THEN RETURN false; END IF;
 IF value_ ? 'baseline' AND NOT private.sf_valid_assistant_order_metrics(value_->'baseline') THEN RETURN false; END IF;
 IF value_ ? 'latest' AND NOT private.sf_valid_assistant_order_metrics(value_->'latest') THEN RETURN false; END IF;
 IF value_ ? 'runMs' AND (jsonb_typeof(value_->'runMs') IS DISTINCT FROM 'number' OR (value_->>'runMs')::numeric NOT BETWEEN 0 AND 300000) THEN RETURN false; END IF;
 IF value_ ? 'stopReason' AND (jsonb_typeof(value_->'stopReason') IS DISTINCT FROM 'string' OR value_->>'stopReason' NOT IN('running','goal_reached','no_improvement','round_limit','time_limit','cancelled','data_missing','data_changed')) THEN RETURN false; END IF;
 IF value_ ? 'steps' THEN
  IF jsonb_typeof(value_->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(value_->'steps')>32 THEN RETURN false; END IF;
  FOR item_ IN SELECT * FROM jsonb_array_elements(value_->'steps') LOOP
   IF jsonb_typeof(item_) IS DISTINCT FROM 'object' OR NOT item_ ?& ARRAY['strategy','round','accepted','before','after'] OR item_-ARRAY['strategy','round','accepted','before','after']<>'{}'::jsonb OR item_->>'strategy' NOT IN('direct','coverage','hours','reserve') OR jsonb_typeof(item_->'strategy') IS DISTINCT FROM 'string' OR item_->>'round' NOT IN('1','2','3','4','5','6') OR jsonb_typeof(item_->'round') IS DISTINCT FROM 'number' OR jsonb_typeof(item_->'accepted') IS DISTINCT FROM 'boolean' OR NOT private.sf_valid_assistant_order_metrics(item_->'before') OR NOT private.sf_valid_assistant_order_metrics(item_->'after') THEN RETURN false; END IF;
  END LOOP;
 END IF;
 IF value_ ? 'decisions' THEN
  IF jsonb_typeof(value_->'decisions') IS DISTINCT FROM 'array' OR jsonb_array_length(value_->'decisions')>5 THEN RETURN false; END IF;
  FOR item_ IN SELECT * FROM jsonb_array_elements(value_->'decisions') LOOP
   IF jsonb_typeof(item_) IS DISTINCT FROM 'object' OR NOT item_ ?& ARRAY['key','choice','basis'] OR item_-ARRAY['key','choice','basis']<>'{}'::jsonb OR item_->>'key' NOT IN('coverage','hours','rules','reserve','proposal') OR jsonb_typeof(item_->'key') IS DISTINCT FROM 'string' OR item_->>'choice' NOT IN('reviewed','deferred') OR jsonb_typeof(item_->'choice') IS DISTINCT FROM 'string' OR jsonb_typeof(item_->'basis') IS DISTINCT FROM 'string' OR item_->>'basis' !~ '^[a-zA-Z0-9:_-]{1,160}$' THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT item->>'key') FROM jsonb_array_elements(value_->'decisions') item) THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.sf_valid_assistant_order_metrics(jsonb),private.sf_valid_assistant_order_state(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_valid_assistant_order_metrics(jsonb),private.sf_valid_assistant_order_state(jsonb) TO authenticated;

CREATE TABLE public.planning_assistant_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 config jsonb NOT NULL CHECK(coalesce(jsonb_typeof(config)='object' AND config ?& ARRAY['month','goal','focus'] AND config-ARRAY['month','goal','focus']='{}'::jsonb AND jsonb_typeof(config->'month')='string' AND config->>'month' ~ '^\d{4}-(0[1-9]|1[0-2])$' AND jsonb_typeof(config->'goal')='string' AND config->>'goal' IN('coverage','both') AND jsonb_typeof(config->'focus')='string' AND (config->>'focus' ~ '^(all|leaders|team:[A-E])$' OR config->>'focus' ~ '^person:[a-zA-Z0-9_-]{1,100}$'),false)),
 status text NOT NULL DEFAULT 'ready' CHECK(status IN('ready','running','awaiting_approval','needs_decision','completed','paused','reviewed','archived')),
 state jsonb NOT NULL DEFAULT '{}' CHECK(private.sf_valid_assistant_order_state(state)),
 basis text CHECK(basis ~ '^[a-zA-Z0-9:_-]{1,160}$'),
 run_token uuid,
 lease_until timestamptz,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planning_assistant_orders_owner_company_updated ON public.planning_assistant_orders(owner_id,company_id,updated_at DESC);
CREATE INDEX planning_assistant_orders_company ON public.planning_assistant_orders(company_id);
ALTER TABLE public.planning_assistant_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY planning_assistant_orders_owner ON public.planning_assistant_orders FOR ALL TO authenticated
 USING(owner_id=(SELECT auth.uid()) AND (SELECT NOT private.sf_has_time_only_login()) AND private.sf_is_manager(company_id,false))
 WITH CHECK(owner_id=(SELECT auth.uid()) AND (SELECT NOT private.sf_has_time_only_login()) AND private.sf_is_manager(company_id,false));
REVOKE ALL ON public.planning_assistant_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.planning_assistant_orders TO authenticated;
GRANT INSERT(company_id,config) ON public.planning_assistant_orders TO authenticated;
GRANT UPDATE(state,status,basis,run_token) ON public.planning_assistant_orders TO authenticated;
CREATE FUNCTION private.sf_guard_assistant_order() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM private.sf_assert_aal2('planning_assistant_orders');
 IF TG_OP='DELETE' THEN
  IF OLD.status='running' AND OLD.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Der Auftrag wird bereits bearbeitet. Bitte zuerst abbrechen oder nach Ablauf der Laufzeit erneut öffnen.'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('assistant-orders:'||NEW.company_id::text||':'||NEW.owner_id::text,0));
  IF (SELECT count(*) FROM public.planning_assistant_orders WHERE owner_id=NEW.owner_id AND company_id=NEW.company_id)>=100 THEN RAISE EXCEPTION 'Höchstens 100 gespeicherte Aufträge pro Benutzer und Unternehmen. Bitte ältere Aufträge entfernen.'; END IF;
 ELSE
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'Unternehmen, Benutzer und Ziel eines Auftrags bleiben unverändert.'; END IF;
  IF OLD.status='running' AND OLD.lease_until>clock_timestamp() AND NEW.run_token IS DISTINCT FROM OLD.run_token THEN RAISE EXCEPTION 'Der Auftrag wird bereits auf einem anderen Gerät bearbeitet.'; END IF;
  NEW.version:=OLD.version+1;
 END IF;
 IF NEW.status='running' THEN
  IF NEW.run_token IS NULL THEN RAISE EXCEPTION 'Kennung des Planungslaufs fehlt.'; END IF;
  NEW.lease_until:=clock_timestamp()+interval '150 seconds';
 ELSE NEW.run_token:=NULL;NEW.lease_until:=NULL; END IF;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sf_guard_assistant_order() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_guard_assistant_order() TO authenticated;
CREATE TRIGGER planning_assistant_order_guard BEFORE INSERT OR UPDATE OR DELETE ON public.planning_assistant_orders FOR EACH ROW EXECUTE FUNCTION private.sf_guard_assistant_order();

-- This hash adds policy and company planning settings to the existing period fingerprint.
-- The private definer is needed to read the existing private snapshot; it checks authorization before any company lookup.
CREATE FUNCTION private.sf_preview_assistant_order(p_company_id uuid,p_month date) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot_ jsonb;basis_ text;
BEGIN
 IF auth.uid() IS NULL OR private.sf_has_time_only_login() OR NOT private.sf_is_manager(p_company_id,false) THEN RAISE EXCEPTION 'Aktive Planungsrechte für dieses Unternehmen erforderlich.' USING ERRCODE='42501'; END IF;
 PERFORM private.sf_assert_aal2('preview_planning_assistant_order');
 IF p_month IS NULL OR extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Bitte einen gültigen Startmonat wählen.'; END IF;
 snapshot_:=private.sf_preview_planning_period(p_company_id,p_month,1);
 SELECT md5(jsonb_build_object('period',snapshot_->>'fingerprint','policy',(SELECT to_jsonb(p) FROM public.company_compliance_policy p WHERE p.company_id=p_company_id),'company',(SELECT to_jsonb(c) FROM public.companies c WHERE c.id=p_company_id))::text) INTO basis_;
 RETURN jsonb_build_object('fingerprint',basis_,'planningFingerprint',snapshot_->>'fingerprint','protectedIds',snapshot_->'protectedIds');
END $$;
REVOKE ALL ON FUNCTION private.sf_preview_assistant_order(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_preview_assistant_order(uuid,date) TO authenticated;
CREATE FUNCTION public.preview_planning_assistant_order(p_company_id uuid,p_month date) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.sf_preview_assistant_order(p_company_id,p_month) $$;
REVOKE ALL ON FUNCTION public.preview_planning_assistant_order(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_planning_assistant_order(uuid,date) TO authenticated;
NOTIFY pgrst,'reload schema';
