-- Synthetic records only; the entire test is rolled back.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-00000000a001','planning-owner@example.invalid','{}'),
 ('00000000-0000-4000-8000-00000000a002','planning-viewer@example.invalid','{}');
INSERT INTO public.companies(id,name,created_by) VALUES
 ('00000000-0000-4000-8000-00000000b001','Synthetic planning one','00000000-0000-4000-8000-00000000a001'),
 ('00000000-0000-4000-8000-00000000b002','Synthetic planning two','00000000-0000-4000-8000-00000000a001');
INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a001','OWNER','ACTIVE'),
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a002','VIEWER','ACTIVE');
INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,css_class,active) VALUES
 ('00000000-0000-4000-8000-00000000b001','FD','Synthetic FD','06:00','14:00','teal',true),
 ('00000000-0000-4000-8000-00000000b001','ND','Synthetic ND','22:00','06:00','blue',true);
INSERT INTO public.employees(company_id,first_name,last_name,personnel_no,role,employment,work_time_model,shift_permissions,qualifications) VALUES
 ('00000000-0000-4000-8000-00000000b001','Synthetic','Staff','SYNTHETIC-1','Sicherheitsmitarbeiter','Vollzeit','SHIFT',ARRAY['FD'],ARRAY['__sp:planningTeam=A']);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}',true);
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','A','2026-12-01',ARRAY['FD','FREI'],1);
 IF v->>'start_offset'<>'1' OR v->>'team_code'<>'A' THEN RAISE EXCEPTION 'bad saved rule'; END IF;
 PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','B','2027-01-01',ARRAY['ND','FREI'],0);
 IF (SELECT count(*) FROM public.company_planning_teams WHERE company_id='00000000-0000-4000-8000-00000000b001')<>2 THEN RAISE EXCEPTION 'independent teams missing'; END IF;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b002','A','2026-12-01',ARRAY['FREI'],0);RAISE EXCEPTION 'foreign write accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','A','2026-12-01',ARRAY['ND'],0);RAISE EXCEPTION 'missing permissions accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','A','2026-12-01',ARRAY['UNKNOWN'],0);RAISE EXCEPTION 'unknown shift accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','A','2026-12-01',ARRAY['FD'],1);RAISE EXCEPTION 'bad offset accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','F','2026-12-01',ARRAY['FREI'],0);RAISE EXCEPTION 'bad team accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT qualifications FROM public.employees WHERE company_id='00000000-0000-4000-8000-00000000b001')<>ARRAY['__sp:planningTeam=A'] THEN RAISE EXCEPTION 'employee changed';END IF;
 IF EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id='00000000-0000-4000-8000-00000000b001') THEN RAISE EXCEPTION 'assignments changed';END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.company_planning_teams WHERE company_id='00000000-0000-4000-8000-00000000b001')<>2 THEN RAISE EXCEPTION 'viewer read denied';END IF;
 IF EXISTS(SELECT 1 FROM public.company_planning_teams WHERE company_id='1f23f5a3-1cbb-430f-af90-36ed34004440') THEN RAISE EXCEPTION 'foreign read accepted';END IF;
 BEGIN PERFORM public.manager_save_planning_team('00000000-0000-4000-8000-00000000b001','A','2026-12-01',ARRAY['FREI'],0);RAISE EXCEPTION 'viewer write accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.company_planning_teams SET pattern=ARRAY['FREI'],start_offset=0 WHERE company_id='00000000-0000-4000-8000-00000000b001';IF FOUND THEN RAISE EXCEPTION 'direct viewer write accepted';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.audit_events WHERE company_id='00000000-0000-4000-8000-00000000b001' AND entity_type='company_planning_teams')<>2 THEN RAISE EXCEPTION 'audit missing';END IF;
 IF has_table_privilege('anon','public.company_planning_teams','SELECT') OR has_function_privilege('anon','public.manager_save_planning_team(uuid,text,date,text[],integer)','EXECUTE') THEN RAISE EXCEPTION 'anonymous access granted';END IF;
END $$;
ROLLBACK;
SELECT 'PASS: independent team saving, permissions, tenant isolation, validation, audit and unchanged employees/services; all synthetic records rolled back' AS result;
