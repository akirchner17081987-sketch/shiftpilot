-- Editable presentation code; stable internal codes preserve existing assignments,
-- permissions, payroll mappings, and code-specific planning rules.
ALTER TABLE public.shift_templates ADD COLUMN display_code text;
ALTER TABLE public.shift_templates ADD CONSTRAINT shift_templates_display_code_format
 CHECK(display_code IS NULL OR display_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$');
CREATE UNIQUE INDEX shift_templates_company_display_code_uidx
 ON public.shift_templates(company_id,lower(coalesce(display_code,code)));

CREATE OR REPLACE FUNCTION public.manager_manage_shift_model(p_company_id uuid, p_action text, p_model jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text := btrim(coalesce(p_model->>'code',''));
  v_name text; v_start time; v_end time; v_color text; v_soll integer;
  v_model public.shift_templates%rowtype; v_used boolean;
  v_site uuid;
  v_display_code text;
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
  v_display_code := case when p_model ? 'display_code' then upper(btrim(coalesce(p_model->>'display_code',''))) else coalesce(v_model.display_code,v_model.code,v_code) end;
  IF v_display_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Das Kürzel benötigt 1–20 Buchstaben oder Zahlen; Bindestrich und Unterstrich sind möglich.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=p_company_id
    AND id IS DISTINCT FROM v_model.id AND lower(coalesce(display_code,code))=lower(v_display_code)) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Dieses Kürzel wird in diesem Unternehmen bereits verwendet.';
  END IF;
  v_site:=case when p_model ? 'site_id' then nullif(p_model->>'site_id','')::uuid else v_model.site_id end;
  if v_site is not null and v_site is distinct from v_model.site_id and not exists(select 1 from public.company_locations where id=v_site and company_id=p_company_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
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
    INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,css_class,active,sort_order,planning_mode,optional_staffing,responsible_employee_id,responsible_only,optional_weekdays,site_id,display_code)
      SELECT p_company_id,upper(v_code),v_name,v_start,v_end,v_color,true,coalesce(max(sort_order),0)+1,v_mode,v_optional,v_responsible,v_only,v_days,v_site,v_display_code
      FROM public.shift_templates WHERE company_id=p_company_id RETURNING * INTO v_model;
  ELSE
    IF (p_action='UPDATE' AND NOT v_model.active) OR (p_action='RESTORE' AND v_model.active) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der Status wurde inzwischen geändert. Bitte lade die Schichtmodelle neu.';
    END IF;
    UPDATE public.shift_templates SET display_code=v_display_code,name=v_name,default_start=v_start,default_end=v_end,css_class=v_color,active=true,planning_mode=v_mode,optional_staffing=v_optional,responsible_employee_id=v_responsible,responsible_only=v_only,optional_weekdays=v_days,site_id=v_site
      WHERE id=v_model.id RETURNING * INTO v_model;
  END IF;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    VALUES(p_company_id,v_model.code,v_soll)
    ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count;
  RETURN jsonb_build_object('model',to_jsonb(v_model),'soll',v_soll);
END $function$;
