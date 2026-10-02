-- Optional staffing is a soft target; daily positive overrides remain mandatory.
ALTER TABLE public.shift_templates
  ADD COLUMN planning_mode text NOT NULL DEFAULT 'required' CHECK(planning_mode IN ('required','optional')),
  ADD COLUMN optional_staffing integer NOT NULL DEFAULT 0 CHECK(optional_staffing BETWEEN 0 AND 99),
  ADD COLUMN responsible_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN responsible_only boolean NOT NULL DEFAULT false,
  ADD COLUMN optional_weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],
  ADD CONSTRAINT shift_templates_optional_target CHECK(planning_mode<>'optional' OR optional_staffing>0),
  ADD CONSTRAINT shift_templates_optional_days CHECK(cardinality(optional_weekdays) BETWEEN 1 AND 7 AND optional_weekdays <@ ARRAY[1,2,3,4,5,6,7]),
  ADD CONSTRAINT shift_templates_exclusive_optional CHECK(NOT responsible_only OR planning_mode<>'optional' OR optional_staffing<=1);

CREATE OR REPLACE FUNCTION public.validate_shift_planning_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF new.responsible_employee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employees WHERE id=new.responsible_employee_id AND company_id=new.company_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Zuständiger Mitarbeiter gehört nicht zu diesem Unternehmen.';
  END IF;
  IF array_position(new.optional_weekdays,NULL) IS NOT NULL OR cardinality(new.optional_weekdays)<>(SELECT count(DISTINCT x) FROM unnest(new.optional_weekdays) x) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ungültige Wochentage.'; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.validate_shift_planning_rule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shift_templates_planning_rule BEFORE INSERT OR UPDATE ON public.shift_templates FOR EACH ROW EXECUTE FUNCTION public.validate_shift_planning_rule();

CREATE OR REPLACE FUNCTION public.normalize_optional_staffing()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=new.company_id AND code=new.shift_code AND planning_mode='optional') THEN new.required_count:=0; END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.normalize_optional_staffing() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER global_staffing_optional BEFORE INSERT OR UPDATE ON public.global_staffing_requirements FOR EACH ROW EXECUTE FUNCTION public.normalize_optional_staffing();

CREATE OR REPLACE FUNCTION public.enforce_shift_responsibility()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE t public.shift_templates%rowtype;
BEGIN
  IF new.status='CANCELLED' THEN RETURN new; END IF;
  IF TG_OP='UPDATE' AND old.company_id=new.company_id AND old.shift_code=new.shift_code AND old.employee_id=new.employee_id AND old.status<>'CANCELLED' THEN RETURN new; END IF;
  SELECT * INTO t FROM public.shift_templates WHERE company_id=new.company_id AND code=new.shift_code FOR SHARE;
  IF t.responsible_only AND t.responsible_employee_id IS DISTINCT FROM new.employee_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet.';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.enforce_shift_responsibility() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shift_assignments_responsible BEFORE INSERT OR UPDATE OF company_id,shift_code,employee_id,status ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_shift_responsibility();

-- Company shift models: caller permissions and existing RLS remain authoritative.
CREATE OR REPLACE FUNCTION public.manager_manage_shift_model(
  p_company_id uuid, p_action text, p_model jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_code text := btrim(coalesce(p_model->>'code',''));
  v_name text; v_start time; v_end time; v_color text; v_soll integer;
  v_model public.shift_templates%rowtype; v_used boolean;
  v_mode text; v_optional integer; v_responsible uuid; v_only boolean; v_days integer[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id=p_company_id
      AND user_id=auth.uid() AND status='ACTIVE'
      AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
  IF p_action NOT IN ('CREATE','UPDATE','REMOVE','RESTORE') OR p_action IS NULL
    OR jsonb_typeof(p_model) IS DISTINCT FROM 'object'
    OR v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige Aktion oder ungültiges Schichtkürzel.';
  END IF;
  -- Serialize catalogue edits within one company, including case-insensitive codes.
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  SELECT * INTO v_model FROM public.shift_templates
    WHERE company_id=p_company_id AND lower(code)=lower(v_code) FOR UPDATE;
  IF p_action='CREATE' AND FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Dieses Kürzel ist bereits vorhanden. Entfernte Modelle können wiederhergestellt werden.';
  ELSIF p_action<>'CREATE' AND NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Das Schichtmodell wurde nicht gefunden.';
  END IF;
  IF p_action='REMOVE' THEN
    v_used := EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=p_company_id AND shift_code=v_model.code)
      OR EXISTS(SELECT 1 FROM public.shift_change_requests WHERE company_id=p_company_id
        AND (old_snapshot->>'type'=v_model.code OR proposed_snapshot->>'type'=v_model.code))
      OR EXISTS(SELECT 1 FROM public.employees WHERE company_id=p_company_id
        AND (v_model.code=ANY(shift_permissions) OR v_model.code=ANY(qualifications)))
      OR EXISTS(SELECT 1 FROM public.datev_lodas_rules WHERE company_id=p_company_id AND source_key=v_model.code);
    IF v_used THEN
      UPDATE public.shift_templates SET active=false WHERE id=v_model.id;
    ELSE
      DELETE FROM public.shift_templates WHERE id=v_model.id;
    END IF;
    DELETE FROM public.global_staffing_requirements WHERE company_id=p_company_id AND shift_code=v_model.code;
    DELETE FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND shift_code=v_model.code;
    RETURN jsonb_build_object('code',v_model.code,'removed',true,'archived',v_used);
  END IF;
  v_name:=btrim(coalesce(p_model->>'name','')); v_color:=p_model->>'color';
  IF length(v_name) NOT BETWEEN 1 AND 80 OR v_name ~ '[<>]'
    OR coalesce(p_model->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'soll','') !~ '^[0-9]{1,2}$'
    OR v_color IS NULL OR v_color NOT IN ('blue','amber','pink','teal','cyan','violet','magenta','olive','gray') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bitte gültigen Namen, Zeiten, Farbe und eine SOLL-Stärke von 0 bis 99 angeben.';
  END IF;
  v_start:=(p_model->>'start')::time; v_end:=(p_model->>'end')::time; v_soll:=(p_model->>'soll')::integer;
  IF v_start=v_end THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Beginn und Ende müssen unterschiedlich sein.'; END IF;
  v_mode:=coalesce(p_model->>'planning_mode',v_model.planning_mode,'required');
  v_optional:=coalesce((p_model->>'optional_staffing')::integer,v_model.optional_staffing,0);
  v_responsible:=CASE WHEN p_model ? 'responsible_employee_id' THEN nullif(p_model->>'responsible_employee_id','')::uuid ELSE v_model.responsible_employee_id END;
  v_only:=coalesce((p_model->>'responsible_only')::boolean,v_model.responsible_only,false);
  IF p_model ? 'optional_weekdays' THEN
    IF jsonb_typeof(p_model->'optional_weekdays') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ungültige Wochentage'; END IF;
    SELECT array_agg(value::integer ORDER BY value::integer) INTO v_days FROM jsonb_array_elements_text(p_model->'optional_weekdays');
  ELSE v_days:=coalesce(v_model.optional_weekdays,ARRAY[1,2,3,4,5,6,7]); END IF;
  IF v_mode NOT IN ('required','optional') OR v_optional NOT BETWEEN 0 AND 99
    OR (v_mode='optional' AND v_optional<1) OR (v_only AND (v_responsible IS NULL OR (v_mode='optional' AND v_optional>1)))
    OR v_days IS NULL OR cardinality(v_days) NOT BETWEEN 1 AND 7 OR NOT v_days <@ ARRAY[1,2,3,4,5,6,7]
    OR cardinality(v_days)<>(SELECT count(DISTINCT x) FROM unnest(v_days) x) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige optionale Planungsregel oder Zuständigkeit.';
  END IF;
  IF v_responsible IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employees WHERE id=v_responsible AND company_id=p_company_id AND status='active' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der zuständige Mitarbeiter muss im aktuellen Unternehmen aktiv sein.';
  END IF;
  IF v_mode='optional' THEN v_soll:=0; END IF;
  IF p_action='CREATE' THEN
    INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,css_class,active,sort_order,planning_mode,optional_staffing,responsible_employee_id,responsible_only,optional_weekdays)
      SELECT p_company_id,upper(v_code),v_name,v_start,v_end,v_color,true,coalesce(max(sort_order),0)+1,v_mode,v_optional,v_responsible,v_only,v_days
      FROM public.shift_templates WHERE company_id=p_company_id RETURNING * INTO v_model;
  ELSE
    IF (p_action='UPDATE' AND NOT v_model.active) OR (p_action='RESTORE' AND v_model.active) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der Status wurde inzwischen geändert. Bitte lade die Schichtmodelle neu.';
    END IF;
    UPDATE public.shift_templates SET name=v_name,default_start=v_start,default_end=v_end,css_class=v_color,active=true,planning_mode=v_mode,optional_staffing=v_optional,responsible_employee_id=v_responsible,responsible_only=v_only,optional_weekdays=v_days
      WHERE id=v_model.id RETURNING * INTO v_model;
  END IF;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    VALUES(p_company_id,v_model.code,v_soll)
    ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count;
  RETURN jsonb_build_object('model',to_jsonb(v_model),'soll',v_soll);
END $$;
REVOKE ALL ON FUNCTION public.manager_manage_shift_model(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_manage_shift_model(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.sf_open_market_candidate(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; ctx jsonb; err text; 
BEGIN
 SELECT * INTO o FROM public.open_shift_market_offers WHERE id=p_offer;
 IF o.id IS NULL OR o.status<>'MARKET_OPEN' OR o.remaining_count=0 OR o.starts_at<=now() THEN RETURN 'Dieses Angebot ist nicht mehr verfügbar'; END IF;
 ctx:=private.sf_open_market_slot(o.company_id,o.work_date,o.shift_code);
 IF (ctx->>'missing')::integer=0 THEN RETURN 'Der Bedarf wurde inzwischen vollständig besetzt'; END IF;
 IF o.starts_at<>(ctx->>'starts_at')::timestamptz OR o.ends_at<>(ctx->>'ends_at')::timestamptz THEN RETURN 'Die Schichtzeiten wurden inzwischen geändert'; END IF;
 IF private.time_month_is_closed(o.company_id,o.work_date) THEN RETURN 'Der Planungsmonat ist abgeschlossen'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=o.company_id;
 IF e.id IS NULL OR e.status<>'active' OR e.deleted_at IS NOT NULL OR e.auth_user_id IS NULL THEN RETURN 'Kein aktiver Mitarbeiterzugang'; END IF;
 IF (e.start_date IS NOT NULL AND o.work_date<e.start_date) OR (e.contract_end IS NOT NULL AND o.work_date>e.contract_end) THEN RETURN 'Schicht liegt außerhalb des Beschäftigungszeitraums'; END IF;
 IF NOT coalesce(o.shift_code=ANY(e.shift_permissions),false) THEN RETURN 'Keine Freigabe für diese Schichtart'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=o.company_id AND code=o.shift_code AND responsible_only AND responsible_employee_id IS DISTINCT FROM e.id) THEN RETURN 'Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet'; END IF;
 BEGIN
  PERFORM public.assert_standard_shift_rules(o.company_id,e.id,o.starts_at,o.ends_at,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  RETURN CASE err WHEN 'Shift overlaps another assignment' THEN 'Bereits andere Schicht im Zeitraum' WHEN 'Shift overlaps an approved absence' THEN 'Genehmigte Abwesenheit im Zeitraum' WHEN 'Standard minimum rest period not met before shift' THEN 'Ruhezeit vor der Schicht nicht ausreichend' WHEN 'Standard minimum rest period not met after shift' THEN 'Ruhezeit nach der Schicht nicht ausreichend' WHEN 'Standard maximum shift duration exceeded' THEN 'Schicht überschreitet die zulässige Dauer' ELSE err END;
 END;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_open_market_slot(p_company uuid, p_date date, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.shift_templates%rowtype; tz text; target integer; filled integer; st timestamptz; en timestamptz;
BEGIN
 SELECT * INTO t FROM public.shift_templates WHERE company_id=p_company AND code=p_code AND active;
 IF t.id IS NULL THEN RETURN jsonb_build_object('missing',0); END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
 st:=(p_date+t.default_start) AT TIME ZONE tz;
 en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
 SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=p_company AND work_date=p_date AND shift_code=p_code),
 CASE WHEN t.planning_mode='optional' THEN 0 ELSE (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=p_company AND shift_code=p_code) END,0) INTO target;
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
END $function$;
