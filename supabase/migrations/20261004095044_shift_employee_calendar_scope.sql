-- Persisted employee and calendar restrictions apply to every assignment write.
ALTER TABLE public.shift_templates
 ADD COLUMN allowed_personnel_nos text[],
 ADD COLUMN exclusive_employees boolean NOT NULL DEFAULT false,
 ADD COLUMN requires_planning_team boolean NOT NULL DEFAULT false,
 ADD COLUMN strict_weekdays boolean NOT NULL DEFAULT false,
 ADD COLUMN strict_times boolean NOT NULL DEFAULT false,
 ADD COLUMN rhythm_alias text,
 ADD CONSTRAINT shift_templates_exclusive_staff CHECK(NOT exclusive_employees OR cardinality(allowed_personnel_nos)>0 AND allowed_personnel_nos IS NOT NULL),
 ADD CONSTRAINT shift_templates_rhythm_alias CHECK(rhythm_alias IS NULL OR requires_planning_team AND length(rhythm_alias) BETWEEN 1 AND 20);

CREATE FUNCTION private.sf_shift_scope_error(company_ uuid,employee_ uuid,code_ text,starts_ timestamptz,ends_ timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE e_ public.employees%rowtype;t_ public.shift_templates%rowtype;exclusive_ text;tz_ text;day_ date;team_ text;
BEGIN
 SELECT * INTO e_ FROM public.employees WHERE company_id=company_ AND id=employee_;
 IF e_.id IS NULL THEN RETURN 'Mitarbeiter dieses Unternehmens wurde nicht gefunden.'; END IF;
 SELECT code INTO exclusive_ FROM public.shift_templates WHERE company_id=company_ AND active
  AND exclusive_employees AND e_.personnel_no=ANY(allowed_personnel_nos) ORDER BY sort_order,code LIMIT 1;
 IF exclusive_ IS NOT NULL AND exclusive_<>code_ THEN RETURN 'Dieser Mitarbeiter ist ausschließlich für '||exclusive_||' freigegeben.'; END IF;
 SELECT * INTO t_ FROM public.shift_templates WHERE company_id=company_ AND code=code_;
 IF t_.id IS NULL THEN RETURN NULL; END IF;
 IF t_.allowed_personnel_nos IS NOT NULL AND NOT coalesce(e_.personnel_no=ANY(t_.allowed_personnel_nos),false) THEN
  RETURN code_||' ist für diese Personalnummer nicht freigegeben.'; END IF;
 SELECT substr(x,19) INTO team_ FROM unnest(e_.qualifications) x WHERE x LIKE '__sp:planningTeam=%' LIMIT 1;
 IF t_.requires_planning_team AND coalesce(team_,'') NOT IN('A','B','C','D','E') THEN
  RETURN code_||' ist ausschließlich für Mitarbeiter in Teams A–E freigegeben.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 day_:=(starts_ AT TIME ZONE tz_)::date;
 IF t_.strict_weekdays AND NOT extract(isodow FROM day_)::int=ANY(t_.optional_weekdays) THEN RETURN code_||' ist an diesem Wochentag nicht zulässig.'; END IF;
 IF t_.strict_times AND (starts_ IS DISTINCT FROM ((day_+t_.default_start) AT TIME ZONE tz_)
   OR ends_ IS DISTINCT FROM (((day_+CASE WHEN t_.default_end<=t_.default_start THEN 1 ELSE 0 END)+t_.default_end) AT TIME ZONE tz_))
 THEN RETURN code_||' darf nur zu den festgelegten Schichtzeiten geplant werden.'; END IF;
 RETURN NULL;
END $$;
-- Invoker uses the caller's existing company RLS; private schema is not exposed by PostgREST.
REVOKE ALL ON FUNCTION private.sf_shift_scope_error(uuid,uuid,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_shift_scope_error(uuid,uuid,text,timestamptz,timestamptz) TO authenticated,service_role;

CREATE FUNCTION public.enforce_shift_employee_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE err_ text;
BEGIN
 IF new.status='CANCELLED' THEN RETURN new; END IF;
 -- Allow unchanged historical records to synchronize; publishing is revalidated.
 IF TG_OP='UPDATE' AND ROW(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.status)
   IS NOT DISTINCT FROM ROW(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.status) THEN RETURN new; END IF;
 err_:=private.sf_shift_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at);
 IF err_ IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE=err_; END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.enforce_shift_employee_scope() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assignments_employee_scope BEFORE INSERT OR UPDATE OF company_id,employee_id,shift_code,starts_at,ends_at,status
 ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_shift_employee_scope();

CREATE OR REPLACE FUNCTION private.sf_month_rhythm(e public.employees, d date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE mode_ text:=coalesce(private.sf_month_meta(e.qualifications,'rhythmMode'),'off');
 team_ text:=private.sf_month_meta(e.qualifications,'planningTeam');
 pattern_ text[]; start_ date; kind_ text; offset_ int:=0; index_ int; expected_ text; central_ record;
BEGIN
 pattern_:=regexp_split_to_array(upper(coalesce(private.sf_month_meta(e.qualifications,'rhythmPattern'),'')),'\s*[,;\n]\s*');
 kind_:=private.sf_month_meta(e.qualifications,'rhythmKind');
 start_:=nullif(private.sf_month_meta(e.qualifications,'rhythmStart'),'')::date;
 IF team_ IN('A','B','C','D','E') THEN
  SELECT * INTO central_ FROM public.company_planning_teams WHERE company_id=e.company_id AND team_code=team_;
  mode_:='required';
  IF FOUND THEN pattern_:=central_.pattern;start_:=central_.start_date;offset_:=central_.start_offset;
  ELSE offset_:=floor((strpos('ABCDE',team_)-1)*cardinality(pattern_)::numeric/5)::int; END IF;
  IF start_ IS NOT NULL AND d<start_ THEN mode_:='off'; END IF;
 END IF;
 IF mode_<>'required' OR start_ IS NULL OR coalesce(cardinality(pattern_),0)=0 OR pattern_=ARRAY['']::text[]
 THEN RETURN jsonb_build_object('mode','off','exemptOt',false); END IF;
 SELECT array_agg(CASE WHEN upper(trim(x)) IN('FREE','OFF','X') THEN 'FREI' WHEN upper(trim(x)) IN('ANY','BELIEBIG','*') THEN 'ALLE' ELSE upper(trim(x)) END ORDER BY n) INTO pattern_ FROM unnest(pattern_) WITH ORDINALITY a(x,n);
 IF team_ IN('A','B','C','D','E') THEN
 SELECT array_agg(coalesce((SELECT s.code FROM public.shift_templates s
   WHERE s.company_id=e.company_id AND s.active AND s.requires_planning_team AND s.rhythm_alias=upper(trim(a.x))
   ORDER BY s.sort_order,s.code LIMIT 1),a.x) ORDER BY a.n) INTO pattern_
 FROM unnest(pattern_) WITH ORDINALITY a(x,n);
 END IF;
 index_:=((d-start_+offset_)%cardinality(pattern_)+cardinality(pattern_))%cardinality(pattern_);
 expected_:=trim(upper(pattern_[index_+1]));
 IF expected_ IN('FREE','OFF','X') THEN expected_:='FREI'; END IF;
 IF expected_ IN('ANY','BELIEBIG','*') THEN expected_:='ALLE'; END IF;
 RETURN jsonb_build_object('mode',mode_,'expected',expected_,'index',index_,'pattern',pattern_,
  'exemptOt',coalesce(team_,'') NOT IN('A','B','C','D','E') AND private.sf_month_meta(e.qualifications,'rhythmExemptOt')='true');
END $function$;

CREATE OR REPLACE FUNCTION private.sf_open_market_rhythm(p_employee uuid, p_date date, p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE q text[]; team text; pat text[]; start_day date; offs integer:=0; mode text; expected text; v text;
BEGIN
 SELECT qualifications INTO q FROM public.employees WHERE id=p_employee;
 SELECT substr(x,19) INTO team FROM unnest(q) x WHERE x LIKE '__sp:planningTeam=%' LIMIT 1;
 SELECT substr(x,17) INTO mode FROM unnest(q) x WHERE x LIKE '__sp:rhythmMode=%' LIMIT 1;
 IF team IN ('A','B','C','D','E') THEN
  SELECT t.pattern,t.start_date,t.start_offset INTO pat,start_day,offs FROM public.company_planning_teams t JOIN public.employees e ON e.company_id=t.company_id WHERE e.id=p_employee AND t.team_code=team;
 END IF;
 IF pat IS NULL THEN
  IF coalesce(mode,'off')='off' AND coalesce(team,'')='' THEN RETURN ''; END IF;
  SELECT substr(x,20) INTO v FROM unnest(q) x WHERE x LIKE '__sp:rhythmPattern=%' LIMIT 1;
  pat:=regexp_split_to_array(upper(coalesce(v,'')),'\s*[,;]\s*');
  SELECT substr(x,18) INTO v FROM unnest(q) x WHERE x LIKE '__sp:rhythmStart=%' LIMIT 1;
  IF coalesce(v,'') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(pat[1],'')='' THEN RETURN 'Rhythmus ist noch unvollständig'; END IF;
  start_day:=v::date;
  offs:=CASE WHEN team IN ('A','B','C','D','E') THEN floor((ascii(team)-ascii('A'))*cardinality(pat)/5.0)::integer ELSE 0 END;
 END IF;
 IF p_date<start_day AND coalesce(team,'')<>'' THEN RETURN ''; END IF;
 IF team IN('A','B','C','D','E') THEN
  SELECT array_agg(coalesce((SELECT s.code FROM public.shift_templates s JOIN public.employees e ON e.company_id=s.company_id
    WHERE e.id=p_employee AND s.active AND s.requires_planning_team AND s.rhythm_alias=upper(trim(a.x))
    ORDER BY s.sort_order,s.code LIMIT 1),a.x) ORDER BY a.n) INTO pat FROM unnest(pat) WITH ORDINALITY a(x,n);
 END IF;
 expected:=pat[(((p_date-start_day+offs)%cardinality(pat)+cardinality(pat))%cardinality(pat))+1];
 IF expected IN ('ALLE','ANY','*','BELIEBIG') OR upper(p_code)=ANY(regexp_split_to_array(expected,'[+|/]')) THEN RETURN ''; END IF;
 RETURN CASE WHEN coalesce(team,'')<>'' THEN 'Team '||team||': ' ELSE '' END||'Rhythmus erwartet '||CASE WHEN expected IN ('FREI','FREE','OFF','X') THEN 'einen freien Tag' ELSE expected END;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_planning_team()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=new.company_id AND user_id=auth.uid() AND status='ACTIVE' AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.';
  END IF;
  IF TG_OP='UPDATE' AND (new.company_id<>old.company_id OR new.team_code<>old.team_code) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unternehmen und Team einer bestehenden Regel können nicht geändert werden.';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(new.pattern) t WHERE t NOT IN ('FREI','ALLE') AND NOT EXISTS(SELECT 1 FROM public.shift_templates s WHERE s.company_id=new.company_id AND upper(s.code)=t AND s.active)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der Rhythmus enthält unbekannte oder entfernte Schichtmodelle.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.employees e CROSS JOIN unnest(new.pattern) t WHERE e.company_id=new.company_id AND e.deleted_at IS NULL AND ('__sp:planningTeam='||new.team_code)=ANY(e.qualifications) AND t NOT IN ('FREI','ALLE') AND NOT EXISTS(SELECT 1 FROM unnest(e.shift_permissions) s WHERE upper(s)=t) AND NOT EXISTS(SELECT 1 FROM public.shift_templates s WHERE s.company_id=e.company_id AND s.active AND s.requires_planning_team AND s.rhythm_alias=t AND s.code=ANY(e.shift_permissions))) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Für zugeordnete Mitarbeiter fehlen Schichtfreigaben. Bitte zuerst die Qualifikationen ergänzen.';
  END IF;
  new.updated_at:=now();new.updated_by:=auth.uid();RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION private.sf_open_market_candidate(p_offer uuid, p_employee uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE o public.open_shift_market_offers%rowtype; e public.employees%rowtype; ctx jsonb; err text; selected_code text; 
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
 selected_code:=private.sf_shared_coverage_shift(o.company_id,o.shift_code,e.id,o.work_date);
 IF selected_code IS NULL THEN RETURN 'Keine Freigabe für diese Schichtart'; END IF;
 IF EXISTS(SELECT 1 FROM public.shift_templates WHERE company_id=o.company_id AND code=selected_code AND responsible_only AND responsible_employee_id IS DISTINCT FROM e.id) THEN RETURN 'Diese Schicht ist ausschließlich dem zuständigen Mitarbeiter zugeordnet'; END IF;
 err:=private.sf_shift_scope_error(o.company_id,e.id,selected_code,o.starts_at,o.ends_at);
 IF err IS NOT NULL THEN RETURN err; END IF;
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
 IF t.strict_weekdays AND NOT extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays) THEN RETURN jsonb_build_object('missing',0,'target',0,'filled',0); END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz FROM public.companies WHERE id=p_company;
 st:=(p_date+t.default_start) AT TIME ZONE tz;
 en:=((p_date+CASE WHEN t.default_end<=t.default_start THEN 1 ELSE 0 END)+t.default_end) AT TIME ZONE tz;
 IF t.coverage_group IS NOT NULL THEN
  SELECT coalesce(
    (SELECT max(d.required_count) FROM public.daily_staffing_overrides d JOIN public.shift_templates m
      ON m.company_id=d.company_id AND m.code=d.shift_code
      WHERE d.company_id=p_company AND d.work_date=p_date AND m.active AND m.coverage_group=t.coverage_group),
    CASE WHEN EXISTS(SELECT 1 FROM public.shift_templates m WHERE m.company_id=p_company AND m.active
      AND m.coverage_group=t.coverage_group AND extract(isodow FROM p_date)::integer=ANY(m.optional_weekdays))
      THEN t.coverage_required ELSE 0 END) INTO target;
  SELECT count(DISTINCT a.employee_id) INTO filled FROM public.shift_assignments a
    JOIN public.shift_templates m ON m.company_id=a.company_id AND m.code=a.shift_code
    WHERE a.company_id=p_company AND m.coverage_group=t.coverage_group AND a.status<>'CANCELLED'
      AND (a.starts_at AT TIME ZONE tz)::date=p_date AND a.starts_at<=st AND a.ends_at>=en;
  RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,
    'starts_at',st,'ends_at',en,'timezone',tz,'coverage_group',t.coverage_group,
    'representative',(SELECT code FROM public.shift_templates m WHERE m.company_id=p_company
      AND m.coverage_group=t.coverage_group AND m.active ORDER BY m.sort_order,m.code LIMIT 1));
 END IF;
 SELECT coalesce((SELECT required_count FROM public.daily_staffing_overrides WHERE company_id=p_company AND work_date=p_date AND shift_code=p_code),
 CASE WHEN t.planning_mode='optional' OR NOT (extract(isodow FROM p_date)::integer=ANY(t.optional_weekdays)) THEN 0 ELSE (SELECT required_count FROM public.global_staffing_requirements WHERE company_id=p_company AND shift_code=p_code) END,0) INTO target;
 SELECT count(*) INTO filled FROM public.shift_assignments WHERE company_id=p_company AND shift_code=p_code AND status<>'CANCELLED' AND (starts_at AT TIME ZONE tz)::date=p_date;
 RETURN jsonb_build_object('missing',greatest(0,target-filled),'target',target,'filled',filled,'starts_at',st,'ends_at',en,'timezone',tz);
END $function$;


