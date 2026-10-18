-- Read-only production probe. Reports counts/timing only, no audit contents.
-- The original API statement timeout remains 8 seconds. This outer diagnostic
-- allows several calls; each individual call must stay within that API budget.
set local statement_timeout='30s';
DO $$ DECLARE c uuid;u uuid;r jsonb;first_ jsonb;start_ timestamptz;ms_ numeric;mode_ text;results jsonb:='[]';cursor_ jsonb;unique_ integer;
BEGIN
 FOR c IN SELECT company_id FROM public.audit_events GROUP BY company_id ORDER BY count(*) DESC LIMIT 2 LOOP
  SELECT user_id INTO u FROM public.company_members WHERE company_id=c AND role='OWNER' AND status='ACTIVE' LIMIT 1;
  ASSERT u is not null,'Owner missing';
  PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal2')::text,true);
  SET LOCAL ROLE authenticated;
  FOREACH mode_ IN ARRAY ARRAY['month','year','category','exact_id','export'] LOOP
   start_:=clock_timestamp();
   IF mode_='month' THEN
    r:=public.manager_audit_workspace(c,'2026-09-30 22:00Z','2026-10-31 23:00Z');first_:=r;
    ASSERT jsonb_array_length(r->'rows')=50,'Month page missing';
   ELSIF mode_='year' THEN r:=public.manager_audit_workspace(c,'2025-12-31 23:00Z','2026-12-31 23:00Z');
   ELSIF mode_='category' THEN r:=public.manager_audit_workspace(c,'2026-09-30 22:00Z','2026-10-31 23:00Z',p_category=>'planning');
   ELSIF mode_='exact_id' THEN r:=public.manager_audit_workspace(c,p_query=>first_->'rows'->0->>'id');ASSERT (r->>'total')::integer=1,'Exact search failed';
   ELSE
    r:=public.manager_audit_workspace(c,'2026-09-30 22:00Z','2026-10-31 23:00Z',p_as_of=>(first_->>'as_of')::timestamptz,p_limit=>1000);
    ASSERT jsonb_array_length(r->'rows')=1000,'Export batch missing';
   END IF;
   ms_:=round(extract(epoch from clock_timestamp()-start_)*1000);ASSERT ms_<8000,'Audit call exceeded original API time budget';
   results:=results||jsonb_build_array(jsonb_build_object('company_id',c,'case',mode_,'rows',jsonb_array_length(r->'rows'),'total',r->'total','ms',ms_));
  END LOOP;
  cursor_:=r->'rows'->999;start_:=clock_timestamp();
  r:=public.manager_audit_workspace(c,'2026-09-30 22:00Z','2026-10-31 23:00Z',p_before_at=>(cursor_->>'created_at')::timestamptz,p_before_id=>(cursor_->>'id')::uuid,p_as_of=>(first_->>'as_of')::timestamptz,p_limit=>1000);
  ASSERT jsonb_array_length(r->'rows')=1000,'Next export page missing';ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=cursor_->>'id'),'Cursor duplicated';
  ms_:=round(extract(epoch from clock_timestamp()-start_)*1000);ASSERT ms_<8000,'Cursor page exceeded API budget';
  results:=results||jsonb_build_array(jsonb_build_object('company_id',c,'case','export_next','rows',jsonb_array_length(r->'rows'),'ms',ms_));
  RESET ROLE;
 END LOOP;
 PERFORM set_config('sf.audit_live_qa',results::text,false);
END $$;
SELECT current_setting('sf.audit_live_qa')::jsonb result;
