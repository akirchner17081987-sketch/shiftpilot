CREATE TABLE public.company_planning_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  team_code text NOT NULL CHECK (team_code IN ('A','B','C','D','E')),
  start_date date NOT NULL,
  pattern text[] NOT NULL CHECK (array_ndims(pattern)=1 AND array_lower(pattern,1)=1 AND cardinality(pattern) BETWEEN 1 AND 365 AND array_position(pattern,NULL) IS NULL),
  start_offset integer NOT NULL CHECK (start_offset>=0 AND start_offset<cardinality(pattern)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(company_id,team_code)
);
ALTER TABLE public.company_planning_teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_planning_teams FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.company_planning_teams TO authenticated;
CREATE POLICY planning_teams_read ON public.company_planning_teams FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.company_members cm WHERE cm.company_id=company_planning_teams.company_id AND cm.user_id=(SELECT auth.uid()) AND cm.status='ACTIVE' AND cm.role<>'TIME_TRACKING')
);
CREATE POLICY planning_teams_insert ON public.company_planning_teams FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM public.company_members cm WHERE cm.company_id=company_planning_teams.company_id AND cm.user_id=(SELECT auth.uid()) AND cm.status='ACTIVE' AND cm.role IN ('OWNER','ADMIN','PLANNER','DISPATCHER'))
);
CREATE POLICY planning_teams_update ON public.company_planning_teams FOR UPDATE TO authenticated USING (
  EXISTS(SELECT 1 FROM public.company_members cm WHERE cm.company_id=company_planning_teams.company_id AND cm.user_id=(SELECT auth.uid()) AND cm.status='ACTIVE' AND cm.role IN ('OWNER','ADMIN','PLANNER','DISPATCHER'))
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.company_members cm WHERE cm.company_id=company_planning_teams.company_id AND cm.user_id=(SELECT auth.uid()) AND cm.status='ACTIVE' AND cm.role IN ('OWNER','ADMIN','PLANNER','DISPATCHER'))
);

-- Initialize central definitions from existing staff metadata without changing staff or services.
WITH raw AS (
  SELECT e.company_id,e.id,
    (SELECT split_part(q,'=',2) FROM unnest(e.qualifications) q WHERE q LIKE '__sp:planningTeam=%' LIMIT 1) team_code,
    (SELECT split_part(q,'=',2) FROM unnest(e.qualifications) q WHERE q LIKE '__sp:rhythmStart=%' LIMIT 1) start_text,
    (SELECT split_part(q,'=',2) FROM unnest(e.qualifications) q WHERE q LIKE '__sp:rhythmPattern=%' LIMIT 1) pattern_text
  FROM public.employees e WHERE e.deleted_at IS NULL
), valid AS (
  SELECT *,regexp_split_to_array(upper(btrim(pattern_text)),'\s*[,;]\s*') pattern
  FROM raw WHERE team_code IN ('A','B','C','D','E') AND start_text ~ '^\d{4}-\d{2}-\d{2}$' AND coalesce(pattern_text,'')<>''
), per_team AS (
  SELECT DISTINCT ON(company_id,team_code) * FROM valid WHERE cardinality(pattern) BETWEEN 1 AND 365 ORDER BY company_id,team_code,id
), per_company AS (
  SELECT DISTINCT ON(company_id) * FROM per_team ORDER BY company_id,team_code
)
INSERT INTO public.company_planning_teams(company_id,team_code,start_date,pattern,start_offset)
SELECT c.company_id,t.team,coalesce(p.start_text,c.start_text)::date,coalesce(p.pattern,c.pattern),floor(t.position*cardinality(coalesce(p.pattern,c.pattern))/5.0)::integer
FROM per_company c CROSS JOIN (VALUES('A',0),('B',1),('C',2),('D',3),('E',4)) t(team,position)
LEFT JOIN per_team p ON p.company_id=c.company_id AND p.team_code=t.team;

CREATE FUNCTION public.validate_planning_team()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
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
  IF EXISTS(SELECT 1 FROM public.employees e CROSS JOIN unnest(new.pattern) t WHERE e.company_id=new.company_id AND e.deleted_at IS NULL AND ('__sp:planningTeam='||new.team_code)=ANY(e.qualifications) AND t NOT IN ('FREI','ALLE') AND NOT EXISTS(SELECT 1 FROM unnest(e.shift_permissions) s WHERE upper(s)=t)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Für zugeordnete Mitarbeiter fehlen Schichtfreigaben. Bitte zuerst die Qualifikationen ergänzen.';
  END IF;
  new.updated_at:=now();new.updated_by:=auth.uid();RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.validate_planning_team() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER company_planning_teams_validate BEFORE INSERT OR UPDATE ON public.company_planning_teams FOR EACH ROW EXECUTE FUNCTION public.validate_planning_team();
CREATE TRIGGER company_planning_teams_audit AFTER INSERT OR UPDATE OR DELETE ON public.company_planning_teams FOR EACH ROW EXECUTE FUNCTION private.capture_audit_change();

CREATE FUNCTION public.manager_save_planning_team(p_company_id uuid,p_team_code text,p_start_date date,p_pattern text[],p_start_offset integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_row public.company_planning_teams%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=p_company_id AND user_id=auth.uid() AND status='ACTIVE' AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planning-team:'||p_company_id::text||':'||p_team_code,0));
  INSERT INTO public.company_planning_teams(company_id,team_code,start_date,pattern,start_offset)
    VALUES(p_company_id,p_team_code,p_start_date,p_pattern,p_start_offset)
    ON CONFLICT(company_id,team_code) DO UPDATE SET start_date=excluded.start_date,pattern=excluded.pattern,start_offset=excluded.start_offset
    RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION public.manager_save_planning_team(uuid,text,date,text[],integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_save_planning_team(uuid,text,date,text[],integer) TO authenticated;
